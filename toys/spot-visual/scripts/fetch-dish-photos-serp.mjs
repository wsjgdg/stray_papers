/**
 * 菜品照片采集 · SerpAPI（Google 图片）
 *
 * 比 Bing 干净，但免费额度只有 100 次/月，所以只用来「补 Bing 没抓到 / 抓错的」，
 * 不做全量。密钥放 .env：SERPAPI_KEY=...
 *
 * 用法：
 *   node scripts/fetch-dish-photos-serp.mjs 麻婆豆腐 佛跳墙   # 指定菜名
 *   node scripts/fetch-dish-photos-serp.mjs --query="北京烤鸭" # 临时查一个词
 *   node scripts/fetch-dish-photos-serp.mjs --per=2
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const OUT_DIR = path.resolve('public/dishes/_candidates');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PER = Number(process.argv.find((a) => a.startsWith('--per='))?.split('=')[1] ?? 2);
const CUSTOM = process.argv.find((a) => a.startsWith('--query='))?.slice(8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEY =
  process.env.SERPAPI_KEY ||
  (fs.existsSync('.env') ? (fs.readFileSync('.env', 'utf8').match(/SERPAPI_KEY=(.+)/)?.[1] ?? '').trim() : '');

if (!KEY) {
  console.error('缺少 SERPAPI_KEY。在 .env 里写 SERPAPI_KEY=xxx，或 SERPAPI_KEY=xxx node scripts/fetch-dish-photos-serp.mjs');
  process.exit(1);
}

/** 付费图库/水印站降权，菜谱站与门户站优先 */
const DOMAIN_SCORE = [
  { re: /xiachufang\.com$/, s: 30 },
  { re: /meishij\.net$/, s: 30 },
  { re: /meishichina\.com$/, s: 30 },
  { re: /douguo\.com$/, s: 28 },
  { re: /zhimg\.com$/, s: 20 },
  { re: /sinaimg\.cn$/, s: 18 },
  { re: /(sohu|163|qq|ifeng)\.(com|net)$/, s: 16 },
  { re: /(699pic|nximg|tukuppt|58pic|zhituwang|veer|hellorf|vcg|gettyimages|shutterstock)\./, s: -40 },
];
const scoreHost = (h) => DOMAIN_SCORE.find((d) => d.re.test(h))?.s ?? 0;

function googleImages(q) {
  const url =
    `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(q)}` +
    `&gl=cn&hl=zh-cn&num=20&api_key=${KEY}`;
  const out = execFileSync('curl', ['-sS', '-m', '40', url], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  let j;
  try {
    j = JSON.parse(out);
  } catch {
    console.log('  ! 响应解析失败');
    return { items: [], error: 'parse' };
  }
  if (j.error) return { items: [], error: j.error };
  const items = (j.images_results ?? [])
    .map((r) => {
      let host = '';
      try {
        host = new URL(r.original || r.link || '').hostname.replace(/^www\./, '');
      } catch {}
      return {
        url: r.original,
        page: r.link,
        title: (r.title || '').slice(0, 60),
        width: r.original_width,
        height: r.original_height,
        host,
        score: scoreHost(host) + (r.original_width >= 800 ? 5 : 0),
      };
    })
    .filter((x) => x.url && /^https?:/.test(x.url))
    .sort((a, b) => b.score - a.score);
  return { items, error: null, left: j.search_metadata?.total_time_taken };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let targets;
if (CUSTOM) targets = [{ prov: '临时', dish: CUSTOM }];
else {
  const src = fs.readFileSync('src/lib/food-data.ts', 'utf8');
  const re = /code:\s*'([A-Z]+)'[^\n]*?fullName:\s*'([^']+)'[^\n]*?dish:\s*'([^']+)'/g;
  targets = [...src.matchAll(re)].map((m) => ({ prov: m[2], dish: m[3] }));
  if (args.length) targets = targets.filter((t) => args.includes(t.dish));
}

const seen = new Set();
const report = [];
for (const { dish } of targets) {
  console.log(`\n── ${dish} ──`);
  const { items, error } = googleImages(`${dish} 成品菜`);
  if (error) {
    console.log(`  ! SerpAPI 报错：${error}`);
    if (/run out|credit|limit/i.test(String(error))) break;
    continue;
  }
  console.log(`  候选 ${items.length} 条`);
  let saved = 0;
  for (const it of items) {
    if (saved >= PER) break;
    let buf;
    try {
      buf = execFileSync('curl', ['-sS', '-m', '40', '-L', '-A', 'Mozilla/5.0', it.url], { maxBuffer: 64 * 1024 * 1024 });
    } catch {
      continue;
    }
    if (!buf || buf.length < 20000) continue;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    if (!isJpg && !isPng) continue;
    const hash = crypto.createHash('md5').update(buf).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    const ext = isPng ? 'png' : 'jpg';
    const file = path.join(OUT_DIR, `${dish}-serp${saved + 1}.${ext}`);
    fs.writeFileSync(file, buf);
    saved += 1;
    report.push({ dish, file: path.relative('public', file), image: it.url, page: it.page, host: it.host });
    console.log(`  ✓ ${path.basename(file)}  ${Math.round(buf.length / 1024)}KB  ← ${it.host}`);
  }
  if (!saved) console.log('  ✗ 没有可用图');
  await sleep(800);
}

fs.writeFileSync(path.join(OUT_DIR, '_report-serp.json'), JSON.stringify(report, null, 2));
console.log(`\n共 ${report.length} 张 → public/dishes/_candidates/`);
