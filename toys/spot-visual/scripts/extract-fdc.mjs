import fs from 'node:fs';

const j = JSON.parse(fs.readFileSync('.cache/fdc_cn.json', 'utf8'));
if (j.error) {
  console.log('ERR', JSON.stringify(j.error));
  process.exit(0);
}
const items = (j.foods ?? []).map((f) => {
  const n = Object.fromEntries((f.foodNutrients ?? []).map((x) => [String(x.nutrientNumber), x.value]));
  return {
    fdcId: f.fdcId,
    description: f.description,
    dataType: f.dataType,
    sodiumMg: n['307'],
    sugarsG: n['269'],
    energyKcal: n['208'],
  };
});
const cn = items.filter((x) => /chinese/i.test(x.description) && x.sodiumMg != null);
fs.writeFileSync('.cache/fdc_items.json', JSON.stringify(items, null, 1));
console.log('total', j.totalHits, 'items', items.length, 'chinese+Na', cn.length);
for (const x of cn) {
  console.log(`${x.fdcId} | ${x.dataType} | ${x.description} | Na ${x.sodiumMg} | 糖 ${x.sugarsG}`);
}
