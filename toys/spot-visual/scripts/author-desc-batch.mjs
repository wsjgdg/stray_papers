/**
 * 描述撰写辅助：把「每行一条描述」的纯文本按顺序回填 id/name，产出标准交付 JSON。
 *
 * 为什么需要：撰写者要对着清单写，手抄 id/name 极易出错（跨市同名靠 id 区分，
 * 抄错一条整批就被合并器拒收）。本脚本按**顺序**回填 id/name，写错名字也无所谓，
 * 同时在落盘前把机器能查的都查掉：条数、长度区间、禁写词、ASCII 引号、以名字开头。
 *
 * 用法：
 *   node scripts/author-desc-batch.mjs --batch=1 --input=drafts/desc-batch1.txt
 *   node scripts/author-desc-batch.mjs --batch=1 --input=xxx.txt --check   # 只校验不落盘
 *
 * 输入文本：UTF-8，一行一条描述，空行忽略；行数必须等于清单条数（300）。
 * 输出：docs/outsource/out-desc-4a-batch<N>.json（可被 merge-out-desc.mjs 直接消费）。
 *
 * 退出码：0 = 通过并已落盘（或 --check 通过）；1 = 校验失败（打印逐条问题）；2 = 用法错误。
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const batch = opt("batch");
const input = opt("input");
const checkOnly = args.includes("--check");

if (!batch || !input) {
  console.error(
    "用法: node scripts/author-desc-batch.mjs --batch=N --input=<文本文件> [--check]",
  );
  process.exit(2);
}

const OUT_DIR = path.resolve("docs/outsource");
const BATCH_FILE = path.join(OUT_DIR, `desc-4a-batch${batch}.json`);
const OUT_FILE = path.join(OUT_DIR, `out-desc-4a-batch${batch}.json`);

if (!fs.existsSync(BATCH_FILE)) {
  console.error(`✗ 找不到输入清单 ${BATCH_FILE}`);
  process.exit(2);
}
if (!fs.existsSync(input)) {
  console.error(`✗ 找不到输入文本 ${input}`);
  process.exit(2);
}

const MIN = 60;
const MAX = 110;
/** 与 merge-out-desc.mjs / check-desc-facts.mjs 同口径（长度按 code point，扫前剥名字） */
const FORBIDDEN = [
  { re: /门票|票价/, label: "门票/票价" },
  { re: /\d+\s*元/, label: "价格数字" },
  { re: /开放时间|营业时间|闭园|开园/, label: "开放时间" },
  { re: /预约|实名制|限流/, label: "预约规则" },
  { re: /电话|联系方式/, label: "联系方式" },
  { re: /最佳季节|最佳时间/, label: "最佳季节（主观）" },
  { re: /必打卡|不虚此行|yyds|打卡/, label: "营销话术" },
  { re: /本条|据资料|该景区条目/, label: "元叙述" },
];

const batchItems = JSON.parse(fs.readFileSync(BATCH_FILE, "utf8")).items;
const lines = fs
  .readFileSync(path.resolve(input), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

const problems = [];
if (lines.length !== batchItems.length)
  problems.push(
    `条数不符：写了 ${lines.length} 条，清单 ${batchItems.length} 条（必须整批交付）`,
  );

const items = [];
lines.forEach((desc, i) => {
  const src = batchItems[i];
  if (!src) return;
  const tag = `#${i + 1} ${src.name}`;
  const len = [...desc].length;
  if (len < MIN || len > MAX)
    problems.push(`${tag} 长度 ${len} 越界（${MIN}-${MAX}）`);
  if (/["']/.test(desc)) problems.push(`${tag} 含 ASCII 引号`);
  const body = src.name ? desc.split(src.name).join("") : desc;
  for (const f of FORBIDDEN)
    if (f.re.test(body)) problems.push(`${tag} 禁写：${f.label}`);
  if (desc.startsWith(src.name)) problems.push(`${tag} 以名字原文开头`);
  items.push({ id: src.id, name: src.name, desc });
});

if (problems.length) {
  console.error(`✗ 批 ${batch} 校验失败 ${problems.length} 处：`);
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
  if (problems.length > 40)
    console.error(`  … 另有 ${problems.length - 40} 处`);
  process.exit(1);
}

if (checkOnly) {
  console.log(`✓ 批 ${batch} 校验通过（${items.length} 条），--check 未落盘`);
  process.exit(0);
}

const out = {
  task: `4A-描述补写-批${batch}`,
  count: items.length,
  items,
};
const tmp = `${OUT_FILE}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(out, null, 2), "utf8");
fs.renameSync(tmp, OUT_FILE);

const lens = items.map((i) => [...i.desc].length);
console.log(
  `✓ 已落盘 ${path.relative(process.cwd(), OUT_FILE)}（${items.length} 条｜长度 ${Math.min(...lens)}–${Math.max(...lens)}，均值 ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}）`,
);
console.log(
  `  下一步：node scripts/merge-out-desc.mjs ${path.relative(process.cwd(), OUT_FILE)}`,
);
