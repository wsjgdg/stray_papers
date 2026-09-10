// B9：从 proxy.ts 拆出的「指标落盘收尾」逻辑。纯函数，依赖 recordCall。
import { recordCall } from './metrics.js';
import type { Usage } from './forwarding.js';

export interface FinalizeInput {
  t0: number;
  bodyStr: string;
  reqModel: string;
  providerId: string;
  requestId: string;
  keyMask: string | null;
  ttft: number | null;
  method: string;
  path: string;
}

/**
 * 记录一次调用的指标到 metrics 存储。所有所需上下文由 FinalizeInput 携带，
 * 不再依赖 proxyRequest 闭包，便于独立测试与复用。
 */
export function finalize(
  input: FinalizeInput,
  status: number | null,
  usage: Usage,
  responseBytes: number,
  error: string | null,
  fromCache = false,
  keySwitches = 0,
): void {
  const { t0, bodyStr, reqModel, providerId, requestId, keyMask, ttft, method } = input;
  const latency = Date.now() - t0;
  const inputTokens = usage.input ?? (bodyStr ? Math.ceil(bodyStr.length / 4) : null);
  const outputTokens = usage.output ?? null;
  const cacheRead = usage.cache ?? null;
  const cacheHitRate =
    cacheRead && inputTokens ? Math.round((cacheRead / inputTokens) * 1000) / 1000 : null;
  recordCall({
    ts: Date.now(),
    provider: providerId,
    model: reqModel || '(unknown)',
    method,
    path: input.path ?? '',
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
    requestId,
    keyMask,
    fromCache,
    keySwitches,
  });
}
