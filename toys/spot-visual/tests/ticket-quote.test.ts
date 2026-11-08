import { describe, it, expect } from "vitest";
import {
  quoteTicket,
  estimateSpotCost,
  TICKET_KEY,
  TICKET_ESTIMATE_BY_LEVEL,
  type Spot,
} from "../src/lib/spot-data";

/** 构造最小可用 Spot（只填 ticket 口径用到的字段） */
function mkSpot(p: Partial<Spot>): Spot {
  return {
    id: "t1",
    name: "测试景点",
    image: "",
    address: "测试市测试区",
    facilities: [],
    projects: [],
    category: "自然风光",
    description: "",
    ...p,
  };
}

describe("quoteTicket 门票报价口径", () => {
  it("手动补录优先级最高（覆盖真实与估算）", () => {
    const s = mkSpot({ ticketPrice: 60, level: "5A" });
    const q = quoteTicket(s, 12);
    expect(q.source).toBe("custom");
    expect(q.price).toBe(12);
  });

  it("有 ticketPrice 时标为已收录", () => {
    const s = mkSpot({ ticketPrice: 60, level: "5A" });
    const q = quoteTicket(s);
    expect(q.source).toBe("real");
    expect(q.price).toBe(60);
  });

  it("无真实价时按 A 级等级估算", () => {
    const s = mkSpot({ level: "4A", category: "自然风光" });
    const q = quoteTicket(s);
    expect(q.source).toBe("estimate");
    expect(q.price).toBe(TICKET_ESTIMATE_BY_LEVEL["4A"]);
  });

  it("无等级时按分类估算", () => {
    const s = mkSpot({ category: "宗教寺庙" });
    const q = quoteTicket(s);
    expect(q.source).toBe("estimate");
    expect(q.price).toBeGreaterThan(0);
  });

  it("城市地标无等级 → 未收录（不猜，留补录）", () => {
    const s = mkSpot({ category: "城市地标" });
    const q = quoteTicket(s);
    expect(q.source).toBe("unknown");
    expect(q.price).toBeNull();
    expect(q.label).toBe("未收录");
  });
});

describe("estimateSpotCost 景点花费估算", () => {
  it("门票 + 项目", () => {
    const s = mkSpot({
      level: "4A",
      category: "自然风光",
      projects: ["观光车"], // PROJECT_PRICES 里 25
    });
    const cost = estimateSpotCost(s);
    expect(cost).toBe((TICKET_ESTIMATE_BY_LEVEL["4A"] ?? 0) + 25);
  });

  it("主题乐园不叠加项目价（门票已含）", () => {
    const s = mkSpot({
      category: "主题乐园",
      projects: ["过山车", "表演"],
    });
    const cost = estimateSpotCost(s);
    expect(cost).toBe(quoteTicket(s).price);
  });

  it("门票补录生效（TICKET_KEY 为键）", () => {
    const s = mkSpot({ id: "abc", category: "城市地标" });
    expect(quoteTicket(s).price).toBeNull();
    const cost = estimateSpotCost(s, { [`abc::${TICKET_KEY}`]: 88 });
    expect(cost).toBe(88);
  });
});
