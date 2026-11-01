# 从中国 OSM PBF 提取全国厕所 + 出入口坐标 → JSON（build 时一次性烘焙）
# 流式扫描（内存安全），1.6GB 约 2-3 分钟
import osmium
import json
import sys

class POIHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.toilets = []  # [lng, lat]
        self.gates = []    # [lng, lat] (出入口/大门)

    def node(self, n):
        if not n.location.valid():
            return
        tags = n.tags
        amenity = tags.get("amenity", "")
        tourism = tags.get("tourism", "")
        barrier = tags.get("barrier", "")

        if amenity == "toilets":
            self.toilets.append([n.location.lon, n.location.lat])
        elif (
            tourism == "gate"
            or barrier == "toll_gate"
            or (tags.get("entrance") == "yes" and barrier in ("gate", "fence"))
            or (barrier == "gate" and tourism)
        ):
            self.gates.append([n.location.lon, n.location.lat])

if __name__ == "__main__":
    pbf_path = sys.argv[1] if len(sys.argv) > 1 else "C:/Users/sibop/Downloads/china.pbf"
    out_path = "data/osm-toilets-gates.json"

    handler = POIHandler()
    print("扫描 PBF（流式，约 2-3 分钟）...")
    handler.apply_file(pbf_path)
    print(f"厕所: {len(handler.toilets)} | 出入口: {len(handler.gates)}")

    import os
    os.makedirs("data", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"toilets": handler.toilets, "gates": handler.gates}, f)
    print(f"→ {out_path}")
