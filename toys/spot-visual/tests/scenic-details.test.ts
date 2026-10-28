// 5A/4A 详情回填回归：SCENIC_DETAILS 的每条都必须在库里并携带到 Spot 上。
// 背景：scenic-details.generated.ts 由 scripts/fetch-scenic-details.mjs 烘焙，
// extras 构建曾漏接（与预约标注同款断链），此测试防复发。
import { describe, expect, it } from "vitest";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { SCENIC_DETAILS } from "@/lib/scenic-details.generated";
import { EXTRA_SCENICS } from "@/lib/scenic-enrich.generated";

describe("scenic details propagation", () => {
  it("SCENIC_DETAILS 每条都能命中库内同名景点", () => {
    const byName = new Set(LIBRARY_SPOTS.map((s) => s.name));
    const missed = Object.keys(SCENIC_DETAILS).filter((n) => !byName.has(n));
    expect(missed).toEqual([]);
  });

  it("字段都携带到库条目（图/电话/开放时间，仅 extras 条目）", () => {
    // 同名景点可能以 POI 条目存在（本地照片/自己的 tel），不经本回填——只验 scenic- 侧
    for (const s of LIBRARY_SPOTS) {
      if (!s.id.startsWith("scenic-")) continue;
      const d = SCENIC_DETAILS[s.name];
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
});
