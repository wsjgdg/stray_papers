// 院校坐标表的基本不变量：覆盖率、地理范围、与 enrich 院校名的对应关系。
// 这些数据由 scripts/fetch-school-coords.mjs 从掌上高考 + 本地地级边界生成，
// 这里防止「生成脚本坏了」或「坐标越界」这类静默问题。
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  SCHOOL_COORDS,
  SCHOOL_COORD_COUNT,
} from "@/lib/school-coords.generated";

const ENRICH = JSON.parse(
  fs.readFileSync(path.resolve("public/data/gaokao-enrich.json"), "utf8"),
) as { unis: Record<string, unknown> };

describe("院校坐标表", () => {
  const names = Object.keys(SCHOOL_COORDS);

  it("覆盖本站院校的绝大多数（>=85%）", () => {
    const total = Object.keys(ENRICH.unis).length;
    expect(names.length).toBe(SCHOOL_COORD_COUNT);
    expect(names.length / total).toBeGreaterThan(0.85);
  });

  it("坐标都在中国境内的大致经纬度范围内", () => {
    const bad: string[] = [];
    for (const [name, [lng, lat]] of Object.entries(SCHOOL_COORDS)) {
      if (!(lng > 73 && lng < 136 && lat > 3 && lat < 54)) bad.push(name);
    }
    expect(bad).toEqual([]);
  });

  it("不是全部挤在一个省：坐标去重后足够分散", () => {
    const uniq = new Set(names.map((n) => SCHOOL_COORDS[n].join(",")));
    // 586 所院校至少应落在 150 个不同的点/城市上
    expect(uniq.size).toBeGreaterThan(150);
  });

  it("每个键都是 enrich 里真实存在的院校名", () => {
    const missing = names.filter((n) => !(n in ENRICH.unis));
    expect(missing).toEqual([]);
  });
});
