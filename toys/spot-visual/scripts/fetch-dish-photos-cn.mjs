/**
 * 菜品照片采集（国内通道）
 *
 * 链路：博查 Web Search 找页面 → 抓页面里的 og:image / 主图 → 百度菜品识别核验
 *       → 通过校验的图下载到 public/dishes/_candidates/
 *
 * 为什么要「核验」这一步：搜索引擎给的是页面主图，经常是店铺招牌、菜单、甚至不相干的图。
 * 百度菜品识别能返回菜名 + 置信度，用它可以挡掉「图不对菜」，这是之前直接用图库 API
 * 最大的坑（驴肉火烧配到三明治那种）。
 *
 * 需要的密钥（缺哪个就跳过哪一步，不会报错退出）：
 *   BOCHA_API_KEY     https://open.bochaai.com  注册即送试用额度
 *   BAIDU_API_KEY     https://console.bce.baidu.com  「菜品识别」每月有免费额度
 *   BAIDU_SECRET_KEY  同上
 *
 * 用法：
 *   node scripts/fetch-dish-photos-cn.mjs            # 全部省级代表菜
 *   node scripts/fetch-dish-photos-cn.mjs 麻婆豆腐    # 指定菜名
 *   node scripts/fetch-dish-photos-cn.mjs --no-verify  # 跳过菜品识别核验
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BOCHA_KEY = process.env.BOCHA_API_KEY || '';
const BAIDU_KEY = process.env.BAIDU_API_KEY || '';
const BAIDU_SECRET = process.env.BAIDU_SECRET_KEY || '';
const OUT_DIR = path.resolve('public/dishes/_candidates');
const VERIFY = !process.argv.includes('--no-verify') && !!(BAIDU_KEY && BAIDU_SECRET);
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function curl(args) {
  return execFileSync('curl', ['-sS', '-m', '30', ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}
function curlJson(url, headers = []) {
  const h = headers.flatMap((x) => ['-H', x]);
  const out = curl(['-w', '\n__S__%{http_code}', ...h, url]);
  const m = out.match(/\n__S__(\d+)$/);
  return { status: m ? Number(m[1]) : 0, body: m ? out.slice(0, m.index) : out };
}

/* ── 1. 博查搜索 ───────────────────────────────────────────── */
function bochaSearch(query, count = 8) {
  const payload = JSON.stringify({ query, count, summary: true, freshness: 'noLimit' });
  const out = execFileSync(
    'curl',
    [
      '-sS', '-m', '30', '-X', 'POST',
      'https://api.bochaai.com/v1/web-search',
      '-H', `Authorization: Bearer ${BOCHA_KEY}`,
      '-H', 'Content-Type: application/json',
      '-d', payload,
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  let j;
  try {
    j = JSON.parse(out);
  } catch {
    return [];
  }
  const list = j?.data?.webPages?.value ?? j?.webPages?.value ?? [];
  return list.map((x) => ({
    title: x.name ?? '',
    url: x.url ?? '',
    snippet: x.snippet ?? '',
    image: x.thumbnailUrl ?? x.imageUrl ?? x.image ?? null,
    site: x.siteName ?? '',
  }));
}

/* ── 2. 从页面抓主图 ───────────────────────────────────────── */
function extractImages(pageUrl) {
  let html = '';
  try {
    html = curl(['-L', '--compressed', '-A', 'Mozilla/5.0', pageUrl]);
  } catch {
    return [];
  }
  const abs = (u) => {
    try {
      return new URL(u, pageUrl).toString();
    } catch {
      return null;
    }
  };
  const out = [];
  for (const re of [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
  ]) {
    for (const m of html.matchAll(re)) {
      const u = abs(m[1]);
      if (u) out.push(u);
    }
  }
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi)) {
    const u = abs(m[1]);
    if (u) out.push(u);
  }
  return [...new Set(out)].slice(0, 6);
}

/* ── 3. 百度菜品识别核验 ───────────────────────────────────── */
let baiduToken = null;
function getBaiduToken() {
  if (baiduToken) return baiduToken;
  const r = curlJson(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_KEY}&client_secret=${BAIDU_SECRET}`,
  );
  baiduToken = JSON.parse(r.body)?.access_token ?? null;
  return baiduToken;
}

function verifyDish(imageUrl, dish) {
  const token = getBaiduToken();
  if (!token) return { ok: false, reason: 'no token' };
  const img = execFileSync('curl', ['-sS', '-m', '30', '-L', imageUrl], { maxBuffer: 32 * 1024 * 1024 });
  const b64 = Buffer.from(img).toString('base64');
  const out = execFileSync(
    'curl',
    [
      '-sS', '-m', '40', '-X', 'POST',
      `https://aip.baidubce.com/rest/2.0/image-classify/v2/dish?access_token=${token}`,
      '-H', 'Content-Type: application/x-www-form-urlencoded',
      '--data-urlencode', `image=${b64}`,
      '--data-urlencode', 'top_num=3',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  try {
    const j = JSON.parse(out);
    const results = (j.result ?? []).map((x) => ({ name: x.name, prob: Number(x.probability ?? 0) }));
    const hit = results.find((r) => r.name && (r.name.includes(dish) || dish.includes(r.name)));
    return { ok: !!hit, top: results[0] ?? null, results };
  } catch {
    return { ok: false, reason: 'parse' };
  }
}

/* ── 主流程 ───────────────────────────────────────────────── */
if (!BOCHA_KEY) {
  console.error('缺少 BOCHA_API_KEY。到 https://open.bochaai.com 注册取 key，然后：');
  console.error('  BOCHA_API_KEY=sk-xxx node scripts/fetch-dish-photos-cn.mjs');
  process.exit(1);
}

const src = fs.readFileSync('src/lib/food-data.ts', 'utf8');
const re = /code:\s*'([A-Z]+)'[^\n]*?fullName:\s*'([^']+)'[^\n]*?dish:\s*'([^']+)'/g;
let dishes = [...src.matchAll(re)].map((m) => ({ code: m[1], prov: m[2], dish: m[3] }));
if (ONLY.length) dishes = dishes.filter((d) => ONLY.includes(d.dish));

fs.mkdirSync(OUT_DIR, { recursive: true });
const report = [];

for (const { dish, prov } of dishes) {
  console.log(`\n── ${prov} / ${dish} ──`);
  const hits = bochaSearch(`${dish} 成品菜 高清图`, 8);
  console.log(`  搜索命中 ${hits.length} 条`);
  let saved = 0;
  for (const h of hits) {
    if (saved >= 2) break;
    const imgs = h.image ? [h.image, ...extractImages(h.url)] : extractImages(h.url);
    for (const img of imgs) {
      if (saved >= 2) break;
      let verdict = { ok: true, skipped: !VERIFY };
      if (VERIFY) {
        verdict = verifyDish(img, dish);
        if (!verdict.ok) continue;
      }
      const ext = (img.match(/\.(jpe?g|png|webp)/i)?.[1] ?? 'jpg').toLowerCase();
      const file = path.join(OUT_DIR, `${dish}-${saved + 1}.${ext}`);
      try {
        execFileSync('curl', ['-sS', '-m', '40', '-L', '-o', file, img]);
        if (fs.statSync(file).size < 8000) {
          fs.unlinkSync(file);
          continue;
        }
      } catch {
        continue;
      }
      saved += 1;
      report.push({
        dish,
        file: path.relative('public', file),
        image: img,
        page: h.url,
        site: h.site,
        verified: verdict.ok,
        top: verdict.top ?? null,
      });
      console.log(`  ✓ 保存 ${path.basename(file)}${verdict.top ? `（识别为 ${verdict.top.name} ${(verdict.top.prob * 100).toFixed(0)}%）` : ''}`);
      break;
    }
  }
  if (!saved) console.log('  ✗ 没有通过核验的图');
  await sleep(600);
}

fs.writeFileSync(path.join(OUT_DIR, '_report.json'), JSON.stringify(report, null, 2));
console.log(`\n共保存 ${report.length} 张到 public/dishes/_candidates/`);
console.log('人工过一遍后，把选中的图改名成「菜名.jpg」挪到 public/dishes/，再跑 npm run photos');
if (!VERIFY) console.log('⚠ 未启用菜品识别核验（缺 BAIDU_API_KEY/BAIDU_SECRET_KEY），图可能是错的，务必人工核对');
