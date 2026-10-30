// 档案批次生成器 + 守护：把「待补档案的 5A/4A 条目」切成 100 条/批的交接清单。
// 与 gen-desc-batches 同一套门控；生成：GEN_PROFILE_BATCHES=1 npx vitest run tests/gen-profile-batches.test.ts
// 守护（每次全量回归都会跑）：profile-batch1..48.json 的 id 并集必须等于
// 「当前待补全集」（5A/4A 且尚无档案数据的条目）且无重复——库发生清洗改名/删除
// 导致清单漂移时，守护会立刻失败，提示重跑生成器，避免外包按过期 id 白写。
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { SPOT_PROFILES } from "@/lib/spot-profiles.generated";

const BATCH_DIR = "docs/outsource";
const PER = 100;
const TOTAL_BATCHES = 48;

/** 待补档案全集：5A/4A 且尚无档案数据、有地址的条目 */
function pendingPool() {
  return LIBRARY_SPOTS.filter(
    (s) =>
      (s.level === "5A" || s.level === "4A") &&
      !SPOT_PROFILES[s.id] &&
      s.address,
  ).sort((a, b) => {
    // 5A 优先（访问量最大），同级按 id 稳定排序
    if ((a.level === "5A") !== (b.level === "5A"))
      return a.level === "5A" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function loadBatches(): { ids: string[]; dups: string[]; files: number } {
  const ids: string[] = [];
  const dups: string[] = [];
  let files = 0;
  for (let n = 1; n <= TOTAL_BATCHES; n++) {
    const p = `${BATCH_DIR}/profile-batch${n}.json`;
    if (!existsSync(p)) continue;
    files++;
    const b = JSON.parse(readFileSync(p, "utf8"));
    for (const i of b.items) {
      if (ids.includes(i.id)) dups.push(i.id);
      ids.push(i.id);
    }
  }
  return { ids, dups, files };
}

describe("profile batches", () => {
  it("守护：48 批 id 并集 == 当前待补全集且无重复", () => {
    const { ids, dups, files } = loadBatches();
    expect(files, "交接清单应有 48 个批次文件").toBe(TOTAL_BATCHES);
    expect(dups, `清单内 id 重复: ${dups.slice(0, 5)}`).toEqual([]);

    const pool = pendingPool();
    const poolSet = new Set(pool.map((s) => s.id));
    const batchSet = new Set(ids);
    const missing = pool.filter((s) => !batchSet.has(s.id));
    const ghost = [...batchSet].filter((id) => !poolSet.has(id));
    expect(
      missing.map((s) => s.id),
      `库内待补条目未入清单（重跑生成器）: ${missing.length} 条`,
    ).toEqual([]);
    expect(
      ghost,
      `清单里的 id 已不在待补池（库已清洗/删除，重跑生成器）: ${ghost.slice(0, 5)}`,
    ).toEqual([]);
    expect(ids.length, "清单总数应等于待补池大小").toBe(pool.length);
  });

  it("生成器：GEN_PROFILE_BATCHES=1 时重写 48 批清单", () => {
    if (!process.env.GEN_PROFILE_BATCHES) {
      console.log("GEN_PROFILE_BATCHES 未设置，跳过生成");
      return;
    }
    const pool = pendingPool();
    let n = 0;
    for (let i = 0; i < pool.length; i += PER) {
      n++;
      const slice = pool.slice(i, i + PER);
      const out = {
        task: `景点档案结构化字段-批${n}（${n <= 4 ? "5A" : "4A"}）`,
        batch: n,
        count: slice.length,
        rules: "见 TASK-SPOT-PROFILE.md",
        items: slice.map((s) => {
          const city =
            s.address.match(/^([^市]{1,4}市[^区县]{0,6}[区县])/)?.[1] ??
            s.address.slice(0, 8);
          return {
            id: s.id,
            name: s.name,
            city,
            level: s.level,
            address: s.address,
            category: s.category,
          };
        }),
      };
      writeFileSync(
        `${BATCH_DIR}/profile-batch${n}.json`,
        JSON.stringify(out, null, 2),
        "utf8",
      );
    }
    console.log(`重写 ${n} 批（池 ${pool.length} 条）`);
    expect(n).toBe(TOTAL_BATCHES);
  });
});
