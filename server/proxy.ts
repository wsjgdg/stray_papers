import { Router, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { PROVIDERS } from './providers.js';
import { loadConfig, resolveKeyPool, type AuthStyle } from './config.js';
import { recordCall } from './metrics.js';
import { getCached, putCached, cacheKey } from './responseCache.js';
import type { ProviderConsole } from './types.js';

const PROVIDER_MAP = new Map<string, ProviderConsole>(PROVIDERS.map((p) => [p.id, p]));

// 每个厂商一个 key 轮询游标（多线程无锁足够：单进程、请求串行推进游标）
const keyCursor = new Map<string, number>();

// 失败切换判定：仅密钥相关 / 传输层错误才值得换 key 重试
// 401/403 = 该 key 失效 → 换 key；429 = 限流（不同 key 可能独立配额）→ 换 key；网络错误 → 换 key
// 5xx / 4xx(非鉴权) = 上游/请求问题，换 key 无意义，不重试
function isRetryable(status: number | null): boolean {
  if (status === null) return true;
  return status === 401 || status === 403 || status === 429;
}

// 已知厂商的鉴权头风格（与 probe.ts 保持一致）
function styleOfKnown(id: string): AuthStyle {
  if (id === 'anthropic') return 'x-api-key';
  if (id === 'google') return 'google';
  return 'bearer';
}

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

function buildAuthHeaders(style: AuthStyle, apiKey: string): Record<string, string> {
  if (style === 'x-api-key') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  if (style === 'google') return { 'x-goog-api-key': apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}

function joinUrl(base: string, suffix: string): string {
  const b = base.replace(/\/+$/, '');
  const s = suffix.replace(/^\/+/, '');
  return `${b}/${s}`;
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
  const requestBytes = Buffer.byteLength(bodyStr || '0');
  const reqModel = (req.body as { model?: string } | undefined)?.model ?? '';
  const streamRequested =
    (req.body as { stream?: boolean } | undefined)?.stream === true || /"stream"\s*:\s*true/i.test(bodyStr);

  const t0 = Date.now();
  let ttft: number | null = null;

  // 响应缓存：仅缓存非流式、可幂等请求（密钥不参与 key 计算）
  const ck = cacheKey(req.method, '/' + wildcard + search, bodyStr);
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
      requestBytes,
      responseBytes,
      fromCache,
      keySwitches,
    });
  }

  const upstreamUrl = joinUrl(baseUrl, wildcard) + search;

  type TryResult = { committed: boolean; status: number | null; error: string | null; retryable: boolean };

  // 用单个 key 发起一次上游请求。committed=true 表示已向客户端写出响应（成功或流已开启），调用方无需再处理。
  async function tryKey(apiKey: string): Promise<TryResult> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      const upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers: { ...forwardHeaders(req), ...buildAuthHeaders(authStyle, apiKey) },
        body: bodyStr || undefined,
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
          return { committed: false, status, error: classifyError(status, text), retryable: isRetryable(status) };
        }
        res.status(status);
        res.set('content-type', contentType);
        if (upstream.headers.get('cache-control')) res.set('cache-control', upstream.headers.get('cache-control')!);
        const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
        let acc = Buffer.alloc(0);
        let firstByte = false;
        nodeStream.on('data', (chunk: Buffer) => {
          if (!firstByte) {
            firstByte = true;
            ttft = Date.now() - t0;
          }
          acc = Buffer.concat([acc, chunk]);
          res.write(chunk);
        });
        nodeStream.on('end', () => {
          res.end();
          const usage = extractUsageFromSSE(acc.toString('utf8'));
          finalize(status, usage, acc.length, null, false, retries);
        });
        nodeStream.on('error', (e) => {
          res.end();
          finalize(status, {}, acc.length, classifyError(status, String(e)), false, retries);
        });
        return { committed: true, status, error: null, retryable: false };
      }

      // 非流式：缓冲后回传并解析 usage
      const buf = Buffer.from(await upstream.arrayBuffer());
      const cacheControl = upstream.headers.get('cache-control') ?? undefined;
      const text = buf.toString('utf8');

      if (status >= 400) {
        // 错误响应：由调用方按 retryable 决定重试下一个 key 或直接返回
        return { committed: false, status, error: classifyError(status, text), retryable: isRetryable(status) };
      }

      res.status(status);
      res.set('content-type', contentType);
      if (cacheControl) res.set('cache-control', cacheControl);
      res.send(buf);

      let usage: Usage = {};
      try {
        usage = extractUsageFromObject(JSON.parse(text));
      } catch {
        /* 非 JSON */
      }
      finalize(status, usage, buf.length, null, false, retries);

      // 缓存可缓存的成功响应（非流式）
      if (!streamRequested && status >= 200 && status < 400) {
        const headers: Record<string, string> = { 'content-type': contentType };
        if (cacheControl) headers['cache-control'] = cacheControl;
        putCached(ck, { status, headers, body: buf, storedAt: Date.now() });
      }
      return { committed: true, status, error: null, retryable: false };
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      const reason = msg.includes('abort') ? '请求超时（>180s）' : classifyError(null, msg);
      return { committed: false, status: null, error: reason, retryable: true };
    }
  }

  // 轮询游标：每次请求推进一格，从当前游标开始依次尝试所有 key
  const start = keyCursor.get(providerId) ?? 0;
  keyCursor.set(providerId, (start + 1) % pool.length);

  let retries = 0;
  let last: TryResult | null = null;
  for (let i = 0; i < pool.length; i++) {
    const idx = (start + i) % pool.length;
    const r = await tryKey(pool[idx]);
    if (r.committed) return; // 成功或流式已提交
    last = r;
    if (!r.retryable) break; // 不可重试的错误（如 400）→ 直接返回，不再切换
    retries++; // 发生一次 key 切换
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
    (req.headers['x-lb-provider'] as string) ||
    (req.headers['x-provider'] as string) ||
    '';
  if (!providerId && typeof req.body === 'object' && req.body && typeof (req.body as { model?: unknown }).model === 'string') {
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
      error: '未指定厂商：请设置请求头 x-lb-provider，或在模型名中使用 vendor/model 前缀（如 openai/gpt-4o）',
    });
    return;
  }
  await proxyRequest(req, res, providerId, wildcard, search);
});
