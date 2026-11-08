// 把单体投档线数据集按省拆分为小文件：
//   public/data/gaokao/{year}/index.json      → 省份/科类清单 + 控制线 + 行数（几 KB）
//   public/data/gaokao/{year}/{slug}.json     → 单省全科类（约 15~25KB gzip）
// 动因：原文件 2.4MB(gzip 411KB) 首次进入要等数十秒，而用户一次只看一个省。
// 原始 public/data/gaokao-{year}.json 保留（构建脚本产物），可随时重跑。
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
  陕西: "shaanxi",
  山东: "shandong",
  上海: "shanghai",
  四川: "sichuan",
  天津: "tianjin",
  新疆: "xinjiang",
  云南: "yunnan",
  浙江: "zhejiang",
  山西: "shanxi",
  西藏: "xizang",
  青海: "qinghai",
};

const ROOT = path.resolve(process.cwd(), "public/data");
const YEARS = [2025, 2026];

function slugOf(prov) {
  return SLUG[prov] ?? encodeURIComponent(prov);
}

for (const year of YEARS) {
  const src = path.join(ROOT, `gaokao-${year}.json`);
  if (!fs.existsSync(src)) {
    console.log(`skip ${year}: 源文件不存在`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(src, "utf8"));
  const outDir = path.join(ROOT, "gaokao", String(year));
  fs.mkdirSync(outDir, { recursive: true });

  const index = {
    v: data.v ?? 1,
    year,
    src: data.src ?? "",
    provs: {},
    totalRows: 0,
    totalSchools: 0,
  };
  const allSchools = new Set();
  let bytes = 0;

  for (const [prov, cats] of Object.entries(data.provs)) {
    const pkg = { v: index.v, year, src: index.src, prov, cats };
    const file = path.join(outDir, `${slugOf(prov)}.json`);
    const body = JSON.stringify(pkg);
    fs.writeFileSync(file, body);
    bytes += body.length;

    const catMeta = {};
    for (const [cat, cd] of Object.entries(cats)) {
      catMeta[cat] = { ctrl: cd.ctrl, rows: cd.adm?.length ?? 0 };
      index.totalRows += cd.adm?.length ?? 0;
      for (const row of cd.adm ?? []) allSchools.add(row[1]);
    }
    index.provs[prov] = { cats: catMeta };
  }
  index.totalSchools = allSchools.size;
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index));

  const idxSize = fs.statSync(path.join(outDir, "index.json")).size;
  console.log(
    `${year}: ${Object.keys(index.provs).length} 省 / ${index.totalRows} 行 / ${index.totalSchools} 校` +
      ` | index ${(idxSize / 1024).toFixed(1)}KB | 分省合计 ${(bytes / 1024).toFixed(0)}KB` +
      ` | 原文件 ${(fs.statSync(src).size / 1024 / 1024).toFixed(2)}MB`,
  );
}
