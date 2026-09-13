import { describe, expect, it } from 'vitest';
import { budgetStatus } from '../server/metrics.js';

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
