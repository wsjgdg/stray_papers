// 守护「拨盘切时段，实测 UV 要跟着变」与「取的是目的地的小时值」。
// 旧的组件内联实现把当前小时写死，切档不换值，且没有测试会因此失败。
import { describe, expect, it } from "vitest";
import { pickUvAtHour } from "@/lib/uv-now";

const rows = [
  { hour: "07", uv: 2, shadow: 68 },
  { hour: "13", uv: 11, shadow: 8 },
  { hour: "18", uv: 4, shadow: 42 },
];

describe("实测 UV 取数", () => {
  it("三个时段取到三个不同的值（拨盘切档必须换值）", () => {
    const v = [7, 13, 18].map((h) => pickUvAtHour(rows, h)?.uv);
    expect(v).toEqual([2, 11, 4]);
    expect(new Set(v).size).toBe(3);
  });

  it("单个数字小时会补齐成两位（7 → 07）", () => {
    expect(pickUvAtHour(rows, 7)?.shadow).toBe(68);
  });

  it("缺该小时数据时返回 null，交给调用方回退典型值", () => {
    expect(pickUvAtHour(rows, 5)).toBeNull();
    expect(pickUvAtHour(null, 7)).toBeNull();
    expect(pickUvAtHour(undefined, 7)).toBeNull();
  });
});
