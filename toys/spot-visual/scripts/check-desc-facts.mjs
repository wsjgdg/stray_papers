/**
 * 景区描述事实核查：把「可核查的断言」从描述里抽出来，供人工逐条核实。
 *
 * 为什么需要：外包写描述最大的风险不是文笔，而是编造——海拔、面积、建成年份、
 * 「世界遗产」「全国重点文物保护单位」这类断言一旦写错就是硬伤。
 * 本脚本不判断真假，只把「必须核对的东西」列出来，避免漏检。
 *
 * 用法：
 *   node scripts/check-desc-facts.mjs docs/outsource/out-desc-4a-batch1.json
 *   node scripts/check-desc-facts.mjs <file> --json     # 输出 JSON 报告
 *   node scripts/check-desc-facts.mjs <file> --targets=docs/outsource/desc-4a-batch1.json
 *
 * 目标清单默认按交付文件名自动推断（out-desc-4a-batchN.json → desc-4a-batchN.json），
 * 推不出来才回落到 5A 清单；--targets 可显式覆盖。
 *
 * 口径与 merge-out-desc.mjs 保持一致（长度按 code point；扫禁写词前先剥掉景点自己的
 * 名字——「三元宫」这类名字自带禁写词的条目不会被误判）。
 *
 * 退出码：0 = 无硬性违规；1 = 有硬性违规（越界字数 / 禁写内容 / 名称不在目标清单）
 */
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
const asJson = process.argv.includes("--json");
if (!file) {
  console.error(
    "用法: node scripts/check-desc-facts.mjs <descriptions.json> [--json]",
  );
  process.exit(2);
}

/** 目标清单：--targets 优先；否则按交付文件名推断；再否则回落 5A 清单 */
function inferTargets(targetFile) {
  const base = path.basename(targetFile).replace(/\.json$/, "");
  const guesses = [];
  if (base.startsWith("out-")) {
    const stripped = base.slice("out-".length);
    guesses.push(
      `desc-${stripped}.json`,
      `${stripped}.json`,
      `desc-${stripped.replace(/^desc-/, "")}.json`,
    );
  }
  for (const g of guesses) {
    const p = path.resolve("docs/outsource", g);
    if (fs.existsSync(p)) return p;
  }
  return path.resolve("docs/outsource/desc-targets-5a.json");
}

const targetsFile = path.resolve(
  process.argv.find((a) => a.startsWith("--targets="))?.split("=")[1] ??
    inferTargets(file),
);
const targetsRaw = fs.existsSync(targetsFile)
  ? JSON.parse(fs.readFileSync(targetsFile, "utf8"))
  : null;
const allowed = new Set(
  (targetsRaw?.targets ?? targetsRaw?.items ?? []).map((t) => t.name),
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

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const list = Array.isArray(raw)
  ? raw
  : (raw.descriptions ?? raw.items ?? raw.profiles ?? []);

const report = list.map((it) => {
  const name = it.name ?? "";
  // 外包产物的描述字段叫 desc（合并器也读 desc）；旧脚本只认 description，
  // 会把整批判成「缺少 description」——两种都收。
  const desc = it.desc ?? it.description ?? "";
  const basis = it.basis ?? "";
  const hard = [];
  const strong = [];
  const numeric = [];

  if (!name) hard.push("缺少 name");
  else if (allowed.size && !allowed.has(name))
    hard.push("name 不在目标清单（逐字符不符）");

  if (!desc)
    hard.push(`缺少 ${it.desc !== undefined ? "desc" : "description"}`);
  const len = [...desc].length;
  if (desc && (len < MIN || len > MAX))
    hard.push(`长度 ${len} 越界（${MIN}-${MAX}）`);
  if (/["']/.test(desc)) hard.push("含 ASCII 引号");
  if (/\n/.test(desc)) hard.push("含换行");

  // 禁写词扫描前先剥掉景点自己的名字：有些名字自带禁写词（如「三元宫」、
  // 「…打卡位」），照抄全名会被误判成违规。与 merge-out-desc.mjs 同口径。
  const body = name ? desc.split(name).join("") : desc;
  for (const f of FORBIDDEN)
    if (f.re.test(body)) hard.push(`出现禁写内容：${f.label}`);

  for (const re of STRONG) {
    const m = body.match(re);
    if (m) strong.push(m[0]);
  }
  for (const m of body.matchAll(NUMERIC))
    numeric.push(m[0].replace(/\s+/g, ""));

  const risk =
    hard.length > 0 ? "违规" : strong.length || numeric.length ? "待核" : "低";

  return {
    name,
    len,
    risk,
    hard,
    strong: [...new Set(strong)],
    numeric,
    basis,
  };
});

const bad = report.filter((r) => r.risk === "违规");
const need = report.filter((r) => r.risk === "待核");

if (asJson) {
  console.log(
    JSON.stringify(
      {
        total: report.length,
        violations: bad.length,
        toVerify: need.length,
        targets: path.relative(process.cwd(), targetsFile),
        report,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `共 ${report.length} 条 ｜ 违规 ${bad.length} ｜ 待核实 ${need.length} ｜ 低风险 ${
      report.length - bad.length - need.length
    } ｜ 目标清单 ${path.relative(process.cwd(), targetsFile)}\n`,
  );
  for (const r of bad) {
    console.log(`✗ ${r.name}`);
    r.hard.forEach((h) => console.log(`    ${h}`));
  }
  if (need.length) {
    console.log("\n—— 待核实（人工逐条确认下列断言）——");
    for (const r of need) {
      const bits = [
        ...r.strong.map((s) => `断言「${s}」`),
        ...r.numeric.map((n) => `数字 ${n}`),
      ];
      console.log(`? ${r.name}  ${bits.join(" / ")}`);
    }
  }
  const low = report.filter((r) => r.risk === "低");
  if (low.length)
    console.log(`\n低风险 ${low.length} 条（无数字/强断言，仍建议抽检）`);
}

process.exit(bad.length ? 1 : 0);
