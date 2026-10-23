import re, os, json
src_dir = 'src/lib'
names = set()
for f in ['food-data.ts', 'food-city.ts', 'food-city-extra.ts']:
    t = open(os.path.join(src_dir, f), encoding='utf-8').read()
    names.update(re.findall(r"dish:\s*'([^']+)'", t))
gen = open('src/lib/dish-photos.generated.ts', encoding='utf-8').read()
have = set(re.findall(r'^  "([^"]+)":', gen, re.M))
missing = sorted(names - have)
print('菜名总数', len(names), '有图', len(have), '缺', len(missing))
for m in missing:
    print('  -', m)
