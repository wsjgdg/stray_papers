import fs from 'node:fs';
import path from 'node:path';

// 复制 cityLabel 的简化版用于比对（脚本只做统计）
const ETHNIC = ['维吾尔','柯尔克孜','乌孜别克','鄂温克','鄂伦春','哈萨克','塔吉克','塔塔尔','达斡尔','俄罗斯','布依','朝鲜','土家','哈尼','傈僳','拉祜','景颇','仫佬','布朗','撒拉','毛南','仡佬','锡伯','阿昌','普米','保安','裕固','独龙','赫哲','门巴','珞巴','基诺','蒙古','回','藏','苗','彝','壮','满','侗','瑶','白','傣','黎','佤','畲','水','土','羌','怒','京'].sort((a, b) => b.length - a.length);

function label(name) {
  if (!name) return '';
  const auto = name.match(/^(.*?)(自治州|自治县|自治旗)$/);
  if (auto) {
    let core = auto[1];
    for (;;) {
      const hit = ETHNIC.find((e) => core.endsWith(`${e}族`));
      if (hit && core.length - hit.length - 1 >= 2) { core = core.slice(0, -(hit.length + 1)); continue; }
      const bare = ETHNIC.filter((e) => e.length >= 2).find((e) => core.endsWith(e));
      if (bare && core.length >= bare.length + 2) { core = core.slice(0, -bare.length); continue; }
      break;
    }
    return core || auto[1];
  }
  for (const s of ['特别行政区','地区','开发区','林区','新区','市','盟','县','区']) {
    if (name.endsWith(s) && name.length - s.length >= 2) return name.slice(0, -s.length);
  }
  return name;
}

// 从 food-city.ts 里抽已覆盖的键
const covered = new Set();
for (const file of ['src/lib/food-city.ts', 'src/lib/food-city-extra.ts']) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^\s{2}([^\s:]+):\s*\{\s*dish:/gm)) covered.add(m[1]);
}

const geoDir = 'public/geo';
const files = fs.readdirSync(geoDir).filter((f) => /^\d+\.json$/.test(f));
const missing = [];
const all = [];
for (const f of files) {
  const code = f.replace('.json', '');
  const geo = JSON.parse(fs.readFileSync(path.join(geoDir, f), 'utf8'));
  const names = geo.features.map((x) => x.properties?.name).filter(Boolean);
  for (const n of names) {
    const l = label(n);
    all.push(l);
    if (!covered.has(l) && !covered.has(n)) missing.push({ code, label: l, full: n });
  }
}
console.log('城市总数', all.length, '已覆盖', covered.size, '缺失', missing.length);
const byProv = new Map();
for (const m of missing) {
  if (!byProv.has(m.code)) byProv.set(m.code, []);
  byProv.get(m.code).push(m.label);
}
for (const [code, list] of [...byProv.entries()].sort()) {
  console.log(code, list.length, list.join(' '));
}
