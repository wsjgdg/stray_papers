import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'vitest';
import {
  costSpikeStatus,
  currentCostSpike,
  hourCostBuckets,
  recordCall,
  resetMetrics,
  getSummary,
  COST_SPIKE_ALERT_RATIO,
  COST_SPIKE_MIN_BASELINE_HOURS,
  COST_SPIKE_MIN_ELAPSED_MIN,
} from '../server/metrics.ts';

// E3：成本异动告警。基线 = 已完成小时「每分钟成本」的中位数，
// 当前小时按已过分钟数折算后与之相比，避免整点附近必然低估。

const at = (h: number, m: number) => new Date(2026, 8, 14, h, m, 0).getTime(); // 本地时间
const hour = (h: number) => `2026-09-14T${String(h).padStart(2, '0')}`;
const B = (h: number, cost: number, requests = 1) => ({ hour: hour(h), cost, requests });
/** 任意时间戳的本地小时 key（与 server/metrics.ts 的 hourKey 同构，避免测试写死日期） */
const localHourKey = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
};

/** 09–12 四个已完成小时，每分钟成本均为 baseline/60 */
const fourHours = (perHourCost: number) => [9, 10, 11, 12].map((h) => B(h, perHourCost, 1));

describe('costSpikeStatus 阈值与护栏', () => {
  const NOW = at(13, 29); // 本小时已过 30 分钟

  it('ratio ≥ 3 判 alert（0.01/min 基线 vs 0.03/min 当前）', () => {
    const s = costSpikeStatus([...fourHours(0.6), B(13, 0.9)], NOW);
    assert.equal(s.elapsedMinutes, 30);
    assert.equal(s.perMinuteUsd, 0.03);
    assert.equal(s.baselinePerMinUsd, 0.01);
    assert.equal(s.baselinePerHourUsd, 0.6);
    assert.equal(s.ratio, 3);
    assert.equal(s.level, 'alert');
    assert.equal(s.reason, 'ok');
    assert.equal(s.sampleHours, 4);
  });

  it('ratio ≥ 1.8 且 < 3 判 warn', () => {
    const s = costSpikeStatus([...fourHours(0.6), B(13, 0.6)], NOW);
    assert.equal(s.ratio, 2);
    assert.equal(s.level, 'warn');
    assert.equal(s.reason, 'ok');
  });

  it('刚好等于 alert 阈值即告警（边界含等号）', () => {
    const s = costSpikeStatus([...fourHours(0.6), B(13, 0.9)], NOW);
    assert.equal(s.ratio, COST_SPIKE_ALERT_RATIO);
    assert.equal(s.level, 'alert');
  });

  it('介于 1 倍与 warn 阈值之间为 normal', () => {
    const s = costSpikeStatus([...fourHours(0.6), B(13, 0.45)], NOW);
    assert.equal(s.ratio, 1.5);
    assert.equal(s.level, 'normal');
    assert.equal(s.reason, 'ok');
  });

  it('本小时不足 MIN_ELAPSED 分钟 → too-early（即便成本已超高）', () => {
    const s = costSpikeStatus([...fourHours(0.6), B(13, 99)], at(13, 3));
    assert.equal(s.elapsedMinutes, COST_SPIKE_MIN_ELAPSED_MIN - 1);
    assert.equal(s.level, 'normal');
    assert.equal(s.reason, 'too-early');
  });

  it('已完成小时不足 MIN_BASELINE_HOURS → insufficient-hours', () => {
    const buckets = [B(11, 0.6), B(12, 0.6), B(13, 99)];
    assert.equal(buckets.length - 1, 2);
    assert.ok(2 < COST_SPIKE_MIN_BASELINE_HOURS);
    const s = costSpikeStatus(buckets, NOW);
    assert.equal(s.sampleHours, 2);
    assert.equal(s.level, 'normal');
    assert.equal(s.reason, 'insufficient-hours');
  });

  it('基线为 0 → no-baseline（ratio 为 null，不做除零）', () => {
    const s = costSpikeStatus([...fourHours(0), B(13, 5)], NOW);
    assert.equal(s.baselinePerMinUsd, 0);
    assert.equal(s.ratio, null);
    assert.equal(s.reason, 'no-baseline');
    assert.equal(s.level, 'normal');
  });

  it('绝对下限先于倍数判定：倍数已 33× 但本小时不足 $0.01 → below-floor', () => {
    // 基线 1e-6/min（= $6e-5/h）；当前小时 $0.001 / 30min = 3.3e-5 → 先按 6 位小数归整为 3.3e-5，再比值得 33×
    const s = costSpikeStatus([...fourHours(6e-5), B(13, 0.001)], NOW);
    assert.equal(s.baselinePerMinUsd, 1e-6);
    assert.equal(s.ratio, 33);
    assert.ok(s.ratio >= COST_SPIKE_ALERT_RATIO);
    assert.equal(s.reason, 'below-floor');
    assert.equal(s.level, 'normal');
  });

  it('无流量的已完成小时（requests=0）被排除在基线之外', () => {
    const noisy = [B(5, 0, 0), B(6, 1000, 0)];
    const s = costSpikeStatus([...noisy, ...fourHours(0.6), B(13, 0.9)], NOW);
    assert.equal(s.sampleHours, 4);
    assert.equal(s.baselinePerMinUsd, 0.01);
    assert.equal(s.level, 'alert');
  });

  it('偶数个样本取中间两值均值（不是上中位数）', () => {
    // 每分钟成本：[0.01, 0.01, 0.03, 0.03] → 中位数 0.02（上中位数会得 0.03）
    const s = costSpikeStatus([B(9, 0.6), B(10, 0.6), B(11, 1.8), B(12, 1.8), B(13, 0.3)], NOW);
    assert.equal(s.baselinePerMinUsd, 0.02);
    assert.equal(s.baselinePerHourUsd, 1.2);
    assert.equal(s.sampleHours, 4);
  });

  it('未来小时（hour > 当前）不计入基线', () => {
    const s = costSpikeStatus([...fourHours(0.6), B(20, 1000), B(13, 0.9)], NOW);
    assert.equal(s.sampleHours, 4);
    assert.equal(s.level, 'alert');
  });

  it('空桶数组不抛错（除零防线）', () => {
    const s = costSpikeStatus([], NOW);
    assert.equal(s.hourCostUsd, 0);
    assert.equal(s.perMinuteUsd, 0);
    assert.equal(s.hourKey, hour(13));
    assert.equal(s.level, 'normal');
  });
});

describe('小时成本环（内存态）', () => {
  beforeEach(() => resetMetrics());

  const call = (ts: number) =>
    recordCall({
      ts,
      provider: 'p',
      model: 'm',
      method: 'POST',
      path: '/chat/completions',
      status: 200,
      latencyMs: 10,
      ttftMs: 5,
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: null,
      cacheHitRate: null,
      error: null,
      requestBytes: 100,
      responseBytes: 200,
    });

  it('同一小时多次调用累加到同一桶', () => {
    const t = at(13, 10);
    call(t);
    call(t + 1000);
    const buckets = hourCostBuckets();
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].hour, hour(13));
    assert.equal(buckets[0].requests, 2);
    assert.equal(buckets[0].cost > 0, true);
  });

  it('桶按时间升序返回', () => {
    call(at(15, 1));
    call(at(9, 1));
    call(at(12, 1));
    assert.deepEqual(
      hourCostBuckets().map((b) => b.hour),
      [hour(9), hour(12), hour(15)],
    );
  });

  it('环形上限 25 小时，淘汰最旧的桶', () => {
    const base = new Date(2026, 8, 10, 0, 0, 0).getTime();
    for (let i = 0; i < 30; i += 1) call(base + i * 3_600_000);
    const buckets = hourCostBuckets();
    assert.equal(buckets.length, 25);
    assert.equal(buckets[0].hour, localHourKey(base + 5 * 3_600_000)); // 09-10T05
    assert.equal(buckets[24].hour, localHourKey(base + 29 * 3_600_000)); // 09-11T05
  });

  it('currentCostSpike 读取实时内存桶', () => {
    const t = Date.now();
    call(t);
    const s = currentCostSpike(t);
    assert.equal(s.hourKey, hour(new Date(t).getHours()));
    assert.equal(s.hourCostUsd > 0, true);
  });

  it('resetMetrics 清空小时环，基线不残留', () => {
    call(at(13, 10));
    assert.equal(hourCostBuckets().length, 1);
    resetMetrics();
    assert.equal(hourCostBuckets().length, 0);
  });

  it('getSummary 暴露 E3 字段且冷启动不误报', () => {
    const s = getSummary();
    assert.equal(s.hourCostUsd, 0);
    assert.equal(s.costSampleHours, 0);
    assert.equal(s.costSpikeLevel, 'normal');
    assert.equal(typeof s.costBaselinePerHrUsd, 'number');
    assert.equal(s.costSpikeRatio, null);
  });

  it('getSummary 的 E3 字段直连实时小时环（接线断言）', () => {
    const now = Date.now();
    for (let k = 4; k >= 1; k -= 1) call(now - k * 3_600_000); // 4 个已完成小时
    const live = currentCostSpike(now);
    const s = getSummary();
    assert.equal(s.costSampleHours, 4);
    assert.equal(s.costSampleHours, live.sampleHours);
    assert.equal(s.hourCostUsd, live.hourCostUsd);
    assert.equal(s.costSpikeRatio, live.ratio);
    assert.equal(s.costSpikeLevel, live.level);
  });
});
