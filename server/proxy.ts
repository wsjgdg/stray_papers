import { Router, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { PROVIDERS } from './providers.js';
import {
  toAnthropicRequest,
  toGeminiRequest,
  fromAnthropicJson,
  fromGeminiJson,
  buildUpstreamUrl,
  createStreamTranslator,
  type ApiFormat,
} from './translate.js';
import { loadConfig, resolveKeyPool, resolveTimeoutMs, type AuthStyle } from './config.js';
import { buildAuthHeaders, styleOfKnown } from './upstreamAuth.js';
import {
  DEFAULT_RETRY_ON,
  isRetryable,
  parseRetryAfter,
  computeBackoff,
  sleep,
} from './retryPolicy.js';

// 兼容旧引用：鉴权头构造已抽到 upstreamAuth.ts，与 probe 共用同一实现
export { buildAuthHeaders };
import { recordCall } from './metrics.js';
import { getCached, putCached, cacheKey } from './responseCache.js';
import { recordSuccess, recordFailure, isUsable } from './keyHealth.js';
import type { ProviderConsole } from './types.js';

const PROVIDER_MAP = new Map<string, ProviderConsole>(PROVIDERS.map((p) => [p.id, p]));

// 每个厂商一个 key 轮询游标（多线程无锁足够：单进程、请求串行推进游标）
const keyCursor = new Map<string, number>();

// 解析目标厂商：已知厂商走默认；未知 id 且配置中存在 → 视为自定义厂商（用其 baseUrl + 自定义鉴权方式）
function resolveTarget(
  providerId: string,
  cfg: ReturnType<typeof loadConfig>,
): { provider: ProviderConsole; authStyle: AuthStyle } | null {
  const known = PROVIDER_MAP.get(providerId);
  if (known) return { provider: known, authStyle: styleOfKnown(providerId) };
  const entry = cfg.providers[providerId];
  if (!entry) return null;
  const synth: ProviderConsole = {
    id: providerId,
    name: entry.customName || providerId,
    nameCn: entry.customName || providerId,
    region: 'intl',
    console: '',
    docs: '',
    pricing: '',
    playground: null,
    status: null,
    modelsEndpoint: null,
    apiBase: entry.baseUrl || null,
    note: '自定义厂商',
  };
  return { provider: synth, authStyle: entry.authStyle ?? 'bearer' };
}

function joinUrl(base: string, suffix: string): string {
  const b = base.replace(/\/+$/, '');
  const s = suffix.replace(/^\/+/, '');
  return `${b}/${s}`;
}

/**
 * 自动获取某厂商的模型清单：命中上游 /models 端点并解析。
 * - 已知厂商用其 modelsEndpoint（完整 URL）；
 * - OpenAI 兼容自定义厂商 → baseUrl + /models（与 chat 同约定：baseUrl 已含 /v1，如 https://host/v1）；
 * - Gemini 格式 → baseUrl + /models（响应为 { models:[{name:"models/xxx"}] }）。
 * 返回去重、排序后的模型 id 列表。
 */
export async function listProviderModels(providerId: string): Promise<string[]> {
  const cfg = loadConfig();
  const target = resolveTarget(providerId, cfg);
  if (!target) throw new Error(`未知厂商: ${providerId}（自定义厂商请先在配置页添加）`);
  const { provider, authStyle } = target;
  const entry = cfg.providers[providerId];
  if (!entry || !entry.enabled) throw new Error('该厂商未启用，请先在「代理」页配置并启用');
  const baseUrl = entry.baseUrl || provider.apiBase;
  if (!baseUrl) throw new Error('该厂商无可用 baseUrl，请在配置中填写');
  const pool = resolveKeyPool(entry);
  if (pool.length === 0) throw new Error('该厂商未配置 API Key');
  const apiKey = pool[0];

  const format: ApiFormat =
    (entry.apiFormat as ApiFormat) ?? (provider.id === 'google' ? 'gemini' : 'openai');
  let modelsUrl: string;
  if (provider.modelsEndpoint) {
    modelsUrl = provider.modelsEndpoint;
  } else if (format === 'gemini') {
    modelsUrl = joinUrl(baseUrl, 'models');
  } else {
    modelsUrl = joinUrl(baseUrl, 'models');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(modelsUrl, {
      headers: buildAuthHeaders(authStyle, apiKey),
      signal: controller.signal,
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`上游返回 HTTP ${r.status} @ ${modelsUrl}: ${txt.slice(0, 200)}`);
    }
    const body = (await r.json().catch(() => null)) as unknown;
    if (!body || typeof body !== 'object') {
      throw new Error(`上游响应不是合法 JSON @ ${modelsUrl}`);
    }
    const stripName = (s?: string) =>
      typeof s === 'string' ? s.replace(/^models\//, '').trim() : '';
    // 兼容各类 OpenAI 兼容形态：{data:[{id|name}]} / {models:[{id|name}]} / 字符串数组 / 顶层数组
    const one = (m: unknown): string => {
      if (typeof m === 'string') return stripName(m);
      if (m && typeof m === 'object') {
        const o = m as Record<string, unknown>;
        return (
          stripName(o.id as string) || stripName(o.name as string) || stripName(o.model as string)
        );
      }
      return '';
    };
    const b = body as Record<string, unknown>;
    let raw: unknown[] = [];
    if (Array.isArray(body)) raw = body;
    else if (Array.isArray(b.data)) raw = b.data;
    else if (Array.isArray(b.models)) raw = b.models;
    let ids: string[] = raw.map(one).filter(Boolean);
    if (ids.length === 0) {
      // 区分两类失败，给出可执行的下一步提示：
      // 1) 识别到 data/models 数组但为空 → 多半是该 Key 未开通模型访问权限（bankofai 等会返回 200 + 空 data）
      // 2) 完全未识别的结构 → 把原始响应（截断）带回，便于定位格式（或手动添加模型名兜底）
      if (Array.isArray(b.data) || Array.isArray(b.models)) {
        throw new Error(
          `上游返回了模型列表结构，但 data/models 为空数组 @ ${modelsUrl}。通常是该 API Key 未开通模型访问权限（或账户无可用模型）。可改用「手动添加模型名」兜底。`,
        );
      }
      const preview = JSON.stringify(body).slice(0, 400);
      throw new Error(`上游返回空列表 @ ${modelsUrl}。原始响应: ${preview}`);
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    out.sort();
    return out;
  } finally {
    clearTimeout(timer);
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Usage {
  input?: number | null;
  output?: number | null;
  cache?: number | null;
}

function extractUsageFromObject(obj: unknown): Usage {
  if (!obj || typeof obj !== 'object') return {};
  const u = (obj as Record<string, unknown>).usage as Record<string, unknown> | undefined;
  if (!u) return {};
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    input: num(u.prompt_tokens) ?? num(u.input_tokens) ?? num(u.promptTokens),
    output: num(u.completion_tokens) ?? num(u.output_tokens) ?? num(u.completionTokens),
    cache:
      num((u.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens) ??
      num(u.cache_read_input_tokens) ??
      num((u as Record<string, unknown>).cacheReadInputTokens),
  };
}

// SSE 文本里可能含多条 data:，挑最后一条带 usage 的
function extractUsageFromSSE(text: string): Usage {
  let best: Usage = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^data:\s*(.*)$/);
    if (!m) continue;
    const payload = m[1].trim();
    if (payload === '[DONE]') continue;
    try {
      const u = extractUsageFromObject(JSON.parse(payload));
      if (u.input !== undefined || u.output !== undefined || u.cache !== undefined) best = u;
    } catch {
      /* 非 JSON */
    }
  }
  return best;
}

function classifyError(status: number | null, bodyText: string): string {
  if (status === null) return '网络/传输层错误（未收到响应）';
  if (status === 401 || status === 403) return `鉴权失败 (${status}) · Key 无效或权限不足`;
  if (status === 404) return '404 · 路径/模型不存在';
  if (status === 429) return '429 · 触发限流 (Rate limit)';
  if (status >= 500) return `上游服务错误 (${status})`;
  if (status >= 400) return `客户端错误 (${status})`;
  try {
    const e = JSON.parse(bodyText)?.error;
    if (e?.message) return `${status} · ${e.message}`.slice(0, 200);
  } catch {
    /* ignore */
  }
  return `HTTP ${status}`;
}

function forwardHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const ct = req.headers['content-type'];
  if (ct) out['content-type'] = ct;
  const accept = req.headers['accept'];
  if (accept) out['accept'] = accept;
  return out;
}

/**
 * 核心代理逻辑：把请求转发到指定厂商并回传，扫描 usage、记录指标、命中响应缓存时直接回放。
 * providerId/wildcard/search 由调用方（/api/proxy 路由 或 /api/v1 统一路由）提供。
 */
export async function proxyRequest(
  req: Request,
  res: Response,
  providerId: string,
  wildcard: string,
  search: string,
): Promise<void> {
  const cfg = loadConfig();
  const target = resolveTarget(providerId, cfg);

  if (!target) {
    res.status(404).json({ error: `未知厂商: ${providerId}（自定义厂商请先在配置页添加）` });
    return;
  }
  const { provider, authStyle } = target;
  const entry = cfg.providers[providerId];
  // 重试状态码：per-provider 覆盖，缺省 [401,403,429]
  const retryOn =
    entry?.retryOn && Array.isArray(entry.retryOn) && entry.retryOn.length > 0
      ? entry.retryOn
      : DEFAULT_RETRY_ON;

  if (!entry || !entry.enabled) {
    res.status(400).json({ error: '该厂商未启用，请先在「代理」页配置并启用' });
    return;
  }
  const baseUrl = entry.baseUrl || provider.apiBase;
  if (!baseUrl) {
    res.status(400).json({ error: '该厂商无可用 baseUrl，请在配置中填写' });
    return;
  }

  // 多 key 池：轮询 + 失败切换
  const pool = resolveKeyPool(entry);
  if (pool.length === 0) {
    res.status(400).json({ error: '该厂商未配置 API Key' });
    return;
  }

  const bodyStr =
    req.method === 'GET' || req.method === 'HEAD'
      ? ''
      : typeof req.body === 'object' && req.body !== null
        ? JSON.stringify(req.body)
        : '';

  const reqModel = (req.body as { model?: string } | undefined)?.model ?? '';
  const streamRequested =
    (req.body as { stream?: boolean } | undefined)?.stream === true ||
    /"stream"\s*:\s*true/i.test(bodyStr);

  // 上游请求超时：per-provider 可覆盖；流式长生成默认放宽到 600s，非流式 180s
  const timeoutMs = resolveTimeoutMs(entry, streamRequested);

  // API 格式转换：openai 透传；anthropic/gemini 改写请求路径与请求体
  const format: ApiFormat = (entry.apiFormat as ApiFormat) ?? 'openai';
  let upstreamUrl: string;
  let sendBody: string;
  if (format === 'openai') {
    upstreamUrl = joinUrl(baseUrl, wildcard) + search;
    sendBody = bodyStr;
  } else {
    const parsed = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<
      string,
      unknown
    >;
    const model = typeof parsed.model === 'string' ? parsed.model : '';
    if (format === 'anthropic') {
      sendBody = JSON.stringify(toAnthropicRequest(parsed));
      upstreamUrl = buildUpstreamUrl('anthropic', baseUrl, model, streamRequested);
    } else {
      sendBody = JSON.stringify(toGeminiRequest(parsed));
      upstreamUrl = buildUpstreamUrl('gemini', baseUrl, model, streamRequested);
    }
  }

  const t0 = Date.now();
  let ttft: number | null = null;

  // 响应缓存：仅缓存非流式、可幂等请求（密钥不参与 key 计算）
  const ck = cacheKey(req.method, '/' + wildcard + search, bodyStr, providerId);
  const cached = !streamRequested ? getCached(ck) : null;
  if (cached) {
    res.status(cached.status);
    for (const [k, v] of Object.entries(cached.headers)) res.set(k, v);
    res.send(cached.body);
    finalize(cached.status, {}, cached.body.length, null, true, 0);
    return;
  }

  function finalize(
    status: number | null,
    usage: Usage,
    responseBytes: number,
    error: string | null,
    fromCache = false,
    keySwitches = 0,
  ) {
    const latency = Date.now() - t0;
    const inputTokens = usage.input ?? (bodyStr ? estimateTokens(bodyStr) : null);
    const outputTokens = usage.output ?? null;
    const cacheRead = usage.cache ?? null;
    const cacheHitRate =
      cacheRead && inputTokens ? Math.round((cacheRead / inputTokens) * 1000) / 1000 : null;
    recordCall({
      ts: Date.now(),
      provider: providerId,
      model: reqModel || '(unknown)',
      method: req.method,
      path: '/' + wildcard,
      status,
      latencyMs: latency,
      ttftMs: ttft,
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheRead,
      cacheHitRate,
      error,
      requestBytes: Buffer.byteLength(bodyStr || '0'),
      responseBytes,
      fromCache,
      keySwitches,
    });
  }

  const translator = createStreamTranslator(format);

  type TryResult = {
    committed: boolean;
    status: number | null;
    error: string | null;
    retryable: boolean;
    retryAfterMs?: number | null;
  };

  // 用单个 key 发起一次上游请求。committed=true 表示已向客户端写出响应（成功或流已开启），调用方无需再处理。
  async function tryKey(apiKey: string): Promise<TryResult> {
    // 客户端断开（取消 / 刷新 / 关闭浮窗）时立即中止上游，避免连接与内存拖到 180s 超时才释放。
    // controller / cleanup 声明在 try 之外，保证异常分支也能解绑监听。
    const controller = new AbortController();
    const onClientClose = () => {
      if (!res.writableFinished) controller.abort();
    };
    res.on('close', onClientClose);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      res.off('close', onClientClose);
    };
    try {
      timer = setTimeout(() => controller.abort(), timeoutMs);
      const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers: { ...forwardHeaders(req), ...buildAuthHeaders(authStyle, apiKey) },
        body: sendBody || undefined,
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timer);

      const status = upstream.status;
      const contentType = upstream.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // 流式：error 态（尚未向客户端写任何字节）才允许换 key 重试；否则开启管道并 commit
        if (status >= 400) {
          const text = await upstream.text();
          cleanup();
          return {
            committed: false,
            status,
            error: classifyError(status, text),
            retryable: isRetryable(status, retryOn),
            retryAfterMs: parseRetryAfter(upstream.headers.get('retry-after')),
          };
        }
        if (upstream.headers.get('location'))
          res.set('location', upstream.headers.get('location')!);
        res.status(status);
        res.set('content-type', contentType);
        if (upstream.headers.get('cache-control'))
          res.set('cache-control', upstream.headers.get('cache-control')!);
        const nodeStream = Readable.fromWeb(
          upstream.body as Parameters<typeof Readable.fromWeb>[0],
        );
        let acc = '';
        let firstByte = false;
        nodeStream.on('data', (chunk: Buffer) => {
          if (!firstByte) {
            firstByte = true;
            ttft = Date.now() - t0;
          }
          if (translator) {
            const out = translator.push(chunk.toString('utf8'));
            if (out) {
              res.write(out);
              acc += out;
            }
          } else {
            res.write(chunk);
            acc += chunk.toString('utf8');
          }
        });
        nodeStream.on('end', () => {
          cleanup();
          if (translator) {
            const out = translator.flush();
            if (out) {
              res.write(out);
              acc += out;
            }
          }
          res.end();
          const usage = extractUsageFromSSE(acc);
          finalize(status, usage, Buffer.byteLength(acc), null, false, retries);
        });
        nodeStream.on('error', (e) => {
          cleanup();
          res.end();
          // 客户端主动断开导致的 abort 不算上游故障，单独归类便于排查
          const abortedByClient = controller.signal.aborted && res.writableEnded;
          finalize(
            status,
            {},
            Buffer.byteLength(acc),
            abortedByClient ? '客户端断开连接' : classifyError(status, String(e)),
            false,
            retries,
          );
        });
        return { committed: true, status, error: null, retryable: false };
      }

      // 非流式：缓冲后回传并解析 usage
      const buf = Buffer.from(await upstream.arrayBuffer());
      const cacheControl = upstream.headers.get('cache-control') ?? undefined;

      if (status >= 400) {
        const text = buf.toString('utf8');
        cleanup();
        return {
          committed: false,
          status,
          error: classifyError(status, text),
          retryable: isRetryable(status, retryOn),
          retryAfterMs: parseRetryAfter(upstream.headers.get('retry-after')),
        };
      }

      // 非 openai 格式：把上游响应转换为 OpenAI 风格再回传（保证 usage 等字段一致）
      let sendBodyOut = buf;
      if (format !== 'openai' && status >= 200 && status < 300) {
        try {
          const parsed = JSON.parse(buf.toString('utf8'));
          sendBodyOut = Buffer.from(
            JSON.stringify(
              format === 'anthropic' ? fromAnthropicJson(parsed) : fromGeminiJson(parsed),
            ),
          );
        } catch {
          /* 转换失败则原样回传 */
        }
      }

      res.status(status);
      res.set('content-type', contentType);
      if (cacheControl) res.set('cache-control', cacheControl);
      if (upstream.headers.get('location')) res.set('location', upstream.headers.get('location')!);
      res.send(sendBodyOut);

      let usage: Usage = {};
      try {
        usage = extractUsageFromObject(JSON.parse(sendBodyOut.toString('utf8')));
      } catch {
        /* 非 JSON */
      }
      finalize(status, usage, sendBodyOut.length, null, false, retries);

      // 缓存可缓存的成功响应（非流式）：存转换后的 OpenAI 体，保证回放一致。
      // 只缓存 2xx：3xx 重定向依赖上游 Location 与实时状态，缓存会给出失效跳转。
      if (!streamRequested && status >= 200 && status < 300) {
        const headers: Record<string, string> = { 'content-type': contentType };
        if (cacheControl) headers['cache-control'] = cacheControl;
        putCached(ck, { status, headers, body: sendBodyOut, storedAt: Date.now() });
      }
      cleanup();
      return { committed: true, status, error: null, retryable: false };
    } catch (err) {
      cleanup();
      const msg = String((err as Error)?.message ?? err);
      // abort 有两种来源：180s 超时、客户端提前断开 → 分开归类，便于从日志/指标定位
      const reason = msg.includes('abort')
        ? res.destroyed || res.writableEnded
          ? '客户端断开连接'
          : '请求超时（>180s）'
        : classifyError(null, msg);
      return { committed: false, status: null, error: reason, retryable: true };
    }
  }

  // 轮询游标：每次请求推进一格，从当前游标开始依次尝试所有 key
  const start = keyCursor.get(providerId) ?? 0;
  keyCursor.set(providerId, (start + 1) % pool.length);

  let retries = 0;
  let last: TryResult | null = null;
  let triedAny = false;
  for (let i = 0; i < pool.length; i++) {
    const idx = (start + i) % pool.length;
    const key = pool[idx];
    // B3：跳过处于冷却 / 被标记为坏 Key 的条目，避免对失效 Key 反复轮询
    if (!isUsable(providerId, key)) continue;
    triedAny = true;
    const r = await tryKey(key);
    if (r.committed) {
      // B3：成功（含流式已开启）复位该 Key 健康度
      recordSuccess(providerId, key);
      return;
    }
    // B3：失败计入健康度（仅 401/403/429 生效；冷却 / 坏 Key 由此产生）
    recordFailure(providerId, key, r.status);
    last = r;
    if (!r.retryable) break; // 不可重试的错误（如 400）→ 直接返回，不再切换
    // 指数退避后再切下一个 key：避免多个 key 连打上游；尊重上游 Retry-After
    if (i + 1 < pool.length) {
      const delay = computeBackoff(retries, r.retryAfterMs ?? null);
      if (delay > 0) await sleep(delay);
      retries++; // 仅当确有一个后续 key 可切换时才计一次切换
    }
  }

  // B3：所有 Key 都在冷却 / 坏 Key 状态 → 明确提示而非泛泛「无可用 Key」
  if (!triedAny) {
    res.status(503).json({
      error: '所有 Key 当前处于冷却或被标记为不可用，请稍后再试，或在「配置」页查看 Key 健康',
    });
    finalize(null, {}, 0, 'all-keys-cooling', false, 0);
    return;
  }
  if (!last) {
    res.status(502).json({ error: '无可用 Key' });
    finalize(null, {}, 0, '无可用 Key', false, 0);
    return;
  }
  // 全部 key 用尽或遇到不可重试错误：向客户端回写错误
  res.status(last.status ?? 502).json({ error: last.error });
  finalize(last.status, {}, 0, last.error, false, retries);
}

// 通用反向代理：/api/proxy/:provider/<path> → provider.apiBase/<path>
export const proxyRouter = Router();
proxyRouter.all('/:provider/*', async (req: Request, res: Response) => {
  const providerId = req.params.provider;
  const wildcard = (req.params[0] as string) ?? '';
  const search = new URL(req.url, 'http://localhost').search;
  await proxyRequest(req, res, providerId, wildcard, search);
});

// 统一 OpenAI 兼容端点：/api/v1/<path>，厂商由请求头或模型名前缀决定
export const unifiedRouter = Router();
unifiedRouter.all('/*', async (req: Request, res: Response) => {
  const wildcard = (req.params[0] as string) ?? '';
  const search = new URL(req.url, 'http://localhost').search;

  let providerId =
    (req.headers['x-lb-provider'] as string) || (req.headers['x-provider'] as string) || '';
  if (
    !providerId &&
    typeof req.body === 'object' &&
    req.body &&
    typeof (req.body as { model?: unknown }).model === 'string'
  ) {
    const model = (req.body as { model: string }).model;
    if (model.includes('/')) providerId = model.split('/')[0];
  }
  if (!providerId) {
    const cfg = loadConfig();
    providerId =
      Object.keys(cfg.providers).find((id) => {
        const e = cfg.providers[id];
        return e.enabled && e.apiKey;
      }) ?? '';
  }
  if (!providerId) {
    res.status(400).json({
      error:
        '未指定厂商：请设置请求头 x-lb-provider，或在模型名中使用 vendor/model 前缀（如 openai/gpt-4o）',
    });
    return;
  }
  await proxyRequest(req, res, providerId, wildcard, search);
});
