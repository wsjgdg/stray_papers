import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'vitest';
import { recordCall, resetMetrics, type CallLog } from '../server/metrics.js';
import { renderMetrics } from '../server/prometheus.js';

function mkLog(over: Partial<CallLog>): Omit<CallLog, 'id' | 'costUsd'> {
  return {
    ts: Date.now(),
    provider: 'mockp',
    model: 'mock-model',
    method: 'POST',
    path: '/v1/chat/completions',
    status: 200,
    latencyMs: 320,
    ttftMs: null,
    inputTokens: 10,
    outputTokens: 4,
    cacheReadTokens: 0,
    cacheHitRate: 0,
    error: null,
    requestBytes: 50,
    responseBytes: 30,
    ...over,
  };
}

describe('prometheus metrics (B10)', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('exports cache hit rate gauge per provider', () => {
    recordCall(mkLog({ cacheHitRate: 0.5, provider: 'mockp' }));
    recordCall(mkLog({ cacheHitRate: 0.25, provider: 'mockp' }));
    const txt = renderMetrics();
    const m = txt.match(/llmworkbench_cache_hit_rate\{provider="mockp"\} (-?[\d.]+)/);
    assert.ok(m, 'cache_hit_rate series should exist');
    assert.equal(Number(m![1]), 0.375, 'avg of 0.5 and 0.25');
  });

  it('exports a latency histogram with buckets/sum/count', () => {
    recordCall(mkLog({ latencyMs: 320, provider: 'mockp' }));
    const txt = renderMetrics();
    assert.ok(
      /llmworkbench_request_latency_ms_bucket\{provider="mockp",le="500"\} 1/.test(txt),
      '320ms should fall in le=500 bucket',
    );
    assert.ok(
      /llmworkbench_request_latency_ms_bucket\{provider="mockp",le="\+Inf"\} 1/.test(txt),
      'inf bucket should equal sample count',
    );
    assert.ok(/llmworkbench_request_latency_ms_sum\{provider="mockp"\} 320/.test(txt));
    assert.ok(/llmworkbench_request_latency_ms_count\{provider="mockp"\} 1/.test(txt));
  });

  it('exports per-model request counts (provider+model labels)', () => {
    recordCall(mkLog({ model: 'gpt4o', provider: 'openai' }));
    recordCall(mkLog({ model: 'gpt4o', provider: 'openai' }));
    recordCall(mkLog({ model: 'claude3', provider: 'openai' }));
    const txt = renderMetrics();
    const m = txt.match(
      /llmworkbench_requests_by_model_total\{provider="openai",model="gpt4o"\} (\d+)/,
    );
    assert.ok(m, 'per-model series for gpt4o should exist');
    assert.equal(Number(m![1]), 2);
    assert.ok(/model="claude3"\} 1/.test(txt));
  });
});
