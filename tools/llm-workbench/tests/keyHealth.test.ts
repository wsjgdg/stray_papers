import { describe, it, expect, vi } from 'vitest';
import {
  recordSuccess,
  recordFailure,
  isUsable,
  getKeyHealth,
  listDeadKeys,
  clearExpired,
} from '../server/keyHealth.js';

describe('keyHealth - 初始状态', () => {
  it('未记录的 Key 默认可用且状态 ok', () => {
    expect(isUsable('init-p', 'k-unknown')).toBe(true);
    const [h] = getKeyHealth('init-p', ['k-unknown']);
    expect(h.status).toBe('ok');
    expect(h.cooldownRemainingMs).toBe(0);
    expect(h.dead).toBe(false);
    expect(h.consecutiveFails).toBe(0);
  });
});

describe('keyHealth - 429 限流冷却', () => {
  it('一次 429 即进入冷却（不可用）且状态 cooling', () => {
    const p = 'cool-p';
    const k = 'sk-cool-key-0001';
    recordFailure(p, k, 429);
    expect(isUsable(p, k)).toBe(false);
    const [h] = getKeyHealth(p, [k]);
    expect(h.status).toBe('cooling');
    expect(h.cooldownRemainingMs).toBeGreaterThan(0);
    expect(h.consecutiveFails).toBe(1);
  });

  it('冷却到期（>5min）后自动恢复可用', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const p = 'expire-p';
      const k = 'sk-expire-key-0001';
      recordFailure(p, k, 429);
      expect(isUsable(p, k)).toBe(false);
      vi.advanceTimersByTime(5 * 60 * 1000 + 100);
      expect(isUsable(p, k)).toBe(true);
      const [h] = getKeyHealth(p, [k]);
      expect(h.status).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('keyHealth - 401/403 坏 Key', () => {
  it('401 立即标记为坏 Key（不可用、dead）', () => {
    const p = 'dead-p';
    const k = 'sk-dead-key-0001';
    recordFailure(p, k, 401);
    expect(isUsable(p, k)).toBe(false);
    const [h] = getKeyHealth(p, [k]);
    expect(h.status).toBe('dead');
    expect(h.dead).toBe(true);
  });

  it('403 同样置 dead', () => {
    const p = 'dead-p2';
    const k = 'sk-dead-key-0002';
    recordFailure(p, k, 403);
    expect(isUsable(p, k)).toBe(false);
    expect(getKeyHealth(p, [k])[0].dead).toBe(true);
  });

  it('坏 Key 出现在 listDeadKeys', () => {
    const p = 'list-p';
    const k = 'sk-list-key-0001';
    recordFailure(p, k, 403);
    expect(listDeadKeys().some((d) => d.providerId === p && d.key === k)).toBe(true);
  });
});

describe('keyHealth - 连续 429 熔断', () => {
  it('连续 3 次 429 后熔断为坏 Key', () => {
    const p = 'thresh-p';
    const k = 'sk-thresh-key-0001';
    recordFailure(p, k, 429);
    recordFailure(p, k, 429);
    // 2 次：处于冷却（不可用）但尚未被熔断为坏 Key
    expect(isUsable(p, k)).toBe(false);
    expect(getKeyHealth(p, [k])[0].status).toBe('cooling');
    expect(getKeyHealth(p, [k])[0].dead).toBe(false);
    recordFailure(p, k, 429); // 第 3 次 → 熔断
    expect(isUsable(p, k)).toBe(false);
    expect(getKeyHealth(p, [k])[0].status).toBe('dead');
    expect(getKeyHealth(p, [k])[0].dead).toBe(true);
  });
});

describe('keyHealth - 成功复位', () => {
  it('坏 Key 成功一次后复活（ok 且可用）', () => {
    const p = 'reset-p';
    const k = 'sk-reset-key-0001';
    recordFailure(p, k, 401);
    expect(isUsable(p, k)).toBe(false);
    recordSuccess(p, k);
    expect(isUsable(p, k)).toBe(true);
    const [h] = getKeyHealth(p, [k]);
    expect(h.status).toBe('ok');
    expect(h.dead).toBe(false);
    expect(h.consecutiveFails).toBe(0);
    expect(listDeadKeys().some((d) => d.providerId === p && d.key === k)).toBe(false);
  });

  it('冷却中的 429 Key 成功一次后复位', () => {
    const p = 'reset2-p';
    const k = 'sk-reset2-key-0001';
    recordFailure(p, k, 429);
    expect(isUsable(p, k)).toBe(false);
    recordSuccess(p, k);
    expect(isUsable(p, k)).toBe(true);
  });
});

describe('keyHealth - 不计入的失败', () => {
  it('网络层错误(null) 与 其它 4xx/5xx 不冷却 Key', () => {
    const p = 'ignore-p';
    const k = 'sk-ignore-key-0001';
    recordFailure(p, k, null);
    recordFailure(p, k, 400);
    recordFailure(p, k, 500);
    expect(isUsable(p, k)).toBe(true);
    expect(getKeyHealth(p, [k])[0].status).toBe('ok');
  });
});

describe('keyHealth - 脱敏与清理', () => {
  it('keyMasked 保留首尾、短 Key 全掩', () => {
    const p = 'mask-p';
    const longKey = 'sk-abcdefghijWXYZ';
    const shortKey = 'abc';
    const [h1] = getKeyHealth(p, [longKey]);
    expect(h1.keyMasked).toBe('sk-a…WXYZ');
    const [h2] = getKeyHealth(p, [shortKey]);
    expect(h2.keyMasked).toBe('••••');
  });

  it('clearExpired 不抛错、对冷却中的 Key 无副作用', () => {
    const p = 'clear-p';
    const k = 'sk-clear-key-0001';
    recordFailure(p, k, 429); // 冷却中，非 dead
    expect(() => clearExpired()).not.toThrow();
    // 冷却未到期 → 仍不可用
    expect(isUsable(p, k)).toBe(false);
  });
});
