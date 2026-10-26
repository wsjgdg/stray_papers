// 把单体批次数据 gaokao-{year}-batches.json 按省拆成懒加载小包。
//
// 背景：批次数据（专科/提前批/专项）原来是 1.6MB 单文件，切到「专科批」要
// 一次性下载 + 解析全部 1.9 万行，实测 2.6s（其中网络只占 0.44s，其余是
// JSON.parse 与建索引）。按省拆开后单省只有几十 KB。
//
// 输入：public/data/gaokao-{year}-batches.json
//   { v, year, provs: { 省: { 组: { 科类: { adm: AdmRow[] } } } } }
// 输出：public/data/gaokao/{year}/b/{slug}.json
//   { v, year, prov, groups: { 组: { 科类: { adm: AdmRow[] } } } }
//
// 用法：node scripts/split-gaokao-batches.mjs [--years=2026,2025]
import fs from "node:fs";
import path from "node:path";

const SLUG = {
  安徽: "anhui",
  北京: "beijing",
  重庆: "chongqing",
  福建: "fujian",
  甘肃: "gansu",
  广东: "guangdong",
  广西: "guangxi",
  贵州: "guizhou",
  海南: "hainan",
  河北: "hebei",
  黑龙江: "heilongjiang",
  河南: "henan",
  湖北: "hubei",
  湖南: "hunan",
  江苏: "jiangsu",
  江西: "jiangxi",
  吉林: "jilin",
  辽宁: "liaoning",
  内蒙古: "neimenggu",
  宁夏: "ningxia",
  青海: "qinghai",
  山东: "shandong",
  上海: "shanghai",
  山西: "shanxi",
  陕西: "shaanxi",
  四川: "sichuan",
  天津: "tianjin",
  西藏: "xizang",
  新疆: "xinjiang",
  云南: "yunnan",
  浙江: "zhejiang",
};

const args = process.argv.slice(2);
const yearArg = args.find((a) => a.startsWith("--years="));
const YEARS = yearArg
  ? yearArg.split("=")[1].split(",").map(Number)
  : [2026, 2025];

const ROOT = path.resolve(process.cwd(), "public/data");

for (const year of YEARS) {
  const src = path.join(ROOT, `gaokao-${year}-batches.json`);
  if (!fs.existsSync(src)) {
    console.log(`${year}: 没有批次文件，跳过`);
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(src, "utf8"));
  const outDir = path.join(ROOT, "gaokao", String(year), "b");
  fs.mkdirSync(outDir, { recursive: true });

  let written = 0;
  let bytes = 0;
  let rows = 0;
  const missing = [];

  for (const [prov, groups] of Object.entries(raw.provs ?? {})) {
    const slug = SLUG[prov];
    if (!slug) {
      missing.push(prov);
      continue;
    }
    const payload = { v: raw.v ?? 1, year, prov, groups };
    const text = JSON.stringify(payload);
    fs.writeFileSync(path.join(outDir, `${slug}.json`), text);
    written++;
    bytes += text.length;
    for (const cats of Object.values(groups))
      for (const cd of Object.values(cats)) rows += (cd.adm ?? []).length;
  }

  const rawSize = fs.statSync(src).size;
  console.log(
    `${year}: ${written} 省 → ${path.relative(process.cwd(), outDir)} · ` +
      `${rows} 行 · 合计 ${(bytes / 1024).toFixed(0)}KB（原单体 ${(rawSize / 1024 / 1024).toFixed(2)}MB）`,
  );
  if (missing.length) console.log(`  ! 无 slug 映射：${missing.join(", ")}`);
}
