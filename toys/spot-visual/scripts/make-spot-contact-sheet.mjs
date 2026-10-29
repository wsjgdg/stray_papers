/**
 * 景点配图终检拼图：把已抓到的景点 webp 拼成带编号的网格，供人工/多模态模型核对。
 *
 * 为什么需要：build-spot-photos.mjs 只按域名权重 + 宽度筛选，判断不了「这张图是不是这个景区」。
 * 编号只用 ASCII 数字（中文标签依赖字体，跨机器易乱码），名称映射走同名 .index.json。
 *
 * 用法：
 *   node scripts/make-spot-contact-sheet.mjs                     # 最近 120 张，一整张
 *   node scripts/make-spot-contact-sheet.mjs --limit=30 --offset=0 --out=qc-1
 *
 * 建议每页 30 张（6×5，1440×900）：整张过大会被视觉模型缩放，编号看不清。
 *
 * 产出：docs/outsource/<out>.jpg + docs/outsource/<out>.index.json
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const CELL_W = 240;
const CELL_H = 180;
const IMG_H = 150;
const COLS = 6;

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split("=")[1] : d;
};
const LIMIT = Number(arg("limit", "120"));
const OFFSET = Number(arg("offset", "0"));
const OUT = arg("out", "contact-sheet-recent");
// 按名单出图：优先于 limit/offset（别名重抓的条目在报表里位置是旧的，靠偏移取不到）
const NAMES_FILE = arg("names", "");

const SPOT_DIR = path.resolve("public/spots");
const REPORT = path.join(SPOT_DIR, "_candidates", "_report.json");
const OUT_DIR = path.resolve("docs/outsource");

const report = fs.existsSync(REPORT)
  ? JSON.parse(fs.readFileSync(REPORT, "utf8"))
  : [];

// 每个景点取最后一条（后抓覆盖先抓），且要求 webp 已烘焙出来
const bySpot = new Map();
for (const r of report) {
  const webp = path.join(SPOT_DIR, `${r.dish}.webp`);
  if (!fs.existsSync(webp)) continue;
  bySpot.set(r.dish, { name: r.dish, file: `spots/${r.dish}.webp`, host: r.host, page: r.purl, sizeKB: r.sizeKB });
}
const all = [...bySpot.values()];
const named = NAMES_FILE
  ? fs
      .readFileSync(NAMES_FILE, "utf8")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => bySpot.get(n))
      .filter(Boolean)
  : null;
const picked = (named ?? all.slice(-(OFFSET + LIMIT))).slice(0, LIMIT);

if (!picked.length) {
  console.error("没有可拼的图（先跑 npm run spots 烘焙）");
  process.exit(1);
}

const rows = Math.ceil(picked.length / COLS);
const width = COLS * CELL_W;
const height = rows * CELL_H;

const composites = [];
for (let i = 0; i < picked.length; i++) {
  const x = (i % COLS) * CELL_W;
  const y = Math.floor(i / COLS) * CELL_H;
  const buf = await sharp(path.join(SPOT_DIR, `${picked[i].name}.webp`))
    .resize({ width: CELL_W - 8, height: IMG_H, fit: "cover" })
    .jpeg({ quality: 82 })
    .toBuffer();
  composites.push({ input: buf, left: x + 4, top: y + 4 });
}

// 编号标签：整张画布一块 SVG 覆盖层，避免逐格合成
const labels = picked
  .map((_, i) => {
    const x = (i % COLS) * CELL_W + 8;
    const y = Math.floor(i / COLS) * CELL_H + IMG_H + 8;
    return `<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="bold" fill="#111">${i + 1}</text>`;
  })
  .join("");
const overlay = Buffer.from(
  `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${labels}</svg>`,
);

fs.mkdirSync(OUT_DIR, { recursive: true });
const jpg = path.join(OUT_DIR, `${OUT}.jpg`);
await sharp({
  create: { width, height, channels: 3, background: "#ffffff" },
})
  .composite([...composites, { input: overlay, left: 0, top: 0 }])
  .jpeg({ quality: 86 })
  .toFile(jpg);

const index = picked.map((p, i) => ({ no: i + 1, name: p.name, webp: p.file, host: p.host, sourcePage: p.page }));
fs.writeFileSync(path.join(OUT_DIR, `${OUT}.index.json`), JSON.stringify({ count: index.length, items: index }, null, 2), "utf8");

console.log(`拼图 ${picked.length} 张 → ${jpg}`);
console.log(`索引 → ${OUT_DIR}/${OUT}.index.json`);
