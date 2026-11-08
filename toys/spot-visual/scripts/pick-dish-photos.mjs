/**
 * 从 _candidates/ 里给每道菜挑一张，复制成 public/dishes/<菜名>.jpg
 * 规则：优先 serp 结果 → 序号小的 → 跳过近白/纯色废图。
 * 用法：node scripts/pick-dish-photos.mjs [--pick=菜名:文件名片段 ...]
 * 需要 sharp（临时依赖）：npm i --no-save sharp
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.resolve('public/dishes');
const CAND = path.join(DIR, '_candidates');
const overrides = Object.fromEntries(
  process.argv
    .filter((a) => a.startsWith('--pick='))
    .map((a) => a.slice(7).split(':'))
    .map(([d, frag]) => [d, frag]),
);

const files = fs.readdirSync(CAND).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const byDish = new Map();
for (const f of files) {
  const m = f.match(/^(.+?)-(serp|tf)?(\d+)\.\w+$/);
  if (!m) continue;
  const [, dish, kind, n] = m;
  if (!byDish.has(dish)) byDish.set(dish, []);
  byDish.get(dish).push({ file: f, kind: kind ?? '', n: Number(n) });
}
for (const list of byDish.values()) {
  list.sort((a, b) => {
    const w = (x) => (x.kind === 'serp' ? 0 : x.kind === 'tf' ? 1 : 2);
    return w(a) - w(b) || a.n - b.n;
  });
}

async function blankish(file) {
  try {
    const st = await sharp(file).stats();
    const v = st.channels.map((c) => c.stdev).reduce((a, b) => a + b, 0) / 3;
    return v < 8;
  } catch {
    return true;
  }
}

let picked = 0;
const skipped = [];
for (const [dish, list] of byDish) {
  const want = overrides[dish];
  const ordered = want ? [...list].sort((a, b) => (a.file.includes(want) ? -1 : 0) - (b.file.includes(want) ? -1 : 0)) : list;
  let ok = false;
  for (const c of ordered) {
    const src = path.join(CAND, c.file);
    if (await blankish(src)) continue;
    const out = path.join(DIR, `${dish}.jpg`);
    const tmp = out + '.tmp';
    const buf = await sharp(src).rotate().resize({ width: 760, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);
    picked += 1;
    ok = true;
    break;
  }
  if (!ok) skipped.push(dish);
}

console.log(`已选 ${picked} 道菜 → public/dishes/`);
if (skipped.length) console.log(`没选到 ${skipped.length} 道：` + skipped.slice(0, 30).join('、'));
