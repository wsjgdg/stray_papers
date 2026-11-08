/**
 * 抓 USDA FoodData Central 的营养数据，作为口味雷达中「咸 / 甜」两维的外部凭据。
 *
 * 说明：
 * - 只有钠（Sodium, mg/100g）和糖（Sugars, g/100g）是可测字段，能落成外部依据；
 *   辣 / 酸 / 香 / 鲜在营养库里没有对应量纲，仍属本项目自评，不做伪造。
 * - 优先 SR Legacy / Foundation / FNDDS（实验室或调查数据），其次 Branded。
 * - 结果落 .cache/taste-evidence.json 缓存，重复运行不重复请求（DEMO_KEY 限流 30 次/小时）。
 *
 * 用法：node scripts/fetch-taste-evidence.mjs [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const KEY = process.env.FDC_API_KEY || 'DEMO_KEY';
const CACHE = path.resolve('.cache/taste-evidence.json');
const FORCE = process.argv.includes('--force');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 中文菜名 → 英文检索词（与 food-data 的 EN 表一致，缺的补在这里） */
const EN = {
  北京烤鸭: 'Peking duck',
  煎饼馃子: 'jianbing',
  驴肉火烧: 'donkey meat sandwich',
  刀削面: 'knife cut noodles',
  手扒肉: 'boiled mutton',
  朝鲜冷面: 'cold buckwheat noodles',
  锅包肉: 'sweet and sour pork',
  红烧肉: 'braised pork belly',
  盐水鸭: 'salted duck',
  西湖醋鱼: 'west lake fish',
  臭鳜鱼: 'fermented mandarin fish',
  佛跳墙: 'buddha jumps over wall soup',
  粉蒸肉: 'steamed pork rice flour',
  葱烧海参: 'sea cucumber scallion',
  烩面: 'braised noodles',
  清蒸武昌鱼: 'steamed fish',
  剁椒鱼头: 'steamed fish head chili',
  白切鸡: 'white cut chicken',
  螺蛳粉: 'luosifen',
  文昌鸡: 'boiled chicken',
  重庆火锅: 'chongqing hot pot',
  麻婆豆腐: 'mapo tofu',
  酸汤鱼: 'sour fish soup',
  过桥米线: 'rice noodle soup',
  酥油茶: 'butter tea',
  羊肉泡馍: 'lamb soup bread',
  兰州牛肉面: 'beef noodle soup',
  手抓羊肉: 'lamb',
  烩羊杂: 'lamb offal soup',
  大盘鸡: 'big plate chicken',
  叉烧: 'char siu',
  葡国鸡: 'portuguese chicken',
  卤肉饭: 'braised pork rice',
};

const PREFER = { 'SR Legacy': 4, Foundation: 3, 'Survey (FNDDS)': 2, Branded: 1 };
const NUT = { energy: '208', sodium: '307', sugars: '269', fat: '204' };

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
fs.mkdirSync(path.dirname(CACHE), { recursive: true });

const src = fs.readFileSync('src/lib/food-data.ts', 'utf8');
const re = /code:\s*'([A-Z]+)'[^\n]*?fullName:\s*'([^']+)'[^\n]*?dish:\s*'([^']+)'/g;
const dishes = [...src.matchAll(re)].map((m) => ({ code: m[1], prov: m[2], dish: m[3] }));

let requests = 0;
const stopReason = [];

function api(url) {
  requests += 1;
  const out = execFileSync('curl', ['-sS', '-m', '25', '-w', '\n__STATUS__%{http_code}', url], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const m = out.match(/\n__STATUS__(\d+)$/);
  const status = m ? Number(m[1]) : 0;
  const body = m ? out.slice(0, m.index) : out;
  return { status, body };
}

for (const { dish } of dishes) {
  if (!FORCE && cache[dish]) continue;
  const q = EN[dish];
  if (!q) {
    cache[dish] = { skipped: 'no english query' };
    continue;
  }
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(
    q,
  )}&pageSize=12&api_key=${KEY}`;
  let res;
  try {
    res = api(url);
  } catch (e) {
    stopReason.push(`${dish}: ${e.message}`);
    break;
  }
  if (res.status === 429) {
    stopReason.push('429 限流，先停');
    break;
  }
  if (res.status !== 200) {
    stopReason.push(`${dish}: HTTP ${res.status}`);
    await sleep(1200);
    continue;
  }
  let foods = [];
  try {
    foods = JSON.parse(res.body).foods ?? [];
  } catch {
    stopReason.push(`${dish}: 响应解析失败`);
    continue;
  }
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const scored = foods
    .map((f) => {
      const desc = (f.description || '').toLowerCase();
      const hit = words.filter((w) => desc.includes(w)).length;
      const nut = Object.fromEntries(
        (f.foodNutrients || []).map((n) => [String(n.nutrientNumber ?? n.nutrientId), n.value]),
      );
      const hasSodium = nut[NUT.sodium] != null;
      const hasSugar = nut[NUT.sugars] != null;
      return {
        fdcId: f.fdcId,
        description: f.description,
        dataType: f.dataType,
        score: hit * 10 + (PREFER[f.dataType] ?? 0) + (hasSodium ? 4 : 0) + (hasSugar ? 2 : 0),
        sodium: nut[NUT.sodium] ?? null,
        sugars: nut[NUT.sugars] ?? null,
        energy: nut[NUT.energy] ?? null,
        fat: nut[NUT.fat] ?? null,
      };
    })
    .filter((f) => f.sodium != null)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    cache[dish] = { query: q, match: null };
    console.log(`  ✗ ${dish}（${q}）无含钠条目`);
  } else {
    const best = scored[0];
    cache[dish] = { query: q, match: best };
    console.log(
      `  ✓ ${dish} ← [${best.dataType}] ${best.description} | Na ${best.sodium}mg 糖 ${best.sugars ?? '-'}g`,
    );
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  await sleep(1500);
}

fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
console.log(`\n完成：缓存 ${Object.keys(cache).length} 条，本次请求 ${requests} 次`);
if (stopReason.length) console.log('中断原因：\n' + stopReason.map((s) => ' - ' + s).join('\n'));
