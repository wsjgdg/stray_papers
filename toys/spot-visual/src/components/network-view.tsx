"use client";

// ═══ 景点地图：ECharts 中国地图 + 聚合气泡（学习 gaokao 的网格聚合模式） ═══
// 相近景点按网格聚合为一个大点（大小 = 数量），缩放越大网格越细自动裂开；
// 点聚合气泡 → 放大一级展开；单个点 → 进详情。
// 渲染器用 canvas：数千散点 + 漫游下 SVG 逐帧重绘 DOM 会卡。

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import ChinaMap from "@/components/map/china-map";
import { useAppStore } from "@/lib/store";
import type { EChartsOption } from "echarts";

// 聚合网格边长（经度度数），索引 = 缩放档位（1×→2×→4×→8×→16×→32×）
const MAP_CELLS = [6.4, 1.6, 0.4, 0.1, 0.025, 0.006];

const CAT_COLORS: Record<string, string> = {
  自然风光: "#10B981",
  历史人文: "#D97706",
  宗教寺庙: "#8B5CF6",
  古镇村落: "#0EA5E9",
  主题乐园: "#EC4899",
  城市地标: "#3B82F6",
  海滨度假: "#06B6D4",
  美食小吃: "#F97316",
  轻运动: "#84CC16",
};

export default function NetworkView() {
  const { spots, setSelectedSpot } = useAppStore();

  // 数据范围：默认精选（top400 本地图 + 手工 30 + 预约标注），全部 = 3000
  const [scope, setScope] = useState<"curated" | "all">("curated");
  const [mapZoom, setMapZoom] = useState(1);
  const visibleSpots = useMemo(
    () =>
      scope === "all"
        ? spots
        : spots.filter(
            (s) =>
              /^\/spots\/pois\//.test(s.image || "") || // top400 本地图
              /^\d+$/.test(s.id) || // 手工 30 条
              !!s.reservation, // 需预约的重点景区
          ),
    [spots, scope],
  );

  // ═══ 网格聚合：缩放越大网格越细，气泡自动裂开（学习 gaokao MAP_CELLS） ═══
  const cell =
    MAP_CELLS[Math.min(Math.round(Math.log2(Math.max(1, mapZoom))), MAP_CELLS.length - 1)];
  const buckets = useMemo(() => {
    type Acc = {
      key: string;
      lng: number;
      lat: number;
      count: number;
      catCount: Record<string, number>;
      has5A: boolean;
      ids: string[];
    };
    const acc = new Map<string, Acc>();
    for (const s of visibleSpots) {
      const loc = s.location as { lng?: number; lat?: number } | undefined;
      if (!loc || typeof loc.lng !== "number" || typeof loc.lat !== "number")
        continue;
      const key = `${Math.floor(loc.lng / cell)}|${Math.floor(loc.lat / cell)}`;
      let e = acc.get(key);
      if (!e) {
        e = { key, lng: 0, lat: 0, count: 0, catCount: {}, has5A: false, ids: [] };
        acc.set(key, e);
      }
      e.lng += loc.lng;
      e.lat += loc.lat;
      e.count++;
      if (s.level === "5A") e.has5A = true;
      e.catCount[s.category] = (e.catCount[s.category] ?? 0) + 1;
      e.ids.push(s.id);
    }
    return [...acc.values()].map((e) => {
      const cat =
        (Object.entries(e.catCount) as [string, number][]).sort(
          (x, y) => y[1] - x[1],
        )[0]?.[0] ?? "城市地标";
      return {
        key: e.key,
        center: [e.lng / e.count, e.lat / e.count] as [number, number],
        count: e.count,
        cat,
        has5A: e.has5A,
        ids: e.ids,
      };
    });
  }, [visibleSpots, cell]);

  const option = useMemo<EChartsOption>(() => {
    const points = buckets.map((b) => {
      const single = b.count === 1;
      const spot = single ? visibleSpots.find((s) => s.id === b.ids[0]) : null;
      const size = single
        ? spot?.level === "5A"
          ? 16
          : 11
        : Math.min(46, 12 + 4.5 * Math.log2(b.count));
      const color = single
        ? spot?.level === "5A"
          ? "#F59E0B"
          : CAT_COLORS[spot?.category ?? ""] || "#6B7280"
        : "#059669";
      return {
        name: single ? spot?.name : `${b.count} 个景点`,
        value: b.center,
        bucketKey: b.key,
        count: b.count,
        id: single ? b.ids[0] : null,
        cat: single ? spot?.category : b.cat,
        has5A: b.has5A,
        itemStyle: {
          color,
          borderColor: b.has5A && !single ? "#F59E0B" : "#fff",
          borderWidth: single ? 1 : 2,
          opacity: single ? 0.85 : 0.9,
        },
      };
    });

    return {
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const d = p.data;
          if (!d) return String(p.name ?? "");
          return d.count > 1
            ? `<b>${d.count} 个景点</b>（含 5A：${d.has5A ? "是" : "否"}）<br/>点击放大展开`
            : `<b>${d.name}</b>`;
        },
      },
      geo: {
        map: "china-compliant",
        roam: true,
        layoutCenter: ["50%", "52%"],
        layoutSize: "130%",
        zoom: mapZoom,
        label: { show: false },
        itemStyle: {
          areaColor: "#E9EEF4",
          borderColor: "#AFBCCD",
          borderWidth: 0.7,
        },
        emphasis: {
          itemStyle: { areaColor: "#DEE6F0" },
          label: { show: false },
        },
      },
      series: [
        {
          type: "scatter",
          coordinateSystem: "geo",
          symbolSize: (val: unknown, params: any) => params.data?.size ?? 11,
          data: points,
          emphasis: { scale: 1.2 },
          zlevel: 2,
          progressive: 400,
        },
      ],
    } as EChartsOption;
  }, [buckets, visibleSpots, mapZoom]);

  const handleSelect = (p: any) => {
    const d = p?.data;
    if (!d) return;
    if (d.count > 1) {
      // 聚合气泡 → 放大一级（网格变细自动裂开）
      setMapZoom((z) => Math.min(z * 2, 32));
      return;
    }
    const spot = visibleSpots.find((s) => s.id === d.id);
    if (spot) setSelectedSpot(spot);
  };

  const handleZoom = (z: number) => {
    setMapZoom((prev) => (Math.abs(prev - z) > 0.01 ? z : prev));
  };

  return (
    <div className="relative w-full h-full bg-white rounded-xl overflow-hidden border border-gray-200/80">
      {/* 数据范围切换 + 计数 */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-100">
        <div className="flex items-center gap-1">
          {(["curated", "all"] as const).map((sc) => (
            <button
              key={sc}
              onClick={() => setScope(sc)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                scope === sc
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {sc === "curated" ? "精选" : "全部"}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          {scope === "curated"
            ? `精选 ${visibleSpots.length}`
            : `全部 ${spots.length}`}{" "}
          个景点 · 聚合为 {buckets.length} 个点位
        </p>
      </div>

      {/* 图例 */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-[320px]">
          {Object.entries(CAT_COLORS).map(([cat, color]) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 text-[11px] text-gray-600"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {cat}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600" />
            聚合气泡（点击放大）
          </span>
        </div>
      </div>

      {visibleSpots.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
          <MapPin className="w-12 h-12 text-gray-300" />
          <p className="text-gray-500 text-sm">当前范围没有带坐标的景点</p>
        </div>
      ) : (
        <ChinaMap
          option={option}
          onSelect={handleSelect}
          height="100%"
          className="w-full"
          renderer="canvas"
          onZoomChange={handleZoom}
        />
      )}
    </div>
  );
}
