/**
 * 外包「景点档案」合并器：out-profile-batchN.json → 验收 → 按 id 落键 → 生成读取表。
 *
 * 用法：
 *   node scripts/merge-out-profile.mjs docs/outsource/out-profile-batchN.json [更多...]
 *
 * 验收（每批，任一硬违规整批拒绝，退出码 1 不落盘）：
 *   1. items 数 = 输入 profile-batchN.json 条数（批号从 task/batch/文件名识别）；
 *   2. 每条 id 已回填且在输入清单内，name 与输入逐字符一致；
 *   3. profile 必填：ticketPeak / openHours / suggestedHours / needReservation ——
 *      缺失仅当 confidence === "low" 才允许（ticketPeak/openHours/suggestedHours 为 null）；
 *   4. 区间：ticketPeak/ticketOff 为非负数或 null；suggestedHours ∈ [0.5, 12]；
 *      driveFromCityMin ∈ [1, 600] 或 null；
 *   5. accessibility ⊆ 闭集且 ≤ 6 个。
 *
 * 合并目标：src/lib/spot-profiles.generated.ts（键 = 库条目 id）。
 * 累积存档：docs/outsource/out-profile-merged.json（幂等，重复运行后写覆盖同名 id）。
 */
import fs from "node:fs";
import path from "node:path";

const OUT_TS = path.resolve("src/lib/spot-profiles.generated.ts");
const MERGED = path.resolve("docs/outsource/out-profile-merged.json");
const IN_DIR = path.resolve("docs/outsource");

const ACCESSIBILITY_SET = new Set([
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

/** 原子写入：先写临时文件再 rename，避免并行会话读到截断的中间态（VERIFY-FEEDBACK 避坑点 3） */
function writeAtomic(file, text) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!args.length) {
  console.error(
    "用法: node scripts/merge-out-profile.mjs <out-profile-batchN.json> [...]",
  );
  process.exit(2);
}

const merged = fs.existsSync(MERGED)
  ? JSON.parse(fs.readFileSync(MERGED, "utf8"))
  : {};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
let totalNew = 0;
let totalLow = 0;

for (const file of args) {
  const out = JSON.parse(fs.readFileSync(file, "utf8"));
  const m =
    out.batch != null
      ? String(out.batch).match(/\d+/)
      : (out.task?.match(/批(\d+)/) ?? file.match(/batch(\d+)/));
  if (!m) {
    console.error(`✗ ${file}: 无法识别批号`);
    process.exit(1);
  }
  const inputPath = path.join(IN_DIR, `profile-batch${m[0]}.json`);
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const byId = new Map(input.items.map((i) => [i.id, i]));

  if (out.items.length !== input.items.length) {
    console.error(
      `✗ ${file}: 条数不符 out=${out.items.length} input=${input.items.length}（整批拒绝）`,
    );
    process.exit(1);
  }

  let bad = 0;
  for (const item of out.items) {
    const src = byId.get(item.id);
    const tag = `${item.name ?? "?"} (id=${item.id ?? "缺"})`;
    if (!src) {
      console.error(`✗ id 未回填或不存在: ${tag}`);
      bad++;
      continue;
    }
    if (item.name !== src.name) {
      console.error(
        `✗ name 不一致: ${tag} out="${item.name}" 输入="${src.name}"`,
      );
      bad++;
      continue;
    }
    const p = item.profile;
    if (!p || typeof p !== "object") {
      console.error(`✗ 缺 profile 对象: ${tag}`);
      bad++;
      continue;
    }
    const low = item.confidence === "low";
    // 必填三件套：null 仅在 low 时允许
    if (p.ticketPeak !== null && !isNum(p.ticketPeak)) {
      console.error(`✗ ticketPeak 类型非法: ${tag}`);
      bad++;
      continue;
    }
    if (p.ticketPeak === null && !low) {
      console.error(`✗ ticketPeak 为 null 但未标 low: ${tag}`);
      bad++;
      continue;
    }
    if (isNum(p.ticketPeak) && p.ticketPeak < 0) {
      console.error(`✗ ticketPeak 为负: ${tag}`);
      bad++;
      continue;
    }
    if (
      p.ticketOff !== null &&
      p.ticketOff !== undefined &&
      !isNum(p.ticketOff)
    ) {
      console.error(`✗ ticketOff 类型非法: ${tag}`);
      bad++;
      continue;
    }
    if (!p.openHours && !low) {
      console.error(`✗ openHours 缺失且未标 low: ${tag}`);
      bad++;
      continue;
    }
    if (p.suggestedHours !== null) {
      if (
        !isNum(p.suggestedHours) ||
        p.suggestedHours < 0.5 ||
        p.suggestedHours > 12
      ) {
        console.error(`✗ suggestedHours 越界: ${tag} = ${p.suggestedHours}`);
        bad++;
        continue;
      }
    } else if (!low) {
      console.error(`✗ suggestedHours 为 null 但未标 low: ${tag}`);
      bad++;
      continue;
    }
    if (
      p.driveFromCityMin !== null &&
      p.driveFromCityMin !== undefined &&
      (!isNum(p.driveFromCityMin) ||
        p.driveFromCityMin < 1 ||
        p.driveFromCityMin > 600)
    ) {
      console.error(`✗ driveFromCityMin 越界: ${tag}`);
      bad++;
      continue;
    }
    if (typeof p.needReservation !== "boolean") {
      console.error(`✗ needReservation 必须是 boolean: ${tag}`);
      bad++;
      continue;
    }
    if (p.accessibility != null) {
      if (!Array.isArray(p.accessibility)) {
        console.error(`✗ accessibility 必须是数组: ${tag}`);
        bad++;
        continue;
      }
      const outside = p.accessibility.filter((a) => !ACCESSIBILITY_SET.has(a));
      if (outside.length) {
        console.error(
          `✗ accessibility 闭集外词「${outside.join("、")}」: ${tag}`,
        );
        bad++;
        continue;
      }
      if (p.accessibility.length > 6) {
        console.error(`✗ accessibility 超过 6 个: ${tag}`);
        bad++;
        continue;
      }
    }
  }
  if (bad) {
    console.error(`✗ ${file}: ${bad} 条硬违规，整批拒绝（原样退回重写）`);
    process.exit(1);
  }

  for (const item of out.items) {
    merged[item.id] = {
      ...item.profile,
      ...(item.confidence === "low" ? { low: true } : {}),
    };
    if (item.confidence === "low") totalLow++;
    totalNew++;
  }
  console.log(`✓ 批${m[0]}: ${out.items.length} 条验收通过并入`);
}

writeAtomic(MERGED, JSON.stringify(merged, null, 2));

const body = Object.fromEntries(
  Object.entries(merged).map(([k, v]) => {
    const { name: _n, ...rest } = v;
    return [k, rest];
  }),
);
const outTs = `// GENERATED by scripts/merge-out-profile.mjs — 外包「景点档案」结构化字段（按库条目 id 落键）。
// 数据源：docs/outsource/out-profile-merged.json（验收通过的批次累积，批 1-4 为 5A）。
// 不要手改；重跑 merge 脚本再生成。字段规约见 docs/outsource/TASK-SPOT-PROFILE.md。
export interface SpotProfile {
  ticketPeak: number | null;
  ticketOff?: number | null;
  ticketNote?: string | null;
  freePolicy?: string | null;
  openHours?: string | null;
  suggestedHours: number | null;
  bestMonths?: string | null;
  nearestAirport?: string | null;
  nearestRail?: string | null;
  driveFromCityMin?: number | null;
  accessibility?: string[] | null;
  needReservation: boolean;
  reservationNote?: string | null;
  officialSite?: string | null;
  tel?: string | null;
  notices?: string | null;
  low?: boolean;
}

export const SPOT_PROFILES: Record<string, SpotProfile> = ${JSON.stringify(body, null, 2)};
`;
writeAtomic(OUT_TS, outTs);

const lows = Object.values(merged).filter((v) => v.low).length;
console.log(
  `完成：本轮新增 ${totalNew}（low ${totalLow}），累计 ${Object.keys(merged).length} 条 → ${OUT_TS}`,
);
