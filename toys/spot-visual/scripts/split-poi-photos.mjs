/**
 * 把城市 POI 包里的详情相册（photos）从 JS 主包搬到静态 JSON。
 *
 * 为什么要搬：city-pois.generated.ts 会随首页一起打进浏览器，1356 个 POI
 * 的 photos 共约 416KB（原始），占了该模块一半。但 photos 只在「景点详情
 * 弹窗」的相册里用到，首屏网格只有封面图（image）。实测 image === photos[0]
 * 对全部 1353 条有图 POI 都成立，所以只需把 [1..] 落盘即可。
 *
 * 幂等：已经搬过的文件（CityPoi 里没有 photos 字段）会被跳过。
 *
 * 用法：node scripts/split-poi-photos.mjs
 * 产物：public/data/poi-photos.json   形如 { "北京::天安门广场": ["url2","url3"] }
 *       src/lib/city-pois.generated.ts（去掉 photos 字段）
 */
import fs from "node:fs";
import path from "node:path";

const TS_PATH = path.resolve("src/lib/city-pois.generated.ts");
const JSON_PATH = path.resolve("public/data/poi-photos.json");

const src = fs.readFileSync(TS_PATH, "utf8");
const anchor = "CITY_POI_PACKS: Record<string, CityPoi[]> = {";
const at = src.indexOf(anchor);
if (at < 0) throw new Error("找不到 CITY_POI_PACKS 定义");

// anchor 自身以 "{" 结尾，直接用它当对象字面量的起点
const start = at + anchor.length - 1;
const end = src.lastIndexOf("}");
const packs = JSON.parse(src.slice(start, end + 1));

let moved = 0;
let bytes = 0;
const out = {};

for (const [city, list] of Object.entries(packs)) {
  for (const p of list) {
    if (!Array.isArray(p.photos)) continue;
    const extras = p.photos.filter((u) => u && u !== p.image);
    if (extras.length) {
      out[`${city}::${p.name}`] = extras;
      bytes += JSON.stringify(extras).length;
    }
    delete p.photos;
    moved++;
  }
}

if (moved === 0) {
  console.log("已经拆分过，无需处理");
  process.exit(0);
}

// 保留原注释头，只重写内容
const header = src.slice(0, start);
const rebuilt = `${header}${JSON.stringify(packs, null, 2)};\n`;
fs.writeFileSync(TS_PATH, rebuilt, "utf8");

fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
fs.writeFileSync(JSON_PATH, JSON.stringify(out), "utf8");

const kb = (n) => (n / 1024).toFixed(0) + "KB";
console.log(
  `搬出相册：${moved} 个 POI / ${Object.keys(out).length} 组多图，${kb(bytes)}`,
);
console.log(
  `  ${path.relative(process.cwd(), TS_PATH)} → ${kb(fs.statSync(TS_PATH).size)}`,
);
console.log(
  `  ${path.relative(process.cwd(), JSON_PATH)} → ${kb(fs.statSync(JSON_PATH).size)}`,
);
