// 5A/4A 详情回填回归：SCENIC_DETAILS 的每条都必须在库里并携带到 Spot 上。
// 背景：scenic-details.generated.ts 由 scripts/fetch-scenic-details.mjs 烘焙，
// extras 构建曾漏接（与预约标注同款断链），此测试防复发。
import { describe, expect, it } from "vitest";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { SCENIC_DETAILS } from "@/lib/scenic-details.generated";
import { SCENIC_DESCRIPTIONS } from "@/lib/poi-descriptions";
import { EXTRA_SCENICS } from "@/lib/scenic-enrich.generated";
import { SCENIC_DROPS } from "@/lib/scenic-renames";

describe("scenic details propagation", () => {
  it("SCENIC_DETAILS 每条都能命中库内条目（按原始名录名，或已判删除）", () => {
    // 生成数据按原始名录名建键，展示名经 SCENIC_RENAMES 清洗后可能不同，故用 sourceName 对应；
    // 被清洗删除的条目（公司名/管委会/长短名并存）不再有对应景点，允许其键存在于 SCENIC_DROPS。
    const known = new Set([
      ...LIBRARY_SPOTS.flatMap(
        (s) => [s.name, s.sourceName].filter(Boolean) as string[],
      ),
      ...SCENIC_DROPS,
    ]);
    const missed = Object.keys(SCENIC_DETAILS).filter((n) => !known.has(n));
    expect(missed).toEqual([]);
  });

  it("extras 条目都带 sourceName", () => {
    const missing = LIBRARY_SPOTS.filter(
      (s) => s.id.startsWith("scenic-") && !s.sourceName,
    ).map((s) => s.name);
    expect(missing).toEqual([]);
  });

  it("字段都携带到库条目（图/电话/开放时间，仅 extras 条目）", () => {
    // 同名景点可能以 POI 条目存在（本地照片/自己的 tel），不经本回填——只验 scenic- 侧
    for (const s of LIBRARY_SPOTS) {
      if (!s.id.startsWith("scenic-")) continue;
      const d = SCENIC_DETAILS[s.sourceName ?? s.name];
      if (!d) continue;
      if (d.image) expect(s.image, `${s.name} 图未携带`).toBe(d.image);
      if (d.tel) expect(s.tel, `${s.name} 电话未携带`).toBe(d.tel);
      if (d.openTime)
        expect(s.openTime, `${s.name} 开放时间未携带`).toBe(d.openTime);
      if (d.rating)
        expect(s.rating, `${s.name} 评分未携带`).toBe(Number(d.rating));
    }
  });

  it("回填覆盖率符合预期（extras 的 5A 中 ≥80%）", () => {
    // 分母只算 extras 侧的 5A（手工/POI 的 5A 走原有数据，不经本回填）
    const total5A = EXTRA_SCENICS.filter((e) => e.level === "5A").length;
    const withDetail = Object.keys(SCENIC_DETAILS).length;
    expect(withDetail).toBeGreaterThanOrEqual(total5A * 0.8);
  });

  it("人工描述表的每条都命中库条目并生效", () => {
    const byName = new Map(LIBRARY_SPOTS.map((s) => [s.name, s]));
    for (const [name, desc] of Object.entries(SCENIC_DESCRIPTIONS)) {
      const s = byName.get(name);
      expect(s, `SCENIC_DESCRIPTIONS 的「${name}」不在库中`).toBeTruthy();
      expect(s!.description, `「${name}」的人工描述未生效（仍是模板句）`).toBe(
        desc,
      );
    }
  });
});
