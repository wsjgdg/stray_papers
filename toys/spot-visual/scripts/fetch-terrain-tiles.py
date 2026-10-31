# 从 AWS Terrarium 高程瓦片（AWS Open Data 公共数据集）为全部 A 级景区算坡度
# 数据源：https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
#   - 静态 S3 托管：无 key、无配额、无限流（对比 Open-Meteo Elevation 有日/小时配额）
#   - z13 瓦片 = 256×256 像素 DEM，40°N 处像素 ≈14m、瓦片 ≈3.6×4.8km
# 解码：elev = R*256 + G + B/256 - 32768
# 坡度：numpy 向量化 Horn 3×3，输出 maxSlope（度）+ steepPct（>10° 像素占比）
# 语义统一：全量景区（含此前 Open-Meteo 批次的）一律按瓦片重算，禁止混分辨率
import json
import math
import os
import re
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/{x}/{y}.png"
TILE_DIR = "data/terrain-tiles/13"


def parse_scenic_spots():
    src = open("src/lib/scenic-enrich.generated.ts", encoding="utf-8").read()
    start = src.index("EXTRA_SCENICS")
    blocks = re.split(r'\{\s*"name":', src[start:])[1:]
    spots = []
    for b in blocks:
        m = re.match(r'\s*"([^"]+)"', b)
        if not m:
            continue
        lng_m = re.search(r'"lng": ([\d.]+)', b)
        lat_m = re.search(r'"lat": ([\d.]+)', b)
        if lng_m and lat_m:
            spots.append(
                {
                    "name": m.group(1),
                    "lng": float(lng_m.group(1)),
                    "lat": float(lat_m.group(1)),
                }
            )
    return spots


def latlng_to_tile(lng, lat, z=13):
    n = 2**z
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


_tile_cache = {}  # (x, y) -> np.ndarray 或 None


def load_tile(x, y):
    key = (x, y)
    if key in _tile_cache:
        return _tile_cache[key]
    path = os.path.join(TILE_DIR, f"{x}", f"{y}.png")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        url = TILE_URL.format(x=x, y=y)
        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "spot-visual/1.0"}
                )
                data = urllib.request.urlopen(req, timeout=20).read()
                tmp = path + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(data)
                os.replace(tmp, path)
                break
            except Exception as e:
                if attempt == 2:
                    print(f"  TILE FAIL {x}/{y}: {e}")
                    _tile_cache[key] = None
                    return None
                time.sleep(2)
    try:
        img = Image.open(path).convert("RGB")
        arr = np.asarray(img, dtype=np.float64)
        elev = arr[:, :, 0] * 256 + arr[:, :, 1] + arr[:, :, 2] / 256 - 32768
        _tile_cache[key] = elev
        return elev
    except Exception as e:
        print(f"  TILE DECODE FAIL {x}/{y}: {e}")
        _tile_cache[key] = None
        return None


def slope_from_tile(elev, lat):
    """瓦片高程矩阵 → Horn 3×3 坡度统计（numpy 向量化）

    先 8× BOX 降采样（256→32，等效 ~112m 网格）再算坡度：
    像素级（~14m）坡度在平原城市被 SRTM 噪声打爆（上海测出 68° 最大坡度），
    112m 网格与 Open-Meteo 1.4km 网格语义可比且保真（华山 56° / 故宫 4.7°）。
    """
    ds = 8
    img = Image.fromarray(elev.astype(np.float32)).resize(
        (elev.shape[1] // ds, elev.shape[0] // ds), Image.BOX
    )
    elev = np.asarray(img, dtype=np.float64)
    mppx = 40075016.7 * math.cos(math.radians(lat)) / (256 * 2**13) * ds
    mppy = 40075016.7 / (256 * 2**13) * ds
    dzdx = (elev[1:-1, 2:] - elev[1:-1, :-2]) / (2 * mppx)
    dzdy = (elev[2:, 1:-1] - elev[:-2, 1:-1]) / (2 * mppy)
    slope = np.degrees(np.arctan(np.sqrt(dzdx**2 + dzdy**2)))
    return {
        "maxSlope": round(float(slope.max()), 1),
        "steepPct": round(float((slope > 10).mean() * 100)),
    }


if __name__ == "__main__":
    cache_path = "scripts/spot-terrain-om.cache.json"
    # --force：忽略已有缓存全量重算（分辨率/算法变更后必须全量统一，禁止混语义）
    force = "--force" in sys.argv
    existing = {}
    if os.path.exists(cache_path):
        existing = json.load(open(cache_path, encoding="utf-8"))

    spots = parse_scenic_spots()
    missing = spots if force else [s for s in spots if s["name"] not in existing]
    print(f"total {len(spots)} | cached {len(existing)} | todo {len(missing)}")

    # 阶段一：8 线程并发预下载全部去重瓦片（S3 静态托管，无配额，并发安全）
    uniq_tiles = sorted({latlng_to_tile(s["lng"], s["lat"]) for s in missing})
    todo_tiles = [
        (x, y)
        for x, y in uniq_tiles
        if (x, y) not in _tile_cache
        and not os.path.exists(os.path.join(TILE_DIR, str(x), f"{y}.png"))
    ]
    print(f"tiles: unique {len(uniq_tiles)} | to download {len(todo_tiles)}")

    def fetch_tile(t):
        x, y = t
        url = TILE_URL.format(x=x, y=y)
        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "spot-visual/1.0"}
                )
                data = urllib.request.urlopen(req, timeout=30).read()
                path = os.path.join(TILE_DIR, str(x), f"{y}.png")
                os.makedirs(os.path.dirname(path), exist_ok=True)
                tmp = path + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(data)
                os.replace(tmp, path)
                return True
            except Exception:
                time.sleep(2)
        print(f"  TILE FAIL {x}/{y}")
        return False

    from concurrent.futures import ThreadPoolExecutor

    start = time.time()
    done = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        for ok in pool.map(fetch_tile, todo_tiles):
            done += 1
            if done % 200 == 0:
                rate = done / (time.time() - start)
                print(
                    f"下载 {done}/{len(todo_tiles)} {rate:.1f}/s "
                    f"ETA {(len(todo_tiles) - done) / max(rate, 0.01) / 60:.0f}min"
                )
    print(f"下载完成 {time.time() - start:.0f}s")

    # 阶段二：纯本地计算（磁盘瓦片 → 8× 降采样 Horn 坡度）
    for i, s in enumerate(missing):
        x, y = latlng_to_tile(s["lng"], s["lat"])
        elev = load_tile(x, y)
        if elev is not None:
            existing[s["name"]] = slope_from_tile(elev, s["lat"])
        if (i + 1) % 200 == 0:
            json.dump(
                existing, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False
            )
            print(f"计算 {i + 1}/{len(missing)} cache={len(existing)}")

    json.dump(existing, open(cache_path, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"完成: cache={len(existing)} / {len(spots)}")
