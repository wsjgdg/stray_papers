import { describe, expect, it } from 'vitest';
import { budgetStatus, ratioLevel } from '../server/metrics.js';
import { projectMonthEnd, type UsageDayTotal } from '../server/usageStore.js';

const day = (d: string, cost: number): UsageDayTotal => ({
  day: d,
  cost,
  requests: 1,
  inputTokens: 0,
  outputTokens: 0,
});

describe('budgetStatus', () => {
  it('未设置预算（null/undefined/<=0）恒为 ok，ratio 为 null', () => {
    expect(budgetStatus(12.34, null)).toEqual({ level: 'ok', ratio: null });
    expect(budgetStatus(12.34, undefined)).toEqual({ level: 'ok', ratio: null });
    expect(budgetStatus(12.34, 0)).toEqual({ level: 'ok', ratio: null });
    expect(budgetStatus(12.34, -5)).toEqual({ level: 'ok', ratio: null });
  });

  it('低于 80% 为 ok，ratio 保留 3 位小数；level 与展示 ratio 同源（0.7999 展示 0.8 → warn）', () => {
    expect(budgetStatus(5, 10)).toEqual({ level: 'ok', ratio: 0.5 });
    expect(budgetStatus(0, 10)).toEqual({ level: 'ok', ratio: 0 });
    expect(budgetStatus(7.999, 10)).toEqual({ level: 'warn', ratio: 0.8 });
  });

  it('达到 80% 预算为 warn（恰好边界含在 warn）', () => {
    expect(budgetStatus(8, 10)).toEqual({ level: 'warn', ratio: 0.8 });
    expect(budgetStatus(9.5, 10)).toEqual({ level: 'warn', ratio: 0.95 });
  });

  it('达到 100% 为 exceed（恰好等于预算也超限）', () => {
    expect(budgetStatus(10, 10)).toEqual({ level: 'exceed', ratio: 1 });
    expect(budgetStatus(12.5, 10)).toEqual({ level: 'exceed', ratio: 1.25 });
  });

  it('todayUsd 为 0 时未超任何阈值', () => {
    expect(budgetStatus(0, 10).level).toBe('ok');
    expect(budgetStatus(0, 10).ratio).toBe(0);
  });
});

describe('ratioLevel（E1 泛化：日/月共用同一阈值口径）', () => {
  it('budgetStatus 是 ratioLevel 的等价封装（回归保护）', () => {
    for (const [used, limit] of [
      [0, 10],
      [7.999, 10],
      [8, 10],
      [10, 10],
      [12.5, 10],
      [5, null],
    ] as [number, number | null][]) {
      expect(budgetStatus(used, limit)).toEqual(ratioLevel(used, limit));
    }
  });
});

describe('projectMonthEnd（E1 月终预测）', () => {
  // 2026-09-14（本地时间），当月 30 天
  const NOW = new Date(2026, 8, 14, 10, 0, 0).getTime();

  it('已完成日均 × 剩余天数 + 本月至今；今日（部分交易日）不进入均值分母', () => {
    const totals = [
      ...Array.from({ length: 13 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, 1)),
      day('2026-09-14', 0.5),
    ];
    const p = projectMonthEnd(totals, NOW);
    expect(p.month).toBe('2026-09');
    expect(p.daysInMonth).toBe(30);
    expect(p.elapsedDays).toBe(14);
    expect(p.remainingDays).toBe(16);
    expect(p.windowDays).toBe(7);
    expect(p.basis).toBe('recent');
    expect(p.recentDailyAvgUsd).toBe(1); // 今日 0.5 未被计入，否则会低估
    expect(p.monthToDateUsd).toBe(13.5);
    expect(p.todayUsd).toBe(0.5);
    expect(p.projectedMonthUsd).toBe(29.5); // 13.5 + 1 × 16
    expect(p.projectedOverageUsd).toBeNull(); // 未设月度预算
  });

  it('窗口内缺失的天按 0 计入（真实反映"这 7 天平均每天花多少"）', () => {
    const p = projectMonthEnd([day('2026-09-13', 7)], NOW);
    expect(p.windowDays).toBe(7);
    expect(p.recentDailyAvgUsd).toBe(1); // 7 / 7
    expect(p.monthToDateUsd).toBe(7);
    expect(p.projectedMonthUsd).toBe(23); // 7 + 1 × 16
  });

  it('1 号无已完成日：退化为 basis=today，用今日至今线性外推', () => {
    const p = projectMonthEnd([day('2026-09-01', 2)], new Date(2026, 8, 1, 10).getTime());
    expect(p.windowDays).toBe(0);
    expect(p.basis).toBe('today');
    expect(p.elapsedDays).toBe(1);
    expect(p.remainingDays).toBe(29);
    expect(p.projectedMonthUsd).toBe(60); // 2 + 2 × 29
  });

  it('只统计当月：上月数据不进 monthToDate', () => {
    const p = projectMonthEnd([day('2026-08-31', 100), day('2026-09-13', 1)], NOW);
    expect(p.monthToDateUsd).toBe(1);
    // 8/31 不在 7 天回溯窗口内；金额按 6 位小数收敛（1/7 → 0.142857）
    expect(p.recentDailyAvgUsd).toBe(0.142857);
    expect(p.projectedMonthUsd).toBe(3.285712);
  });

  it('设置月预算时给出预计超额；未超为 0', () => {
    const totals = Array.from({ length: 13 }, (_, i) =>
      day(`2026-09-${String(i + 1).padStart(2, '0')}`, 1),
    );
    const over = projectMonthEnd(totals, NOW, 20);
    expect(over.projectedMonthUsd).toBe(29); // 13 + 1 × 16
    expect(over.projectedOverageUsd).toBe(9);
    const under = projectMonthEnd(totals, NOW, 100);
    expect(under.projectedOverageUsd).toBe(0);
  });

  it('2 月（非闰年）天数与剩余天数正确', () => {
    const p = projectMonthEnd([], new Date(2026, 1, 10, 9).getTime());
    expect(p.month).toBe('2026-02');
    expect(p.daysInMonth).toBe(28);
    expect(p.remainingDays).toBe(18);
    expect(p.projectedMonthUsd).toBe(0);
  });
});
