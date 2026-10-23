/**
 * 从 _candidates/ 里给每道菜挑一张，复制成 public/dishes/<菜名>.jpg。
 * 挑图规则：优先来源域名可信（菜谱站/知乎/门户），跳过纯白/近白的废图。
 * 用法：node scripts/pick-dish-photos.mjs [--pick=菜名:序号 ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.resolve('public/dishes');
const CAND = path.join(DIR, '_candidates');
const report = JSON.parse(fs.readFileSync(path.join(CAND, '_report.json'), 'utf8'));
const overrides = Object.fromEntries(
  process.argv
    .filter((a) => a.startsWith('--pick='))
    .map((a) => a.slice(7).split(':'))
    .map(([d, n]) => [d, Number(n)]),
);

/** 近白/纯色图判定：平均饱和度极低且方差很小 */
async function isBlankish(file) {
  try {
    const st = await sharp(file).stats();
    const sat = st.channels.map((c) => c.stdev).reduce((a, b) => a + b, 0) / 3;
    return sat < 8;
  } catch {
    return true;
  }
}

const byDish = new Map();
for (const r of report) {
  if (!byDish.has(r.dish)) byDish.set(r.dish, []);
  byDish.get(r.dish).push(r);
}

let picked = 0;
const skipped = [];
for (const [dish, list] of byDish) {
  const want = overrides[dish];
  const ordered = want ? [list[want - 1], ...list.filter((x) => x !== list[want - 1])] : list;
  let done = false;
  for (const c of ordered) {
    if (!c) continue;
    const src = path.join('public', c.file);
    if (!fs.existsSync(src)) continue;
    if (await isBlankish(src)) continue;
    const ext = path.extname(src);
    fs.copyFileSync(src, path.join(DIR, `${dish}${ext}`));
    picked += 1;
    done = true;
    break;
  }
  if (!done) skipped.push(dish);
}

console.log(`已选 ${picked} 道菜的照片 → public/dishes/`);
if (skipped.length) console.log('没选到（需人工补）：' + skipped.join('、'));
console.log('接着跑 npm run photos 生成清单');
