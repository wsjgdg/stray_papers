#!/usr/bin/env python3
"""Convert one raw agnes png to a story-CG source webp (1280px wide, q90)."""
import sys
from pathlib import Path

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
if img.width > 1280:
    img = img.resize((1280, round(img.height * 1280 / img.width)), Image.LANCZOS)
img.save(dst, "WEBP", quality=90, method=6)
print(f"{dst} <- {src} {img.size}")
