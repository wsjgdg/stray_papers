# 从中国 OSM PBF 提取全国厕所 + 出入口坐标
# 使用 pyosmium TagFilter 在 C++ 层过滤（比逐节点 Python 回调快 1000 倍）
import osmium
import json
import sys

pbf_path = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/sibop/Downloads/china.pbf"
out_path = "data/osm-toilets-gates.json"

toilets = []  # [lng, lat]
gates = []    # [lng, lat]

# ── Pass 1: amenity=toilets ──
class ToiletHandler(osmium.SimpleHandler):
    def node(self, n):
        if n.location.valid():
            toilets.append([n.location.lon, n.location.lat])

print("Pass 1: amenity=toilets (C++ filter)...")
th = ToiletHandler()
th.apply_file(pbf_path, filters=[osmium.filter.TagFilter(("amenity", "toilets"))])
print(f"  toilets: {len(toilets)}")

# ── Pass 2: tourism=gate ──
class GateTourismHandler(osmium.SimpleHandler):
    def node(self, n):
        if n.location.valid():
            gates.append([n.location.lon, n.location.lat])

print("Pass 2: tourism=gate (C++ filter)...")
gth = GateTourismHandler()
gth.apply_file(pbf_path, filters=[osmium.filter.TagFilter(("tourism", "gate"))])
print(f"  tourism gates: {len(gates)}")

# ── Pass 3: barrier=gate（部分出入口只有 barrier 标签）──
pre_count = len(gates)
class GateBarrierHandler(osmium.SimpleHandler):
    def node(self, n):
        if n.location.valid():
            gates.append([n.location.lon, n.location.lat])

print("Pass 3: barrier=gate (C++ filter)...")
gbh = GateBarrierHandler()
gbh.apply_file(pbf_path, filters=[osmium.filter.TagFilter(("barrier", "gate"))])
print(f"  barrier gates added: {len(gates) - pre_count}")

# 保存
import os
os.makedirs("data", exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump({"toilets": toilets, "gates": gates}, f)
print(f"→ {out_path}: toilets={len(toilets)} gates={len(gates)}")
