import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  takeToken,
  tryConsume,
  burstFor,
  resetRateLimits,
  type Bucket,
} from '../server/rateLimit.js';

describe('rateLimit: 令牌桶 (B3)', () => {
  it('burstFor 至少为 1', () => {
    assert.equal(burstFor(0.2), 1);
    assert.equal(burstFor(1), 1);
    assert.equal(burstFor(5), 5);
  });

  it('takeToken：满桶允许突发，耗尽后拒绝并给出 retryAfterMs', () => {
    const b: Bucket = { tokens: 2, last: 1000 };
    assert.equal(takeToken(b, 1000, 2, 2).allowed, true);
    assert.equal(takeToken(b, 1000, 2, 2).allowed, true);
    const denied = takeToken(b, 1000, 2, 2);
    assert.equal(denied.allowed, false);
    // rate=2/s → 差 1 个令牌需 500ms
    assert.equal(denied.retryAfterMs, 500);
  });

  it('takeToken：按速率补充，等待后可再次通过', () => {
    const b: Bucket = { tokens: 1, last: 0 };
    assert.equal(takeToken(b, 0, 1, 1).allowed, true);
    assert.equal(takeToken(b, 100, 1, 1).allowed, false); // 仅补 0.1 个
    assert.equal(takeToken(b, 1000, 1, 1).allowed, true); // 补满 1 个
  });

  it('takeToken：补充不超过桶容量上限', () => {
    const b: Bucket = { tokens: 0, last: 0 };
    // 经过 100s、rate=10 → 理论补 1000，但容量 5 → 只到 5，允许 5 次
    assert.equal(takeToken(b, 100_000, 10, 5).allowed, true);
    assert.equal(takeToken(b, 100_000, 10, 5).allowed, true);
    assert.equal(takeToken(b, 100_000, 10, 5).allowed, true);
    assert.equal(takeToken(b, 100_000, 10, 5).allowed, true);
    assert.equal(takeToken(b, 100_000, 10, 5).allowed, true);
    assert.equal(takeToken(b, 100_000, 10, 5).allowed, false);
  });

  it('tryConsume：ratePerSec<=0 直通（未配置限流）', () => {
    resetRateLimits();
    for (let i = 0; i < 20; i++) assert.equal(tryConsume('p', 0).allowed, true);
  });

  it('tryConsume：按厂商隔离，突发耗尽后拒绝', () => {
    resetRateLimits();
    const now = 1_000_000;
    assert.equal(tryConsume('a', 2, now).allowed, true);
    assert.equal(tryConsume('a', 2, now).allowed, true);
    assert.equal(tryConsume('a', 2, now).allowed, false);
    assert.equal(tryConsume('b', 2, now).allowed, true); // 不同厂商互不影响
  });

  it('resetRateLimits 清空状态', () => {
    resetRateLimits();
    const now = 5_000_000;
    assert.equal(tryConsume('a', 1, now).allowed, true);
    assert.equal(tryConsume('a', 1, now).allowed, false);
    resetRateLimits();
    assert.equal(tryConsume('a', 1, now).allowed, true);
  });
});
