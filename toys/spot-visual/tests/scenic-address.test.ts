// A 级名录地址清洗：原始数据常见行政区前缀三重复写（北京北京市延庆区北京延庆区北京市延庆区…），
// 以及「省简称+市全称」叠写（北京|北京市）。见 src/lib/spot-data.ts 的 cleanScenicAddress。
import { describe, expect, it } from "vitest";
import { cleanScenicAddress, LIBRARY_SPOTS } from "@/lib/spot-data";

describe("A级名录地址清洗", () => {
  it("直辖市：简称+全称+区名 三重复写压成一份", () => {
    expect(
      cleanScenicAddress(
        "北京北京市延庆区北京延庆区北京市延庆区八达岭旅游公司院内",
      ),
    ).toBe("北京市延庆区八达岭旅游公司院内");
  });

  it("自治区+市：相邻重复段折叠", () => {
    expect(cleanScenicAddress("广西壮族自治区桂林市桂林市临桂区xxx")).toBe(
      "广西壮族自治区桂林市临桂区xxx",
    );
  });

  it("合法嵌套：乐山市与峨眉山市是真实的市辖县级市，不得压掉", () => {
    expect(cleanScenicAddress("四川省乐山市峨眉山市黄湾镇")).toBe(
      "四川省乐山市峨眉山市黄湾镇",
    );
  });

  it("普通省市地址原样", () => {
    expect(cleanScenicAddress("湖南省张家界市武陵源区")).toBe(
      "湖南省张家界市武陵源区",
    );
  });

  it("自治区+市+县级市合法嵌套：呼伦贝尔市/额尔古纳市市名不同，不判重", () => {
    expect(cleanScenicAddress("内蒙古自治区呼伦贝尔市额尔古纳市")).toBe(
      "内蒙古自治区呼伦贝尔市额尔古纳市",
    );
  });

  it("含数字的普通地址原样（含非行政区后缀的正文不吃掉）", () => {
    expect(cleanScenicAddress("江苏省苏州市姑苏区廖家巷28号唐寅文化区")).toBe(
      "江苏省苏州市姑苏区廖家巷28号唐寅文化区",
    );
  });

  it("空地址原样返回", () => {
    expect(cleanScenicAddress("")).toBe("");
  });

  it("全量名录地址清洗幂等（清洗结果再洗一遍不变）", () => {
    const scenic = LIBRARY_SPOTS.filter((s) => s.id.startsWith("scenic-"));
    const bad = scenic
      .map((s) => s.address)
      .filter((a) => cleanScenicAddress(a) !== a);
    expect(bad).toEqual([]);
  });
});
