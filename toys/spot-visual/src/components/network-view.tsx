"use client";

// ═══ 景点网络：两级下潜地图（学习 /food 的「固定视图 + 点击下潜」模式） ═══
// 全国级：固定视野（roam: false），每个省份一个聚合气泡 —— 位置 = 省会中心
// （PROVINCE_CENTERS），大小 = 景点数对数缩放；点击气泡 / 省份区块 → 下潜。
// 省级：按需加载该省市级矢量边界（loadCityGeo，内存缓存 + 并发去重），
// 散点 = 省内景点真实坐标，点散点打开全局详情弹窗（详情由页面层渲染）。
// 渲染器统一 canvas：省级散点可达数百，SVG 逐帧重建 DOM 会卡。

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Layers, Loader2, MapPin } from "lucide-react";
import ChinaMap, { type MapRegistration } from "@/components/map/china-map";
import { loadCityGeo, getCachedCityGeo, type CityGeo } from "@/lib/city-geo";
import { PROVINCE_CENTERS } from "@/lib/china-geo";
import { useAppStore } from "@/lib/store";
import { quoteTicket } from "@/lib/spot-data";
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

/** 5A 散点金色，与全国级气泡的 5A 描边同色 */
const FIVE_A_COLOR = "#F59E0B";

// 省名匹配：address 一律以省级全称开头（如「湖南省张家界市…」「北京市东城区…」），
// 34 个简称互不为前缀，startsWith 逐个命中即可；直辖市（北京市…）归入自身。
const PROVINCE_NAMES = Object.keys(PROVINCE_CENTERS);

function provinceOf(address: string): string | null {
  for (const prov of PROVINCE_NAMES) {
    if (address.startsWith(prov)) return prov;
  }
  return null;
}

export default function NetworkView() {
  const {
    spots,
    setSelectedSpot,
    cityFilter,
    levelFilter,
    searchQuery,
    setCityFilter,
    setLevelFilter,
    setSearchQuery,
    favorites,
    trip,
  } = useAppStore();

  // 数据范围：默认精选（top400 本地图 + 手工 30 + 预约标注），全部 = 统一库全量
  const [scope, setScope] = useState<"curated" | "all">("curated");

  // 联动主页面筛选（省份/等级/搜索持久化在 store）：切过来不再上下文断裂
  const coupled = Boolean(cityFilter || levelFilter || searchQuery.trim());
  const visibleSpots = useMemo(() => {
    let list =
      scope === "all"
        ? spots
        : spots.filter(
            (s) =>
              /^\/spots\/pois\//.test(s.image || "") || // top400 本地图
              /^\d+$/.test(s.id) || // 手工 30 条
              !!s.reservation, // 需预约的重点景区
          );
    if (cityFilter) list = list.filter((s) => s.address.includes(cityFilter));
    if (levelFilter) list = list.filter((s) => s.level === levelFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q)
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q),
      );
    return list;
  }, [spots, scope, cityFilter, levelFilter, searchQuery]);

  // ═══ 两级下潜：null = 全国视图，否则为省级简称（与 PROVINCE_ADCODE 同键） ═══
  const [drill, setDrill] = useState<string | null>(null);
  const [cityGeo, setCityGeo] = useState<CityGeo | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityErr, setCityErr] = useState<string | null>(null);

  // 下潜后按需加载市级边界；缓存命中先渲染避免闪 loading（同 /food 下钻）
  useEffect(() => {
    if (!drill) {
      setCityGeo(null);
      setCityErr(null);
      setCityLoading(false);
      return;
    }
    let alive = true;
    setCityGeo(getCachedCityGeo(drill) ?? null);
    setCityErr(null);
    setCityLoading(true);
    loadCityGeo(drill)
      .then((g) => {
        if (alive) setCityGeo(g);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setCityGeo(null);
        setCityErr(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (alive) setCityLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [drill]);

  // ═══ 全国级聚合：省名 → 数量（位置用省会中心，无需散点坐标） ═══
  const provinceAgg = useMemo(() => {
    const counts = new Map<string, number>();
    const fiveA = new Set<string>();
    for (const s of visibleSpots) {
      const prov = provinceOf(s.address);
      if (!prov) continue;
      counts.set(prov, (counts.get(prov) ?? 0) + 1);
      if (s.level === "5A") fiveA.add(prov);
    }
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .map(([prov, count]) => ({
        prov,
        count,
        has5A: fiveA.has(prov),
        center: PROVINCE_CENTERS[prov],
        // 对数缩放：最少的省 14，最多的省 46
        size:
          max > 1
            ? Math.min(
                46,
                Math.max(14, 14 + 32 * (Math.log(count) / Math.log(max))),
              )
            : 14,
      }))
      .sort((a, b) => b.count - a.count);
  }, [visibleSpots]);
  const matchedTotal = useMemo(
    () => provinceAgg.reduce((sum, g) => sum + g.count, 0),
    [provinceAgg],
  );

  // ═══ 省级散点：该省内带真实坐标的景点 ═══
  const provinceSpots = useMemo(() => {
    if (!drill) return [];
    return visibleSpots.filter((s) => {
      if (provinceOf(s.address) !== drill) return false;
      const loc = s.location as { lng?: number; lat?: number } | undefined;
      return typeof loc?.lng === "number" && typeof loc?.lat === "number";
    });
  }, [visibleSpots, drill]);

  // ── 全国 option：固定视野 + 省份聚合气泡 ─────────────────
  const nationalOption = useMemo<EChartsOption>(() => {
    const points = provinceAgg.map((g) => ({
      name: g.prov,
      value: g.center,
      prov: g.prov,
      count: g.count,
      size: g.size,
      itemStyle: {
        color: "#059669",
        borderColor: g.has5A ? FIVE_A_COLOR : "#ffffff",
        borderWidth: g.has5A ? 2 : 1,
        opacity: 0.9,
      },
    }));
    return {
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const d = p?.data;
          if (!d) return String(p.name ?? "");
          return `<b>${d.name}</b><br/>${d.count} 个景点 · 点击下潜`;
        },
      },
      geo: {
        map: "china-compliant",
        roam: false, // 固定视图：点击下潜代替缩放漫游
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
          symbolSize: (val: unknown, params: any) => params.data?.size ?? 14,
          data: points,
          label: {
            show: true,
            position: "bottom",
            distance: 3,
            fontSize: 10,
            color: "#334155",
            textBorderColor: "#ffffff",
            textBorderWidth: 2,
            formatter: (p: any) =>
              p?.data
                ? `${p.data.name}\n${p.data.count} 个景点`
                : String(p.name ?? ""),
          },
          emphasis: { scale: 1.15 },
          zlevel: 2,
        },
      ],
    } as EChartsOption;
  }, [provinceAgg]);

  // ── 省级 option：市级边界 + 真实坐标散点（收藏/行程状态上地图） ─────────────────
  const provinceOption = useMemo<EChartsOption>(() => {
    if (!cityGeo) return nationalOption;
    const favSet = new Set(favorites);
    const tripSet = new Set(trip);
    const points = provinceSpots.map((s) => {
      const loc = s.location as { lng: number; lat: number };
      const is5A = s.level === "5A";
      const isFav = favSet.has(s.id);
      const inTrip = tripSet.has(s.id);
      return {
        name: s.name,
        value: [loc.lng, loc.lat],
        id: s.id,
        size: is5A ? 14 : s.level === "4A" ? 12 : 9,
        itemStyle: {
          color: is5A ? FIVE_A_COLOR : (CAT_COLORS[s.category] ?? "#6B7280"),
          borderColor: isFav ? "#EF4444" : inTrip ? "#F59E0B" : "#ffffff",
          borderWidth: isFav || inTrip ? 3 : 1,
          opacity: 0.9,
        },
      };
    });
    return {
      tooltip: {
        trigger: "item",
        formatter: (p: any) => {
          const d = p?.data;
          if (!d) return String(p.name ?? "");
          const spot = provinceSpots.find((s) => s.id === d.id);
          const quote = spot ? quoteTicket(spot) : null;
          const ticket =
            quote && quote.price != null
              ? `门票 ¥${quote.price}`
              : quote?.label;
          const status = favSet.has(d.id)
            ? "❤️ 已收藏"
            : tripSet.has(d.id)
              ? "🧭 已在行程"
              : null;
          const parts = [
            spot?.level,
            spot?.category,
            spot?.rating != null ? `评分 ${spot.rating}` : null,
            ticket,
          ].filter(Boolean);
          return `<b>${d.name}</b>${parts.length ? `<br/>${parts.join(" · ")}` : ""}${status ? `<br/>${status}` : ""}<br/><span style="color:#059669">点击查看详情</span>`;
        },
      },
      geo: {
        map: cityGeo.mapName,
        roam: false,
        // 用剔除远海岛礁后的包围盒定初始视野（如海南三沙不压扁本岛）
        boundingCoords: cityGeo.viewBounds,
        layoutCenter: ["50%", "50%"],
        layoutSize: "96%",
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
          symbolSize: (val: unknown, params: any) => params.data?.size ?? 9,
          data: points,
          emphasis: { scale: 1.3 },
          zlevel: 2,
          progressive: 600,
        },
      ],
    } as EChartsOption;
  }, [cityGeo, provinceSpots, nationalOption, favorites, trip]);

  // 市级地图按需注册（引用需稳定，避免 ChinaMap 反复 setOption）
  const maps = useMemo<MapRegistration[]>(
    () => (cityGeo ? [{ name: cityGeo.mapName, geo: cityGeo.geo }] : []),
    [cityGeo],
  );

  const option = drill && cityGeo ? provinceOption : nationalOption;

  // ── 点击：全国级下潜 / 省级进详情 ────────────────────────
  const handleSelect = (p: any) => {
    if (!drill) {
      // 聚合气泡（data.prov）或省份区块（feature name 已归一为简称，与 PROVINCE_CENTERS 同键）
      const prov =
        p?.data?.prov ?? (p?.componentType === "geo" ? p?.name : null);
      if (prov && PROVINCE_CENTERS[prov]) setDrill(prov);
      return;
    }
    const id = p?.data?.id;
    if (!id) return; // 省级点市级区块不响应，只认散点
    const spot = provinceSpots.find((s) => s.id === id);
    if (spot) setSelectedSpot(spot); // 详情弹窗由页面全局渲染
  };

  return (
    <div className="relative w-full h-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700/80 dark:border-gray-700">
      {/* 返回 + 数据范围切换 + 计数 */}
      <div className="absolute top-4 left-4 z-10 bg-white dark:bg-gray-900/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-100 dark:border-gray-800">
        {drill && (
          <button
            onClick={() => setDrill(null)}
            className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-colors"
          >
            <ChevronLeft className="w-3 h-3" />
            返回全国
          </button>
        )}
        <div className="flex items-center gap-1">
          {(["curated", "all"] as const).map((sc) => (
            <button
              key={sc}
              onClick={() => setScope(sc)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                scope === sc
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {sc === "curated" ? "精选" : "全部"}
            </button>
          ))}
        </div>
        <p
          className="text-[11px] text-gray-500 dark:text-gray-400 mt-1"
          title="精选 = top400 本地图 + 手工 30 + 预约标注；全部 = 统一库全量（含 A 级名录）"
        >
          {drill
            ? `${drill} · ${provinceSpots.length} 个景点`
            : `${provinceAgg.length} 省 · ${matchedTotal} 个景点`}
        </p>
        {coupled && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              联动筛选
            </span>
            {cityFilter && (
              <button
                onClick={() => setCityFilter(null)}
                title="点击清除"
                className="px-1.5 py-0.5 rounded-md bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 text-[10px] text-sky-700 dark:text-sky-400"
              >
                {cityFilter} ×
              </button>
            )}
            {levelFilter && (
              <button
                onClick={() => setLevelFilter(null)}
                title="点击清除"
                className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-[10px] text-amber-700 dark:text-amber-400"
              >
                {levelFilter} ×
              </button>
            )}
            {searchQuery.trim() && (
              <button
                onClick={() => setSearchQuery("")}
                title="点击清除"
                className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px] text-gray-600 dark:text-gray-300"
              >
                「{searchQuery.trim()}」 ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* 图例：全国级只有聚合气泡；省级按分类着色 */}
      <div className="absolute bottom-4 left-4 z-10 bg-white dark:bg-gray-900/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-100 dark:border-gray-800">
        {drill ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-[320px]">
            {Object.entries(CAT_COLORS).map(([cat, color]) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {cat}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: FIVE_A_COLOR }}
              />
              5A 景区
            </span>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600" />
            省份聚合气泡 · 越大景点越多 · 点击下潜
          </span>
        )}
      </div>

      {visibleSpots.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
          <MapPin className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            当前范围没有带坐标的景点
          </p>
        </div>
      ) : (
        <ChinaMap
          option={option}
          onSelect={handleSelect}
          maps={maps}
          height="100%"
          className="w-full"
          renderer="canvas"
        />
      )}

      {/* 市级边界加载 / 失败遮罩 */}
      {drill && (cityLoading || cityErr) && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white dark:bg-gray-900/80 dark:bg-gray-900/80 backdrop-blur-[2px] text-center px-6">
          {cityLoading ? (
            <>
              <Loader2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 animate-spin" />
              <p className="text-sm text-gray-600 dark:text-gray-300">
                正在加载 {drill} 市级边界…
              </p>
            </>
          ) : (
            <>
              <Layers className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {drill} 暂无市级矢量边界
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[280px] leading-relaxed">
                {cityErr}
              </p>
              <button
                onClick={() => setDrill(null)}
                className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 underline"
              >
                返回全国视图
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
