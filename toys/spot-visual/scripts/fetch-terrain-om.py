# 从 Open-Meteo Elevation API 批量采样景区周边 5×5 高程网格 → 算最大坡度/陡坡占比
# 替代 OpenTopography（24h 限流）：Open-Meteo Elevation 免费、无 key、无限额
# 每次 API call 返回 25 个高程点（5×5 网格，间距 0.0125°≈1.4km）
import json
import math
import re
import sys
import urllib.request
import urllib.parse
import time
import os

def parse_scenic_spots(level):
    src = open("src/lib/scenic-enrich.generated.ts", encoding="utf-8").read()
    start = src.index("EXTRA_SCENICS")
    blocks = re.split(r'\{\s*"name":', src[start:])[1:]
    spots = []
    for b in blocks:
        m = re.match(r'\s*"([^"]+)"', b)
        if not m:
            continue
        name = m.group(1)
        lng_m = re.search(r'"lng": ([\d.]+)', b)
        lat_m = re.search(r'"lat": ([\d.]+)', b)
        level_m = re.search(r'"level": "([^"]+)"', b)
        if lng_m and lat_m and level_m and level_m.group(1) == level:
            spots.append({
                "name": name,
                "lng": float(lng_m.group(1)),
                "lat": float(lat_m.group(1)),
            })
    return spots

def compute_slope_grid(elevations, n, center_lat):
    """5×5 高程网格 → Horn 坡度"""
    grid = [elevations[i * n:(i + 1) * n] for i in range(n)]
    m_per_lat = 111320
    m_per_lng = 111320 * math.cos(math.radians(center_lat))
    cell_m = 0.0125 * m_per_lat  # 0.0125° ≈ 1.4km

    max_slope = 0
    steep = 0
    total = 0
    for r in range(1, n - 1):
        for c in range(1, n - 1):
            dzdx = (grid[r][c + 1] - grid[r][c - 1]) / (2 * cell_m)
            dzdy = (grid[r + 1][c] - grid[r - 1][c]) / (2 * cell_m)
            slope = math.degrees(math.atan(math.sqrt(dzdx ** 2 + dzdy ** 2)))
            if slope > max_slope:
                max_slope = slope
            if slope > 10:
                steep += 1
            total += 1
    return {
        "maxSlope": round(max_slope, 1),
        "steepPct": round(steep / total * 100) if total > 0 else 0,
    }

if __name__ == "__main__":
    level = sys.argv[1] if len(sys.argv) > 1 else "5A"
    cache_path = "scripts/spot-terrain-om.cache.json"

    spots = parse_scenic_spots(level)
    existing = {}
    if os.path.exists(cache_path):
        existing = json.load(open(cache_path, encoding="utf-8"))
    print(f"{level}: {len(spots)} spots | 已缓存: {len(existing)}")

    N = 5
    HALF = 0.025  # ±0.025° ≈ ±2.8km
    STEP = HALF * 2 / (N - 1)  # 0.0125°

    hit = 0
    miss = 0
    for i, s in enumerate(spots):
        if s["name"] in existing:
            continue
        # 生成 5×5 网格坐标
        lats = []
        lngs = []
        for r in range(N):
            for c in range(N):
                lats.append(round(s["lat"] - HALF + r * (HALF * 2 / (N - 1)), 6))
                lngs.append(round(s["lng"] - HALF + c * (HALF * 2 / (N - 1)), 6))
        lat_str = ",".join(str(x) for x in lats)
        lng_str = ",".join(str(x) for x in lngs)
        url = f"https://api.open-meteo.com/v1/elevation?latitude={lat_str}&longitude={lng_str}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "spot-visual/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
            elevs = data.get("elevation", [])
            if len(elevs) == N * N:
                slope = compute_slope_grid(elevs, N, s["lat"])
                existing[s["name"]] = slope
                hit += 1
            else:
                miss += 1
        except Exception as e:
            miss += 1
            if miss <= 5:
                print(f"  MISS {s['name']}: {e}")
        if (i + 1) % 50 == 0:
            # 增量落盘
            json.dump(existing, open(cache_path, "w"), ensure_ascii=False)
            print(f"进度 {i+1}/{len(spots)} 命中 {hit} 未中 {miss} (cached={len(existing)})")
        time.sleep(2)

    json.dump(existing, open(cache_path, "w"), ensure_ascii=False)
    print(f"完成: 缓存 {len(existing)} | 本轮命中 {hit} 未中 {miss}")
