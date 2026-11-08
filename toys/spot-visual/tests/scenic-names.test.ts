// 名录名称卫生：A 级名录原始数据里出现过名称夹带换行（「重庆石柱西沱古镇\n景区」），
// 会让界面上名称断行、也会让「一行一个名称」的对外名单错位。此测试防复发。
import { describe, expect, it } from "vitest";
import { LIBRARY_SPOTS } from "@/lib/spot-data";

describe("景区名称卫生", () => {
  const scenic = LIBRARY_SPOTS.filter((s) => s.id.startsWith("scenic-"));

  it("名称不含控制字符或首尾空白", () => {
    const bad = scenic
      .map((s) => s.name)
      .filter((n) => /[\u0000-\u001f\u007f]/.test(n) || n !== n.trim());
    expect(bad).toEqual([]);
  });

  it("名称非空且不含换行", () => {
    const bad = scenic.filter((s) => !s.name || /[\r\n]/.test(s.name));
    expect(bad.map((s) => s.name)).toEqual([]);
  });
});
