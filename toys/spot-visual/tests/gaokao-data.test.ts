import { beforeEach, describe, expect, it } from "vitest";
import {
  activeProvinces,
  admissionsFor,
  loadBatchesDataset,
  controlLine,
  getSchool,
  loadEnrichDataset,
  loadFullDataset,
  rankForScore,
  type RealDataset,
} from "@/lib/gaokao-data";
import { recommend } from "@/lib/gaokao";

// 小型夹具：河南(物理/历史) + 广东(物理)，含一分一段、省控线、招生计划与同比
const fixture: RealDataset = {
  v: 1,
  year: 2025,
  src: "test",
  provs: {
    河南: {
      物理类: {
        ctrl: 400,
        curve: [
          [700, 100],
          [600, 10000],
          [500, 50000],
        ],
        adm: [
          ["A1", "甲大学", "本科批", 650, 5000, "北京", 3, 100, 5, 10],
          ["A2", "乙大学", "本科批", 620, 9000, "北京", 2, 5, null, -20],
          ["A3", "丙大学", "本科批", 590, 15000, "河南", 0, null, null, null],
          // rank=0：位次未知（无一分一段可回填），必须保留院校行
          ["A4", "丁学院", "本科批", 560, 0, "河南", 0, null, null, null],
        ],
      },
      历史类: {
        adm: [
          ["A1", "甲大学", "本科批", 610, 8000, "北京", 3, null, null, null],
        ],
      },
    },
    广东: {
      物理类: {
        adm: [
          ["A1", "甲大学", "本科批", 640, 6000, "北京", 3, null, null, null],
        ],
      },
    },
  },
};

beforeEach(() => {
  expect(loadFullDataset(fixture)).toBe(true);
});

describe("loadFullDataset + 读取接口", () => {
  it("省份与科类目录", () => {
    const provs = activeProvinces();
    expect(provs.map((p) => p.name)).toEqual(["河南", "广东"]);
    expect(provs[0].cats).toEqual(["物理类", "历史类"]);
  });
  it("getSchool 按校名索引（招生代码跨省冲突不可作键）", () => {
    const gd = admissionsFor("广东", "物理类").find(
      (r) => r.schoolName === "甲大学",
    );
    expect(gd?.schoolCode).toBe("A1");
    expect(getSchool("甲大学")?.is985).toBe(true);
  });

  it("getSchool 去重与 flags 解析（1=985 2=211 4=民办）", () => {
    const a1 = getSchool("甲大学");
    expect(a1?.is985).toBe(true);
    expect(a1?.is211).toBe(true);
    expect(a1?.isPrivate).toBe(false);
    expect(getSchool("丙大学")?.isDFC).toBe(false);
  });
  it("admissionsFor 携带计划/同比字段", () => {
    const rows = admissionsFor("河南", "物理类");
    expect(rows).toHaveLength(4);
    const a1 = rows.find((r) => r.schoolCode === "A1")!;
    expect(a1.planCount).toBe(100);
    expect(a1.scoreDelta).toBe(5);
    const a2 = rows.find((r) => r.schoolCode === "A2")!;
    expect(a2.planDelta).toBe(-20);
    expect(a2.scoreDelta).toBeUndefined();
  });
  it("rank=0 的院校行保留且 minRank 为 0（位次未知）", () => {
    const a4 = admissionsFor("河南", "物理类").find(
      (r) => r.schoolCode === "A4",
    );
    expect(a4).toBeDefined();
    expect(a4!.minScore).toBe(560);
    expect(a4!.minRank).toBe(0);
  });

  it("controlLine", () => {
    expect(controlLine("河南", "物理类")).toBe(400);
    expect(controlLine("河南", "历史类")).toBeUndefined();
    expect(controlLine("不存在", "物理类")).toBeUndefined();
  });
});

describe("rankForScore（真实一分一段插值）", () => {
  it("锚点与插值", () => {
    expect(rankForScore("河南", "物理类", 700)).toBe(100);
    expect(rankForScore("河南", "物理类", 650)).toBe(5050);
    expect(rankForScore("河南", "物理类", 500)).toBe(50000);
  });
  it("无一分一段的省/科类返回 0", () => {
    expect(rankForScore("广东", "物理类", 650)).toBe(0);
    expect(rankForScore("河南", "不存在", 650)).toBe(0);
  });
});

describe("recommend 冲稳保分档", () => {
  it("边界：冲 [-18,0]、稳 (0,22]、保 (22,55]", () => {
    const r = recommend(620, "河南", "物理类");
    // 甲 650: gap -30 → 无档; 乙 620: gap 0 → 冲; 丙 590: gap 30 → 保
    expect(r.reach.map((x) => x.schoolName)).toEqual(["乙大学"]);
    expect(r.match).toHaveLength(0);
    expect(r.safe.map((x) => x.schoolName)).toEqual(["丙大学"]);
    expect(r.userRank).toBe(8020); // 620 分在 600~700 锚点间插值
  });
  it("keep 筛选在截断前生效", () => {
    const only985 = recommend(620, "河南", "物理类", (s) => s?.is985 ?? false);
    expect(only985.reach).toHaveLength(0); // 乙大学是 211 非 985
    const only211 = recommend(620, "河南", "物理类", (s) => s?.is211 ?? false);
    expect(only211.reach.map((x) => x.schoolName)).toEqual(["乙大学"]);
  });
  it("每档最多 12 条", () => {
    // 生成 15 所 gap 均为 10 的院校验证截断
    const many: RealDataset = {
      ...fixture,
      provs: {
        河南: {
          物理类: {
            ctrl: 400,
            adm: Array.from(
              { length: 15 },
              (_, i) =>
                [
                  `M${i}`,
                  `大学${i}`,
                  "本科批",
                  610,
                  10000 + i * 100,
                  "北京",
                  0,
                  null,
                  null,
                  null,
                ] as const,
            ),
          },
        },
      },
    };
    expect(loadFullDataset(many as RealDataset)).toBe(true);
    const r = recommend(620, "河南", "物理类");
    expect(r.match).toHaveLength(12);
  });
});

describe("loadEnrichDataset 合并", () => {
  it("软科官方标签覆盖 flags，排名与学科评估入库", () => {
    expect(
      loadEnrichDataset({
        v: 1,
        rankSrc: "t",
        evalSrc: "t",
        unis: {
          甲大学: {
            name: "甲大学",
            rank: "42",
            rankNum: 42,
            score: 300,
            tags: ["双一流", "211"],
            category: "综合",
            aPlus: 3,
            a: 4,
            aMinus: 5,
            topDisc: ["力学"],
          },
        },
      }),
    ).toBe(true);
    const a1 = getSchool("甲大学")!;
    expect(a1.is985).toBe(false); // 官方标签无 985，覆盖数据集的 flags
    expect(a1.is211).toBe(true);
    expect(a1.isDFC).toBe(true);
    expect(a1.rank).toBe("42");
    expect(a1.rankNum).toBe(42);
    expect(a1.aPlus).toBe(3);
    expect(a1.aClass).toBe(12);
    expect(a1.topDisc).toEqual(["力学"]);
    // 未覆盖的院校保持原值
    expect(getSchool("丙大学")!.isDFC).toBe(false);
  });
  it("无效结构返回 false", () => {
    expect(loadEnrichDataset(null as never)).toBe(false);
    expect(loadEnrichDataset({} as never)).toBe(false);
  });
});

// 回归：生成器产物必须能被数据层加载（曾因 cats 包装层级不一致导致线上白屏失败）
import fs from "node:fs";
import path from "node:path";

describe("生成的真实数据文件与数据层结构一致", () => {
  it("public/data/gaokao-2025.json 能 loadFullDataset 成功", () => {
    const file = path.resolve("public/data/gaokao-2025.json");
    if (!fs.existsSync(file)) return; // 数据文件未生成时跳过
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RealDataset;
    expect(loadFullDataset(raw)).toBe(true);
    expect(activeProvinces().length).toBeGreaterThan(20);
    expect(admissionsFor("河南", "物理类").length).toBeGreaterThan(100);
  });
});

describe("loadBatchesDataset 批次组", () => {
  it("非本科批合并并可按组查询", () => {
    expect(
      loadBatchesDataset({
        v: 1,
        year: 2025,
        provs: {
          河南: {
            zhuanke: {
              物理类: {
                adm: [
                  [
                    "Z1",
                    "黄河水利职业技术学院",
                    "专科批",
                    420,
                    0,
                    "河南",
                    0,
                    null,
                    null,
                    null,
                  ],
                ],
              },
            },
            tiqian: {
              物理类: {
                adm: [
                  [
                    "T1",
                    "国防科技大学",
                    "本科提前批",
                    640,
                    900,
                    "湖南",
                    3,
                    null,
                    null,
                    null,
                  ],
                ],
              },
            },
          },
        },
      }),
    ).toBe(true);
    const zk = admissionsFor("河南", "物理类", "zhuanke");
    expect(zk).toHaveLength(1);
    expect(zk[0].schoolName).toBe("黄河水利职业技术学院");
    expect(zk[0].group).toBe("zhuanke");
    expect(zk[0].minRank).toBe(0);
    expect(admissionsFor("河南", "物理类", "tiqian")[0].schoolName).toBe(
      "国防科技大学",
    );
    expect(getSchool("国防科技大学")?.is985).toBe(true);
    expect(admissionsFor("河南", "物理类", "benke")).toHaveLength(4);
  });

  it("无效结构返回 false", () => {
    expect(loadBatchesDataset(null as never)).toBe(false);
  });
});

// 回归：secnotes 2026 数据文件同样必须能被数据层加载
describe("2026 secnotes dataset", () => {
  it("public/data/gaokao-2026.json loads via loadFullDataset", () => {
    const file = path.resolve("public/data/gaokao-2026.json");
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RealDataset;
    expect(loadFullDataset(raw)).toBe(true);
    expect(activeProvinces().length).toBeGreaterThan(15);
    expect(admissionsFor("江苏", "物理类").length).toBeGreaterThan(500);
  });
});
