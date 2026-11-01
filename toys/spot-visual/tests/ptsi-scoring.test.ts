// PTSI 计分守护：防止退回「所有项同一个值」的旧行为
//  1) UV 连续计分（旧实现是 5 档台阶，7 天预报里多数日子同分）
//  2) 降水参与逐日评估
//  3) 景点排行必须逐景点有差异（旧实现给每个景点传同一 UV + 0 拥挤 → 全表同分）
import { describe, expect, it } from "vitest";
import {
  calcPTSI,
  calcPTSIForSpots,
  uvPenalty,
  precipPenalty,
  exposurePenalty,
  effortPenalty,
} from "@/lib/ptsi-calculator";

describe("PTSI 计分", () => {
  it("UV 扣分是连续函数，不是台阶", () => {
    const scores = [0, 2, 3, 5, 7, 8, 9, 11].map(uvPenalty);
    expect(new Set(scores).size).toBeGreaterThanOrEqual(7);
    expect(uvPenalty(0)).toBe(0);
    expect(uvPenalty(11)).toBe(50);
    // 单调不减
    for (let i = 1; i < scores.length; i++)
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
  });

  it("7 天窗口：不同 uvMax/降水要给出不同分", () => {
    const days = [
      { uv: 3, rain: 0 },
      { uv: 5, rain: 10 },
      { uv: 7, rain: 40 },
      { uv: 9, rain: 90 },
      { uv: 11, rain: 20 },
    ];
    const scores = days.map(
      (d) => calcPTSI(d.uv, [], { precipProb: d.rain }).score,
    );
    expect(new Set(scores).size).toBe(scores.length);
  });

  it("降水/暴露扣分有界且只增不减", () => {
    expect(precipPenalty(null)).toBe(0);
    expect(precipPenalty(100)).toBe(15);
    expect(precipPenalty(50)).toBeLessThan(precipPenalty(90));
    // 暴露时长线性：0.5h 与 2h 不能再同为 0（否则半日游景点全部同分）
    expect(exposurePenalty(2)).toBeGreaterThan(exposurePenalty(0.5));
    expect(exposurePenalty(12)).toBe(10);
    expect(exposurePenalty(6)).toBeGreaterThan(0);
  });

  it("景点排行：体力与时长要拉开分数，且不再按评分反推拥挤", () => {
    const spots = [
      { name: "A", rating: 4.9, level: "5A", suggestedHours: 8, stamina: 90 },
      { name: "B", rating: 4.6, level: "5A", suggestedHours: 3, stamina: 30 },
      { name: "C", rating: 4.2, level: "4A", suggestedHours: 2, stamina: 20 },
      { name: "D", rating: 4.0, level: "4A", suggestedHours: 1, stamina: 15 },
      { name: "E", rating: 4.8, level: null, suggestedHours: 5, stamina: 55 },
    ];
    const res = calcPTSIForSpots(spots, []);
    const scores = res.map((r) => r.ptsi.score);
    expect(new Set(scores).size).toBeGreaterThanOrEqual(4);
    const byName = new Map(res.map((r) => [r.name, r.ptsi.score]));
    // 体力大 + 玩得久 → 分更低（只剩真实维度：体力 + 暴露时长）
    expect(byName.get("A")!).toBeLessThan(byName.get("D")!);
    // 评分本身不参与扣分：同体力同时长时，4.9 分与 4.0 分同分
    const tie = calcPTSIForSpots(
      [
        { name: "hi", rating: 4.9, level: "5A", suggestedHours: 2, stamina: 40 },
        { name: "lo", rating: 4.0, level: "4A", suggestedHours: 2, stamina: 40 },
      ],
      [],
    );
    expect(tie[0].ptsi.score).toBe(tie[1].ptsi.score);
    // 返回值里不再有 crowdMinutes（拥挤分钟已整体移除）
    expect("crowdMinutes" in res[0]).toBe(false);
  });

  it("体力扣分有界：0 → 0 分，100 → 30 分", () => {
    expect(effortPenalty(null)).toBe(0);
    expect(effortPenalty(0)).toBe(0);
    expect(effortPenalty(100)).toBe(30);
    expect(effortPenalty(50)).toBe(15);
    expect(effortPenalty(90)).toBeGreaterThan(effortPenalty(50));
  });
});
