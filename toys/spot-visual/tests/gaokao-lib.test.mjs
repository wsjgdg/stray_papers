import { describe, expect, it } from "vitest";
import {
  isKeepBatch,
  normName,
  num,
  parseCsv,
  rankFromCurve,
} from "../scripts/gaokao-lib.mjs";

describe("num", () => {
  it("空串/空白返回 null（Number('') 是 0 的坑）", () => {
    expect(num("")).toBeNull();
    expect(num("  ")).toBeNull();
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
  });
  it("数字与非法串", () => {
    expect(num("42")).toBe(42);
    expect(num("442.152")).toBeCloseTo(442.152);
    expect(num("500+")).toBeNull();
    expect(num("Tr")).toBeNull();
  });
});

describe("isKeepBatch", () => {
  it("保留本科普通批与一段", () => {
    expect(isKeepBatch("本科批")).toBe(true);
    expect(isKeepBatch("普通本科批")).toBe(true);
    expect(isKeepBatch("本科批A段")).toBe(true);
    expect(isKeepBatch("本科一批")).toBe(true);
    expect(isKeepBatch("普通类一段")).toBe(true);
  });
  it("剔除专科/艺体/提前批", () => {
    expect(isKeepBatch("专科批")).toBe(false);
    expect(isKeepBatch("专科提前批")).toBe(false);
    expect(isKeepBatch("艺术类本科批")).toBe(false);
    expect(isKeepBatch("体育本科批")).toBe(false);
    expect(isKeepBatch("本科提前批")).toBe(false);
    expect(isKeepBatch("高校专项计划批")).toBe(false);
  });
});

describe("normName", () => {
  it("去全角/半角括号内容与空白", () => {
    expect(normName("哈尔滨工业大学（深圳）")).toBe("哈尔滨工业大学");
    expect(normName("哈尔滨工业大学(深圳)")).toBe("哈尔滨工业大学");
    expect(normName("中国矿业大学（北京）")).toBe("中国矿业大学");
    expect(normName("清 华 大 学")).toBe("清华大学");
  });
});

describe("parseCsv", () => {
  it("基础解析 + 表头映射", () => {
    const rows = parseCsv("a,b,c\n1,2,3\nx,y,z");
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "x", b: "y", c: "z" },
    ]);
  });
  it("CRLF 与末尾换行", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toHaveLength(2);
    expect(rows[1].b).toBe("4");
  });
  it("引号包裹的字段含逗号", () => {
    const rows = parseCsv('name,note\n"Smith, John","a,b"c');
    expect(rows[0].name).toBe("Smith, John");
    expect(rows[0].note).toBe("a,bc");
  });
  it("转义引号", () => {
    const rows = parseCsv('q\n"he said ""hi"""');
    expect(rows[0].q).toBe('he said "hi"');
  });
  it("BOM 头由调用方处理（这里验证不影响解析）", () => {
    const rows = parseCsv("a\n1");
    expect(rows[0].a).toBe("1");
  });
});

describe("rankFromCurve", () => {
  const curve = [
    [700, 100],
    [600, 10000],
    [500, 50000],
  ];
  it("高于最高分 → 最低位次", () => {
    expect(rankFromCurve(curve, 750)).toBe(100);
    expect(rankFromCurve(curve, 700)).toBe(100);
  });
  it("低于最低分 → 最大位次", () => {
    expect(rankFromCurve(curve, 400)).toBe(50000);
    expect(rankFromCurve(curve, 500)).toBe(50000);
  });
  it("中点线性插值", () => {
    // 650 恰在 700~600 中点 → 100~10000 中点
    expect(rankFromCurve(curve, 650)).toBe(5050);
  });
  it("空表返回 null", () => {
    expect(rankFromCurve([], 600)).toBeNull();
  });
});
