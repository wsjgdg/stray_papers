// 4A 描述外包批次生成器：把「尚无人工描述的 4A 条目」切成 300 条/批的交接清单。
// 默认跳过（纯工具，不参与回归）；要生成时显式运行：
//   GEN_DESC_BATCHES=1 npx vitest run tests/gen-desc-batches.test.ts
// 产出：docs/outsource/desc-4a-batch<N>.json（从批 2 起补齐，批 1 由交接包提供）。
// 字段与批 1 一致：name / sourceName / address / category / id / city / mergeKey。
// 排序沿用热门城市优先（城市包城市 + 省会在前），保证批次间内容稳定不漂移。
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { SCENIC_DESCRIPTIONS, POI_DESCRIPTIONS } from "@/lib/poi-descriptions";

// 与 build-spot-photos 管线一致的热门城市顺位
const HOT = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "南京",
  "苏州",
  "成都",
  "重庆",
  "西安",
  "洛阳",
  "武汉",
  "长沙",
  "厦门",
  "青岛",
  "大连",
  "昆明",
  "桂林",
  "三亚",
  "哈尔滨",
  "拉萨",
  "张家界",
  "黄山",
  "乐山",
  "酒泉",
  "嘉兴",
  "晋中",
  "天津",
  "石家庄",
  "郑州",
  "济南",
  "太原",
  "南昌",
  "福州",
  "南宁",
  "贵阳",
  "兰州",
  "西宁",
  "银川",
  "乌鲁木齐",
  "呼和浩特",
];

/** 地址前缀（区县级）作为 POI 的城市限定键：北京市西城区景山西街44号 → 北京市西城区 */
function addrPrefix(address: string): string | null {
  const m = address.match(
    /^([^市县旗]{1,6}市)?([^市县旗区]{1,8}(?:区|县|旗))?/,
  );
  const joined = (m?.[1] ?? "") + (m?.[2] ?? "");
  return joined.includes("市") || joined.includes("县") || joined.includes("旗")
    ? joined
    : null;
}

function mergeKeyOf(s: (typeof LIBRARY_SPOTS)[number]): string {
  if (s.id.startsWith("poi-")) {
    const prefix = addrPrefix(s.address) ?? `${s.address.slice(0, 3)}`;
    return `${prefix}::${s.name}`;
  }
  // extras：沿用裸名（同名跨省时由 merge 脚本按 id 落键，读取侧也走 id）
  return s.name;
}

function handDescOf(s: (typeof LIBRARY_SPOTS)[number]): string | undefined {
  if (s.id.startsWith("poi-")) {
    const city = s.address?.match(/^([^市省]+?[市省])/)?.[1] ?? "";
    // POI 的人工描述键是打包城市（如「北京」），从 id 还原更稳：poi-北京-3 → 北京
    const m = s.id.match(/^poi-(.+)-\d+$/);
    const packCity = m ? m[1] : city;
    return (
      POI_DESCRIPTIONS[`${packCity}::${s.name}`] ??
      POI_DESCRIPTIONS[`${city}::${s.name}`]
    );
  }
  return SCENIC_DESCRIPTIONS[s.name];
}

describe("4A desc batch generator", () => {
  it("writes handoff batches", () => {
    if (!process.env.GEN_DESC_BATCHES) {
      console.log("GEN_DESC_BATCHES 未设置，跳过生成");
      return;
    }
    const batch1Path = "docs/outsource/desc-4a-batch1.json";
    const done = new Set<string>(); // 已外包（含批 1）的 id
    if (existsSync(batch1Path)) {
      const b1 = JSON.parse(readFileSync(batch1Path, "utf8"));
      for (const i of b1.items) done.add(i.id);
    }

    const pool = LIBRARY_SPOTS.filter(
      (s) =>
        s.level === "4A" &&
        !done.has(s.id) &&
        !handDescOf(s) && // 已有人工描述（5A 表 / POI 人工表）的不再外包
        s.address,
    ).sort((a, b) => {
      const ca = a.address.match(/^[^省]{1,4}省|^[^市]{1,6}市/)?.[0] ?? "";
      const ra =
        HOT.indexOf(ca.replace(/省$/, "")) === -1
          ? 99
          : HOT.indexOf(ca.replace(/省$/, ""));
      const cb = b.address.match(/^[^省]{1,4}省|^[^市]{1,6}市/)?.[0] ?? "";
      const rb =
        HOT.indexOf(cb.replace(/省$/, "")) === -1
          ? 99
          : HOT.indexOf(cb.replace(/省$/, ""));
      return ra - rb;
    });

    const PER = 300;
    const total = Math.ceil(pool.length / PER);
    let written = 0;
    for (let n = 2; n <= total + 1; n++) {
      const slice = pool.slice((n - 2) * PER, (n - 1) * PER);
      if (!slice.length) break;
      const out = {
        task: `4A-描述补写-批${n}`,
        count: slice.length,
        rules: "见 TASK-4A-DESC.md",
        items: slice.map((s) => ({
          name: s.name,
          sourceName: (s as any).sourceName ?? null,
          address: s.address,
          category: s.category,
          id: s.id,
          city:
            s.address.match(/^([^市]+?市[^区县]+?[区县])/)?.[1] ??
            s.address.slice(0, 8),
          mergeKey: mergeKeyOf(s),
        })),
      };
      writeFileSync(
        `docs/outsource/desc-4a-batch${n}.json`,
        JSON.stringify(out, null, 2),
        "utf8",
      );
      written++;
      console.log(`批${n}: ${slice.length} 条 → desc-4a-batch${n}.json`);
    }
    console.log(
      `池=${pool.length} 已批1=${done.size} 共写出 ${written} 个新批次`,
    );
    expect(written).toBeGreaterThan(0);
  });
});
