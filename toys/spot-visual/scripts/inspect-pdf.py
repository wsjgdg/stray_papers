import os, re, sys

P = r"C:\Users\sibop\Desktop\中国食物成分表 标准版 第二册 第6版 杨月欣 北大医 2019 中 扫描 ※ 9787565919787.pdf"
print('exists', os.path.exists(P))
if not os.path.exists(P):
    # 列目录看看真实文件名
    d = os.path.dirname(P)
    for f in os.listdir(d):
        if '成分表' in f or '.pdf' in f.lower():
            print('  found:', f)
    sys.exit(0)

size = os.path.getsize(P)
print('size MB', round(size / 1048576, 1))

with open(P, 'rb') as fh:
    head = fh.read(4)
    fh.seek(0)
    chunk = fh.read(min(size, 40 * 1024 * 1024))
print('header', head)
print('pages(/Type/Page)', chunk.count(b'/Type/Page') + chunk.count(b'/Type /Page'))
print('text ops Tj/TJ', chunk.count(b'Tj') + chunk.count(b'TJ'))
print('DCTDecode imgs', chunk.count(b'DCTDecode'))
print('FlateDecode', chunk.count(b'FlateDecode'))
print('has Font', chunk.count(b'/Font'))
print('linearized', b'/Linearized' in chunk)

try:
    from pypdf import PdfReader
    r = PdfReader(P)
    print('pypdf pages', len(r.pages))
    t = r.pages[80].extract_text() or ''
    print('page81 text len', len(t))
    print(repr(t[:300]))
except Exception as e:
    print('pypdf NA:', type(e).__name__, e)
