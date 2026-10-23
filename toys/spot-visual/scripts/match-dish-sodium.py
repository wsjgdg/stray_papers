"""把「中国菜肴数据集(3302道, CC BY 4.0)」的钠含量匹配到本项目的菜名上。

只导出派生结果（每份钠、全库分位、命中的库内菜名），不分发原始表。
输出：src/lib/dish-sodium.generated.ts
"""
import zipfile, re, os
import xml.etree.ElementTree as ET

XLSX = r'C:\Users\sibop\Desktop\29977027\Nutritional_content-unit.xlsx'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

z = zipfile.ZipFile(XLSX)
shared = [''.join(t.text or '' for t in si.iter(NS + 't'))
          for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si')]
root = ET.fromstring(z.read('xl/worksheets/sheet2.xml'))


def txt(c):
    v = c.find(NS + 'v')
    if v is None:
        return ''
    return shared[int(v.text)] if c.get('t') == 's' else v.text


rows = [[txt(c) for c in r.findall(NS + 'c')] for r in root.findall('.//' + NS + 'row')]
data = []
for r in rows[1:]:
    if len(r) < 23:
        continue
    name, na, serving = (r[2] or '').strip(), r[22], r[4]
    try:
        na_f = float(na)
    except (TypeError, ValueError):
        continue
    if na_f <= 0:
        continue
    data.append({'name': name, 'na': na_f, 'serving': serving})

nas = sorted(d['na'] for d in data)
n = len(nas)
print('有效条目', n)


def pct(v):
    # 分位：低于该值的比例（0-100）
    import bisect
    return round(bisect.bisect_left(nas, v) / n * 100)


# 我们的菜名
names = set()
for f in ['food-data.ts', 'food-city.ts', 'food-city-extra.ts']:
    t = open(os.path.join('src/lib', f), encoding='utf-8').read()
    names.update(re.findall(r"dish:\s*'([^']+)'", t))

PREFIX = ['简式', '家常', '传统', '特色', '经典', '正宗', '烧', '炒', '炖', '蒸', '煮']


def norm(s):
    s = s.replace(' ', '').strip()
    for p in PREFIX:
        if s.startswith(p) and len(s) - len(p) >= 2:
            return s[len(p):]
    return s


by_name = {}
for d in data:
    by_name.setdefault(norm(d['name']), d)
for d in data:
    by_name.setdefault(d['name'], d)

matched = {}
unmatched = []
for dish in sorted(names):
    key = norm(dish)
    hit = by_name.get(key) or by_name.get(dish)
    if not hit:
        cand = [d for d in data if dish in d['name'] and len(d['name']) <= len(dish) + 4]
        if cand:
            hit = min(cand, key=lambda d: len(d['name']))
    if not hit:
        cand = [d for d in data if len(d['name']) >= 3 and d['name'] in dish]
        if cand:
            hit = max(cand, key=lambda d: len(d['name']))
    if hit:
        matched[dish] = hit
    else:
        unmatched.append(dish)

print('命中', len(matched), '/', len(names))

body = '\n'.join(
    f'  {dish!r}: {{ db: {m["name"]!r}, na: {round(m["na"], 1)}, serving: {str(m["serving"] or "")!r}, pct: {pct(m["na"])} }},'
    for dish, m in sorted(matched.items())
).replace("'", "'")

ts = f"""// 本文件由 scripts/match-dish-sodium.py 生成，请勿手改。
//
// 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。
// 只保留派生结果：命中的库内菜名、每份钠含量、每份份数、以及该钠值在 3,302 道菜中的分位。
// 原始表不入库。
export interface DishSodium {{
  /** 数据集里的菜名（可能与本项目用字略有差异） */
  db: string;
  /** 每份钠含量 mg */
  na: number;
  /** 该条目的份数 */
  serving: string;
  /** 在全集 3,302 道菜中的钠分位（0-100，越高越咸） */
  pct: number;
}}

export const DISH_SODIUM: Record<string, DishSodium> = {{
{body}
}};

export const SODIUM_DATASET_SIZE = {n};
"""

open('src/lib/dish-sodium.generated.ts', 'w', encoding='utf-8').write(ts)
print('写出 src/lib/dish-sodium.generated.ts')
