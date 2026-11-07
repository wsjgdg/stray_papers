#!/usr/bin/env python3
"""Chroma-key an Agnes-generated sprite (flat green/magenta bg) -> trimmed webp.

Usage: python make-sprite.py <in.png> <out.webp> [--bg green|magenta] [--height 900]

Keying: background is a textured flat color, so a global chroma-distance test
plus an edge flood-fill keeps interior greens (none in the cast palettes)
safe while eating the textured halo.
"""
import sys
from collections import deque
from PIL import Image

def main():
    src, out = sys.argv[1], sys.argv[2]
    bg = "green"
    height = 900
    args = sys.argv[3:]
    for i, a in enumerate(args):
        if a == "--bg":
            bg = args[i + 1]
        if a == "--height":
            height = int(args[i + 1])

    img = Image.open(src).convert("RGB")
    w, h = img.size
    px = img.load()

    if bg == "green":
        def is_bg(r, g, b):
            return g > 90 and g - max(r, b) > 42
    else:
        def is_bg(r, g, b):
            return r > 90 and b > 90 and min(r, b) - g > 42

    # flood fill from the borders so anything enclosed by the character
    # (e.g. between arm and body) is never punched out by mistake
    mask = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(*px[x, y]) and not mask[y][x]:
                mask[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(*px[x, y]) and not mask[y][x]:
                mask[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not mask[ny][nx]:
                if is_bg(*px[nx, ny]):
                    mask[ny][nx] = True
                    q.append((nx, ny))

    out_img = Image.new("RGBA", (w, h))
    src_rgba = img.convert("RGBA")
    opx = out_img.load()
    spx = src_rgba.load()
    removed = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # strict global kill: enclosed bg pockets (between fingers, under
            # an arm) never touch the border, so the flood fill misses them —
            # a much stricter threshold catches those without touching cast
            # palette colors (mint tracery, teal hair stay far below this)
            strict = (
                g > 140 and g - max(r, b) > 80
                if bg == "green"
                else r > 140 and b > 140 and min(r, b) - g > 80
            )
            if mask[y][x] or strict:
                removed += 1
            else:
                opx[x, y] = spx[x, y]
    # soften 1px edge: pixels adjacent to removed bg get partial alpha
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                n = 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx]:
                        n += 1
                if n:
                    r, g, b, a = opx[x, y]
                    opx[x, y] = (r, g, b, max(90, 255 - n * 60))

    bbox = out_img.getbbox()
    if bbox:
        out_img = out_img.crop(bbox)
    scale = height / out_img.height
    out_img = out_img.resize(
        (max(1, round(out_img.width * scale)), height), Image.LANCZOS
    )
    out_img.save(out, "WEBP", quality=82, method=6)
    import os
    print(
        f"{out}: {out_img.size}, removed {removed * 100 // (w * h)}% bg, "
        f"{os.path.getsize(out) // 1024} KB"
    )

if __name__ == "__main__":
    main()
