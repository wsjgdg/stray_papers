/**
 * 为市级名食自动生成「主料参照」映射。
 * 规则：按菜名里的主料关键词匹配成分表条目；匹配不到就不生成（不硬凑）。
 * 输出：src/lib/ingredient-city.generated.ts
 * 用法：node scripts/gen-city-ingredients.mjs
 */
import fs from 'node:fs';

/** 顺序即优先级：越具体的越靠前，避免「鱼香肉丝」被鱼抢走 */
const RULES = [
  { key: 'seaCucumber', words: ['海参'] },
  { key: 'shrimp', words: ['虾'] },
  { key: 'duck', words: ['鸭'] },
  { key: 'chicken', words: ['鸡'] },
  { key: 'lamb', words: ['羊'] },
  { key: 'beef', words: ['牛', '腱'] },
  { key: 'pork', words: ['猪', '肉', '排骨', '里脊', '肘', '肠', '肝', '腩', '血肠', '腊肉'] },
  { key: 'fish', words: ['鱼', '鲈', '鳜', '鲤', '鲫'] },
  { key: 'tofu', words: ['豆腐', '豆花', '豆干', '腐竹', '素鸡', '豆皮'] },
  { key: 'egg', words: ['蛋'] },
  { key: 'wheat', words: ['面', '饼', '馍', '饺', '馄饨', '烧麦', '馕', '油条', '麻花', '馃', '包子', '火烧', '锅魁', '撒'] },
  { key: 'rice', words: ['米', '饭', '粉', '糕', '糍', '粽', '粥', '粿'] },
  { key: 'woodEar', words: ['木耳'] },
  { key: 'seaweed', words: ['紫菜', '海带'] },
  { key: 'cabbage', words: ['菜', '白菜', '酸菜', '笋'] },
];

const KEY_TO_ING = {
  seaCucumber: 'seaCucumber',
  shrimp: 'shrimp',
  duck: 'roastDuck',
  chicken: 'chickenLeg',
  lamb: 'lambLeg',
  beef: 'beefLeg',
  pork: 'porkLeg',
  fish: 'grassCarp',
  tofu: 'tofuSoft',
  egg: 'egg',
  wheat: 'wheatFlour',
  rice: 'glutinousRice',
  woodEar: 'woodEar',
  seaweed: 'seaweed',
  cabbage: 'cabbage',
};

/** 取所有菜名（含省 + 市） */
const names = new Set();
for (const f of ['src/lib/food-data.ts', 'src/lib/food-city.ts', 'src/lib/food-city-extra.ts']) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/dish:\s*'([^']+)'/g)) names.add(m[1]);
}

const out = [];
for (const dish of names) {
  const rule = RULES.find((r) => r.words.some((w) => dish.includes(w)));
  if (!rule) continue;
  out.push({ dish, ing: KEY_TO_ING[rule.key] });
}

const body = out
  .map(
    ({ dish, ing }) =>
      `  ${JSON.stringify(dish)}: { items: ['${ing}'], caveat: '按菜名里的主料推断，未含调味与配菜；成菜实际钠通常高于主料。' },`,
  )
  .join('\n');

fs.writeFileSync(
  'src/lib/ingredient-city.generated.ts',
  `// 本文件由 scripts/gen-city-ingredients.mjs 生成，请勿手改。\n// 只覆盖「菜名里能识别出主料」的菜；识别不出的不生成，避免硬凑。\nimport type { DishIngredients } from './ingredient-nutrition';\n\nexport const CITY_INGREDIENTS: Record<string, DishIngredients> = {\n${body}\n};\n`,
);
console.log(`菜名 ${names.size} 个，生成主料映射 ${out.length} 个`);
