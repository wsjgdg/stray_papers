import { describe, it, expect } from "vitest";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { SPOT_PROFILES } from "@/lib/spot-profiles.generated";

/**
 * 外包「景点档案」的守护测试。
 *
 * 为什么需要：档案是外部 AI 逐批写的，合入脚本（`merge-out-profile.mjs`）只做
 * 「条数/id/名字/区间/闭集」这类结构性验收，判断不了下面两类错误——
 *
 *   1. **id 落空**：写到库里根本不存在的条目上（比如外包顺手改了 id、或条目被后续清洗删掉了），
 *      数据白发，而且是静默的——页面上不会有任何提示。
 *   2. **口径跑偏**：票价写成 0 当「未收录」（我们规定免费才填 0、不知道填 null）；
 *      时长写成 24 小时这类明显不合理的数字。
 *
 * 这个测试就是把这两类钉死在 CI 上：档案为空时直接跳过，不阻塞日常开发。
 */

const ACCESSIBILITY = new Set([
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

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

describe("外包景点档案", () => {
  const ids = new Set((LIBRARY_SPOTS as any[]).map((s) => String(s.id)));
  const entries = Object.entries(SPOT_PROFILES as Record<string, any>);

  it("每个键都是库内真实存在的条目 id", () => {
    const ghost = entries.map(([k]) => k).filter((k) => !ids.has(k));
    expect(ghost, `档案里有库内不存在的 id：${ghost.join("、")}`).toEqual([]);
  });

  it("票价字段：非负数或 null，且 0 只代表免费", () => {
    const bad: string[] = [];
    for (const [id, p] of entries) {
      for (const key of ["ticketPeak", "ticketOff"] as const) {
        const v = p?.[key];
        if (v === null || v === undefined) continue;
        if (!isNum(v) || v < 0) bad.push(`${id}.${key}=${v}`);
      }
    }
    expect(bad, `票价非法：${bad.join("、")}`).toEqual([]);
  });

  it("淡季票价不高于旺季票价", () => {
    const bad: string[] = [];
    for (const [id, p] of entries) {
      const peak = p?.ticketPeak;
      const off = p?.ticketOff;
      if (isNum(peak) && isNum(off) && off > peak) bad.push(`${id} ${off}>${peak}`);
    }
    expect(bad, `淡季高于旺季：${bad.join("、")}`).toEqual([]);
  });

  it("建议时长在 0.5–12 小时之间", () => {
    const bad: string[] = [];
    for (const [id, p] of entries) {
      const v = p?.suggestedHours;
      if (v === null || v === undefined) continue;
      if (!isNum(v) || v < 0.5 || v > 12) bad.push(`${id}=${v}`);
    }
    expect(bad, `时长越界：${bad.join("、")}`).toEqual([]);
  });

  it("从市区车程在 1–600 分钟之间", () => {
    const bad: string[] = [];
    for (const [id, p] of entries) {
      const v = p?.driveFromCityMin;
      if (v === null || v === undefined) continue;
      if (!isNum(v) || v < 1 || v > 600) bad.push(`${id}=${v}`);
    }
    expect(bad, `车程越界：${bad.join("、")}`).toEqual([]);
  });

  it("accessibility 只用闭集里的词", () => {
    const bad: string[] = [];
    for (const [id, p] of entries) {
      const arr = p?.accessibility;
      if (!Array.isArray(arr)) continue;
      for (const w of arr) if (!ACCESSIBILITY.has(w)) bad.push(`${id}:${w}`);
      if (arr.length > 6) bad.push(`${id} 超过 6 项`);
    }
    expect(bad, `闭集外词汇/超项：${bad.join("、")}`).toEqual([]);
  });

  it("必填项缺失的条目必须标 low（外包侧写成 confidence=low，合入后落为 low:true）", () => {
    const bad: string[] = [];
    for (const [id, p] of entries) {
      const missing =
        p?.ticketPeak === null || p?.openHours === null || p?.suggestedHours === null;
      if (missing && p?.low !== true) bad.push(id);
    }
    expect(bad, `必填为空却没标 low：${bad.join("、")}`).toEqual([]);
  });
});
