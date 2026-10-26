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

  it("一分一段已内置：分数越高位次越靠前，省控线可用", () => {
    const curve = curveFor("广东", "物理类");
    expect(curve.length).toBeGreaterThan(100);
    const high = rankForScore("广东", "物理类", 650);
    const mid = rankForScore("广东", "物理类", 600);
    const low = rankForScore("广东", "物理类", 500);
    expect(high).toBeGreaterThan(0);
    expect(high).toBeLessThan(mid);
    expect(mid).toBeLessThan(low);
    expect(controlLine("广东", "物理类")).toBe(425);
  });

  it("分段填报省份没有本科线时不报错，曲线仍可用", () => {
    expect(controlLine("浙江", "综合")).toBeUndefined();
    expect(curveFor("浙江", "综合").length).toBeGreaterThan(100);
    expect(rankForScore("浙江", "综合", 630)).toBeGreaterThan(0);
  });

  it("清单里的每个科类都带一分一段（新疆西藏除外，官方不公布）", () => {
    const slugOf: Record<string, string> = {
      安徽: "anhui",
      北京: "beijing",
      重庆: "chongqing",
      福建: "fujian",
      广东: "guangdong",
      广西: "guangxi",
      贵州: "guizhou",
      海南: "hainan",
      河北: "hebei",
      黑龙江: "heilongjiang",
      湖北: "hubei",
      湖南: "hunan",
      江苏: "jiangsu",
      辽宁: "liaoning",
      内蒙古: "neimenggu",
      上海: "shanghai",
      山西: "shanxi",
      浙江: "zhejiang",
    };
    const missing: string[] = [];
    const provs = index.provs as Record<
      string,
      { cats: Record<string, { rows: number; ctrl?: number }> }
    >;
    for (const [prov, v] of Object.entries(provs)) {
      const slug = slugOf[prov];
      expect(slug, `省份 ${prov} 缺 slug 映射`).toBeTruthy();
      const pkg = read(`gaokao/2026/${slug}.json`);
      for (const cat of Object.keys(v.cats)) {
        const curve = pkg.cats[cat]?.curve;
        if (!Array.isArray(curve) || curve.length < 20)
          missing.push(`${prov}/${cat}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
