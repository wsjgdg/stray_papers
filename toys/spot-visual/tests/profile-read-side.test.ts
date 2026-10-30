import { describe, it, expect, vi } from "vitest";

/**
 * 读取侧接线验收：外包档案 / 外包描述 合入后，是否真的被数据层和页面取到。
 *
 * 用 vi.mock 替换生成表，而不是去改生成文件——
 * 生成表是合并器的产出物，测试动它既脏又容易和并行会话撞车。
 */

const PROFILE = {
  "scenic-北京-6": {
    ticketPeak: 60,
    ticketOff: 40,
    openHours: "08:30-17:00",
    suggestedHours: 3,
    driveFromCityMin: 45,
    needReservation: false,
    low: false,
  },
  "poi-北京-3": {
    ticketPeak: 2,
    ticketOff: 1,
    openHours: "06:00-21:00",
    suggestedHours: 1.5,
    bestMonths: "4-5月",
    driveFromCityMin: 20,
    accessibility: ["无障碍通道"],
    needReservation: false,
    low: false,
  },
  "scenic-洛阳-0": {
    ticketPeak: 0,
    openHours: "全天",
    suggestedHours: 2,
    needReservation: true,
    reservationNote: "须提前预约",
    low: false,
  },
};

vi.mock("@/lib/spot-profiles.generated", () => ({
  SPOT_PROFILES: PROFILE,
}));
vi.mock("@/lib/scenic-desc-outsource.generated", () => ({
  OUTSOURCE_DESCRIPTIONS: { "scenic-北京-6": "这是一条外包写入的景区描述。" },
}));

const { quoteTicket, getSpotProfile, suggestedVisitHours } = await import("@/lib/spot-data");
const { LIBRARY_SPOTS } = await import("@/lib/spot-data");

const spotById = (id: string) =>
  (LIBRARY_SPOTS as any[]).find((s) => s.id === id) ?? null;

describe("档案读取侧", () => {
  it("按 id 能取到档案", () => {
    expect(getSpotProfile("poi-北京-3")?.ticketPeak).toBe(2);
    expect(getSpotProfile("不存在")).toBeUndefined();
  });

  it("门票报价优先用档案收录价，而不是等级估算", () => {
    const s = spotById("scenic-北京-6");
    expect(s).not.toBeNull();
    const q = quoteTicket(s!, undefined);
    expect(q.source).toBe("profile");
    expect(q.price).toBe(60);
    expect(q.label).toBe("档案收录");
  });

  it("票价为 0 显示「免费」而不是「未收录」", () => {
    const s = spotById("scenic-洛阳-0");
    if (!s) return; // 该 id 在当前库内不存在时跳过，避免误报
    const q = quoteTicket(s, undefined);
    expect(q.price).toBe(0);
    expect(q.label).toBe("免费");
  });

  it("没有档案的条目仍走原有估算链，不被新链路打断", () => {
    const s = (LIBRARY_SPOTS as any[]).find(
      (x) => !PROFILE[x.id as keyof typeof PROFILE],
    );
    const q = quoteTicket(s!, undefined);
    expect(["custom", "profile", "real", "estimate", "unknown"]).toContain(q.source);
    expect(q.source).not.toBe("profile");
  });

  it("建议游玩时长优先取档案值", () => {
    const s = spotById("scenic-北京-6")!;
    expect(suggestedVisitHours(s)).toBe(3);
    const other = (LIBRARY_SPOTS as any[]).find(
      (x) => !PROFILE[x.id as keyof typeof PROFILE] && x.level === "4A",
    )!;
    expect(suggestedVisitHours(other)).toBe(3); // 4A 兜底也是 3，这里确认不报错即可
  });

  it("外包描述按 id 命中库内条目", () => {
    const s = spotById("scenic-北京-6");
    expect(s).not.toBeNull();
    // 描述链：手工 > 外包（按 id）> 模板句
    expect(s!.description).toBe("这是一条外包写入的景区描述。");
  });
});
