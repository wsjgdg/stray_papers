/**
 * 菜品照片采集（Bing 图片，无需 API Key）
 *
 * 为什么走 Bing：
 *   实测国内网络下，Google Custom Search / Exa / DuckDuckGo / Openverse / TheMealDB /
 *   Spoonacular / Flickr / Pixabay 全部不可达（HTTP 000）；
 *   Unsplash、Pexels、SerpAPI、Brave、Bing 的 API 可以连上（401/422 说明只是缺 key），
 *   其中只有 cn.bing.com 的图片搜索**不需要 key**就能拿到中文菜名的结果。
 *
 * 用法：
 *   node scripts/fetch-dish-photos-bing.mjs                  # 全部省级代表菜
 *   node scripts/fetch-dish-photos-bing.mjs 麻婆豆腐 剁椒鱼头  # 指定菜名
 *   node scripts/fetch-dish-photos-bing.mjs --per=4           # 每道菜最多存几张（默认 3）
 *
 * 产出：public/dishes/_candidates/<菜名>-N.jpg + _report.json（含来源页，便于逐一核对）
 * 注意：搜索结果里有一部分来自付费图库（摄图网、昵图网等），通常会带水印，
 *       脚本按域名做了降权，但最终仍需人工过目。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const OUT_DIR = path.resolve('public/dishes/_candidates');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const PER = Number(process.argv.find((a) => a.startsWith('--per='))?.split('=')[1] ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';

/** 付费图库/水印站，排后面；真实菜谱与资讯站排前面 */
const DOMAIN_SCORE = [
  { re: /xiachufang\.com$/, s: 30 },
  { re: /meishij\.net$/, s: 30 },
  { re: /meishichina\.com$/, s: 30 },
  { re: /douguo\.com$/, s: 28 },
  { re: /zhimg\.com$/, s: 20 },
  { re: /sinaimg\.cn$/, s: 18 },
  { re: /(sohu|163|qq|ifeng)\.(com|net)$/, s: 16 },
  { re: /baike|wikipedia/, s: 14 },
  { re: /(699pic|nximg|tukuppt|58pic|zhituwang|veer|hellorf|vcg)\./, s: -40 },
];

function domainScore(host) {
  for (const d of DOMAIN_SCORE) if (d.re.test(host)) return d.s;
  return 0;
}

function curl(url, opts = {}) {
  return execFileSync('curl', ['-sS', '-m', '25', '-A', UA, ...(opts.bin ? [] : ['--compressed']), url], {
    encoding: opts.bin ? 'buffer' : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** 从 Bing 图片搜索页提取 murl / purl / title */
function bingImages(dish) {
  const q = encodeURIComponent(`${dish} 成品菜 美食`);
  const url = `https://cn.bing.com/images/search?q=${q}&qft=+filterui:imagesize-large&form=IRFLTR`;
  let html = '';
  try {
    html = curl(url);
  } catch (e) {
    console.log(`  ! 搜索失败 ${e.message}`);
    return [];
  }
  const items = [];
  // Bing 把结果塞在 m="{...}" 的 JSON 属性里，字段做了 HTML 转义
  const blocks = html.split('m="{').slice(1);
  for (const b of blocks) {
    const raw = '{' + b.split('}"')[0] + '}';
    let j;
    try {
      j = JSON.parse(raw.replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
    } catch {
      continue;
    }
    if (!j.murl) continue;
    let host = '';
    try {
      host = new URL(j.murl).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    items.push({ murl: j.murl, turl: j.turl || '', purl: j.purl || '', title: (j.t || '').slice(0, 60), host, score: domainScore(host) });
  }
  return items.sort((a, b) => b.score - a.score);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const src = fs.readFileSync('src/lib/food-data.ts', 'utf8');
const re = /code:\s*'([A-Z]+)'[^\n]*?fullName:\s*'([^']+)'[^\n]*?dish:\s*'([^']+)'/g;
let dishes = [...src.matchAll(re)].map((m) => ({ prov: m[2], dish: m[3] }));
if (process.argv.includes('--all')) {
  // 把城市级名食也纳入（含补充表）
  const seen = new Set(dishes.map((d) => d.dish));
  for (const file of ['src/lib/food-city.ts', 'src/lib/food-city-extra.ts']) {
    const t = fs.readFileSync(file, 'utf8');
    for (const m of t.matchAll(/dish:\s*'([^']+)'/g)) {
      const dish = m[1];
      if (!seen.has(dish)) { seen.add(dish); dishes.push({ prov: '城市', dish }); }
    }
  }
}
if (args.length) dishes = dishes.filter((d) => args.includes(d.dish));

const seenHash = new Set();
const report = [];

for (const { prov, dish } of dishes) {
  const already = fs.readdirSync(OUT_DIR).some((f) => f.startsWith(dish + '-'));
  if (already && !process.argv.includes('--force')) { console.log(`-- ${dish} 已有`); continue; }
  console.log(`\n── ${prov} / ${dish} ──`);
  const items = bingImages(dish);
  console.log(`  候选 ${items.length} 条`);
  let saved = 0;
  for (const it of items) {
    if (saved >= PER) break;
    let buf;
    try {
      buf = curl(it.murl, { bin: true });
    } catch {
      if (!it.turl) continue;
      try { buf = curl(it.turl, { bin: true }); } catch { continue; }
    }
    if (!buf || buf.length < 20000) continue;
    // 只认真正的图片（jp/png/webp 魔数）
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isWebp = buf.subarray(8, 12).toString() === 'WEBP';
    if (!isJpg && !isPng && !isWebp) continue;
    const hash = crypto.createHash('md5').update(buf).digest('hex');
    if (seenHash.has(hash)) continue;
    seenHash.add(hash);

    const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
    const file = path.join(OUT_DIR, `${dish}-${saved + 1}.${ext}`);
    fs.writeFileSync(file, buf);
    saved += 1;
    report.push({ dish, prov, file: path.relative('public', file), image: it.murl, page: it.purl, host: it.host, sizeKB: Math.round(buf.length / 1024) });
    console.log(`  ✓ ${path.basename(file)}  ${Math.round(buf.length / 1024)}KB  ← ${it.host}`);
  }
  if (!saved) console.log('  ✗ 没有可用图');
  await sleep(150);
}

fs.writeFileSync(path.join(OUT_DIR, '_report.json'), JSON.stringify(report, null, 2));
console.log(`\n共 ${report.length} 张 → public/dishes/_candidates/`);
console.log('挑好之后改名成「菜名.jpg」移到上一级，再跑 npm run photos');
