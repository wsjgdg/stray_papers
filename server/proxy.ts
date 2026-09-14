import { Router, type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { fetch as upstreamFetch } from 'undici';
import {
  toAnthropicRequest,
  toGeminiRequest,
  fromAnthropicJson,
  fromGeminiJson,
  buildUpstreamUrl,
  createStreamTranslator,
  type ApiFormat,
} from './translate.js';
import { loadConfig, getBudget, resolveKeyPool, resolveTimeoutMs } from './config.js';
import { resolveChain } from './routing.js';
import { buildAuthHeaders } from './upstreamAuth.js';
import { DEFAULT_RETRY_ON, isRetryable, parseRetryAfter } from './retryPolicy.js';

// 兼容旧引用：鉴权头构造已抽到 upstreamAuth.ts，与 probe 共用同一实现
export { buildAuthHeaders };
import { maskKey, budgetStatus, getSummary } from './metrics.js';
import { getDispatcher } from './httpAgent.js';
import {
  getCached,
  putCached,
  cacheKey,
  triggerRefresh,
  type CacheReplay,
} from './responseCache.js';
import { rotateKeys, type TryResult } from './keyRotation.js';
import { finalize, type FinalizeInput } from './finalize.js';
import {
  resolveTarget,
  joinUrl,
  classifyError,
  forwardHeaders,
  extractUsageFromObject,
  extractUsageFromSSE,
  applyModelMapping,
  type Usage,
} from './forwarding.js';
import { registerCacheRefreshHandler } from './caching.js';

// B7：SWR 后台刷新回调注册（实现见 caching.ts）
registerCacheRefreshHandler();

/**
 * 单次厂商尝试的结果（B1 fallback 链使用）。
 * - committed：已向客户端写出最终响应（成功或已写错误）
 * - settled：调用方应终止整条链（已写出响应，或遇到不应换厂商的错误，如预算超限 402）
 *   注意：chain 模式下未 committed 且未 settled 即「可换下一个厂商重试」。
 */
export interface ProxyAttempt {
  providerId: string;
  committed: boolean;
  settled: boolean;
  status: number | null;
  error: string | null;
  retryable: boolean;
}

export interface ProxyOptions {
  /** chain 模式：失败时仅返回结果而不写响应，由统一路由决定是否切换下一个厂商 */
  chain?: boolean;
  /** 链共用 requestId（贯穿多次尝试与日志）；缺省每次生成 */
  requestId?: string;
  /** 本次请求规划的完整厂商链，写入日志 routeChain 便于回溯 */
  routeChain?: string[];
}

/**
 * 核心代理逻辑：把请求转发到指定厂商并回传，扫描 usage、记录指标、命中响应缓存时直接回放。
 * providerId/wildcard/search 由调用方（/api/proxy 路由 或 /api/v1 统一路由）提供。
 * 返回 ProxyAttempt 以便统一路由在 chain 模式下实现 fallback。
 */
export async function proxyRequest(
  req: Request,
  res: Response,
  providerId: string,
  wildcard: string,
  search: string,
  opts: ProxyOptions = {},
): Promise<ProxyAttempt> {
  // B5：每请求生成全局唯一 requestId，贯穿响应头与日志，便于关联排查
  const requestId = opts.requestId ?? randomUUID();
  let keyMask: string | null = null;
  if (!res.getHeader('x-request-id')) res.set('x-request-id', requestId);

  const cfg = loadConfig();
  const target = resolveTarget(providerId, cfg);

  // chain 模式：配置类错误（厂商不存在/未启用/无 baseUrl）不写响应，交调用方换下一个厂商
  const fail = (status: number, error: string, retryable = false): ProxyAttempt => {
    if (!opts.chain) res.status(status).json({ error });
    return { providerId, committed: false, settled: opts.chain ? false : true, status, error, retryable };
  };

  if (!target) return fail(404, `未知厂商: ${providerId}（自定义厂商请先在配置页添加）`);
  const { provider, authStyle } = target;
  const entry = cfg.providers[providerId];
  // 重试状态码：per-provider 覆盖，缺省 [401,403,429]
  const retryOn =
    entry?.retryOn && Array.isArray(entry.retryOn) && entry.retryOn.length > 0
      ? entry.retryOn
      : DEFAULT_RETRY_ON;

  if (!entry || !entry.enabled) return fail(400, '该厂商未启用，请先在「代理」页配置并启用');
  const baseUrl = entry.baseUrl || provider.apiBase;
  if (!baseUrl) return fail(400, '该厂商无可用 baseUrl，请在配置中填写');

  // 多 key 池：轮询 + 失败切换
  const pool = resolveKeyPool(entry);
  if (pool.length === 0) return fail(400, '该厂商未配置 API Key');

  const bodyStr =
    req.method === 'GET' || req.method === 'HEAD'
      ? ''
      : typeof req.body === 'object' && req.body !== null
        ? JSON.stringify(req.body)
        : '';

  const reqModel = (req.body as { model?: string } | undefined)?.model ?? '';
  // 模型映射：请求模型名 → 上游实际模型名（未命中原样透传）
  const upstreamModel = applyModelMapping(reqModel, entry.modelMapping);
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
    // 命中模型映射时改写请求体中的 model（整体重序列化，避免字符串替换误伤其他字段）
    if (upstreamModel !== reqModel && typeof req.body === 'object' && req.body !== null) {
      sendBody = JSON.stringify({ ...(req.body as Record<string, unknown>), model: upstreamModel });
    } else {
      sendBody = bodyStr;
    }
  } else {
    const parsed = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<
      string,
      unknown
    >;
    const model = applyModelMapping(
      typeof parsed.model === 'string' ? parsed.model : '',
      entry.modelMapping,
    );
    if (format === 'anthropic') {
      sendBody = JSON.stringify(toAnthropicRequest({ ...parsed, model }));
      upstreamUrl = buildUpstreamUrl('anthropic', baseUrl, model, streamRequested);
    } else {
      sendBody = JSON.stringify(toGeminiRequest({ ...parsed, model }));
      upstreamUrl = buildUpstreamUrl('gemini', baseUrl, model, streamRequested);
    }
  }

  const t0 = Date.now();
  let ttft: number | null = null;

  const mkInput = (): FinalizeInput => ({
    t0,
    bodyStr,
    // 记录上游实际模型名：命中模型映射时成本/用量按上游模型计价
    reqModel: upstreamModel,
    providerId,
    requestId,
    keyMask,
    ttft,
    method: req.method,
    path: '/' + wildcard,
    routeChain: opts.routeChain,
  });

  // D3 fail-closed：开启 blockOnExceed 且当日预算已超限时直接拒绝（402），不再打上游。
  // 放在缓存查找之前：超限语义 = 拒绝服务，命中缓存也不放行；仍记一条本地拦截日志供对账。
  const budget = getBudget();
  if (budget.blockOnExceed && budget.dailyUsd) {
    const todayUsd = getSummary().todayCostUsd;
    const st = budgetStatus(todayUsd, budget.dailyUsd);
    if (st.level === 'exceed') {
      const msg = `日预算已超限（今日 $${todayUsd.toFixed(4)} / 预算 $${budget.dailyUsd}），blockOnExceed 已拦截本次转发`;
      res.status(402).json({ error: msg });
      finalize(mkInput(), 402, {}, 0, '预算超限拦截（本地）', false, 0);
      // 预算超限：fail-closed，直接拒绝，不换厂商重试
      return { providerId, committed: false, settled: true, status: 402, error: msg, retryable: false };
    }
  }

  // 响应缓存：仅缓存非流式、可幂等请求（密钥不参与 key 计算）
  // B7：SWR 后台刷新所需的下游配方，在成功响应后由 tryKey 填充
  let upstreamReplay: CacheReplay | undefined;
  const ck = cacheKey(req.method, '/' + wildcard + search, bodyStr, providerId);
  const lookup = !streamRequested ? getCached(ck) : { state: 'miss' as const, entry: null };
  if (lookup.state === 'fresh' || lookup.state === 'stale') {
    const cached = lookup.entry!;
    res.status(cached.status);
    for (const [k, v] of Object.entries(cached.headers)) res.set(k, v);
    // B7：SWR —— TTL 过期窗口内回放旧值并标记，前台立即可用、后台静默刷新
    res.set('x-cache', lookup.state === 'stale' ? 'STALE' : 'HIT');
    res.send(cached.body);
    finalize(mkInput(), cached.status, {}, cached.body.length, null, true, 0);
    if (lookup.state === 'stale') triggerRefresh(ck);
    return { providerId, committed: true, settled: true, status: cached.status, error: null, retryable: false };
  }

  const translator = createStreamTranslator(format);

  // 用单个 key 发起一次上游请求。committed=true 表示已向客户端写出响应（成功或流已开启），调用方无需再处理。
  async function tryKey(apiKey: string, retries: number): Promise<TryResult> {
    // 客户端断开（取消 / 刷新 / 关闭浮窗）时立即中止上游，避免连接与内存拖到 180s 超时才释放。
    // controller / cleanup 声明在 try 之外，保证异常分支也能解绑监听。
    const controller = new AbortController();
    // B5：记录本次所用 Key 的脱敏掩码（不留存明文）
    keyMask = maskKey(apiKey);
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
      const fwdHeaders: Record<string, string> = {
        ...forwardHeaders(req),
        ...buildAuthHeaders(authStyle, apiKey),
      };
      const upstream = await upstreamFetch(upstreamUrl, {
        method: req.method,
        headers: fwdHeaders,
        body: sendBody || undefined,
        signal: controller.signal,
        redirect: 'manual',
        dispatcher: getDispatcher(providerId),
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
          finalize(mkInput(), status, usage, Buffer.byteLength(acc), null, false, retries);
        });
        nodeStream.on('error', (e) => {
          cleanup();
          res.end();
          // 客户端主动断开导致的 abort 不算上游故障，单独归类便于排查
          const abortedByClient = controller.signal.aborted && res.writableEnded;
          finalize(
            mkInput(),
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
      finalize(mkInput(), status, usage, sendBodyOut.length, null, false, retries);

      // 缓存可缓存的成功响应（非流式）：存转换后的 OpenAI 体，保证回放一致。
      // 只缓存 2xx：3xx 重定向依赖上游 Location 与实时状态，缓存会给出失效跳转。
      if (!streamRequested && status >= 200 && status < 300) {
        const headers: Record<string, string> = { 'content-type': contentType };
        if (cacheControl) headers['cache-control'] = cacheControl;
        // B7：记录下游配方，供 SWR 后台刷新复用（含鉴权头，常驻内存不落盘）
        upstreamReplay = {
          method: req.method,
          url: upstreamUrl,
          headers: fwdHeaders,
          body: sendBody ?? '',
          providerId,
        };
        putCached(ck, { status, headers, body: sendBodyOut, storedAt: Date.now() }, upstreamReplay);
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

  // 多 key 轮询：跳过冷却/坏 Key，成功 commit，失败退避后切下一个（逻辑见 keyRotation.ts）
  const rot = await rotateKeys(providerId, pool, (key, retries) => tryKey(key, retries));
  if (rot.committed) {
    // tryKey 已写出响应（成功或流式已开启）
    return { providerId, committed: true, settled: true, status: rot.last?.status ?? null, error: null, retryable: false };
  }
  // B3：所有 Key 都在冷却 / 坏 Key 状态 → 明确提示而非泛泛「无可用 Key」
  if (!rot.triedAny) {
    const msg = '所有 Key 当前处于冷却或被标记为不可用，请稍后再试，或在「配置」页查看 Key 健康';
    finalize(mkInput(), null, {}, 0, 'all-keys-cooling', false, 0);
    if (!opts.chain) {
      res.status(503).json({ error: msg });
      return { providerId, committed: false, settled: true, status: 503, error: msg, retryable: true };
    }
    // chain 模式：本厂商冷却，交给调用方换下一个厂商
    return { providerId, committed: false, settled: false, status: 503, error: msg, retryable: true };
  }
  if (!rot.last) {
    const msg = '无可用 Key';
    finalize(mkInput(), null, {}, 0, '无可用 Key', false, 0);
    if (!opts.chain) {
      res.status(502).json({ error: msg });
      return { providerId, committed: false, settled: true, status: 502, error: msg, retryable: false };
    }
    return { providerId, committed: false, settled: false, status: 502, error: msg, retryable: false };
  }
  // 全部 key 用尽或遇到不可重试错误：向客户端回写错误（非 chain）或交调用方汇总（chain）
  const st = rot.last.status ?? 502;
  const msg = rot.last.error ?? '上游请求失败';
  finalize(mkInput(), st, {}, 0, msg, false, rot.retries);
  if (!opts.chain) {
    res.status(st).json({ error: msg });
    return { providerId, committed: false, settled: true, status: st, error: msg, retryable: rot.last.retryable };
  }
  return { providerId, committed: false, settled: false, status: st, error: msg, retryable: rot.last.retryable };
}

// 通用反向代理：/api/proxy/:provider/<path> → provider.apiBase/<path>
export const proxyRouter = Router();
proxyRouter.all('/:provider/*', async (req: Request, res: Response) => {
  const providerId = req.params.provider;
  const wildcard = (req.params[0] as string) ?? '';
  const search = new URL(req.url, 'http://localhost').search;
  await proxyRequest(req, res, providerId, wildcard, search);
});

// 统一 OpenAI 兼容端点：/api/v1/<path>，厂商由请求头 / 模型名前缀 / 路由配置决定（B1 fallback 链）
export const unifiedRouter = Router();
unifiedRouter.all('/*', async (req: Request, res: Response) => {
  // B5：统一端点也在入口注入 x-request-id，覆盖「未指定厂商」等早于 proxyRequest 的提前返回
  const requestId = randomUUID();
  res.set('x-request-id', requestId);
  const wildcard = (req.params[0] as string) ?? '';
  const search = new URL(req.url, 'http://localhost').search;

  const cfg = loadConfig();
  const routing = cfg.routing;

  // 1) 显式厂商头 → 单厂商（不进入回退）
  const explicit =
    (req.headers['x-lb-provider'] as string) || (req.headers['x-provider'] as string) || '';
  // 2) 从模型名解析 vendor/model 前缀
  const rawModel =
    typeof req.body === 'object' && req.body && typeof (req.body as { model?: unknown }).model === 'string'
      ? (req.body as { model: string }).model
      : '';
  let modelName = rawModel;
  let prefixProvider = '';
  if (!explicit && rawModel.includes('/')) {
    const idx = rawModel.indexOf('/');
    prefixProvider = rawModel.slice(0, idx);
    const m = rawModel.slice(idx + 1);
    if (m) modelName = m;
  }

  let chain: string[];
  if (explicit) {
    chain = [explicit];
  } else if (prefixProvider) {
    chain = [prefixProvider];
    // 去掉 vendor 前缀后，上游只认真实模型名（如 openai/gpt-4o → gpt-4o）
    if (typeof req.body === 'object' && req.body !== null) req.body.model = modelName;
  } else {
    chain = resolveChain(modelName, routing, cfg);
  }

  if (chain.length === 0) {
    res.status(400).json({
      error:
        '未指定厂商或未匹配到可用路由：请设置请求头 x-lb-provider，或使用 vendor/model 前缀（如 openai/gpt-4o），或在配置中设置模型路由 / 默认厂商',
    });
    return;
  }

  // B1：按链顺序尝试，上游失败（未 committed 且未 settled）则切换下一个厂商
  const attempted: string[] = [];
  let last: ProxyAttempt | null = null;
  for (let i = 0; i < chain.length; i++) {
    const pid = chain[i];
    attempted.push(pid);
    // 在写出响应之前设置路由头，确保成功响应携带正确 header
    res.set('x-route-used', pid);
    res.set('x-route-attempts', String(attempted.length));
    const result = await proxyRequest(req, res, pid, wildcard, search, {
      chain: true,
      requestId,
      routeChain: chain,
    });
    if (result.committed || result.settled) return;
    last = result;
  }
  // 整条链失败：写最终错误（含尝试过的厂商清单，便于客户端定位）
  const finalStatus = last?.status ?? 502;
  const finalError = last?.error ?? '所有路由厂商均不可用';
  res.set('x-route-used', attempted[attempted.length - 1]);
  res.set('x-route-attempts', String(attempted.length));
  res.status(finalStatus).json({ error: finalError, routeAttempts: attempted });
});
