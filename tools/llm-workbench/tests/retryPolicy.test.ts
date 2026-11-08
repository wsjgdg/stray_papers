import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RETRY_ON,
  isRetryable,
  parseRetryAfter,
  computeBackoff,
} from '../server/retryPolicy.js';

describe('isRetryable', () => {
  it('默认集合命中 401/403/429', () => {
    expect(isRetryable(401, DEFAULT_RETRY_ON)).toBe(true);
    expect(isRetryable(403, DEFAULT_RETRY_ON)).toBe(true);
    expect(isRetryable(429, DEFAULT_RETRY_ON)).toBe(true);
  });

  it('网络错误（null）始终可重试', () => {
    expect(isRetryable(null, DEFAULT_RETRY_ON)).toBe(true);
  });

  it('5xx 与未列入的 4xx 不可重试', () => {
    expect(isRetryable(500, DEFAULT_RETRY_ON)).toBe(false);
    expect(isRetryable(400, DEFAULT_RETRY_ON)).toBe(false);
    expect(isRetryable(404, DEFAULT_RETRY_ON)).toBe(false);
  });

  it('per-provider retryOn 覆盖默认', () => {
    const custom = [429, 500];
    expect(isRetryable(500, custom)).toBe(true);
    expect(isRetryable(401, custom)).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('秒数被正常解析并钳制到 8s 上限', () => {
    expect(parseRetryAfter('1')).toBe(1000);
    expect(parseRetryAfter('100')).toBe(8000); // 超过 cap
  });

  it('HTTP-date 被解析为相对毫秒', () => {
    const now = Date.now();
    const future = new Date(now + 3000).toUTCString();
    const parsed = parseRetryAfter(future);
    expect(parsed).not.toBeNull();
    // toUTCString 截断到秒，差值落在 [0, ~3.1s]
    expect(parsed! >= 0 && parsed! <= 3100).toBe(true);
  });

  it('缺失 / 非法值返回 null', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('garbage')).toBeNull();
  });
});

describe('computeBackoff', () => {
  it('指数退避 base × 2^attempt，封顶 8s', () => {
    expect(computeBackoff(0, null)).toBe(500);
    expect(computeBackoff(1, null)).toBe(1000);
    expect(computeBackoff(2, null)).toBe(2000);
    expect(computeBackoff(3, null)).toBe(4000);
    expect(computeBackoff(4, null)).toBe(8000);
    expect(computeBackoff(10, null)).toBe(8000);
  });

  it('Retry-After 与指数退避取较大者', () => {
    // attempt 0 指数值 500，Retry-After 3000 更大 → 取 3000
    expect(computeBackoff(0, 3000)).toBe(3000);
    // attempt 5 指数值封顶 8000，Retry-After 2000 更小 → 取 8000
    expect(computeBackoff(5, 2000)).toBe(8000);
  });
});
