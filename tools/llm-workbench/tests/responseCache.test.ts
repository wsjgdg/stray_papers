import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'vitest';
import {
  setCacheConfig,
  getCacheConfig,
  cacheKey,
  putCached,
  getCached,
  getReplay,
  setCacheRefreshHandler,
  triggerRefresh,
  getCacheStats,
  clearCache,
  sweepExpired,
} from '../server/responseCache.ts';

const entry = (body = 'x', storedAt = Date.now(), cc = '') => ({
  status: 200,
  headers: cc
    ? { 'content-type': 'application/json', 'cache-control': cc }
    : { 'content-type': 'application/json' },
  body: Buffer.from(body),
  storedAt,
});

const replay = (
  over: Partial<{ method: string; url: string; body: string; providerId: string }> = {},
) => ({
  method: 'POST',
  url: 'https://upstream.example/v1/chat/completions',
  headers: { authorization: 'Bearer sk-test', 'content-type': 'application/json' },
  body: '{"model":"gpt-4"}',
  providerId: 'openai',
  ...over,
});

describe('responseCache capacity + expiry governance', () => {
  // 关闭 SWR 以保留原有 FIFO/LRU + 过期语义
  beforeEach(() => {
    setCacheConfig({ enabled: true, ttlMs: 60_000, swrMs: 0 });
    clearCache();
  });

  it('cache hit replays body', () => {
    const k = cacheKey('POST', '/chat/completions', '{"a":1}', 'openai');
    putCached(k, entry('hello'));
    const hit = getCached(k);
    assert.equal(hit.state, 'fresh');
    assert.equal(hit.entry?.body.toString(), 'hello');
  });

  it('evicts oldest when entry count exceeds max', () => {
    for (let i = 0; i < 600; i++) putCached(`k-${i}`, entry('x'));
    const s = getCacheStats();
    assert.ok(s.size <= s.maxEntries);
    assert.ok(s.evictions > 0);
  });

  it('evicts oldest when byte count exceeds max', () => {
    const big = 'y'.repeat(1024 * 1024);
    for (let i = 0; i < 100; i++) putCached(`big-${i}`, entry(big));
    const s = getCacheStats();
    assert.ok(s.bytes <= s.maxBytes);
  });

  it('sweeps expired entries proactively', () => {
    const stale = Date.now() - getCacheConfig().ttlMs - 1_000;
    for (let i = 0; i < 5; i++) putCached(`old-${i}`, entry('x', stale));
    const n = sweepExpired();
    assert.equal(n, 5);
    assert.equal(getCacheStats().size, 0);
    assert.ok(getCacheStats().expired >= 5);
  });

  it('honors no-store / private', () => {
    putCached('ns', entry('x', Date.now(), 'no-store'));
    putCached('pv', entry('x', Date.now(), 'private, max-age=0'));
    assert.equal(getCacheStats().size, 0);
  });

  it('counts misses while disabled', () => {
    setCacheConfig({ enabled: false });
    const before = getCacheStats().misses;
    const hit = getCached('whatever');
    assert.equal(hit.state, 'miss');
    assert.equal(hit.entry, null);
    assert.equal(getCacheStats().misses, before + 1);
    setCacheConfig({ enabled: true });
  });

  it('clearCache zeroes entries and bytes', () => {
    putCached('z', entry('x'));
    assert.equal(clearCache(), 1);
    const s = getCacheStats();
    assert.equal(s.size, 0);
    assert.equal(s.bytes, 0);
  });
});

describe('responseCache stale-while-revalidate (B7)', () => {
  beforeEach(() => {
    setCacheConfig({ enabled: true, ttlMs: 60_000, swrMs: 30_000 });
    clearCache();
    setCacheRefreshHandler(null);
  });

  it('serves stale within SWR window only when replay is available', () => {
    const k = cacheKey('POST', '/c', '{"a":1}', 'openai');
    // TTL 已过的条目
    const old = Date.now() - getCacheConfig().ttlMs - 5_000;

    // 无 replay → 不可 SWR，按 miss 淘汰
    putCached(k, entry('stale1', old));
    assert.equal(getCached(k).state, 'miss');

    // 有 replay → 在 TTL+swr 窗口内回放旧值（state=stale）
    putCached(k, entry('stale2', old), replay());
    const look = getCached(k);
    assert.equal(look.state, 'stale');
    assert.equal(look.entry?.body.toString(), 'stale2');
  });

  it('returns miss once beyond TTL + SWR window', () => {
    const k = cacheKey('POST', '/c', '{"a":1}', 'openai');
    const wayOld = Date.now() - getCacheConfig().ttlMs - getCacheConfig().swrMs - 5_000;
    putCached(k, entry('stale3', wayOld), replay());
    assert.equal(getCached(k).state, 'miss');
  });

  it('getReplay returns the stored refresh recipe', () => {
    const k = cacheKey('POST', '/c', '{"a":1}', 'openai');
    const r = replay({ providerId: 'anthropic', url: 'https://a.example/v1' });
    putCached(k, entry('x'), r);
    const got = getReplay(k);
    assert.ok(got);
    assert.equal(got?.providerId, 'anthropic');
    assert.equal(got?.url, 'https://a.example/v1');
  });

  it('triggerRefresh invokes registered handler and refreshes the entry', () => {
    const k = cacheKey('POST', '/c', '{"a":1}', 'openai');
    const old = Date.now() - getCacheConfig().ttlMs - 5_000;
    const r = replay();
    putCached(k, entry('OLD', old), r);

    let triggered = false;
    setCacheRefreshHandler((key) => {
      triggered = true;
      const rr = getReplay(key);
      assert.ok(rr);
      putCached(
        key,
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('FRESH'),
          storedAt: Date.now(),
        },
        rr ?? undefined,
      );
    });

    const look = getCached(k);
    assert.equal(look.state, 'stale');
    triggerRefresh(k);
    assert.equal(triggered, true);

    // 刷新后续读应为 fresh 且为新鲜值
    const after = getCached(k);
    assert.equal(after.state, 'fresh');
    assert.equal(after.entry?.body.toString(), 'FRESH');
  });

  it('triggerRefresh is a no-op without a registered handler', () => {
    const k = cacheKey('POST', '/c', '{"a":1}', 'openai');
    const old = Date.now() - getCacheConfig().ttlMs - 5_000;
    putCached(k, entry('OLD', old), replay());
    assert.doesNotThrow(() => triggerRefresh(k));
    assert.equal(getCached(k).state, 'stale');
  });
});
