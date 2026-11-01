// 景点档案（外包结构化字段）守护：读取表里的每条都必须能对上库条目，
// 且 low 之外的条目必填三件套齐全——档案是「结构断言」，不能让空壳混进来。
import { describe, expect, it } from "vitest";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { SPOT_PROFILES } from "@/lib/spot-profiles.generated";

const ACCESSIBILITY_SET = new Set([
  "无障碍通道",
  "轮椅租借",
  "母婴室",
  "适老步道",
  "老年人优惠",
  "儿童游乐区",
  "无障碍卫生间",
  "观光车/电瓶车",
  "索道/扶梯",
  "医疗服务点",
  "寄存柜",
  "停车场",
]);

describe("spot profiles", () => {
  it("守护：档案键全部命中库条目", () => {
    const ids = new Set(LIBRARY_SPOTS.map((s) => s.id));
    const ghost = Object.keys(SPOT_PROFILES).filter((id) => !ids.has(id));
    expect(ghost.slice(0, 5), `档案里有 ${ghost.length} 个 id 不在库`).toEqual(
      [],
    );
  });

  it("守护：非 low 条目的必填字段与区间合法；accessibility 不越闭集", () => {
    const bad: string[] = [];
    for (const [id, p] of Object.entries(SPOT_PROFILES)) {
      const low = p.low === true;
      if (!low) {
        if (typeof p.ticketPeak !== "number" && p.ticketPeak !== 0)
          bad.push(`${id} 非 low 但 ticketPeak 为 ${p.ticketPeak}`);
        if (!p.openHours) bad.push(`${id} 非 low 但缺 openHours`);
        if (typeof p.suggestedHours !== "number")
          bad.push(`${id} 非 low 但缺 suggestedHours`);
      }
      if (typeof p.suggestedHours === "number") {
        if (p.suggestedHours < 0.5 || p.suggestedHours > 12)
          bad.push(`${id} suggestedHours=${p.suggestedHours} 越界`);
      }
      if (typeof p.ticketPeak === "number" && p.ticketPeak < 0)
        bad.push(`${id} ticketPeak 为负`);
      if (typeof p.driveFromCityMin === "number") {
        if (p.driveFromCityMin < 1 || p.driveFromCityMin > 600)
          bad.push(`${id} driveFromCityMin=${p.driveFromCityMin} 越界`);
      }
      if (typeof p.needReservation !== "boolean")
        bad.push(`${id} needReservation 非 boolean`);
      if (Array.isArray(p.accessibility)) {
        const outside = p.accessibility.filter(
          (a) => !ACCESSIBILITY_SET.has(a),
        );
        if (outside.length) bad.push(`${id} 闭集外词 ${outside.join("、")}`);
        if (p.accessibility.length > 6)
          bad.push(`${id} accessibility 超过 6 个`);
      }
    }
    expect(bad.slice(0, 8), `档案违规 ${bad.length} 条`).toEqual([]);
  });

  it("覆盖率：5A 已全部有档案", () => {
    const fiveA = LIBRARY_SPOTS.filter((s) => s.level === "5A");
    const missing = fiveA.filter((s) => !SPOT_PROFILES[s.id]);
    expect(
      missing.slice(0, 5).map((s) => s.id),
      `5A 缺档案 ${missing.length} 条`,
    ).toEqual([]);
  });
});
