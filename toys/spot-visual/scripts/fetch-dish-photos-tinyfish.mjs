/**
 * 菜品照片采集 · TinyFish（search + fetch）
 *
 * 两段能力：
 *   GET  https://api.search.tinyfish.ai?query=...   → 干净的搜索结果（含摘要）
 *   POST https://api.fetch.tinyfish.ai  {urls:[]}   → 抓页面正文（含图片链接）
 *
 * 用途：Bing 抓不到 / 抓错的菜，用它的搜索+抓取补一轮。
 * 密钥：.env 里的 TINYFISH_API_KEY（请求头 X-API-Key，不是 Bearer）。
 *
 * 用法：node scripts/fetch-dish-photos-tinyfish.mjs 佛跳墙 臭鳜鱼 --per=2
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const OUT_DIR = path.resolve('public/dishes/_candidates');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PER = Number(process.argv.find((a) => a.startsWith('--per='))?.split('=')[1] ?? 2);
const KEY =
  process.env.TINYFISH_API_KEY ||
  (fs.existsSync('.env') ? (fs.readFileSync('.env', 'utf8').match(/TINYFISH_API_KEY=(.+)/)?.[1] ?? '').trim() : '');

if (!KEY) {
  console.error('缺少 TINYFISH_API_KEY（.env 里写 TINYFISH_API_KEY=sk-tinyfish-...）');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = ['-H', `X-API-Key: ${KEY}`];

function search(query) {
  const url = `https://api.search.tinyfish.ai?query=${encodeURIComponent(query)}`;
  const out = execFileSync('curl', ['-sS', '-m', '30', ...H, url], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  try {
    return JSON.parse(out).results ?? [];
  } catch {
    return [];
  }
}

function fetchPages(urls) {
  const out = execFileSync(
    'curl',
    ['-sS', '-m', '60', '-X', 'POST', 'https://api.fetch.tinyfish.ai', ...H, '-H', 'Content-Type: application/json', '-d', JSON.stringify({ urls })],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  try {
    return JSON.parse(out).results ?? [];
  } catch {
    return [];
  }
}

/** 从抓取结果里捞图片链接（content / html / markdown 字段都可能带） */
function imagesFrom(page) {
  const blob = JSON.stringify(page);
  const out = new Set();
  for (const m of blob.matchAll(/https?:\/\/[^"'\s\\]+\.(?:jpe?g|png|webp)(?:\?[^"'\s\\]*)?/gi)) out.add(m[0]);
  return [...out].slice(0, 8);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const seen = new Set();
const report = [];

for (const dish of args) {
  console.log(`\n── ${dish} ──`);
  const hits = search(`${dish} 成品菜 做法`).slice(0, 4);
  console.log(`  搜索命中 ${hits.length} 条`);
  if (!hits.length) continue;
  const pages = fetchPages(hits.map((h) => h.url));
  const imgs = pages.flatMap(imagesFrom).filter((u) => !/logo|icon|avatar|sprite/i.test(u));
  console.log(`  页面抓取 ${pages.length} 个，图片 ${imgs.length} 条`);
  let saved = 0;
  for (const img of imgs) {
    if (saved >= PER) break;
    let buf;
    try {
      buf = execFileSync('curl', ['-sS', '-m', '40', '-L', '-A', 'Mozilla/5.0', img], { maxBuffer: 64 * 1024 * 1024 });
    } catch {
      continue;
    }
    if (!buf || buf.length < 20000) continue;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    if (!isJpg && !isPng) continue;
    const h = crypto.createHash('md5').update(buf).digest('hex');
    if (seen.has(h)) continue;
    seen.add(h);
    const ext = isPng ? 'png' : 'jpg';
    const file = path.join(OUT_DIR, `${dish}-tf${saved + 1}.${ext}`);
    fs.writeFileSync(file, buf);
    saved += 1;
    report.push({ dish, file: path.relative('public', file), image: img, source: 'tinyfish' });
    console.log(`  ✓ ${path.basename(file)}  ${Math.round(buf.length / 1024)}KB`);
  }
  if (!saved) console.log('  ✗ 没有可用图');
  await sleep(400);
}

fs.writeFileSync(path.join(OUT_DIR, '_report-tinyfish.json'), JSON.stringify(report, null, 2));
console.log(`\n共 ${report.length} 张 → public/dishes/_candidates/`);
