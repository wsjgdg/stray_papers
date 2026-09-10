// 重试与退避策略：与代理核心解耦，便于单测。
// 失败切换判定 + 指数退避 + Retry-After 解析，均为纯函数。

// 触发换 key 重试的缺省 HTTP 状态码集合：
// 401/403 = 该 key 失效 → 换 key；429 = 限流（不同 key 可能独立配额）→ 换 key。
// 具体厂商可用 ProviderConfig.retryOn 覆盖。
export const DEFAULT_RETRY_ON: readonly number[] = [401, 403, 429];
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8000;

// 仅密钥相关 / 传输层错误才值得换 key 重试；5xx / 4xx(非指定码) 换 key 无意义。
export function isRetryable(status: number | null, retryOn: readonly number[]): boolean {
  if (status === null) return true; // 网络 / 传输层错误 → 换 key
  return retryOn.includes(status);
}

// 解析上游 Retry-After 头（秒数 或 HTTP-date），钳制到退避上限。
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const sec = Number(header);
  if (!Number.isNaN(sec) && sec >= 0) return Math.min(sec * 1000, BACKOFF_CAP_MS);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), BACKOFF_CAP_MS);
  return null;
}

// 指数退避：base × 2^attempt，封顶；若上游给出 Retry-After 则取较大值。
export function computeBackoff(attempt: number, retryAfterMs: number | null): number {
  const expo = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
  return retryAfterMs && retryAfterMs > 0 ? Math.max(expo, retryAfterMs) : expo;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
