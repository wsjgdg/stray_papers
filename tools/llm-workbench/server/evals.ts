// Phase C：自建评测集（C1）+ 结果矩阵汇总（C2）+ LLM-as-judge（C3）
//
// 设计要点：
// - 评测集是纯 JSON 文件：用户集在 <configDir>/evals/*.json，随仓库发布的示例在 <cwd>/evals/*.json
//   （同名时用户集优先，不改动仓库文件）；
// - 跑批一律走**本地代理**（默认 127.0.0.1:<实际端口> 的 /api/v1/chat/completions），
//   因此自动获得路由/回退/缓存/重试/密钥轮询/成本记账——评测成本与真实调用同口径；
// - 逐条串行执行（不并发）：结果可复现，且不会把上游打爆或让限流干扰评测；
// - 结果落盘 <configDir>/eval-results/<runId>.json，每行即时写入（中断可续看）；
// - 判分：exact / contains 为确定性判分；llm 为 LLM-as-judge（1-5 分，≥3 视为通过）。
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWriteJson, configDir } from './config.js';

export type JudgeKind = 'exact' | 'contains' | 'llm';

export interface EvalCase {
  input: string;
  system?: string;
  expect?: string;
  /** 缺省：有 expect → contains；无 expect → 不计分（pass=null） */
  judge?: JudgeKind;
}

export interface EvalSet {
  name: string;
  description?: string;
  /** 待测模型（走统一端点，支持 vendor/model 前缀或路由表里的名字） */
  models: string[];
  cases: EvalCase[];
  temperature?: number;
  maxTokens?: number;
  /** C3：llm 判官所用模型；缺省时 llm 判分不可用（返回 pass=null） */
  judgeModel?: string;
}

export interface EvalRow {
  caseIndex: number;
  model: string;
  status: number;
  output: string;
  error?: string;
  latencyMs: number;
  costUsd: number;
  fromCache: boolean;
  pass: boolean | null;
  /** LLM 判官 1-5 分 */
  score?: number;
  judgeNote?: string;
  requestId?: string;
}

export type EvalRunStatus = 'running' | 'done' | 'error' | 'stopped';

export interface EvalRun {
  id: string;
  setId: string;
  name: string;
  models: string[];
  caseCount: number;
  /** 计划总调用数 = models × cases */
  total: number;
  status: EvalRunStatus;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  rows: EvalRow[];
}

export const PASS_SCORE = 3; // llm 判官 ≥3 分视为通过

// ───────────────────────── 校验 ─────────────────────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** 校验评测集结构；非法返回 null（端点回 400，不抛错） */
export function parseEvalSet(input: unknown): EvalSet | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const name = str(o.name);
  if (!name) return null;
  if (!Array.isArray(o.models) || o.models.length === 0) return null;
  const models = o.models.map(str);
  if (models.some((m) => !m)) return null;
  if (!Array.isArray(o.cases) || o.cases.length === 0) return null;

  const cases: EvalCase[] = [];
  for (const raw of o.cases) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    const input_ = str(c.input);
    if (!input_) return null;
    const judge = c.judge;
    if (judge !== undefined && judge !== 'exact' && judge !== 'contains' && judge !== 'llm')
      return null;
    cases.push({
      input: input_,
      system: str(c.system) ?? undefined,
      expect: str(c.expect) ?? undefined,
      judge: judge as JudgeKind | undefined,
    });
  }
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
  return {
    name,
    description: str(o.description) ?? undefined,
    models: models as string[],
    cases,
    temperature: num(o.temperature),
    maxTokens: num(o.maxTokens),
    judgeModel: str(o.judgeModel) ?? undefined,
  };
}

/** 判分：exact / contains 确定性；llm 交由 deps.judge 处理；无 expect 且非 llm → 不计分 */
export function gradeDeterministic(
  c: EvalCase,
  output: string,
): { pass: boolean | null; kind: 'exact' | 'contains' | 'none' } {
  const judge: JudgeKind = c.judge ?? (c.expect !== undefined ? 'contains' : 'llm');
  if (c.expect === undefined) return { pass: null, kind: 'none' };
  if (judge === 'exact') return { pass: output.trim() === c.expect.trim(), kind: 'exact' };
  if (judge === 'contains') {
    const hay = output.toLowerCase();
    const needle = c.expect.trim().toLowerCase();
    return { pass: needle.length > 0 && hay.includes(needle), kind: 'contains' };
  }
  return { pass: null, kind: 'none' }; // llm → 交给判官
}

// ───────────────────────── 集合存取 ─────────────────────────

export function repoEvalDir(): string {
  return path.join(process.cwd(), 'evals');
}
export function userEvalDir(): string {
  return path.join(configDir(), 'evals');
}
export function evalResultsDir(): string {
  return path.join(configDir(), 'eval-results');
}

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

function readSet(file: string): EvalSet | null {
  try {
    return parseEvalSet(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

/** 候选 id：两个目录下所有 *.json 的文件名（去扩展名），用户目录优先 */
function candidateIds(dirs: string[]): string[] {
  const ids = new Set<string>();
  for (const d of dirs) {
    try {
      for (const f of fs.readdirSync(d)) {
        if (f.endsWith('.json')) ids.add(f.slice(0, -5));
      }
    } catch {
      /* 目录不存在 */
    }
  }
  return [...ids].sort();
}

export interface EvalSetSummary {
  id: string;
  name: string;
  models: string[];
  caseCount: number;
  source: 'user' | 'repo';
  description?: string;
  judgeModel?: string;
}

export function listEvalSets(): EvalSetSummary[] {
  const out: EvalSetSummary[] = [];
  for (const id of candidateIds([userEvalDir(), repoEvalDir()])) {
    if (!SAFE_ID.test(id)) continue;
    const userFile = path.join(userEvalDir(), `${id}.json`);
    const repoFile = path.join(repoEvalDir(), `${id}.json`);
    const fromUser = fs.existsSync(userFile) ? readSet(userFile) : null;
    const set = fromUser ?? (fs.existsSync(repoFile) ? readSet(repoFile) : null);
    if (!set) continue;
    out.push({
      id,
      name: set.name,
      models: set.models,
      caseCount: set.cases.length,
      source: fromUser ? 'user' : 'repo',
      description: set.description,
      judgeModel: set.judgeModel,
    });
  }
  return out;
}

export function getEvalSet(id: string): EvalSet | null {
  if (!SAFE_ID.test(id)) return null;
  const userFile = path.join(userEvalDir(), `${id}.json`);
  if (fs.existsSync(userFile)) {
    const s = readSet(userFile);
    if (s) return s;
  }
  const repoFile = path.join(repoEvalDir(), `${id}.json`);
  return fs.existsSync(repoFile) ? readSet(repoFile) : null;
}

/** 保存到用户目录（覆盖同名仓库示例，不改仓库文件） */
export function saveEvalSet(id: string, set: EvalSet): void {
  if (!SAFE_ID.test(id)) throw new Error('非法评测集 id：仅允许字母数字与 . _ -');
  fs.mkdirSync(userEvalDir(), { recursive: true });
  atomicWriteJson(path.join(userEvalDir(), `${id}.json`), JSON.stringify(set, null, 2));
}

/** 只能删除用户目录里的集合；仓库示例不可删（避免误删发布内容） */
export function deleteEvalSet(id: string): boolean {
  if (!SAFE_ID.test(id)) return false;
  const f = path.join(userEvalDir(), `${id}.json`);
  if (!fs.existsSync(f)) return false;
  fs.rmSync(f, { force: true });
  return true;
}

// ───────────────────────── 运行器 ─────────────────────────

/** 单次模型调用的结果（由 deps.callModel 提供） */
export interface EvalCallResult {
  status: number;
  text: string;
  requestId?: string;
  cache?: string | null;
  error?: string;
}

export interface EvalDeps {
  callModel: (model: string, c: EvalCase, set: EvalSet) => Promise<EvalCallResult>;
  /** C3：LLM 判官；缺省时 llm 判分返回 pass=null */
  judge?: (model: string, c: EvalCase, output: string, set: EvalSet) => Promise<number | null>;
  /** 用 requestId 反查该次调用的记账成本（与 /api/proxy/logs 同源） */
  costOf?: (requestId: string) => number;
  now?: () => number;
  /** 返回 true 则提前结束（用户点了停止） */
  shouldStop?: () => boolean;
  /** 每产出一行回调（用于落盘/进度） */
  onRow?: (row: EvalRow, run: EvalRun) => void;
}

/**
 * 串行跑完一个评测集：models × cases。
 * 纯函数式副作用（不碰 fs），便于单测注入 deps。
 */
export async function runEvalSet(
  setId: string,
  set: EvalSet,
  deps: EvalDeps,
  runId = randomUUID(),
): Promise<EvalRun> {
  const now = deps.now ?? (() => Date.now());
  const run: EvalRun = {
    id: runId,
    setId,
    name: set.name,
    models: [...set.models],
    caseCount: set.cases.length,
    total: set.models.length * set.cases.length,
    status: 'running',
    startedAt: now(),
    rows: [],
  };
  for (const model of set.models) {
    for (let i = 0; i < set.cases.length; i += 1) {
      if (deps.shouldStop?.()) {
        run.status = 'stopped';
        run.finishedAt = now();
        return run;
      }
      const c = set.cases[i];
      const t0 = now();
      let res: EvalCallResult;
      try {
        res = await deps.callModel(model, c, set);
      } catch (e) {
        res = { status: 0, text: '', error: (e as Error).message };
      }
      const latencyMs = now() - t0;
      const row: EvalRow = {
        caseIndex: i,
        model,
        status: res.status,
        output: res.text,
        error: res.error,
        latencyMs,
        costUsd: res.requestId ? (deps.costOf?.(res.requestId) ?? 0) : 0,
        fromCache: res.cache === 'HIT' || res.cache === 'hit',
        pass: null,
        requestId: res.requestId,
      };
      if (!res.error && res.status >= 200 && res.status < 400) {
        const det = gradeDeterministic(c, res.text);
        if (det.kind !== 'none') {
          row.pass = det.pass;
        } else if (deps.judge) {
          const score = await deps.judge(model, c, res.text, set);
          if (score !== null) {
            row.score = score;
            row.pass = score >= PASS_SCORE;
            row.judgeNote = `judge ${score}/5`;
          }
        }
      }
      run.rows.push(row);
      deps.onRow?.(row, run);
    }
  }
  run.status = 'done';
  run.finishedAt = now();
  return run;
}

// ───────────────────────── 运行态存储 ─────────────────────────

const runs = new Map<string, EvalRun>();
const stopFlags = new Set<string>();
let loopbackBase: string | null = null;

/** 由 index.ts 在 listen 成功后注入实际地址（避免循环 import） */
export function setEvalLoopback(base: string): void {
  loopbackBase = base.replace(/\/+$/, '');
}

function baseUrl(): string {
  const env = (process.env.EVAL_BASE_URL ?? '').trim();
  if (env) return env.replace(/\/+$/, '');
  if (loopbackBase) return loopbackBase;
  throw new Error('评测需要本地服务已监听：请稍后重试（未取到监听地址）');
}

function runFile(runId: string): string {
  return path.join(evalResultsDir(), `${runId}.json`);
}

function persistRun(run: EvalRun): void {
  try {
    fs.mkdirSync(evalResultsDir(), { recursive: true });
    atomicWriteJson(runFile(run.id), JSON.stringify(run, null, 2));
  } catch {
    /* 落盘失败不影响跑批 */
  }
}

/** 带超时的 fetch（评测单条不应无限挂住） */
async function fetchJson(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs = 120_000,
): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    return { status: r.status, headers, text: await r.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** 从代理记账里取成本：requestId → CallLog.costUsd（由 index.ts 注入避免循环 import） */
let costLookup: ((requestId: string) => number) | null = null;
export function setEvalCostLookup(fn: (requestId: string) => number): void {
  costLookup = fn;
}

function extractText(raw: string): string {
  try {
    const j = JSON.parse(raw) as Record<string, any>;
    const msg = j?.choices?.[0]?.message?.content;
    if (typeof msg === 'string') return msg;
    // Anthropic 原生格式（统一端点已转 OpenAI，这里兜底）
    if (typeof j?.content?.[0]?.text === 'string') return j.content[0].text;
    if (typeof j?.error === 'string') return `[error] ${j.error}`;
    return raw;
  } catch {
    return raw;
  }
}

/** C3：让判官模型给候选回答打分（1-5），并返回该次判分是否 ≥ PASS_SCORE */
export function buildJudgePrompt(c: EvalCase, output: string): string {
  return [
    '你是严格的评测判官。请按「参考答案」判断「候选回答」的正确程度，只输出一个 1-5 的整数，不要任何解释。',
    '评分标准：5=完全正确；4=基本正确但有细节缺失；3=方向正确有明显缺陷；2=部分相关但结论错误；1=完全错误或答非所问。',
    '',
    `【题目】${c.input}`,
    `【参考答案】${c.expect ?? '（未提供，按题目要求判断合理性）'}`,
    `【候选回答】${output.slice(0, 4000)}`,
    '',
    '只输出一个整数：',
  ].join('\n');
}

/** 从判官回复里解析 1-5 分 */
export function parseScore(raw: string): number | null {
  const m = raw.match(/[1-5]/);
  return m ? Number(m[0]) : null;
}

/** 默认 deps：走本地代理（自动获得缓存/重试/路由/记账） */
function defaultDeps(set: EvalSet): EvalDeps {
  const call = async (model: string, c: EvalCase, s: EvalSet): Promise<EvalCallResult> => {
    const body: Record<string, unknown> = {
      model,
      stream: false,
      messages: [
        ...(c.system ? [{ role: 'system', content: c.system }] : []),
        { role: 'user', content: c.input },
      ],
    };
    if (s.temperature !== undefined) body.temperature = s.temperature;
    if (s.maxTokens !== undefined) body.max_tokens = s.maxTokens;
    const r = await fetchJson(`${baseUrl()}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: r.status,
      text: extractText(r.text),
      requestId: r.headers['x-request-id'],
      cache: r.headers['x-cache'] ?? null,
      error: r.status >= 400 ? `HTTP ${r.status}` : undefined,
    };
  };
  return {
    callModel: call,
    judge:
      set.judgeModel === undefined
        ? undefined
        : async (_model, c, output) => {
            const r = await call(
              set.judgeModel as string,
              { input: buildJudgePrompt(c, output) },
              {
                ...set,
                maxTokens: 8,
                temperature: 0,
              },
            );
            if (r.status < 200 || r.status >= 400) return null;
            return parseScore(r.text);
          },
    costOf: (requestId) => costLookup?.(requestId) ?? 0,
  };
}

/** 启动一次跑批（后台执行，立即返回 run 快照） */
export function startEvalRun(setId: string, set: EvalSet): EvalRun {
  void baseUrl(); // 未监听时立刻抛错，避免异步里才失败
  const runId = randomUUID();
  const placeholder: EvalRun = {
    id: runId,
    setId,
    name: set.name,
    models: [...set.models],
    caseCount: set.cases.length,
    total: set.models.length * set.cases.length,
    status: 'running',
    startedAt: Date.now(),
    rows: [],
  };
  runs.set(runId, placeholder);
  stopFlags.delete(runId);
  persistRun(placeholder);

  void runEvalSet(setId, set, {
    ...defaultDeps(set),
    shouldStop: () => stopFlags.has(runId),
    onRow: (_row, run) => {
      runs.set(runId, { ...run, rows: [...run.rows] });
      persistRun(runs.get(runId) as EvalRun);
    },
  })
    .then((final) => {
      runs.set(runId, final);
      persistRun(final);
    })
    .catch((e: Error) => {
      const cur = runs.get(runId) ?? placeholder;
      const failed: EvalRun = {
        ...cur,
        status: 'error',
        error: e.message,
        finishedAt: Date.now(),
      };
      runs.set(runId, failed);
      persistRun(failed);
    })
    .finally(() => stopFlags.delete(runId));
  return placeholder;
}

export function getEvalRun(runId: string): EvalRun | null {
  if (!SAFE_ID.test(runId)) return null;
  const mem = runs.get(runId);
  if (mem) return mem;
  try {
    return JSON.parse(fs.readFileSync(runFile(runId), 'utf8')) as EvalRun;
  } catch {
    return null;
  }
}

/** 历史跑批（按开始时间倒序，列表不下发 rows，只给 rowCount 供进度显示） */
export function listEvalRuns(limit = 50): (Omit<EvalRun, 'rows'> & { rowCount: number })[] {
  const out: (Omit<EvalRun, 'rows'> & { rowCount: number })[] = [];
  try {
    for (const f of fs.readdirSync(evalResultsDir())) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      const run = getEvalRun(id);
      if (!run) continue;
      const { rows, ...rest } = run;
      out.push({ ...rest, rowCount: rows.length });
    }
  } catch {
    /* 目录不存在 */
  }
  out.sort((a, b) => b.startedAt - a.startedAt);
  return out.slice(0, limit);
}

/** 请求停止（在两条用例之间生效） */
export function stopEvalRun(runId: string): boolean {
  const run = runs.get(runId);
  if (!run || run.status !== 'running') return false;
  stopFlags.add(runId);
  return true;
}

export function resetEvalRuns(): void {
  runs.clear();
  stopFlags.clear();
}

// ───────────────────────── C2：汇总与导出 ─────────────────────────

export interface EvalModelSummary {
  model: string;
  total: number;
  graded: number; // 参与判分的行（pass !== null）
  passed: number;
  passRate: number | null; // passed / graded
  avgLatencyMs: number;
  costUsd: number;
  errorCount: number;
  cacheHits: number;
  avgScore: number | null;
}

export interface EvalSummary {
  total: number;
  graded: number;
  passed: number;
  passRate: number | null;
  costUsd: number;
  avgLatencyMs: number;
  models: EvalModelSummary[];
}

const avg = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/** 按模型聚合：通过率 / 平均延迟 / 总成本 / 缓存命中 */
export function summarizeRun(run: EvalRun): EvalSummary {
  const byModel = new Map<string, EvalRow[]>();
  for (const r of run.rows) {
    const list = byModel.get(r.model) ?? [];
    list.push(r);
    byModel.set(r.model, list);
  }
  const models: EvalModelSummary[] = [...byModel.entries()].map(([model, rows]) => {
    const graded = rows.filter((r) => r.pass !== null);
    const passed = graded.filter((r) => r.pass === true).length;
    const scores = rows.map((r) => r.score).filter((s): s is number => typeof s === 'number');
    return {
      model,
      total: rows.length,
      graded: graded.length,
      passed,
      passRate: graded.length ? passed / graded.length : null,
      avgLatencyMs: Math.round(avg(rows.map((r) => r.latencyMs)) ?? 0),
      costUsd: rows.reduce((a, r) => a + r.costUsd, 0),
      errorCount: rows.filter((r) => r.error).length,
      cacheHits: rows.filter((r) => r.fromCache).length,
      avgScore: avg(scores),
    };
  });
  const gradedAll = run.rows.filter((r) => r.pass !== null);
  const passedAll = gradedAll.filter((r) => r.pass === true).length;
  return {
    total: run.rows.length,
    graded: gradedAll.length,
    passed: passedAll,
    passRate: gradedAll.length ? passedAll / gradedAll.length : null,
    costUsd: run.rows.reduce((a, r) => a + r.costUsd, 0),
    avgLatencyMs: Math.round(avg(run.rows.map((r) => r.latencyMs)) ?? 0),
    models: models.sort((a, b) => (b.passRate ?? -1) - (a.passRate ?? -1)),
  };
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

const CSV_HEADER = [
  'model',
  'caseIndex',
  'pass',
  'score',
  'status',
  'latencyMs',
  'costUsd',
  'fromCache',
  'requestId',
  'error',
  'output',
];

/** 明细 CSV（原样输出，不截断——评测结果要能离线复核） */
export function runToCsv(run: EvalRun): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of run.rows) {
    lines.push(
      [
        r.model,
        r.caseIndex,
        r.pass === null ? '' : r.pass ? 'pass' : 'fail',
        r.score ?? '',
        r.status,
        r.latencyMs,
        r.costUsd.toFixed(6),
        r.fromCache ? '1' : '0',
        r.requestId ?? '',
        r.error ?? '',
        r.output.replace(/\r?\n/g, ' ⏎ '),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
