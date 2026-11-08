import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  admissionsFor,
  loadIndex,
  loadProvincePackage,
  loadBatchesDataset,
  rankForScore,
  controlLine,
} from "@/lib/gaokao-data";

const read = (p: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), "public/data", p), "utf8"));

describe("2026 真实数据端到端", () => {
  it("原表无位次的省份，反推后同分去向可用", () => {
    loadIndex(read("gaokao/2026/index.json"));
    for (const [slug, prov, cat] of [
      ["hunan", "湖南", "物理类"],
      ["beijing", "北京", "综合"],
      ["hebei", "河北", "物理类"],
      ["jiangsu", "江苏", "物理类"],
    ] as const) {
      loadProvincePackage(read(`gaokao/2026/${slug}.json`));
      const rank = rankForScore(prov, cat, 570);
      const lo = Math.round(rank * 0.85);
      const hi = Math.round(rank * 1.15);
      const rows = admissionsFor(prov, cat);
      const hit = rows.filter((r) => r.minRank >= lo && r.minRank <= hi);
      const derived = rows.filter((r) => r.rankDerived).length;
      console.log(
        `${prov}/${cat} 570分→位次${rank} 命中${hit.length}所 反推行${derived}/${rows.length} 本科线${controlLine(prov, cat) ?? "—"}`,
      );
      expect(rank).toBeGreaterThan(0);
      expect(hit.length).toBeGreaterThan(5);
      expect(derived).toBeGreaterThan(0);
    }
  });

  it("批次先载入、省包后到，位次照样补齐（与加载顺序无关）", () => {
    // 换年份会清空运行时索引，借此拿到干净状态
    loadIndex(read("gaokao/2025/index.json"));
    loadIndex(read("gaokao/2026/index.json"));
    loadBatchesDataset(read("gaokao-2026-batches.json"));
    const zeroBefore = admissionsFor("湖南", "物理类", "zhuanke").filter(
      (r) => !r.minRank,
    ).length;
    expect(zeroBefore).toBeGreaterThan(0);
    loadProvincePackage(read("gaokao/2026/hunan.json"));
    const zeroAfter = admissionsFor("湖南", "物理类", "zhuanke").filter(
      (r) => !r.minRank,
    ).length;
    console.log(`专科批缺位次：省包载入前 ${zeroBefore} → 后 ${zeroAfter}`);
    expect(zeroAfter).toBeLessThan(zeroBefore);
  });
});
