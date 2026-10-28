"use client";

// ═══ 景点地图：ECharts 中国地图 + 景点散点（学习 gaokao 的地图构建方式） ═══
// 取代旧的 SVG 关系图：点位落在真实地理上下文里，缩放/漫游原生支持。
// 数据范围：精选（top400 本地图 + 手工 + 预约 ≈ 430）/ 全部（3000）两级切换。

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import ChinaMap from "@/components/map/china-map";
import { useAppStore } from "@/lib/store";
import type { EChartsOption } from "echarts";

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

  const option = useMemo<EChartsOption>(() => {
    const points = visibleSpots
      .map((s) => {
        const loc = s.location as { lng?: number; lat?: number } | undefined;
        if (!loc || typeof loc.lng !== "number" || typeof loc.lat !== "number")
          return null;
        return {
          name: s.name,
          value: [loc.lng, loc.lat],
          id: s.id,
          level: s.level,
          rating: s.rating,
          cat: s.category,
          itemStyle: {
            color:
              s.level === "5A"
                ? "#F59E0B"
                : CAT_COLORS[s.category] || "#6B7280",
            borderColor: "#fff",
            borderWidth: 1,
          },
        };
      })
      .filter(Boolean) as any[];

    return {
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const d = p.data;
          if (!d) return String(p.name ?? "");
          const lv = d.level ? `<b>${d.level}</b> · ` : "";
          const rate = d.rating ? ` · ★${d.rating}` : "";
          return `<b>${d.name}</b>${lv}${rate}<br/>${d.cat ?? ""}`;
        },
      },
      geo: {
        map: "china-compliant",
        roam: true,
        layoutCenter: ["50%", "52%"],
        layoutSize: "130%",
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
          symbolSize: (val: unknown, params: any) =>
            params.data?.level === "5A"
              ? 16
              : params.data?.level === "4A"
                ? 13
                : 10,
          data: points,
          emphasis: { scale: 1.4 },
          zlevel: 2,
          progressive: 500,
        },
      ],
    };
  }, [visibleSpots]);

  const handleSelect = (p: any) => {
    const id = p?.data?.id;
    if (!id) return;
    const spot = visibleSpots.find((s) => s.id === id);
    if (spot) setSelectedSpot(spot);
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
          个景点
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
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            5A 景区
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
        />
      )}
    </div>
  );
}
