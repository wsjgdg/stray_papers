/**
 * 归档包导入器：把外部交付的「景点档案」归档目录（out-profile-batchN.json 合集）
 * 验收后并入 docs/outsource/out-profile-merged.json 并重生成读取表。
 *
 * 为什么不用 merge-out-profile.mjs 逐批跑：
 *   外部交付方的批次编号来自**它们自己那一版清单**（先合并旧批1、再按剩余池重排），
 *   与仓库当前 profile-batch1..48.json 的批号/条数完全不对齐 —— 官方合并器的
 *   「items 数 = 输入清单条数」「id 必须在输入清单内」两条会整批拒绝。
 *   但**契约是 id**，不是批号：这里按「汇总 id 集」校验，规则与官方合并器逐条一致，
 *   并且额外强制「交付 id 必须落在仓库待补池内」「同一 id 不许重复交」。
 *
 * 用法：
 *   node scripts/import-profile-archive.mjs [归档目录，默认 docs/outsource/archive3820]
 *
 * 验收（任一硬违规 → 退出码 1，不写任何文件）：
 *   1. 每条 id 必须已回填，且属于「待补池」（5A/4A 且尚无档案）∪「合并档已有 id」
 *      （后者用于收官全量重交：已交付过的条目按 id 幂等覆盖）；
 *   2. name 与库条目逐字符一致；同一 id 在全包内不得重复；
 *   3. ticketPeak 非负或 null（null 必须 low）；openHours 缺失必须 low；
 *      suggestedHours ∈ [0.5,12]（null 必须 low）；driveFromCityMin ∈ [1,600] 或 null；
 *      needReservation 必须 boolean；accessibility ⊆ 12 词闭集且 ≤6 个。
 *
 * 落盘：out-profile-merged.json（幂等，按 id 覆盖）+ src/lib/spot-profiles.generated.ts
 * 末行打印未交付条目数（这些要回到清单继续外包，不是错误）。
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

const OPTIONAL_KEYS = [
  "ticketOff",
  "ticketNote",
  "freePolicy",
  "openHours",
  "bestMonths",
  "nearestAirport",
  "nearestRail",
  "driveFromCityMin",
  "accessibility",
  "reservationNote",
  "officialSite",
  "tel",
  "notices",
];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function writeAtomic(file, text) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

const archiveDir = path.resolve(
  process.argv[2] ?? "docs/outsource/archive3820",
);
if (!fs.existsSync(archiveDir)) {
  console.error(`✗ 归档目录不存在: ${archiveDir}`);
  process.exit(2);
}
const files = fs
  .readdirSync(archiveDir)
  .filter((f) => /^out-profile-batch\d+(-legacy)?\.json$/.test(f))
  .sort((a, b) => {
    const na = Number(a.match(/batch(\d+)/)[1]);
    const nb = Number(b.match(/batch(\d+)/)[1]);
    return na - nb || a.localeCompare(b);
  });
if (!files.length) {
  console.error(`✗ ${archiveDir} 下没有 out-profile-batchN.json`);
  process.exit(2);
}

// 仓库待补池（与 tests/gen-profile-batches.test.ts 的 pendingPool 同口径）
const pool = new Map();
for (let n = 1; n <= 60; n++) {
  const p = path.join(IN_DIR, `profile-batch${n}.json`);
  if (!fs.existsSync(p)) continue;
  const b = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const it of b.items) pool.set(it.id, it);
}
const knownName = new Map(); // id -> 权威 name
for (const [id, it] of pool) knownName.set(id, it.name);

const mergedPath = MERGED;
const alreadyMerged = new Set(
  fs.existsSync(mergedPath)
    ? Object.keys(JSON.parse(fs.readFileSync(mergedPath, "utf8")))
    : [],
);

// 已交付过的条目不在待补池里了，但收官重交会再送一遍：
// 从上一版已验收归档（同目录下的 out-profile-batch*.json）补 id→name，用于逐字符校验。
for (const dir of ["docs/outsource/archive3820", "docs/outsource"]) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (!/^out-profile-batch\d+(-legacy)?\.json$/.test(f)) continue;
    try {
      const b = JSON.parse(fs.readFileSync(path.join(abs, f), "utf8"));
      for (const it of b.items ?? []) {
        if (it?.id && it?.name && !knownName.has(it.id))
          knownName.set(it.id, it.name);
      }
    } catch {
      /* 非本管线的文件忽略 */
    }
  }
}
if (!pool.size && !alreadyMerged.size) {
  console.error("✗ 仓库待补池与合并档都为空（清单与生成表均缺失）");
  process.exit(2);
}

const seen = new Map();
const bad = [];
let items = 0;
let low = 0;
let missingRequired = 0;
const collected = {};

for (const f of files) {
  const out = JSON.parse(fs.readFileSync(path.join(archiveDir, f), "utf8"));
  if (!Array.isArray(out.items)) {
    bad.push(`${f}: 缺 items 数组`);
    continue;
  }
  for (const item of out.items) {
    items++;
    const tag = `${item.name ?? "?"} (id=${item.id ?? "缺"}, ${f})`;
    const inPool = pool.has(item.id);
    if (!inPool && !alreadyMerged.has(item.id)) {
      bad.push(`id 既不在待补池、也不在合并档: ${tag}`);
      continue;
    }
    const wantName = knownName.get(item.id);
    if (wantName && item.name !== wantName) {
      bad.push(`name 不一致: ${tag} out="${item.name}" 权威="${wantName}"`);
      continue;
    }
    if (seen.has(item.id)) {
      bad.push(`id 重复交付: ${item.id}（${seen.get(item.id)} 与 ${f}）`);
      continue;
    }
    seen.set(item.id, f);

    const p = item.profile;
    if (!p || typeof p !== "object") {
      bad.push(`缺 profile 对象: ${tag}`);
      continue;
    }
    const isLow = item.confidence === "low";
    if (p.ticketPeak !== null && !isNum(p.ticketPeak)) {
      bad.push(`ticketPeak 类型非法: ${tag}`);
      continue;
    }
    if (p.ticketPeak === null && !isLow) {
      bad.push(`ticketPeak 为 null 但未标 low: ${tag}`);
      continue;
    }
    if (isNum(p.ticketPeak) && p.ticketPeak < 0) {
      bad.push(`ticketPeak 为负: ${tag}`);
      continue;
    }
    if (p.ticketOff != null && !isNum(p.ticketOff)) {
      bad.push(`ticketOff 类型非法: ${tag}`);
      continue;
    }
    if (!p.openHours && !isLow) {
      bad.push(`openHours 缺失且未标 low: ${tag}`);
      continue;
    }
    if (p.suggestedHours !== null) {
      if (
        !isNum(p.suggestedHours) ||
        p.suggestedHours < 0.5 ||
        p.suggestedHours > 12
      ) {
        bad.push(`suggestedHours 越界: ${tag} = ${p.suggestedHours}`);
        continue;
      }
    } else if (!isLow) {
      bad.push(`suggestedHours 为 null 但未标 low: ${tag}`);
      continue;
    }
    if (p.driveFromCityMin != null) {
      if (
        !isNum(p.driveFromCityMin) ||
        p.driveFromCityMin < 1 ||
        p.driveFromCityMin > 600
      ) {
        bad.push(`driveFromCityMin 越界: ${tag} = ${p.driveFromCityMin}`);
        continue;
      }
    }
    if (typeof p.needReservation !== "boolean") {
      bad.push(`needReservation 必须是 boolean: ${tag}`);
      continue;
    }
    if (p.accessibility != null) {
      if (!Array.isArray(p.accessibility)) {
        bad.push(`accessibility 必须是数组: ${tag}`);
        continue;
      }
      const outside = p.accessibility.filter((a) => !ACCESSIBILITY_SET.has(a));
      if (outside.length) {
        bad.push(`accessibility 闭集外词「${outside.join("、")}」: ${tag}`);
        continue;
      }
      if (p.accessibility.length > 6) {
        bad.push(`accessibility 超过 6 个: ${tag}`);
        continue;
      }
    }

    if (isLow) low++;
    if (p.ticketPeak === null || !p.openHours || p.suggestedHours === null)
      missingRequired++;

    // 归一：可选字段缺失一律补 null，避免读取侧出现 undefined
    const normalized = { ...p };
    for (const k of OPTIONAL_KEYS)
      if (normalized[k] === undefined) normalized[k] = null;
    if (isLow) normalized.low = true;
    collected[item.id] = normalized;
  }
}

if (bad.length) {
  console.error(`✗ ${bad.length} 条硬违规，整包拒绝（不写任何文件）：`);
  for (const b of bad.slice(0, 20)) console.error(`   ${b}`);
  process.exit(1);
}

const merged = fs.existsSync(MERGED)
  ? JSON.parse(fs.readFileSync(MERGED, "utf8"))
  : {};
let added = 0;
for (const [id, v] of Object.entries(collected)) {
  if (!merged[id]) added++;
  merged[id] = v;
}
writeAtomic(MERGED, JSON.stringify(merged, null, 2));

const body = Object.fromEntries(
  Object.entries(merged).map(([k, v]) => {
    const { name: _n, ...rest } = v;
    return [k, rest];
  }),
);
const outTs = `// GENERATED by scripts/merge-out-profile.mjs / import-profile-archive.mjs
// 外包「景点档案」结构化字段（按库条目 id 落键，字段规约见 docs/outsource/TASK-SPOT-PROFILE.md）。
// 不要手改；重跑合并器再生成。
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

const remaining = [...pool.keys()].filter((id) => !merged[id]);
console.log(
  `✓ 导入 ${Object.keys(collected).length} 条（本次新增 ${added}，合并档累计 ${Object.keys(merged).length}）`,
);
console.log(
  `  low ${low}（${((low / Object.keys(collected).length) * 100).toFixed(1)}%）｜必填三件套缺失 ${missingRequired}`,
);
console.log(`  → ${path.relative(process.cwd(), MERGED)}`);
console.log(`  → ${path.relative(process.cwd(), OUT_TS)}`);
console.log(`  待补池剩余未交付 ${remaining.length} 条（需回到清单继续外包）`);
if (remaining.length) {
  const byCity = new Map();
  for (const id of remaining) {
    const s = pool.get(id);
    const c = s.city || "(空)";
    byCity.set(c, (byCity.get(c) ?? 0) + 1);
  }
  const top = [...byCity.entries()].sort((a, b) => b[1] - a[1]);
  console.log(
    `  剩余按城市: ${top
      .slice(0, 15)
      .map(([c, n]) => `${c}:${n}`)
      .join(" ")}${top.length > 15 ? ` …（共 ${top.length} 市）` : ""}`,
  );
}
