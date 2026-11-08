"""把价格与环境足迹并到已匹配的菜肴上，输出 src/lib/dish-impact.generated.ts

数据：中国菜肴数据集（3,302 道，CC BY 4.0）
 - Price-content.xlsx sheet1：菜名 + 总价
 - Environmental_footprint-unit.xlsx sheet1：Dish_name + 重量/碳/水/土地足迹
关联键：菜名（中文）→ 营养表中的 Dish_name（英文）→ 环境足迹表
"""
import zipfile, re, json
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
BASE = r'C:\Users\sibop\Desktop\29977027' + '\\'


def rows_of(path, sheet):
    z = zipfile.ZipFile(path)
    shared = [''.join(t.text or '' for t in si.iter(NS + 't'))
              for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si')]
    root = ET.fromstring(z.read(sheet))

    def txt(c):
        v = c.find(NS + 'v')
        return '' if v is None else (shared[int(v.text)] if c.get('t') == 's' else v.text)

    return [[txt(c) for c in r.findall(NS + 'c')] for r in root.findall('.//' + NS + 'row')]


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# 中文名 → 英文名
nutri = rows_of(BASE + 'Nutritional_content-unit.xlsx', 'xl/worksheets/sheet2.xml')
zh2en = {}
for r in nutri[1:]:
    if len(r) > 3 and r[2]:
        zh2en.setdefault(r[2].strip(), r[3].strip())

# 中文名 → 总价 / 份数
price_rows = rows_of(BASE + 'Price-content.xlsx', 'xl/worksheets/sheet1.xml')
zh2price = {}
for r in price_rows[1:]:
    if len(r) > 10 and r[2]:
        p = num(r[10])
        if p:
            zh2price.setdefault(r[2].strip(), p)

# 英文名 → 环境足迹
env_rows = rows_of(BASE + 'Environmental_footprint-unit.xlsx', 'xl/worksheets/sheet1.xml')
en2env = {}
for r in env_rows[1:]:
    if len(r) > 7 and r[1]:
        en2env.setdefault(r[1].strip(), {
            'weight': num(r[4]), 'carbon': num(r[5]), 'water': num(r[6]), 'land': num(r[7]),
        })

# 已匹配的菜
gen = open('src/lib/dish-sodium.generated.ts', encoding='utf-8').read()
matched = re.findall(r'^  (.+?): \{ db: (.+?), na:', gen, re.M)
matched = [(eval(a) if a.startswith("'") else a.strip("'\""), eval(b) if b.startswith("'") else b.strip("'\""))
           for a, b in matched]

out = {}
for dish, db in matched:
    price = zh2price.get(db) or zh2price.get(dish)
    env = en2env.get(zh2en.get(db, '')) or en2env.get(zh2en.get(dish, ''))
    if price is None and not env:
        continue
    out[dish] = {'db': db, 'price': round(price, 2) if price else None,
                 'carbon': round(env['carbon'], 1) if env and env['carbon'] else None,
                 'water': round(env['water'], 1) if env and env['water'] else None,
                 'land': round(env['land'], 2) if env and env['land'] else None,
                 'weight': round(env['weight'], 0) if env and env['weight'] else None}

body = '\n'.join(
    f"  {d!r}: {{ db: {v['db']!r}, price: {v['price']}, carbon: {v['carbon']}, water: {v['water']}, land: {v['land']}, weight: {v['weight']} }},"
    for d, v in sorted(out.items())
)

open('src/lib/dish-impact.generated.ts', 'w', encoding='utf-8').write(f"""// 本文件由 scripts/gen-dish-impact.py 生成，请勿手改。
//
// 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。
// price 为该条目的整份总价（元，原数据集口径），carbon/water/land 为整份环境足迹（g / L / m²）。
export interface DishImpact {{
  db: string;
  price: number | null;
  carbon: number | null;
  water: number | null;
  land: number | null;
  weight: number | null;
}}

export const DISH_IMPACT: Record<string, DishImpact> = {{
{body}
}};
""")
print('覆盖', len(out), '道菜；价格', sum(1 for v in out.values() if v['price']), '碳', sum(1 for v in out.values() if v['carbon']))
