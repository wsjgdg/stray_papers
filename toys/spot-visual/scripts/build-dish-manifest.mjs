/**
 * 菜品照片清单生成器（人工供图专用）
 *
 * 把图片丢进 public/dishes/，文件名里带上菜名即可（如 `麻婆豆腐.jpg`、`四川-麻婆豆腐.jpg`），
 * 跑一次本脚本就会生成 src/lib/dish-photos.generated.ts，详情面板自动把卡面换成照片。
 * 没有照片的菜继续走本地生成的口味卡面，不会出现裂图。
 *
 * 可选：public/dishes/index.json 显式指定文件 / 署名 / 协议，优先级最高：
 *   { "麻婆豆腐": { "file": "mapo-tofu.jpg", "credit": "摄影：张三", "license": "已获授权" } }
 * 也可用 public/dishes/credits.json 只补充署名：
 *   { "麻婆豆腐": { "credit": "摄影：张三", "license": "CC BY-SA 4.0" } }
 *
 * 用法：node scripts/build-dish-manifest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DISH_DIR = path.resolve('public/dishes');
const OUT = path.resolve('src/lib/dish-photos.generated.ts');
const IMG_RE = /\.(jpe?g|png|webp|avif)$/i;

/** 从数据文件里收所有菜名（省级 + 市级，去重） */
function dishNames() {
  const names = new Set();
  for (const f of ['src/lib/food-data.ts', 'src/lib/food-city.ts']) {
    if (!fs.existsSync(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/dish:\s*'([^'（）]+)'/g)) names.add(m[1].trim());
  }
  return [...names];
}

const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {});
const index = readJson(path.join(DISH_DIR, 'index.json'));
const credits = readJson(path.join(DISH_DIR, 'credits.json'));

fs.mkdirSync(DISH_DIR, { recursive: true });
const files = fs.readdirSync(DISH_DIR).filter((f) => IMG_RE.test(f));
const dishes = dishNames();

const entries = new Map();
const unmatched = [];

// 1) index.json 显式指定
for (const [dish, cfg] of Object.entries(index)) {
  if (!cfg?.file) continue;
  entries.set(dish, { file: cfg.file, credit: cfg.credit, license: cfg.license, focus: cfg.focus });
}

// 2) 文件名匹配菜名（取最长命中，避免「小炒肉」抢了「农家小炒肉」）
const byLength = [...dishes].sort((a, b) => b.length - a.length);
for (const file of files) {
  const base = file.replace(IMG_RE, '');
  const hit = byLength.find((d) => base.includes(d) || d.includes(base));
  if (!hit) {
    unmatched.push(file);
    continue;
  }
  if (entries.has(hit)) continue;
  entries.set(hit, { file });
}

// 3) 署名补充
for (const [dish, cfg] of Object.entries(credits)) {
  const e = entries.get(dish);
  if (!e) continue;
  e.credit = cfg.credit ?? e.credit;
  e.license = cfg.license ?? e.license;
  e.focus = cfg.focus ?? e.focus;
}

const body = [...entries.entries()]
  .map(([dish, e]) => {
    const parts = [`src: ${JSON.stringify(`/dishes/${encodeURIComponent(e.file)}`)}`];
    if (e.credit) parts.push(`credit: ${JSON.stringify(e.credit)}`);
    if (e.license) parts.push(`license: ${JSON.stringify(e.license)}`);
    if (e.focus) parts.push(`focus: ${JSON.stringify(e.focus)}`);
    return `  ${JSON.stringify(dish)}: { ${parts.join(', ')} },`;
  })
  .join('\n');

fs.writeFileSync(
  OUT,
  `// 本文件由 scripts/build-dish-manifest.mjs 生成，请勿手改。\n// 图片放在 public/dishes/，文件名带菜名即可；\nexport const GENERATED_DISH_PHOTOS: Record<string, import('./dish-photo').DishPhoto> = {\n${body}\n};\n`,
);

console.log(`图片 ${files.length} 张，命中 ${entries.size} 道菜`);
if (unmatched.length) console.log(`未匹配上的文件（文件名里加菜名即可）：\n${unmatched.map((f) => '  - ' + f).join('\n')}`);
const missing = dishes.filter((d) => !entries.has(d));
if (missing.length) console.log(`暂无照片的菜 ${missing.length} 道（继续用口味卡面）`);
