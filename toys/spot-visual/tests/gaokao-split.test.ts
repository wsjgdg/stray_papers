import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeProvinces,
  admissionsFor,
  controlLine,
  curveFor,
  getSchool,
  isProvinceLoaded,
  loadIndex,
  loadProvincePackage,
  rankForScore,
  totalSchools,
} from "@/lib/gaokao-data";

const read = (p: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), "public/data", p), "utf8"));

describe("分省数据包（真实产物）", () => {
  const index = read("gaokao/2026/index.json");
  const gd = read("gaokao/2026/guangdong.json");

  it("清单可载入，省份与院校总数来自清单", () => {
    expect(loadIndex(index)).toBe(true);
    expect(activeProvinces().length).toBe(Object.keys(index.provs).length);
    expect(totalSchools()).toBe(index.totalSchools);
  });

  it("未载入的省返回空，不误报有数据", () => {
    expect(isProvinceLoaded("广东")).toBe(false);
    expect(admissionsFor("广东", "物理类").length).toBe(0);
  });

  it("载入单省包后投档线可用，且与清单行数一致", () => {
    expect(loadProvincePackage(gd)).toBe(true);
    expect(isProvinceLoaded("广东")).toBe(true);
    const rows = admissionsFor("广东", "物理类");
    expect(rows.length).toBe(index.provs["广东"].cats["物理类"].rows);
    expect(rows[0].prov).toBe("广东");
    expect(rows[0].schoolName.length).toBeGreaterThan(0);
  });

  it("院校画像来自该省行（所在地/层次标志）", () => {
    const first = admissionsFor("广东", "物理类")[0];
    const s = getSchool(first.schoolName);
    expect(s).toBeTruthy();
    expect(typeof s!.prov).toBe("string");
  });

  it("分省包之间互不污染：另一省仍为空", () => {
    expect(admissionsFor("浙江", "综合").length).toBe(0);
    loadProvincePackage(read("gaokao/2026/zhejiang.json"));
    expect(admissionsFor("浙江", "综合").length).toBeGreaterThan(0);
    expect(admissionsFor("广东", "物理类").length).toBeGreaterThan(0);
  });

  it("无一分一段的年份返回空曲线而不是报错", () => {
    expect(curveFor("广东", "物理类")).toEqual([]);
    expect(rankForScore("广东", "物理类", 600)).toBe(0);
    expect(controlLine("广东", "物理类")).toBeUndefined();
  });
});
