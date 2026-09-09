import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'vitest';
import { recordCall, getMetrics, resetMetrics } from '../server/metrics.ts';

function call(provider: string, ts: number) {
  recordCall({
    ts,
    provider,
    model: 'm',
    method: 'POST',
    path: '/chat/completions',
    status: 200,
    latencyMs: 10,
    ttftMs: 5,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: null,
    cacheHitRate: null,
    error: null,
    requestBytes: 100,
    responseBytes: 200,
  });
}

describe('metrics getMetrics sort (regression: ?? vs - precedence)', () => {
  beforeEach(() => resetMetrics());

  it('getMetrics sorted by lastTs descending', () => {
    const now = Date.now();
    call('a', now - 5_000);
    call('b', now);
    call('c', now - 10_000);
    const order = getMetrics().map((m) => m.provider);
    assert.deepEqual(order, ['b', 'a', 'c']);
  });

  it('reverse insert order still yields descending', () => {
    const now = Date.now();
    call('c', now - 10_000);
    call('b', now);
    call('a', now - 5_000);
    const order = getMetrics().map((m) => m.provider);
    assert.deepEqual(order, ['b', 'a', 'c']);
  });

  it('same provider uses last ts', () => {
    const now = Date.now();
    call('x', now - 10_000);
    call('y', now - 9_000);
    call('x', now - 2_000);
    const order = getMetrics().map((m) => m.provider);
    assert.deepEqual(order, ['x', 'y']);
  });
});
