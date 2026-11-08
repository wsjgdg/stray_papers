"""菜名别名/变体扩展：分四档匹配 本项目432道菜 → 中国菜肴数据集3302道。
只做规则与包含关系，不做自由生成；候选交人工确认后才入库。
输出 .cache/alias-candidates.json + 打印 T2/T3 待确认清单
"""
import zipfile, re, json, os
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
db = [(r[2] or '').strip() for r in rows[1:] if len(r) > 22 and r[2]]
db = [d for d in db if d]
db_set = set(db)
print('库内菜名', len(db), '去重', len(db_set))

our = set()
for f in ['food-data.ts', 'food-city.ts', 'food-city-extra.ts']:
    t = open(os.path.join('src/lib', f), encoding='utf-8').read()
    our.update(re.findall(r"dish:\s*'([^']+)'", t))
print('本项目菜名', len(our))

# 已匹配（上一版 gen-dish-sodium.py 的结果）
gen = open('src/lib/dish-sodium.generated.ts', encoding='utf-8').read()
done = set(re.findall(r'^  (.+?): \{ db:', gen, re.M))
done = {d.strip("'\"") for d in done}
print('已匹配', len(done))

MOD = ['简式', '家常', '传统', '特色', '经典', '正宗', '老式', '干煸', '水煮', '清蒸', '红烧',
       '小炒', '辣炒', '爆炒', '香煎', '糖醋', '蒜蓉', '葱油', '酱爆', '凉拌']


def strip_mod(s):
    out = s
    changed = True
    while changed:
        changed = False
        for m in MOD:
            if out.startswith(m) and len(out) - len(m) >= 2:
                out, changed = out[len(m):], True
    return out


T2, T3, T4 = {}, {}, {}
for dish in sorted(our - done):
    cand_t2 = [d for d in db_set if dish in d and len(d) <= len(dish) + 4 and d != dish]
    if cand_t2:
        T2[dish] = sorted(cand_t2, key=len)[:3]
        continue
    cand_t3 = [d for d in db_set if len(d) >= 3 and d in dish and d != dish]
    if cand_t3:
        T3[dish] = sorted(cand_t3, key=len, reverse=True)[:3]
        continue
    n = strip_mod(dish)
    if n != dish and n in db_set:
        T4[dish] = [n]

print(f'\nT2 库名包含本菜名（高精度）{len(T2)} 条')
for k, v in list(T2.items())[:40]:
    print(f'  {k} → {v[0]}')
print(f'\nT3 本菜名包含库名（需人工）{len(T3)} 条')
for k, v in list(T3.items())[:60]:
    print(f'  {k} → {v[0]}')
print(f'\nT4 去修饰词相等（高精度）{len(T4)} 条')
for k, v in list(T4.items())[:30]:
    print(f'  {k} → {v[0]}')

json.dump({'T2': T2, 'T3': T3, 'T4': T4}, open('.cache/alias-candidates.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
