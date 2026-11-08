import { describe, it, expect } from 'vitest';
import { findVisibleRange } from '../src/hooks/useVirtualList';

// D2：窗口化渲染的区间计算。这里只测纯函数部分——DOM 行为交给浏览器冒烟。
// offsets 语义：长度 n+1 的前缀和，offsets[i] = 第 i 行起点，offsets[n] = 总高。

/** 等高的偏移表 */
function uniform(count: number, size: number): number[] {
  return Array.from({ length: count + 1 }, (_, i) => i * size);
}

describe('findVisibleRange', () => {
  it('空列表返回空区间', () => {
    expect(findVisibleRange([0], 0, 600)).toEqual({ start: 0, end: 0 });
    expect(findVisibleRange([], 0, 600)).toEqual({ start: 0, end: 0 });
  });

  it('顶部：从头开始，末尾加 overscan', () => {
    // 100 行 × 50px；视口 200px → 可见 0..4 行
    const r = findVisibleRange(uniform(100, 50), 0, 200, 6);
    expect(r.start).toBe(0);
    expect(r.end).toBe(10); // 4 可视 + 6 overscan
  });

  it('中部：起点按二分定位，并向前留 overscan', () => {
    // 滚到 1000px（第 20 行起点），视口 200px → 可见 20..23
    const r = findVisibleRange(uniform(100, 50), 1000, 200, 6);
    expect(r.start).toBe(14); // 20 - 6
    expect(r.end).toBe(30); // 24 + 6
  });

  it('底部：end 不超过总行数', () => {
    const r = findVisibleRange(uniform(100, 50), 5000 - 200, 200, 6);
    expect(r.end).toBe(100);
    expect(r.start).toBeLessThanOrEqual(100);
  });

  it('超出总高的滚动位置仍返回合法区间（橡皮筋/筛选后总高变小）', () => {
    // 二分定位到 lo=100（无行底边 > 该 top），再被 overscan 回拉到 94 → 渲染末尾几行
    const r = findVisibleRange(uniform(100, 50), 999_999, 200, 6);
    expect(r.start).toBe(94);
    expect(r.end).toBe(100);
    // 关键不变量：区间始终落在 [0, n] 内且 start <= end
    expect(r.start).toBeGreaterThanOrEqual(0);
    expect(r.end).toBeLessThanOrEqual(100);
    expect(r.start).toBeLessThanOrEqual(r.end);
  });

  it('视口高度为 0 时用 600 兜底，不会退化成"渲染全部"', () => {
    const r = findVisibleRange(uniform(200, 50), 0, 0, 0);
    expect(r.end).toBe(12); // 600/50
  });

  it('负 scrollTop 视为 0（部分浏览器会短暂给负值）', () => {
    expect(findVisibleRange(uniform(100, 50), -50, 200, 0)).toEqual({ start: 0, end: 4 });
  });

  it('变高行（展开行）时按实际偏移定位', () => {
    // 5 行：48, 48, 200(展开), 48, 48 → 偏移 0,48,96,296,344,392
    const offsets = [0, 48, 96, 296, 344, 392];
    // scrollTop=90 落在第 1 行内（48..96），第 2 行(96..296)也进入视口 → [1, 3)
    expect(findVisibleRange(offsets, 90, 100, 0)).toEqual({ start: 1, end: 3 });
    // 滚过展开行后只剩 3、4 行 → [3, 5)
    expect(findVisibleRange(offsets, 300, 100, 0)).toEqual({ start: 3, end: 5 });
  });

  it('overscan 不会把 start 拉到负数', () => {
    const r = findVisibleRange(uniform(10, 50), 0, 100, 50);
    expect(r.start).toBe(0);
  });
});
