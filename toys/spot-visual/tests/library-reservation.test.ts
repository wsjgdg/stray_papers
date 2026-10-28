// 统一库回归：预约标注必须真正落到库条目上（手工/POI/A 级 extras 三条通道）。
// 背景：extras 构建曾漏掉 reservation 字段，标注表写了但 A 级条目拿不到。
import { describe, expect, it } from "vitest";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { RESERVATION_NOTES } from "@/lib/poi-descriptions";

const RESERVED = [
  "故宫博物院",
  "陕西历史博物馆",
  "南京博物院",
  "首都博物馆",
  "四川广汉三星堆博物馆",
  "丽江玉龙雪山景区",
  "泰山风景区",
  "华山风景区",
  "峨眉山风景区",
  "云冈石窟",
  "安顺市黄果树旅游景区",
  "上海科技馆",
  "灵隐寺",
];

describe("library reservation propagation", () => {
  it("标注表里的每一条都能在库中命中（名字精确匹配）", () => {
    const byName = new Map<string, number>();
    for (const s of LIBRARY_SPOTS)
      byName.set(s.name, (byName.get(s.name) ?? 0) + 1);
    for (const name of RESERVED) {
      expect(
        byName.get(name),
        `RESERVATION_NOTES 的「${name}」在库里找不到同名景点`,
      ).toBeGreaterThan(0);
    }
  });

  it("标注表内全部条目都在库条目上生效", () => {
    const withReservation = new Set(
      LIBRARY_SPOTS.filter((s) => s.reservation).map((s) => s.name),
    );
    const missed = Object.keys(RESERVATION_NOTES).filter(
      (n) => !withReservation.has(n),
    );
    expect(missed, `这些标注没有落到任何库条目: ${missed.join("、")}`).toEqual(
      [],
    );
  });

  it("带预约标注的条目数 >= 标注表条目数", () => {
    const n = LIBRARY_SPOTS.filter((s) => s.reservation).length;
    expect(n).toBeGreaterThanOrEqual(Object.keys(RESERVATION_NOTES).length);
  });
});
