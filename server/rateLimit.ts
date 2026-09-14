// B3：per-provider 速率限制（令牌桶）。
//
// 语义：
//  - 桶容量 burst = max(1, ceil(ratePerSec))，初始满桶 → 允许一次突发；
//  - 按 ratePerSec 令牌/秒 连续补充（惰性计算：仅在访问时按经过时间补桶）；
//  - 令牌不足时不排队、直接拒绝，并给出「再等多久才有 1 个令牌」的 retryAfterMs。
//
// 纯函数 takeToken 负责单次判定（可单测，不依赖时钟）；tryConsume 维护每厂商桶状态。
// 仅当配置了 maxRps 的厂商才参与限流，未配置的厂商零开销直通。

export interface Bucket {
  tokens: number;
  last: number; // 上次补充时间（epoch ms）
}

/** 纯函数：向桶补充令牌并尝试取 1 个。now 由调用方注入，便于测试。 */
export function takeToken(
  b: Bucket,
  now: number,
  ratePerSec: number,
  burst: number,
): { allowed: boolean; retryAfterMs: number } {
  const elapsedSec = Math.max(0, now - b.last) / 1000;
  b.tokens = Math.min(burst, b.tokens + elapsedSec * ratePerSec);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }
  // 还差 (1 - tokens) 个令牌；按补充速率折算等待毫秒
  const need = 1 - b.tokens;
  return { allowed: false, retryAfterMs: Math.ceil((need / ratePerSec) * 1000) };
}

const buckets = new Map<string, Bucket>();

/** 桶容量：至少 1，避免 ratePerSec 很小时永远拿不到令牌 */
export function burstFor(ratePerSec: number): number {
  return Math.max(1, Math.ceil(ratePerSec));
}

/**
 * 尝试为某厂商消耗 1 个令牌。ratePerSec <= 0 视为未配置限流（直接放行）。
 * now 可注入以便测试；生产缺省取 Date.now()。
 */
export function tryConsume(
  providerId: string,
  ratePerSec: number,
  now: number = Date.now(),
): { allowed: boolean; retryAfterMs: number } {
  if (!(ratePerSec > 0)) return { allowed: true, retryAfterMs: 0 };
  const burst = burstFor(ratePerSec);
  let b = buckets.get(providerId);
  if (!b) {
    b = { tokens: burst, last: now };
    buckets.set(providerId, b);
  }
  return takeToken(b, now, ratePerSec, burst);
}

/** 单测 / 配置变更时清空桶状态 */
export function resetRateLimits(): void {
  buckets.clear();
}
