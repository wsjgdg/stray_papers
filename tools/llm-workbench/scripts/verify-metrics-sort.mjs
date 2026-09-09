// 回归：指标列表按 lastTs 降序排序（server/metrics.ts getMetrics）。
// 历史 bug：`y.lastTs ?? 0 - (x.lastTs ?? 0)` 因 `-` 优先级高于 `??`，
// 实际解析为 `y.lastTs ?? (0 - (...))`，比较函数恒为正 → 排序失效。
import assert from 'node:assert/strict';
import { recordCall, getMetrics, resetMetrics } from '../server/metrics.ts';

let pass = 0;
const ok = (name, extra = '') => {
  pass++;
  console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`);
};

function call(provider, ts) {
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

resetMetrics();
const now = Date.now();
call('a', now - 5_000);
call('b', now);
call('c', now - 10_000);

// 1) 降序：最新在前
{
  const order = getMetrics().map((m) => m.provider);
  assert.deepEqual(order, ['b', 'a', 'c'], `实际顺序 ${order.join(',')}`);
  ok('getMetrics 按 lastTs 降序', order.join(' > '));
}

// 2) 逆序插入同样得到降序结果（证明不是靠插入顺序蒙对）
resetMetrics();
call('c', now - 10_000);
call('b', now);
call('a', now - 5_000);
{
  const order = getMetrics().map((m) => m.provider);
  assert.deepEqual(order, ['b', 'a', 'c'], `实际顺序 ${order.join(',')}`);
  ok('逆序插入仍为降序', order.join(' > '));
}

// 3) 同一 provider 多次调用后以最后一次为准
resetMetrics();
call('x', now - 10_000); // x 首次很旧，但下面还有一次更新
call('y', now - 9_000);
call('x', now - 2_000); // x 最后一次晚于 y → x 应排在 y 前
{
  const order = getMetrics().map((m) => m.provider);
  assert.deepEqual(order, ['x', 'y'], `实际顺序 ${order.join(',')}`);
  ok('同 provider 以最后一次 ts 参与排序', order.join(' > '));
}

resetMetrics();
console.log(`\n结果: ${pass} 通过 / 0 失败`);
