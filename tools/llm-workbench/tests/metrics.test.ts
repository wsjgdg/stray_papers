import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'vitest';
import {
  recordCall,
  getMetrics,
  resetMetrics,
  getSummary,
  sampleRateHistory,
  getRateHistory,
  getLogs,
  findLogByRequestId,
} from '../server/metrics.ts';

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

describe('metrics summary + logs + rate history', () => {
  beforeEach(() => resetMetrics());

  const rec = (provider: string, status = 200) =>
    recordCall({
      ts: Date.now(),
      provider,
      model: 'm',
      method: 'POST',
      path: '/chat/completions',
      status,
      latencyMs: 1,
      ttftMs: 1,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheHitRate: 0.2,
      error: status >= 400 ? 'e' : null,
      requestBytes: 1,
      responseBytes: 1,
    });

  it('getSummary aggregates rates, today buckets, recent models', () => {
    rec('p1');
    const s = getSummary();
    assert.equal(s.recentModels.length, 1);
    assert.equal(s.recentModels[0].model, 'm');
    assert.ok(s.todayInputTokens >= 1000);
    assert.equal(typeof s.rateHistoryMax, 'number');
    assert.ok(Array.isArray(s.rateHistory));
  });

  it('sampleRateHistory appends and is bounded', () => {
    for (let i = 0; i < 5; i++) sampleRateHistory();
    assert.equal(getRateHistory().length, 5);
  });
  it('findLogByRequestId returns the matching entry', () => {
    recordCall({
      ts: Date.now(),
      provider: 'rq',
      model: 'm',
      method: 'POST',
      path: '/chat/completions',
      status: 200,
      latencyMs: 3,
      ttftMs: 1,
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: null,
      cacheHitRate: null,
      error: null,
      requestBytes: 1,
      responseBytes: 2,
      requestId: 'req-abc',
    });
    const hit = findLogByRequestId('req-abc');
    assert.ok(hit);
    assert.equal(hit.provider, 'rq');
    assert.equal(findLogByRequestId('nope'), null);
    assert.equal(findLogByRequestId(''), null);
  });

  it('getLogs filters by provider / status / limit', () => {
    rec('p1');
    rec('p2', 500);
    assert.equal(getLogs({ provider: 'p1' }).length, 1);
    assert.equal(getLogs({ status: 'error' }).length, 1);
    assert.equal(getLogs({ limit: 1 }).length, 1);
  });
});
