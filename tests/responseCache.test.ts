import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'vitest';
import {
  setCacheConfig,
  getCacheConfig,
  cacheKey,
  putCached,
  getCached,
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

describe('responseCache capacity + expiry governance', () => {
  beforeEach(() => {
    setCacheConfig({ enabled: true, ttlMs: 60_000 });
    clearCache();
  });

  it('cache hit replays body', () => {
    const k = cacheKey('POST', '/chat/completions', '{"a":1}', 'openai');
    putCached(k, entry('hello'));
    const hit = getCached(k);
    assert.equal(hit?.body.toString(), 'hello');
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
    assert.equal(getCached('whatever'), null);
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
