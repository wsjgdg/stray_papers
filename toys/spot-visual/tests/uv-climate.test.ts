// 守护「典型 UV 跟季节走」：旧的典型值是写死的盛夏量级（清晨2/正午11/黄昏4），
// 11 月也显示 11 → 页面告诉用户「正午紫外线极强」，而实测只有 0.2。
import { describe, expect, it } from "vitest";
import { seasonalUvPeak, typicalUvAt } from "@/lib/uv-climate";

const jan = new Date(2026, 0, 15);
const jul = new Date(2026, 6, 15);

describe("典型 UV", () => {
  it("峰值随季节变化：1 月明显低于 7 月", () => {
    expect(seasonalUvPeak(jan)).toBeLessThan(seasonalUvPeak(jul));
    expect(seasonalUvPeak(jul)).toBeGreaterThanOrEqual(10);
    expect(seasonalUvPeak(jan)).toBeLessThanOrEqual(4);
  });

  it("同一时段 1 月与 7 月不能同值（否则等于没按季节算）", () => {
    const noonJan = typicalUvAt(13, jan);
    const noonJul = typicalUvAt(13, jul);
    expect(noonJan).not.toBe(noonJul);
    expect(noonJul).toBeGreaterThan(noonJan);
    // 旧实现在这两个月都给 11
    expect(noonJan).toBeLessThan(11);
  });

  it("日内曲线：正午最高、夜间为 0", () => {
    expect(typicalUvAt(13, jul)).toBeGreaterThan(typicalUvAt(7, jul));
    expect(typicalUvAt(13, jul)).toBeGreaterThan(typicalUvAt(18, jul));
    expect(typicalUvAt(21, jul)).toBe(0);
    expect(typicalUvAt(2, jul)).toBe(0);
  });

  it("有界且非负", () => {
    for (const m of [0, 3, 6, 9, 11]) {
      for (let h = 0; h <= 23; h++) {
        const v = typicalUvAt(h, new Date(2026, m, 15));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(11);
      }
    }
  });
});
