/**
 * 景区描述事实核查：把「可核查的断言」从描述里抽出来，供人工逐条核实。
 *
 * 为什么需要：外包写描述最大的风险不是文笔，而是编造——海拔、面积、建成年份、
 * 「世界遗产」「全国重点文物保护单位」这类断言一旦写错就是硬伤。
 * 本脚本不判断真假，只把「必须核对的东西」列出来，避免漏检。
 *
 * 用法：
 *   node scripts/check-desc-facts.mjs docs/outsource/out-desc-batch1.json
 *   node scripts/check-desc-facts.mjs <file> --json     # 输出 JSON 报告
 *
 * 退出码：0 = 无硬性违规；1 = 有硬性违规（越界字数 / 禁写内容 / 名称不在目标清单）
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
const asJson = process.argv.includes("--json");
if (!file) {
  console.error("用法: node scripts/check-desc-facts.mjs <descriptions.json> [--json]");
  process.exit(2);
}

const items = JSON.parse(fs.readFileSync(file, "utf8"));
const list = Array.isArray(items) ? items : items.descriptions ?? items.items ?? [];

// 目标清单（只允许给它列出的名字写描述）
const targetsFile = path.resolve("docs/outsource/desc-targets-5a.json");
const allowed = new Set(
  fs.existsSync(targetsFile)
    ? JSON.parse(fs.readFileSync(targetsFile, "utf8")).targets.map((t) => t.name)
    : [],
);

const MIN = 60;
const MAX = 110;

/** 禁写内容：本项目这些字段由结构化数据提供，描述里不得出现 */
const FORBIDDEN = [
  { re: /门票|票价/, label: "门票/票价" },
  { re: /\d+\s*元/, label: "价格数字" },
  { re: /开放时间|营业时间|闭园|开园/, label: "开放时间" },
  { re: /预约|实名制|限流/, label: "预约规则" },
  { re: /电话|联系方式/, label: "联系方式" },
  { re: /最佳季节|最佳时间/, label: "最佳季节（主观）" },
];

/** 强断言：必须能给出可靠依据 */
const STRONG = [
  /世界文化遗产/,
  /世界自然遗产/,
  /世界文化与自然双遗产/,
  /世界地质公园/,
  /世界灌溉工程遗产/,
  /全国重点文物保护单位/,
  /国家级风景名胜区/,
  /国家森林公园/,
  /国家地质公园/,
  /国家湿地公园/,
  /非物质文化遗产/,
  /最大|唯一|第一|最早|最高|最古老|首座/,
];

/** 数字断言：带单位的量，逐条核对 */
const NUMERIC =
  /(\d+(?:\.\d+)?)\s*(米|公里|千米|平方公里|平方千米|公顷|万平方米|亩|年|层|座|处|株|种|级|A)/g;

const report = list.map((it) => {
  const name = it.name ?? "";
  const desc = it.description ?? "";
  const basis = it.basis ?? "";
  const hard = [];
  const strong = [];
  const numeric = [];

  if (!name) hard.push("缺少 name");
  else if (allowed.size && !allowed.has(name)) hard.push("name 不在目标清单（逐字符不符）");

  if (!desc) hard.push("缺少 description");
  const len = [...desc].length;
  if (desc && (len < MIN || len > MAX)) hard.push(`长度 ${len} 越界（${MIN}-${MAX}）`);
  if (/["']/.test(desc)) hard.push("含 ASCII 引号");
  if (/\n/.test(desc)) hard.push("含换行");

  for (const f of FORBIDDEN) if (f.re.test(desc)) hard.push(`出现禁写内容：${f.label}`);

  for (const re of STRONG) {
    const m = desc.match(re);
    if (m) strong.push(m[0]);
  }
  for (const m of desc.matchAll(NUMERIC)) numeric.push(m[0].replace(/\s+/g, ""));

  const risk =
    hard.length > 0 ? "违规" : strong.length || numeric.length ? "待核" : "低";

  return { name, len, risk, hard, strong: [...new Set(strong)], numeric, basis };
});

const bad = report.filter((r) => r.risk === "违规");
const need = report.filter((r) => r.risk === "待核");

if (asJson) {
  console.log(JSON.stringify({ total: report.length, violations: bad.length, toVerify: need.length, report }, null, 2));
} else {
  console.log(`共 ${report.length} 条 ｜ 违规 ${bad.length} ｜ 待核实 ${need.length} ｜ 低风险 ${report.length - bad.length - need.length}\n`);
  for (const r of bad) {
    console.log(`✗ ${r.name}`);
    r.hard.forEach((h) => console.log(`    ${h}`));
  }
  if (need.length) {
    console.log("\n—— 待核实（人工逐条确认下列断言）——");
    for (const r of need) {
      const bits = [...r.strong.map((s) => `断言「${s}」`), ...r.numeric.map((n) => `数字 ${n}`)];
      console.log(`? ${r.name}  ${bits.join(" / ")}`);
    }
  }
  const low = report.filter((r) => r.risk === "低");
  if (low.length) console.log(`\n低风险 ${low.length} 条（无数字/强断言，仍建议抽检）`);
}

process.exit(bad.length ? 1 : 0);
