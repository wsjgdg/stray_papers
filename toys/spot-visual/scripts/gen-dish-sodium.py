"""生成菜肴级钠数据（含模糊匹配 + 人工确认名单）。

数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。
策略：精确/去前缀后相似度 ≥0.86 的自动接受；0.66–0.86 的必须进 MANUAL 名单
（下面这份是逐条人工核对过的，同菜才算，地名变体算同菜，泛化名不算）。
"""
import zipfile, re, os, json, difflib, bisect
import xml.etree.ElementTree as ET

XLSX = r'C:\Users\sibop\Desktop\29977027\Nutritional_content-unit.xlsx'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z = zipfile.ZipFile(XLSX)
shared = [''.join(t.text or '' for t in si.iter(NS + 't'))
          for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(NS + 'si')]
root = ET.fromstring(z.read('xl/worksheets/sheet2.xml'))


def txt(c):
    v = c.find(NS + 'v')
    return '' if v is None else (shared[int(v.text)] if c.get('t') == 's' else v.text)


rows = [[txt(c) for c in r.findall(NS + 'c')] for r in root.findall('.//' + NS + 'row')]
data = []
for r in rows[1:]:
    if len(r) < 23:
        continue
    try:
        na = float(r[22])
    except (TypeError, ValueError):
        continue
    if na > 0:
        data.append({'name': (r[2] or '').strip(), 'na': na, 'serving': r[4]})

nas = sorted(d['na'] for d in data)
N = len(nas)
pct = lambda v: round(bisect.bisect_left(nas, v) / N * 100)

# ── 人工确认（0.66–0.86 区间里逐条看过，确认是同一道菜的） ──
MANUAL = {
    '临高烤乳猪': '烤乳猪',        # 地名变体
    '兴安烤羊腿': '烤羊腿',        # 地名变体
    '千张包子': '湖州千张包',      # 千张包即湖州特产，本项目的菜名加了「子」
    '客家酿豆腐': '酿豆腐',        # 客家即该菜本源
    '昌吉丸子汤': '丸子汤',        # 地名变体
    '松鼠桂鱼': '松鼠鳜鱼',        # 桂鱼=鳜鱼，同物异名
    '永州血鸭': '炒血鸭',          # 永州为血鸭本源做法
    '东坡肘子': '八宝糯米东坡肘子',   # 同菜，本项目的名字省了前缀
    '红焖羊肉': '栗子红焖羊肉',       # 同菜，加栗子版本
    '臭豆腐': '长沙臭豆腐',           # 臭豆腐本源即长沙
    '全羊汤锅': '全羊汤',             # 锅=盛具，同菜
    '湛江白切鸡': '白切鸡',           # 地名变体
    '白城烤羊腿': '烤羊腿',           # 地名变体
    '黄冈东坡肉': '东坡肉',           # 地名变体
}
# 命中但属于「不同东西」的，禁掉
BLOCK = {'金华火腿'}  # 库内是「金华火腿酥」，是酥点不是火腿

PREFIX = ['简式', '家常', '传统', '特色', '经典', '正宗', '老式', '干煸', '水煮', '烧', '炒', '炖', '蒸', '煮', '拌', '焖']


def norm(s):
    s = re.sub(r'[（）()·\s]', '', s)
    changed = True
    while changed:
        changed = False
        for p in PREFIX:
            if s.startswith(p) and len(s) - len(p) >= 2:
                s, changed = s[len(p):], True
    return s


names = set()
for f in ['food-data.ts', 'food-city.ts', 'food-city-extra.ts']:
    t = open(os.path.join('src/lib', f), encoding='utf-8').read()
    names.update(re.findall(r"dish:\s*'([^']+)'", t))

by_norm, by_raw = {}, {}
for d in data:
    by_norm.setdefault(norm(d['name']), d)
    by_raw.setdefault(d['name'], d)

matched = {}
for dish in sorted(names):
    if dish in BLOCK:
        continue
    if dish in MANUAL:
        hit, kind = by_raw.get(MANUAL[dish]) or by_norm.get(norm(MANUAL[dish])), 'manual'
    else:
        hit, kind = by_raw.get(dish) or by_norm.get(norm(dish)), 'exact'
        if not hit:
            best = max(((difflib.SequenceMatcher(None, norm(dish), norm(d['name'])).ratio(), d) for d in data),
                       key=lambda x: x[0], default=(0, None))
            if best[0] >= 0.86:
                hit, kind = best[1], 'fuzzy'
    if hit:
        matched[dish] = (hit, kind)

print(f'命中 {len(matched)} / {len(names)}')

body = '\n'.join(
    f'  {dish!r}: {{ db: {h["name"]!r}, na: {round(h["na"], 1)}, serving: {str(h["serving"] or "")!r}, pct: {pct(h["na"])}, match: {k!r} }},'
    for dish, (h, k) in sorted(matched.items())
)

ts = f"""// 本文件由 scripts/gen-dish-sodium.py 生成，请勿手改。
//
// 数据来源：中国菜肴数据集（3,302 道菜，CC BY 4.0）。
// 只保留派生结果：命中的库内菜名、每份钠、份数、该钠值在 3,302 道菜中的分位。
// match 字段说明匹配强度：exact=同名或仅差前缀，manual=人工确认的地名/异名变体，fuzzy=高相似度自动匹配。
export interface DishSodium {{
  db: string;
  na: number;
  serving: string;
  pct: number;
  match: 'exact' | 'manual' | 'fuzzy';
}}

export const DISH_SODIUM: Record<string, DishSodium> = {{
{body}
}};

export const SODIUM_DATASET_SIZE = {N};
"""

open('src/lib/dish-sodium.generated.ts', 'w', encoding='utf-8').write(ts)
print('写出 →', len(body.splitlines()), '条')
