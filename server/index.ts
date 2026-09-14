import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { exec } from 'node:child_process';
import { buildSnapshot } from './aggregate.js';
import { cached, invalidate } from './cache.js';
import { probeProvider } from './probe.js';
import { PROVIDERS } from './providers.js';
const PROVIDER_MAP = new Map(PROVIDERS.map((p) => [p.id, p]));
import { WEB_ASSETS, WEB_ENTRY } from './generated/webAssets.js';
import {
  loadConfig,
  maskConfig,
  upsertProvider,
  deleteProvider,
  importConfig,
  initConfigStore,
  isLocked,
  isEncrypted,
  hasConfigFile,
  unlock,
  enableEncryption,
  disableEncryption,
  getConfigState,
  resolveKeyPool,
  getProxyTokenState,
  setProxyToken,
  setProxyTokenEnabled,
  generateProxyToken,
  getMigrationNotice,
  configDir,
  getBudget,
  setBudget,
  isValidModelMapping,
  getRouting,
  setRouting,
  listRoutedModels,
} from './config.js';
import { isValidRouting } from './routing.js';
import {
  getMetrics,
  getLogs,
  getSummary,
  sampleRateHistory,
  loadPersistedLogs,
  persistedLogsAvailable,
  budgetStatus,
  findLogByRequestId,
} from './metrics.js';
import { aggregateSpend, spendToCsv } from './spendExport.js';
import { createBackupBlob, restoreBackupBlob } from './backup.js';
import {
  flush as flushUsageStore,
  initUsageStore,
  stopUsageStore,
  usageSpendSources,
  usageByTag,
} from './usageStore.js';
import {
  deletePricingOverrides,
  getPricingState,
  initPricingOverrides,
  parsePricingOverrides,
  savePricingOverrides,
  initPricingTable,
  getPricingTableState,
  parsePricingTable,
  savePricingTable,
  deletePricingTable,
} from './pricing.js';
import {
  loadProfiles,
  listProfiles,
  getAdminProfile,
  ensureAdminProfile,
  createProfile,
  deleteProfile,
  authenticate,
  getSession,
  clearSession,
  isAdmin,
  loginThrottle,
  recordLoginFailure,
  clearLoginFailures,
} from './auth.js';
import { proxyRouter, unifiedRouter, buildAuthHeaders } from './proxy.js';
import { replayCall } from './replay.js';
import {
  listEvalSets,
  getEvalSet,
  saveEvalSet,
  deleteEvalSet,
  parseEvalSet,
  startEvalRun,
  getEvalRun,
  listEvalRuns,
  stopEvalRun,
  summarizeRun,
  runToCsv,
  evalResultsDir,
  setEvalLoopback,
  setEvalCostLookup,
} from './evals.js';
import { listProviderModels } from './forwarding.js';
import { getCacheStats, clearCache } from './responseCache.js';
import { renderMetrics } from './prometheus.js';
import { timingSafeEqualStr } from './crypto.js';
import { getKeyHealth, listDeadKeys, recordSuccess, clearExpired } from './keyHealth.js';
import { guardLocalOrigin } from './localGuard.js';
import type { Snapshot, ProbeResult, ProviderKeyHealth } from './types.js';

const BASE_PORT = Number(process.env.API_PORT || 8787);
const SNAPSHOT_TTL = 10 * 60 * 1000;

// 代理访问令牌（B4）：默认关闭，保持单机零配置体验；设置页开关启用。
// 环境变量优先级最高：PROXY_TOKEN=off 强制关闭（逃生开关），PROXY_TOKEN=<值> 强制启用该值。
const ENV_PROXY_TOKEN = (process.env.PROXY_TOKEN ?? '').trim();

// 解析生效的令牌要求（每次请求实时解析，支持运行时开关/重置）：
// 1) 显式 PROXY_TOKEN=off → 关闭（覆盖一切配置）
// 2) 环境变量 PROXY_TOKEN=非空 → 使用该值作为令牌（强制开启）
// 3) 否则回退配置：proxyTokenEnabled && proxyToken 时要求令牌
function resolveProxyTokenRequirement(): { required: boolean; token: string } {
  if (ENV_PROXY_TOKEN === 'off') return { required: false, token: '' };
  if (ENV_PROXY_TOKEN) return { required: true, token: ENV_PROXY_TOKEN };
  const st = getProxyTokenState();
  if (st.enabled && st.token) return { required: true, token: st.token };
  return { required: false, token: '' };
}

function requireProxyToken(req: Request, res: Response, next: NextFunction): void {
  const { required, token } = resolveProxyTokenRequirement();
  if (!required) {
    next();
    return;
  }
  const auth = req.headers.authorization ?? '';
  const provided =
    (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '') ||
    ((req.headers['x-proxy-token'] as string) ?? '') ||
    // EventSource 无法设置自定义请求头，SSE 端点经 ?token= 透传（B8）
    ((req.query.token as string) ?? '');
  if (!timingSafeEqualStr(provided, token)) {
    res.status(401).json({
      error: '缺少或错误的代理令牌（Authorization: Bearer <token> / x-proxy-token 头 / ?token=）',
    });
    return;
  }
  next();
}

// 启动日志同时写入 %TEMP%/llm-workbench.log，便于双击闪退时排查（窗口一闪即逝看不到错误）
function logStartup(line: string): void {
  const text = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'llm-workbench.log'), text);
  } catch {
    /* 忽略写入失败 */
  }
  console.log(line);
}

const app = express();

// 详见 server/localGuard.ts：拒绝「带 Origin 但非本机来源」的跨站请求，
// 无 Origin（curl / SDK / Prometheus）与 file:// 场景放行，保持零配置体验。
app.use(guardLocalOrigin);

// ───────── A5：请求体上限分层 ─────────
// 代理要转发长 prompt（放宽到 20mb），其余管理类接口 1mb 足够，避免大 body 打到配置/档案接口。
const JSON_SMALL = '1mb';
const JSON_LARGE = '20mb';
const jsonSmall = express.json({ limit: JSON_SMALL });
const jsonLarge = express.json({ limit: JSON_LARGE });
// 大 body 白名单：统一端点与「指定厂商转发」；其余走小上限
const isLargeBodyPath = (p: string) => p.startsWith('/api/v1') || /^\/api\/proxy\/[^/]+\//.test(p);
app.use((req: Request, res: Response, next: NextFunction) => {
  (isLargeBodyPath(req.path) ? jsonLarge : jsonSmall)(req, res, next);
});

// RBAC：仅当存在「非管理员」档案（真正多人协作）时才强制管理员会话；
// 单机所有者（仅一个管理员档案、无其它用户）本地使用无需登录即可保存配置。
function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  const hasNonAdmin = listProfiles().some((p) => p.role !== 'admin');
  if (!hasNonAdmin) {
    next();
    return;
  }
  if (!isAdmin()) {
    res.status(401).json({ error: '需要管理员登录' });
    return;
  }
  next();
}

app.get('/api/health', (_req: Request, res: Response) => {
  const notice = getMigrationNotice();
  res.json({
    ok: true,
    now: Date.now(),
    ttlMs: SNAPSHOT_TTL,
    configDir: configDir(),
    migrationNotice: notice,
  });
});

app.get('/api/snapshot', async (req: Request, res: Response) => {
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  if (force) invalidate('snapshot');
  try {
    const {
      value,
      cached: hit,
      fetchedAt,
      stale,
    } = await cached<Snapshot>('snapshot', SNAPSHOT_TTL, buildSnapshot);
    res.set('Cache-Control', 'no-store');
    res.json({
      ...value,
      meta: {
        cached: hit,
        fetchedAt,
        stale,
        ttlMs: SNAPSHOT_TTL,
        nextAutoRefreshIn: Math.max(0, SNAPSHOT_TTL - (Date.now() - fetchedAt)),
      },
    });
  } catch (err) {
    res.status(502).json({ error: String((err as Error)?.message ?? err) });
  }
});

interface ProbeBody {
  providers?: string[];
  apiKeys?: Record<string, string>;
}

app.post('/api/probe', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as ProbeBody;
  const ids = body.providers?.length ? body.providers : PROVIDERS.map((p) => p.id);
  const targets = PROVIDERS.filter((p) => ids.includes(p.id));
  const keys = body.apiKeys ?? {};

  const results = await Promise.all(
    targets.map((p) => probeProvider(p, keys[p.id]?.trim() || undefined)),
  );
  res.set('Cache-Control', 'no-store');
  res.json({ checkedAt: Date.now(), results });
});

app.get('/api/providers', (_req: Request, res: Response) => {
  res.json({ providers: PROVIDERS });
});

// ───────── 代理访问令牌（B4）：公开管理面，注册在 requireProxyToken 之前以免自锁 ─────────
// 返回状态（不要求令牌本身），供前端判断是否显示提示并自动注入
app.get('/api/proxy/token', (_req: Request, res: Response) => {
  const { required } = resolveProxyTokenRequirement();
  const st = getProxyTokenState();
  res.json({
    enabled: st.enabled,
    required,
    tokenMasked: st.token ? `****${st.token.slice(-4)}` : '',
    envOverridden: ENV_PROXY_TOKEN !== '',
  });
});

// 启用 / 禁用 / 重置令牌（默认单机所有者免登录；多用户时需管理员会话）
app.post('/api/proxy/token', requireAdmin, (req: Request, res: Response) => {
  const { action } = (req.body ?? {}) as { action?: string };
  const st = getProxyTokenState();
  let token = st.token ?? '';
  let enabled = st.enabled;
  if (action === 'enable') {
    enabled = true;
    if (!token) token = generateProxyToken();
  } else if (action === 'disable') {
    enabled = false;
  } else if (action === 'reset' || action === 'generate') {
    token = generateProxyToken();
    enabled = true;
  } else {
    res.status(400).json({ error: 'action 必须为 enable | disable | reset 之一' });
    return;
  }
  setProxyToken(token);
  setProxyTokenEnabled(enabled);
  res.json({
    enabled,
    required: enabled && !!token,
    token: enabled ? token : '', // 仅在启用/重置时回显明文，供前端存储与用户复制
    tokenMasked: enabled ? `****${token.slice(-4)}` : '',
    envOverridden: ENV_PROXY_TOKEN !== '',
  });
});

// 令牌校验必须挂在 /api/proxy 的所有子路由之前（含 config / models / 转发）
app.use('/api/proxy', requireProxyToken);
app.use('/api/v1', requireProxyToken);

// ───────── 本地代理：配置 / 指标 / 日志 / 连通性（必须在 proxyRouter 挂载之前） ─────────
app.get('/api/proxy/config', (_req: Request, res: Response) => {
  res.json({
    ...maskConfig(loadConfig()),
    locked: isLocked(),
    encrypted: isEncrypted(),
    hasConfig: hasConfigFile(),
  });
});

// B1：读取模型路由配置
app.get('/api/proxy/routing', (_req: Request, res: Response) => {
  res.json({ routing: getRouting() ?? null });
});

// B1：写入模型路由配置（整体覆盖；null 表示清空）
app.post('/api/proxy/routing', requireAdmin, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { routing?: unknown };
  if (body.routing === null) {
    setRouting(null);
    res.json({ routing: null });
    return;
  }
  if (!isValidRouting(body.routing)) {
    res.status(400).json({
      error:
        '路由格式非法：需 { default: string[], routes?: Record<string,string[]> }，default 必填为字符串数组',
    });
    return;
  }
  setRouting(body.routing);
  res.json({ routing: getRouting() ?? null });
});

// 密钥加密状态与解锁
app.get('/api/crypto/status', (_req: Request, res: Response) => {
  res.json(getConfigState());
});

app.post('/api/crypto/unlock', requireAdmin, (req: Request, res: Response) => {
  const { password } = (req.body ?? {}) as { password?: string };
  if (!password) {
    res.status(400).json({ error: 'password required' });
    return;
  }
  if (!unlock(password)) {
    res.status(401).json({ error: '密码错误' });
    return;
  }
  res.json(getConfigState());
});

app.post('/api/crypto/init', requireAdmin, (req: Request, res: Response) => {
  const { password } = (req.body ?? {}) as { password?: string };
  if (!password) {
    res.status(400).json({ error: 'password required' });
    return;
  }
  if (isEncrypted() && !isLocked()) {
    res.status(400).json({ error: '已启用加密，无需重复初始化' });
    return;
  }
  if (!enableEncryption(password)) {
    res.status(500).json({ error: '启用加密失败' });
    return;
  }
  res.json(getConfigState());
});

app.post('/api/crypto/disable', requireAdmin, (_req: Request, res: Response) => {
  if (!disableEncryption()) {
    res.status(500).json({ error: '关闭加密失败' });
    return;
  }
  res.json(getConfigState());
});

// ───────── 本地多档案 + RBAC 认证接口 ─────────
app.get('/api/auth/session', (_req: Request, res: Response) => {
  res.json({ session: getSession() });
});

app.get('/api/auth/profiles', (_req: Request, res: Response) => {
  res.json({ profiles: listProfiles() });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { profileId, password } = (req.body ?? {}) as { profileId?: string; password?: string };
  if (!profileId || !password) {
    res.status(400).json({ error: 'profileId 与 password 必填' });
    return;
  }
  // A2：失败退避 —— 先查是否被限流，失败后累加退避，成功清零
  const key = `${profileId}|${req.ip ?? 'local'}`;
  const gate = loginThrottle(key);
  if (gate.blocked) {
    const sec = Math.ceil(gate.retryAfterMs / 1000);
    res.set('Retry-After', String(sec));
    res.status(429).json({
      error: gate.locked
        ? `失败次数过多，已锁定 ${sec} 秒`
        : `登录尝试过于频繁，请 ${sec} 秒后重试`,
    });
    return;
  }
  const role = authenticate(profileId, password);
  if (!role) {
    const wait = recordLoginFailure(key);
    res.status(401).json({ error: '档案或密码错误', retryAfterMs: wait });
    return;
  }
  clearLoginFailures(key);
  res.json({ role, session: getSession() });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  clearSession();
  res.json({ ok: true });
});

app.post('/api/auth/setup', (req: Request, res: Response) => {
  const { password } = (req.body ?? {}) as { password?: string };
  if (!password) {
    res.status(400).json({ error: 'password required' });
    return;
  }
  if (getAdminProfile()) {
    res.status(409).json({ error: '管理员已存在' });
    return;
  }
  ensureAdminProfile(password);
  res.json({ ok: true });
});

app.post('/api/auth/profile', requireAdmin, (req: Request, res: Response) => {
  const { name, role, password } = (req.body ?? {}) as {
    name?: string;
    role?: 'admin' | 'viewer';
    password?: string;
  };
  if (!name || !role || !password) {
    res.status(400).json({ error: 'name / role / password 必填' });
    return;
  }
  const r = createProfile(name, role, password);
  if ('error' in r) {
    res.status(400).json(r);
    return;
  }
  res.json(r);
});

app.delete('/api/auth/profile/:id', requireAdmin, (req: Request, res: Response) => {
  const r = deleteProfile(req.params.id);
  if ('error' in r) {
    res.status(400).json(r);
    return;
  }
  res.json(r);
});

// 响应缓存统计 / 清空
app.get('/api/proxy/cache', (_req: Request, res: Response) => {
  res.json(getCacheStats());
});
app.post('/api/proxy/cache/clear', requireAdmin, (_req: Request, res: Response) => {
  res.json({ cleared: clearCache() });
});

app.post('/api/proxy/config', requireAdmin, (req: Request, res: Response) => {
  const {
    providerId,
    apiKey,
    apiKeys,
    baseUrl,
    enabled,
    customName,
    authStyle,
    apiFormat,
    models,
    enabledModels,
    modelMapping,
    maxRps,
    dailyKeyBudgetUsd,
  } = (req.body ?? {}) as {
    providerId?: string;
    apiKey?: string;
    apiKeys?: string[];
    baseUrl?: string;
    enabled?: boolean;
    customName?: string;
    authStyle?: 'bearer' | 'x-api-key' | 'google';
    apiFormat?: 'openai' | 'anthropic' | 'gemini';
    models?: string[];
    enabledModels?: string[];
    modelMapping?: Record<string, string>;
    maxRps?: number;
    dailyKeyBudgetUsd?: number;
  };
  if (!providerId) {
    res.status(400).json({ error: 'providerId required' });
    return;
  }
  // B3：配额字段需为非负有限数（0 表示不限制）
  for (const [name, v] of [
    ['maxRps', maxRps],
    ['dailyKeyBudgetUsd', dailyKeyBudgetUsd],
  ] as const) {
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
      res.status(400).json({ error: `${name} 需为非负数字（0 表示不限制）` });
      return;
    }
  }
  // 模型映射必须是「字符串 → 非空字符串」的平面映射；传非法结构直接 400
  if (modelMapping !== undefined && !isValidModelMapping(modelMapping)) {
    res
      .status(400)
      .json({ error: 'modelMapping 必须为 { 请求模型名: 上游模型名 } 的映射，值不能为空' });
    return;
  }
  const cfg = upsertProvider(providerId, {
    apiKey,
    apiKeys: Array.isArray(apiKeys) ? apiKeys : undefined,
    baseUrl,
    enabled,
    customName,
    authStyle,
    apiFormat,
    models: Array.isArray(models) ? models : undefined,
    enabledModels: Array.isArray(enabledModels) ? enabledModels : undefined,
    modelMapping,
    maxRps,
    dailyKeyBudgetUsd,
  });
  res.json(maskConfig(cfg));
});

app.post('/api/proxy/config/delete', requireAdmin, (req: Request, res: Response) => {
  const { providerId } = (req.body ?? {}) as { providerId?: string };
  if (!providerId) {
    res.status(400).json({ error: 'providerId required' });
    return;
  }
  res.json(maskConfig(deleteProvider(providerId)));
});

app.post('/api/proxy/import', requireAdmin, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    providers?: Record<
      string,
      {
        apiKey?: string;
        baseUrl?: string;
        enabled?: boolean;
        models?: string[];
        enabledModels?: string[];
      }
    >;
  };
  if (!body.providers || typeof body.providers !== 'object') {
    res
      .status(400)
      .json({ error: 'body.providers 必须为对象 { id: { apiKey, baseUrl, enabled } }' });
    return;
  }
  // 逐厂商校验模型映射：批量导入同样不允许留下空键/空值
  for (const [id, p] of Object.entries(body.providers)) {
    const mapping = (p as { modelMapping?: unknown } | undefined)?.modelMapping;
    if (mapping !== undefined && !isValidModelMapping(mapping)) {
      res
        .status(400)
        .json({ error: `providers.${id}.modelMapping 必须为 { 请求模型名: 上游模型名 }` });
      return;
    }
  }
  res.json(maskConfig(importConfig(body)));
});

app.get('/api/proxy/metrics', (_req: Request, res: Response) => {
  res.json({ metrics: getMetrics() });
});

// 浮窗汇总：全局速率 + 当日 token/成本 + 最近模型
app.get('/api/proxy/metrics/summary', (_req: Request, res: Response) => {
  res.json(getSummary());
});

// D3 日预算：查询（今日成本 + 阈值状态）/ 设置（null 清除）；阈值判定见 metrics.budgetStatus。
// blockOnExceed = fail-closed：超限后代理拒绝转发（见 proxy.ts 守卫）。
app.get('/api/proxy/budget', (_req: Request, res: Response) => {
  const budget = getBudget();
  const todayUsd = getSummary().todayCostUsd;
  res.json({ ...budget, todayUsd, ...budgetStatus(todayUsd, budget.dailyUsd) });
});
app.post('/api/proxy/budget', requireAdmin, (req: Request, res: Response) => {
  const { dailyUsd, blockOnExceed } = (req.body ?? {}) as {
    dailyUsd?: unknown;
    blockOnExceed?: unknown;
  };
  if (
    dailyUsd !== null &&
    (typeof dailyUsd !== 'number' || !Number.isFinite(dailyUsd) || dailyUsd <= 0)
  ) {
    res.status(400).json({ error: 'dailyUsd 必须为正数（USD），传 null 清除预算' });
    return;
  }
  if (blockOnExceed !== undefined && typeof blockOnExceed !== 'boolean') {
    res.status(400).json({ error: 'blockOnExceed 必须为布尔值' });
    return;
  }
  setBudget(dailyUsd ?? null, blockOnExceed as boolean | undefined);
  const budget = getBudget();
  const todayUsd = getSummary().todayCostUsd;
  res.json({ ...budget, todayUsd, ...budgetStatus(todayUsd, budget.dailyUsd) });
});

// D5 配置备份：导出/导入加密备份（config.json + auth.json 原文打包，passphrase 派生 GCM）。
// 导入后重新初始化内存态（配置/档案/快照缓存），使恢复即刻生效。
app.post('/api/proxy/backup/export', requireAdmin, (req: Request, res: Response) => {
  try {
    const { passphrase } = (req.body ?? {}) as { passphrase?: unknown };
    res.json({ blob: createBackupBlob(passphrase as string) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
app.post('/api/proxy/backup/import', requireAdmin, (req: Request, res: Response) => {
  try {
    const { blob, passphrase } = (req.body ?? {}) as { blob?: unknown; passphrase?: unknown };
    const r = restoreBackupBlob(blob as string, passphrase as string);
    initConfigStore();
    loadProfiles();
    invalidate();
    res.json({ restored: true, ...r });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// D2 成本导出：按「日 × 厂商 × 模型」聚合支出，format=csv（缺省，带下载头）或 json；days 限定最近 N 天。
// 数据源 = D4 用量存档（跨重启完整），导出前先 flush 捕获最近几秒的调用。
app.get('/api/proxy/metrics/export', (req: Request, res: Response) => {
  const days = Number(req.query.days ?? 30);
  flushUsageStore();
  const rows = aggregateSpend(usageSpendSources(), {
    days: Number.isFinite(days) && days > 0 ? days : 30,
  });
  if (req.query.format === 'json') {
    res.json({ rows, generatedAt: new Date().toISOString() });
    return;
  }
  res.set('content-type', 'text/csv; charset=utf-8');
  res.set(
    'content-disposition',
    `attachment; filename="spend-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.send(spendToCsv(rows));
});

// D1 定价覆盖：查看 / 更新（手动粘贴 JSON）/ 重置；写入与配置一致走 admin 鉴权 + 原子写
app.get('/api/proxy/pricing', (_req: Request, res: Response) => {
  res.json(getPricingState());
});
app.post('/api/proxy/pricing', requireAdmin, (req: Request, res: Response) => {
  const parsed = parsePricingOverrides(req.body);
  if (!parsed) {
    res.status(400).json({
      error:
        '无效的定价覆盖：需要 { providers?: {id:{input,output,cacheRead?}}, models?: {id:{...}} }，价格为非负数字（USD / 1M tokens）',
    });
    return;
  }
  savePricingOverrides({ ...parsed, updatedAt: new Date().toISOString() });
  res.json(getPricingState());
});
app.delete('/api/proxy/pricing', requireAdmin, (_req: Request, res: Response) => {
  deletePricingOverrides();
  res.json(getPricingState());
});

// B5 基准定价表外置：查看来源/版本 + 导入（写数据目录 pricing.json）/ 恢复内置
app.get('/api/proxy/pricing-table', (_req: Request, res: Response) => {
  res.json(getPricingTableState());
});
app.post('/api/proxy/pricing-table', requireAdmin, (req: Request, res: Response) => {
  const parsed = parsePricingTable(req.body);
  if (!parsed) {
    res.status(400).json({
      error:
        '无效的基准定价表：需要 { version?, updatedAt?, providers: { <厂商id>: { input, output, cacheRead? } } }，价格为非负数字（USD / 1M tokens）',
    });
    return;
  }
  savePricingTable({ ...parsed, updatedAt: parsed.updatedAt ?? new Date().toISOString() });
  res.json(getPricingTableState());
});
app.delete('/api/proxy/pricing-table', requireAdmin, (_req: Request, res: Response) => {
  deletePricingTable();
  res.json(getPricingTableState());
});

// 聚合端点：metrics + cache + summary 一次返回，前端单一定时器轮询
app.get('/api/proxy/overview', (_req: Request, res: Response) => {
  res.json({ metrics: getMetrics(), cache: getCacheStats(), summary: getSummary() });
});

// B8：SSE 推送替代前端 3s 轮询。连接即推首帧快照，之后每 2s（复用 sampleRateHistory 节拍）推全量聚合；
// 断线/心跳保活，连接关闭即清理定时器。鉴权同 /api/proxy（支持 ?token= 供 EventSource）。
app.get('/api/proxy/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = () => {
    try {
      res.write(
        `data: ${JSON.stringify({
          metrics: getMetrics(),
          cache: getCacheStats(),
          summary: getSummary(),
        })}\n\n`,
      );
    } catch {
      /* 连接已断开时忽略 */
    }
  };
  send(); // 首帧立即填充 UI
  const tick = setInterval(send, 2000);
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* ignore */
    }
  }, 15000);
  const cleanup = () => {
    clearInterval(tick);
    clearInterval(heartbeat);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
});

// Prometheus 指标导出（Grafana / scrape 用）
app.get('/metrics', (_req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(renderMetrics());
});

app.get('/api/proxy/logs', (req: Request, res: Response) => {
  const provider = req.query.provider as string | undefined;
  const status = req.query.status as 'ok' | 'error' | undefined;
  const tag = req.query.tag as string | undefined;
  const limit = Number(req.query.limit ?? 200);
  const history = req.query.history === '1' || req.query.history === 'true';
  const logs = history
    ? loadPersistedLogs({ provider, status, tag, limit: Number.isFinite(limit) ? limit : 200 })
    : getLogs({ provider, status, tag, limit: Number.isFinite(limit) ? limit : 200 });
  // B4：列表不下发请求体（可能含 prompt），仅给一个 hasReqBody 标记供「重放」按钮启用
  const safe = logs.map((l) => {
    const { reqBody, ...rest } = l;
    return { ...rest, hasReqBody: Boolean(reqBody) };
  });
  res.json({ logs: safe, historyAvailable: persistedLogsAvailable() });
});

// B4 请求重放：用存档的 method/path/body 经代理原路重发（不含任何鉴权头，使用当前配置的 Key），
// 结果与原始记录并排返回，便于排障对比。请求体仅内存持有，重启/落盘后不可重放。
// 核心逻辑在 server/replay.ts（可注入 send，便于单测）。
app.post('/api/proxy/logs/:requestId/replay', requireAdmin, async (req: Request, res: Response) => {
  const out = await replayCall(findLogByRequestId(req.params.requestId));
  if (!out.ok) {
    res.status(out.status).json({ error: out.error });
    return;
  }
  res.json({ original: out.original, replay: out.replay });
});

// B2：按调用标签（x-lb-tag）聚合支出，供多项目共用一套 Key 时归集成本。
// days 限定最近 N 天；未带标签的调用归入 '(untagged)'。按成本降序。
app.get('/api/proxy/usage/by-tag', (req: Request, res: Response) => {
  const days = Number(req.query.days ?? 30);
  flushUsageStore();
  res.json({
    rows: usageByTag({ days: Number.isFinite(days) && days > 0 ? days : 30 }),
    generatedAt: new Date().toISOString(),
  });
});

// 单条日志精查：响应头 x-request-id → 该次调用的用量/成本/TTFT（多模型对比用）
app.get('/api/proxy/logs/:requestId', (req: Request, res: Response) => {
  const log = findLogByRequestId(req.params.requestId);
  if (!log) {
    res.status(404).json({ error: '未找到该 requestId 对应的调用日志（可能已被环形缓冲淘汰）' });
    return;
  }
  res.json(log);
});

// 评测行的成本口径与「调用日志」同源：用 x-request-id 反查记账成本
setEvalCostLookup((requestId) => findLogByRequestId(requestId)?.costUsd ?? 0);

// ───────── Phase C：自建评测集（C1）+ 结果矩阵（C2）+ LLM 判官（C3）─────────
// 评测集：用户集 <configDir>/evals/*.json（可写），随仓库示例 <cwd>/evals/*.json（只读）。
// 给「LLM 判官」一个默认候选：第一个启用厂商的首个启用模型（带 vendor 前缀，走统一端点）
function suggestJudgeModel(): string | null {
  const c = loadConfig();
  for (const [id, p] of Object.entries(c.providers)) {
    if (!p.enabled) continue;
    const m = p.enabledModels?.[0] ?? p.models?.[0];
    if (m) return `${id}/${m}`;
  }
  return null;
}

app.get('/api/proxy/evals', (_req: Request, res: Response) => {
  res.json({
    sets: listEvalSets(),
    resultsDir: evalResultsDir(),
    defaultJudgeModel: suggestJudgeModel(),
  });
});

app.get('/api/proxy/evals/runs', (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  res.json({ runs: listEvalRuns(Number.isFinite(limit) && limit > 0 ? limit : 50) });
});

app.get('/api/proxy/evals/runs/:runId', (req: Request, res: Response) => {
  const run = getEvalRun(req.params.runId);
  if (!run) {
    res.status(404).json({ error: '未找到该跑批记录' });
    return;
  }
  res.json({ run, summary: summarizeRun(run) });
});

app.get('/api/proxy/evals/runs/:runId/export', (req: Request, res: Response) => {
  const run = getEvalRun(req.params.runId);
  if (!run) {
    res.status(404).json({ error: '未找到该跑批记录' });
    return;
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="eval-${run.id}.csv"`);
  res.send(runToCsv(run));
});

app.post('/api/proxy/evals/runs/:runId/stop', requireAdmin, (req: Request, res: Response) => {
  const ok = stopEvalRun(req.params.runId);
  res.json({ stopped: ok });
});

app.get('/api/proxy/evals/:id', (req: Request, res: Response) => {
  const set = getEvalSet(req.params.id);
  if (!set) {
    res.status(404).json({ error: '未找到该评测集' });
    return;
  }
  res.json({ id: req.params.id, set });
});

// 保存评测集（写用户目录；同名时覆盖仓库示例但不改动仓库文件）
app.post('/api/proxy/evals/:id', requireAdmin, (req: Request, res: Response) => {
  const parsed = parseEvalSet(req.body);
  if (!parsed) {
    res.status(400).json({
      error:
        '无效的评测集：需要 { name, models: [string], cases: [{ input, expect?, judge?: "exact"|"contains"|"llm" }] }',
    });
    return;
  }
  try {
    saveEvalSet(req.params.id, parsed);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }
  res.json({ id: req.params.id, set: parsed });
});

app.delete('/api/proxy/evals/:id', requireAdmin, (req: Request, res: Response) => {
  const ok = deleteEvalSet(req.params.id);
  if (!ok) {
    res.status(404).json({ error: '用户目录下没有该评测集（仓库示例不可删）' });
    return;
  }
  res.json({ deleted: true });
});

// 跑批：后台串行执行，立即返回 run 快照；进度由 GET /runs/:runId 轮询
app.post('/api/proxy/evals/:id/run', requireAdmin, (req: Request, res: Response) => {
  const setId = req.params.id;
  const set = getEvalSet(setId);
  if (!set) {
    res.status(404).json({ error: '未找到该评测集' });
    return;
  }
  try {
    res.json({ run: startEvalRun(setId, set) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// 用已保存的 key 探测已配置厂商的连通性：
// 已知厂商走统一探测端点；自定义厂商直接探测其 baseUrl 的 /models（OpenAI 兼容约定）
app.post('/api/proxy/connectivity', async (req: Request, res: Response) => {
  const cfg = loadConfig();
  const ids =
    ((req.body ?? {}) as { providers?: string[] }).providers ?? Object.keys(cfg.providers);
  const results: ProbeResult[] = [];
  for (const id of ids) {
    const entry = cfg.providers[id];
    const known = PROVIDER_MAP.get(id);
    if (known) {
      if (!entry?.apiKey) {
        results.push({
          providerId: id,
          ok: false,
          httpStatus: null,
          latencyMs: null,
          state: 'error',
          modelCount: null,
          message: '未配置 API Key',
          checkedAt: Date.now(),
        });
        continue;
      }
      results.push(await probeProvider(known, entry.apiKey));
      continue;
    }
    if (!entry) {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: null,
        state: 'error',
        modelCount: null,
        message: '未找到该厂商配置',
        checkedAt: Date.now(),
      });
      continue;
    }
    // 自定义厂商：探测 baseUrl 的 /models 端点
    const baseUrl = entry.baseUrl;
    if (!baseUrl) {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: null,
        state: 'error',
        modelCount: null,
        message: '未配置 baseUrl（API 地址）',
        checkedAt: Date.now(),
      });
      continue;
    }
    if (!entry.apiKey) {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: null,
        state: 'error',
        modelCount: null,
        message: '未配置 API Key',
        checkedAt: Date.now(),
      });
      continue;
    }
    const t0 = Date.now();
    try {
      const modelsUrl = `${baseUrl.replace(/\/+$/, '')}/models`;
      const r = await fetch(modelsUrl, {
        headers: buildAuthHeaders(entry.authStyle ?? 'bearer', entry.apiKey),
        signal: AbortSignal.timeout(15000),
      });
      const ms = Date.now() - t0;
      results.push({
        providerId: id,
        ok: r.ok,
        httpStatus: r.status,
        latencyMs: ms,
        state: r.ok ? 'ok' : r.status === 401 || r.status === 403 ? 'auth-required' : 'error',
        modelCount: null,
        message: r.ok ? '连接正常（baseUrl 可达，鉴权通过）' : `HTTP ${r.status}`,
        checkedAt: Date.now(),
      });
    } catch (e) {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: Date.now() - t0,
        state: 'unreachable',
        modelCount: null,
        message: `无法连接: ${String((e as Error)?.message ?? e).slice(0, 140)}`,
        checkedAt: Date.now(),
      });
    }
  }
  res.json({ checkedAt: Date.now(), results });
});

// ───────── Key 健康度（B3：冷却 / 坏 Key 追踪） ─────────
// 只读：返回各厂商所有 Key 的冷却 / 坏 Key 状态
app.get('/api/proxy/key-health', (_req: Request, res: Response) => {
  const cfg = loadConfig();
  const providers: ProviderKeyHealth[] = [];
  for (const [providerId, entry] of Object.entries(cfg.providers)) {
    const pool = resolveKeyPool(entry);
    if (pool.length === 0) continue;
    providers.push({ providerId, keys: getKeyHealth(providerId, pool) });
  }
  res.json({ now: Date.now(), providers });
});

// 手动触发坏 Key 复活探测（需管理员；默认单机所有者免登录）
app.post('/api/proxy/key-health/probe', requireAdmin, async (_req: Request, res: Response) => {
  try {
    await reviveDeadKeys();
    res.json({ ok: true, revivedAt: Date.now() });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

// 周期性对坏 Key 做探测，探测通过（state==='ok'）即复活；随后清理过期健康条目
async function reviveDeadKeys(): Promise<void> {
  const dead = listDeadKeys();
  for (const { providerId, key } of dead) {
    const provider = PROVIDER_MAP.get(providerId);
    if (!provider) continue;
    try {
      const r = await probeProvider(provider, key);
      if (r.state === 'ok') recordSuccess(providerId, key);
    } catch {
      /* 探测失败则保持坏 Key 状态 */
    }
  }
}

// 自动获取某厂商模型清单（须在 proxyRouter 之前注册，否则会被通配路由捕获）
app.get('/api/proxy/:provider/models', async (req: Request, res: Response) => {
  const providerId = req.params.provider;
  try {
    const models = await listProviderModels(providerId);
    res.json({ models });
  } catch (e) {
    res.status(502).json({ error: String((e as Error)?.message ?? e) });
  }
});

// 通用反向代理：/api/proxy/:provider/<path> → provider.apiBase/<path>
app.use('/api/proxy', proxyRouter);

// B6：统一端点模型目录（OpenAI 兼容 /v1/models），须在 unifiedRouter 之前注册以免被通配捕获。
// 聚合所有「已启用且有 key」厂商的模型，并应用模型映射别名（上游名 → 请求侧名）。
app.get('/api/v1/models', (_req: Request, res: Response) => {
  const now = Math.floor(Date.now() / 1000);
  const data = listRoutedModels().map((d) => ({
    id: d.id,
    object: 'model',
    created: now,
    owned_by: d.owned_by,
  }));
  res.json({ object: 'list', data });
});

// 统一 OpenAI 兼容端点：/api/v1/<path>，厂商由请求头或模型名前缀决定
app.use('/api/v1', unifiedRouter);

// 生产模式：托管前端构建产物
// 优先级：WEB_DIR 环境变量（须真实存在 index.html）> 内嵌资源（pkg / 打包 Electron，写入临时目录）> 开发态 dist/
function resolveWebDir(): string {
  const envDir = process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : '';
  if (envDir) {
    // WEB_DIR 指向的目录必须真实含有 index.html；否则视为无效（如打包态指向不存在的
    // resources/app/dist），回退到内嵌/开发态资源，避免主窗口加载 404 黑屏。
    if (fs.existsSync(path.join(envDir, 'index.html'))) return envDir;
    console.warn(`[web] WEB_DIR 无 index.html，回退内嵌/开发态资源: ${envDir}`);
  }
  const versions = process.versions as Record<string, string | undefined>;
  const embedded =
    Boolean((process as { pkg?: unknown }).pkg) ||
    process.env.USE_EMBED === '1' ||
    Boolean(versions.electron); // Electron 主进程内运行的 server.cjs
  if (embedded && Object.keys(WEB_ASSETS).length > 0) {
    const dir = path.join(os.tmpdir(), 'llm-workbench-web');
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, b64] of Object.entries(WEB_ASSETS)) {
      const fp = path.join(dir, rel);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
    }
    return dir;
  }
  // 开发/普通 node 运行：从 cwd 或其上一级找 dist（不依赖 import.meta.url，兼容 CJS 打包）
  const candidates = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), '..', 'dist'),
    path.resolve(process.cwd(), 'llm-workbench', 'dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return candidates[0];
}

const dist = resolveWebDir();
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(dist, WEB_ENTRY), (err) => {
    if (err) res.status(404).send('Frontend not built. Run: npm run build');
  });
});

// 若同端口已有实例在跑，则直接复用（打开浏览器）而非再起一个 → 避免重复占用/闪退
async function tryReuse(basePort: number): Promise<boolean> {
  if (process.env.NO_OPEN || process.env.NO_REUSE) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const r = await fetch(`http://127.0.0.1:${basePort}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const url = `http://127.0.0.1:${basePort}`;
      logStartup(`[api] 已有实例运行于 ${url}，直接打开浏览器`);
      exec(process.platform === 'win32' ? `cmd /c start "" "${url}"` : `open "${url}"`);
      return true;
    }
  } catch {
    /* 端口无服务，需新启动 */
  }
  return false;
}

function openBrowser(port: number): void {
  if (process.env.NO_OPEN) return;
  const url = `http://127.0.0.1:${port}`;
  const cmd = process.platform === 'win32' ? `cmd /c start "" "${url}"` : `open "${url}"`;
  exec(cmd, (err) => {
    if (err) logStartup(`[api] 自动打开浏览器失败（请手动访问）: ${url}`);
  });
}

// 自动选端口：从 BASE_PORT 起，被占用则顺延（最多 +10），彻底避免 EADDRINUSE 闪退
let httpServer: ReturnType<typeof app.listen> | null = null;
let actualPort: number | null = null;
function listenOn(port: number, maxPort: number): void {
  const s = app.listen(port, '127.0.0.1', () => {
    actualPort = port;
    const url = `http://127.0.0.1:${port}`;
    // Phase C：评测跑批回环到本实例的统一端点，从而复用路由/缓存/重试/记账
    setEvalLoopback(url);
    logStartup(`[api] LLM Workbench API on ${url}`);
    openBrowser(port);
  });
  httpServer = s;
  s.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && port < maxPort) {
      logStartup(`[api] 端口 ${port} 被占用，尝试 ${port + 1}`);
      s.close();
      listenOn(port + 1, maxPort);
    } else {
      logStartup(`[api] 启动失败: ${err.message}`);
      // 保留窗口 6 秒，便于看到错误（双击场景下窗口会一闪而过）
      setTimeout(() => process.exit(1), 6000);
    }
  });
}

let rateTimer: ReturnType<typeof setInterval> | null = null;
let reviveTimer: ReturnType<typeof setInterval> | null = null;

// 启动入口：封装为可导出函数，便于被 Electron 主进程直接调用复用全部后端逻辑；
// 仅在「直接运行」时才自启（tsx server/index.ts / node server.cjs / pkg 打包的 server.bundle.cjs）。
export function startServer(): void {
  logStartup(`[api] 启动中… 基础端口 ${BASE_PORT}`);
  initConfigStore();
  initPricingTable(); // B5：加载基准定价表（$PRICING_FILE > 数据目录 > 仓库 data/pricing.json，否则内置）
  initPricingOverrides(); // D1：加载用户定价覆盖（无文件/损坏则回退内置定价）
  initUsageStore(); // D4：加载日粒度用量存档并启动节流落盘
  loadProfiles();
  // 启动速率历史采样（每 2s 一次），供浮窗趋势图展示真实持久化数据
  sampleRateHistory();
  rateTimer = setInterval(sampleRateHistory, 2000);
  // B3：坏 Key 复活巡检（启动先探一次，之后每 60s 探一次并清理过期健康条目）
  void reviveDeadKeys().finally(clearExpired);
  reviveTimer = setInterval(() => {
    void reviveDeadKeys().finally(clearExpired);
  }, 60_000);
  installShutdownHandlers();
  (async () => {
    if (await tryReuse(BASE_PORT)) {
      // 复用已有实例：保持窗口短暂可见，明确告知是「已在浏览器打开」而非崩溃闪退
      logStartup(
        `[api] 应用已在浏览器打开（http://127.0.0.1:${BASE_PORT}）。本窗口 2 秒后自动关闭。`,
      );
      setTimeout(() => process.exit(0), 2000);
      return;
    }
    listenOn(BASE_PORT, BASE_PORT + 10);
  })();
}

/** 返回实际监听端口（被占用顺延后得到）；Electron 主进程据此建窗，避免打到别的实例 */
export function getServerPort(): number | null {
  return actualPort;
}

/** 优雅退出：停掉采样定时器并关闭监听；Electron 可在 will-quit 中调用 */
export function stopServer(): void {
  if (rateTimer) {
    clearInterval(rateTimer);
    rateTimer = null;
  }
  if (reviveTimer) {
    clearInterval(reviveTimer);
    reviveTimer = null;
  }
  stopUsageStore(); // D4：强制落盘当日用量
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

let shutdownInstalled = false;
function installShutdownHandlers(): void {
  if (shutdownInstalled) return;
  shutdownInstalled = true;
  const onSignal = (sig: string) => {
    logStartup(`[api] 收到 ${sig}，正在退出…`);
    stopServer();
    setTimeout(() => process.exit(0), 200).unref();
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGHUP', () => onSignal('SIGHUP'));
}

function isRunDirectly(): boolean {
  const entry = process.argv[1] || '';
  return (
    entry.endsWith('index.ts') ||
    entry.endsWith('index.js') ||
    entry.endsWith('index.cjs') ||
    entry.endsWith('server.cjs') ||
    entry.endsWith('server.js') ||
    entry.endsWith('server.bundle.cjs')
  );
}

if (isRunDirectly()) {
  startServer();
}
