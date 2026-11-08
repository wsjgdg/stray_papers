"""从扫描版 PDF 里直接抠出页图（DCTDecode 的 JPEG）。
不需要 poppler/ghostscript：按 SOI/EOI 标记扫描即可。
用法：python scripts/carve-pdf-images.py [最多张数] [起始序号]
"""
import os, sys, struct

P = r"C:\Users\sibop\Desktop\中国食物成分表 标准版 第二册 第6版 杨月欣 北大医 2019 中 扫描 ※ 9787565919787.pdf"
OUT = os.path.join(os.path.dirname(__file__), '..', '.cache', 'pdfpages_' + (sys.argv[3] if len(sys.argv) > 3 else 'v2'))
# 用法: python scripts/carve-pdf-images.py <max> <skip> [pdf|v1|v2]
MAXN = int(sys.argv[1]) if len(sys.argv) > 1 else 24
SKIP = int(sys.argv[2]) if len(sys.argv) > 2 else 0
WHICH = sys.argv[3] if len(sys.argv) > 3 else 'v2'
P_V1 = r"C://Users//sibop//Desktop//中国食物成分表 标准版 第一册 第6版 杨月欣 北大医 2018 中 扫描 ※ 9787565916991.pdf"
if WHICH == 'v1':
    P = P_V1

os.makedirs(OUT, exist_ok=True)
data = open(P, 'rb').read()
print('file MB', round(len(data) / 1048576, 1))


def jpeg_size(b):
    """从 JPEG 头解析宽高，顺便验证结构"""
    i = 2
    while i < len(b) - 9:
        if b[i] != 0xFF:
            i += 1
            continue
        m = b[i + 1]
        if m in (0xC0, 0xC1, 0xC2, 0xC3):
            h, w = struct.unpack('>HH', b[i + 5:i + 9])
            return w, h
        ln = struct.unpack('>H', b[i + 2:i + 4])[0]
        i += 2 + ln
    return None


found = 0
idx = 0
pos = 0
while True:
    s = data.find(b'\xff\xd8\xff', pos)
    if s < 0:
        break
    e = data.find(b'\xff\xd9', s)
    if e < 0:
        break
    blob = data[s:e + 2]
    pos = e + 2
    if len(blob) < 60 * 1024:
        continue
    wh = jpeg_size(blob)
    idx += 1
    if idx <= SKIP:
        continue
    if wh and wh[0] < 600:
        continue
    name = f'p{idx:03d}.jpg'
    open(os.path.join(OUT, name), 'wb').write(blob)
    found += 1
    print(f'  {name}  {wh}  {len(blob)//1024}KB')
    if found >= MAXN:
        break

print('dumped', found, '→', os.path.abspath(OUT))
