/**
 * 外包交付回收器：把外部 AI 交回的内容落成标准文件，让定时任务能发现。
 *
 * 为什么需要：任务书要求外部「不要写进项目仓库」，提示词只写了文件名没写路径，
 * 而 CRON-DELIVERY 的监控判据是扫描 docs/outsource/ 下的 out-* 文件——
 * 通道不定义，外部交回来的东西就永远发现不了。本脚本就是这条通道：
 *   外部 AI →（回复里的 JSON 代码块 / 下载的 .json）→ 本脚本 → docs/outsource/out-*.json
 *
 * 用法：
 *   node scripts/ingest-outsource.mjs <文件> --kind=desc --batch=1
 *   node scripts/ingest-outsource.mjs <文件> --kind=profile --batch=1
 *   管道：cat 外部回复.txt | node scripts/ingest-outsource.mjs - --kind=desc --batch=1
 *
 * 行为：
 *   1. 从文件/stdin 里抠出 JSON（容忍 ```json 代码块、前后说明文字）；
 *   2. 与输入清单（desc-4a-batchN.json / profile-batchN.json）逐条核对：
 *      条数、id 集合、name 逐字符一致——不一致直接拒绝，不写盘；
 *   3. 通过则原子写入 docs/outsource/out-<kind>-batchN.json（覆盖旧文件）。
 *
 * 退出码：0 = 已落盘；1 = 校验失败（已打印具体差异）；2 = 用法错误。
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("docs/outsource");

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--"));
const kindArg = args.find((a) => a.startsWith("--kind="))?.split("=")[1];
const batchArg = args.find((a) => a.startsWith("--batch="))?.split("=")[1];

if (!src || !kindArg || !batchArg) {
  console.error(
    "用法: node scripts/ingest-outsource.mjs <文件|-> --kind=desc|profile --batch=N",
  );
  process.exit(2);
}
if (!["desc", "profile"].includes(kindArg)) {
  console.error(`--kind 只能是 desc 或 profile（收到 ${kindArg}）`);
  process.exit(2);
}

const INPUT_FILE =
  kindArg === "desc"
    ? path.join(OUT_DIR, `desc-4a-batch${batchArg}.json`)
    : path.join(OUT_DIR, `profile-batch${batchArg}.json`);
const TARGET_FILE =
  kindArg === "desc"
    ? path.join(OUT_DIR, `out-desc-4a-batch${batchArg}.json`)
    : path.join(OUT_DIR, `out-profile-batch${batchArg}.json`);

/** 从任意文本里抠出第一个完整 JSON 值（容忍代码块与前后说明） */
function extractJson(text) {
  const trimmed = text.trim();
  // 优先取 ```json ... ``` 代码块
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [];
  if (fence) candidates.push(fence[1].trim());
  candidates.push(trimmed);
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {}
    // 退而求其次：扫描第一个平衡的 { } 或 [ ]
    const start = c.search(/[[{]/);
    if (start < 0) continue;
    const open = c[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(c.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new Error("没能从输入里解析出 JSON");
}

const raw =
  src === "-"
    ? fs.readFileSync(0, "utf8")
    : fs.readFileSync(path.resolve(src), "utf8");

let payload;
try {
  payload = extractJson(raw);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

// 顶层可能是数组
const items = Array.isArray(payload)
  ? payload
  : (payload.items ?? payload.descriptions ?? payload.profiles ?? null);
if (!Array.isArray(items)) {
  console.error(
    '✗ 找不到 items 数组（顶层应形如 {"task":…,"count":N,"items":[...]}）',
  );
  process.exit(1);
}

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`✗ 找不到输入清单 ${INPUT_FILE}`);
  process.exit(1);
}
const input = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
const byId = new Map(input.items.map((i) => [i.id, i]));

const problems = [];
if (items.length !== input.items.length) {
  problems.push(
    `条数不符：交回 ${items.length} 条，输入清单 ${input.items.length} 条（整批拒收）`,
  );
}
const missing = input.items.filter((i) => !items.some((x) => x.id === i.id));
if (missing.length)
  problems.push(
    `缺少 ${missing.length} 条 id，例：${missing
      .slice(0, 3)
      .map((i) => i.id)
      .join(", ")}`,
  );
const extra = items.filter((x) => x.id && !byId.has(x.id));
if (extra.length)
  problems.push(
    `有 ${extra.length} 条 id 不在输入清单，例：${extra
      .slice(0, 3)
      .map((x) => x.id)
      .join(", ")}`,
  );
const badName = items.filter((x) => {
  const src = byId.get(x.id);
  return src && x.name !== undefined && x.name !== src.name;
});
if (badName.length)
  problems.push(
    `有 ${badName.length} 条 name 与输入不一致（须逐字符照抄），例：${badName
      .slice(0, 3)
      .map((x) => `${x.id}「${x.name}」≠「${byId.get(x.id)?.name}」`)
      .join("; ")}`,
  );
const noId = items.filter((x) => !x.id);
if (noId.length) problems.push(`有 ${noId.length} 条没回填 id`);

// 描述批：desc 字段非空；档案批：profile 对象非空
const payloadKey = kindArg === "desc" ? "desc" : "profile";
const emptyBody = items.filter(
  (x) =>
    !x[payloadKey] ||
    (typeof x[payloadKey] === "string" && !x[payloadKey].trim()),
);
if (emptyBody.length)
  problems.push(`有 ${emptyBody.length} 条 ${payloadKey} 为空`);

if (problems.length) {
  console.error(`✗ 批 ${batchArg}（${kindArg}）校验失败，未落盘：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// 落盘（保留外部给的 task/count/nameIssues 等顶层字段）
const out = Array.isArray(payload)
  ? {
      task: `${kindArg}-batch${batchArg}`,
      batch: Number(batchArg),
      count: items.length,
      items,
    }
  : { ...payload, count: items.length, items };
if (out.batch === undefined) out.batch = Number(batchArg);

const tmp = `${TARGET_FILE}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(out, null, 2), "utf8");
fs.renameSync(tmp, TARGET_FILE);

console.log(
  `✓ 已落盘 ${path.relative(process.cwd(), TARGET_FILE)}（${items.length} 条）`,
);
console.log(
  `  下一步：node scripts/${
    kindArg === "desc" ? "merge-out-desc" : "merge-out-profile"
  }.mjs ${path.relative(process.cwd(), TARGET_FILE)}`,
);
