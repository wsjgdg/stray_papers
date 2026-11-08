/**
 * 生成「待补营养数据」清单：把所有还没有外部营养条目的菜列成 CSV + Markdown。
 * 用法：node scripts/gen-nutrition-todo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const FDC_DISHES = new Set(['北京烤鸭', '庐州烤鸭', '锅包肉', '扬州炒饭', '老边饺子', '黑家饺子', '鲅鱼饺子']);

/** 省级代表菜 */
const provSrc = fs.readFileSync('src/lib/food-data.ts', 'utf8');
const provRe = /code:\s*'([A-Z]+)'[^\n]*?name:\s*'([^']+)'[^\n]*?fullName:\s*'([^']+)'[^\n]*?dish:\s*'([^']+)'[^\n]*?cuisine:\s*'([^']+)'/g;
const provinces = [...provSrc.matchAll(provRe)].map((m) => ({ prov: m[2], city: '', dish: m[4], cuisine: m[5] }));

/** 市级代表菜：按 // ── 省名 ── 注释分段 */
function parseCityFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  let section = '';
  for (const line of text.split('\n')) {
    const h = line.match(/\/\/\s*──\s*(\S+?)\s*──/);
    if (h) {
      section = h[1];
      continue;
    }
    const m = line.match(/^\s{2}([^\s:]+):\s*\{\s*dish:\s*'([^']+)'(?:,\s*cuisine:\s*'([^']+)')?/);
    if (m) out.push({ prov: section, city: m[1], dish: m[2], cuisine: m[3] ?? '' });
  }
  return out;
}
const cities = [...parseCityFile('src/lib/food-city.ts'), ...parseCityFile('src/lib/food-city-extra.ts')];

const seen = new Set();
const rows = [];
for (const p of provinces) {
  if (FDC_DISHES.has(p.dish) || seen.has(`省|${p.dish}`)) continue;
  seen.add(`省|${p.dish}`);
  rows.push({ level: '省级', prov: p.prov, city: '（省域）', dish: p.dish, cuisine: p.cuisine });
}
for (const c of cities) {
  if (FDC_DISHES.has(c.dish) || seen.has(`市|${c.dish}`)) continue;
  seen.add(`市|${c.dish}`);
  rows.push({ level: '市级', prov: c.prov, city: c.city, dish: c.dish, cuisine: c.cuisine });
}

fs.mkdirSync('docs', { recursive: true });

// CSV（带 BOM，Excel 直接打开不乱码）
const header = ['层级', '省份', '城市/区', '菜名', '菜系', '钠 mg/100g', '糖 g/100g', '数据来源/页码', '是否查到'];
const csv = [header.join(','), ...rows.map((r) => [r.level, r.prov, r.city, r.dish, r.cuisine, '', '', '', ''].map((x) => `"${x}"`).join(','))].join('\n');
fs.writeFileSync('docs/nutrition-todo.csv', '\uFEFF' + csv + '\n');

// Markdown 清单
const byProv = new Map();
for (const r of rows) {
  if (!byProv.has(r.prov)) byProv.set(r.prov, []);
  byProv.get(r.prov).push(r);
}
const provCount = rows.filter((r) => r.level === '省级').length;
const cityCount = rows.length - provCount;

let md = `# 待补营养数据的菜品清单

口味雷达的「钠 / 糖」两个维度目前只有 **7 道菜**接上了 USDA FoodData Central 的实测值
（北京烤鸭、庐州烤鸭、锅包肉、扬州炒饭、老边饺子、黑家饺子、鲅鱼饺子）。

下面这 **${rows.length} 道**还没有外部数据，目前是「本项目自评」口径。

- 省级代表菜 **${provCount}** 道（优先，进首屏的省份卡面直接展示）
- 市级代表菜 **${cityCount}** 道

## 怎么填

1. 查《中国食物成分表 标准版 第 6 版》（杨月欣主编，北京大学医学出版社），按菜名或主料查钠、糖两项，单位分别是 mg/100g 与 g/100g
2. 查不到就留空——留空比编数好，页面上会继续标「自评」
3. CSV 版本：\`docs/nutrition-todo.csv\`（带 BOM，Excel 直接开），最后一列填书名页码或 URL，我按它回填进代码

> 只有钠和糖是营养库能给的量；辣/酸/香/鲜没有对应量纲，不在这份清单里。

`;

for (const [prov, list] of byProv) {
  md += `\n## ${prov}（${list.length}）\n\n`;
  md += '| 菜名 | 城市/区 | 菜系 | 钠 | 糖 |\n|---|---|---|---|---|\n';
  for (const r of list) md += `| ${r.dish} | ${r.city} | ${r.cuisine || '-'} | ☐ | ☐ |\n`;
}
fs.writeFileSync('docs/nutrition-todo.md', md);

console.log(`共 ${rows.length} 道待补（省级 ${provCount} / 市级 ${cityCount}）`);
console.log('写出 docs/nutrition-todo.csv 与 docs/nutrition-todo.md');
