"use client";

import { useEffect, useRef } from "react";
import echarts from "@/lib/echarts-core";
import type { EChartsOption } from "echarts";
import { CHINA_GEO, CHINA_MAP_NAME } from "@/lib/china-geo";

/** 已注册的 ECharts 地图名集合（模块级去重，避免重复 registerMap） */
const registeredMaps = new Set<string>();

function registerChina() {
  if (registeredMaps.has(CHINA_MAP_NAME)) return;
  echarts.registerMap(
    CHINA_MAP_NAME,
    CHINA_GEO as unknown as Parameters<typeof echarts.registerMap>[1],
  );
  registeredMaps.add(CHINA_MAP_NAME);
}

export interface MapRegistration {
  name: string;
  geo: unknown;
}

/** 从 option 里取出当前使用的 map 名（map series 或 geo 组件） */
function mapNameOf(option: EChartsOption): string | undefined {
  const series = Array.isArray(option.series)
    ? (option.series as Record<string, unknown>[])
    : [];
  const fromSeries = series.find((s) => typeof s?.map === "string")?.map as
    string | undefined;
  if (fromSeries) return fromSeries;
  const geo = option.geo as { map?: string } | undefined;
  return geo?.map;
}

export interface ChinaMapProps {
  option: EChartsOption;
  /** 点击地图元素（省份区块 / 市级区块 / 散点）时回调，参数为 ECharts 事件对象 */
  onSelect?: (params: any) => void;
  /** 额外需要注册的地图（如省级下钻的市级边界）；需保持引用稳定 */
  maps?: MapRegistration[];
  className?: string;
  height?: string | number;
  /** 缩放下限：1 = 初始全景，不传则不限制 */
  minZoom?: number;
  /** 缩放上限：不传则不限制 */
  maxZoom?: number;
  /** 递增即复位视野（回到初始全景，丢弃用户缩放/平移） */
  resetSignal?: number;
}

/**
 * 共享的中国矢量地图（ECharts）。
 * - 首次挂载时注册 china-compliant 地图（含台湾/港澳/南海诸岛要素）
 * - 支持通过 maps 传入按需加载的下级地图（省级 → 市级）
 * - 随 option 变化更新；容器尺寸变化自动 resize
 */
export default function ChinaMap({
  option,
  onSelect,
  maps,
  className,
  height = "100%",
  minZoom,
  maxZoom,
  resetSignal,
}: ChinaMapProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cbRef = useRef(onSelect);
  cbRef.current = onSelect;
  const zoomRef = useRef({ min: minZoom, max: maxZoom });
  zoomRef.current = { min: minZoom, max: maxZoom };
  const optionRef = useRef(option);
  optionRef.current = option;
  const resetSeen = useRef(resetSignal);

  // 复位视野：用 notMerge 重放原始 option，不再回灌已漫游的 zoom/center
  useEffect(() => {
    if (resetSignal === undefined || resetSignal === resetSeen.current) return;
    resetSeen.current = resetSignal;
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(
      { animation: false, ...(optionRef.current as object) } as EChartsOption,
      { notMerge: true },
    );
  }, [resetSignal]);

  useEffect(() => {
    if (!elRef.current) return;
    registerChina();
    const chart = echarts.init(elRef.current, undefined, {
      renderer: "canvas",
    });
    chartRef.current = chart;
    chart.setOption(option);
    const handler = (p: any) => cbRef.current?.(p);
    chart.on("click", handler);
    // 缩放边界：ECharts 的 roam 没有内置 min/max，越界后把钳制值写回。
    // 只在越界时写，避免每帧 setOption 打断惯性动画。
    const clampZoom = () => {
      const { min, max } = zoomRef.current;
      if (min == null && max == null) return;
      const lo = min ?? 0;
      const hi = max ?? 64;
      const opt = chart.getOption() as {
        geo?: Array<{ zoom?: number }>;
        series?: Array<{ map?: string; zoom?: number }>;
      };
      const geoZoom = Array.isArray(opt.geo) ? opt.geo[0]?.zoom : undefined;
      const seriesZoom = opt.series?.find(
        (s) => typeof s?.map === "string",
      )?.zoom;
      const cur = typeof geoZoom === "number" ? geoZoom : seriesZoom;
      if (typeof cur !== "number" || (cur >= lo && cur <= hi)) return;
      const fixed = Math.min(hi, Math.max(lo, cur));
      if (typeof geoZoom === "number")
        chart.setOption({ geo: { zoom: fixed } });
      else chart.setOption({ series: [{ zoom: fixed }] });
    };
    chart.on("georoam", clampZoom);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      chart.off("click", handler);
      chart.off("georoam", clampZoom);
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (maps?.length) {
      for (const m of maps) {
        if (!m?.name || !m.geo || registeredMaps.has(m.name)) continue;
        echarts.registerMap(
          m.name,
          m.geo as Parameters<typeof echarts.registerMap>[1],
        );
        registeredMaps.add(m.name);
      }
    }
    const chart = chartRef.current;
    if (!chart) return;

    // 同一张地图上的数据更新（如选中某个市）会走 notMerge 全量重建，
    // 那样会把用户已经缩放/拖拽的视野重置回初始 boundingCoords。
    // 这里先取出当前 roam 状态，再回灌到新 option，保证「选择后视野不动」。
    const nextMap = mapNameOf(option);
    const prev = chart.getOption() as
      | {
          series?: Array<{ map?: string; zoom?: number; center?: number[] }>;
          geo?: Array<{ map?: string; zoom?: number; center?: number[] }>;
        }
      | undefined;
    const prevSeries = prev?.series?.[0];
    const prevGeo = prev?.geo?.[0];
    let next = option;
    // 视野保持有两种形态：map series（food 页）与 geo 组件（gaokao 页
    // scatter-on-geo）。notMerge 全量重建会重置视野，把用户当前
    // zoom/center 回灌进新 option，保证「选择/筛选后视野不动」。
    if (
      nextMap &&
      prevSeries?.map === nextMap &&
      (prevSeries.zoom != null || prevSeries.center != null)
    ) {
      const series = (
        Array.isArray(option.series) ? option.series : []
      ) as Record<string, unknown>[];
      next = {
        ...option,
        series: series.map((s, i) =>
          i === 0
            ? { ...s, zoom: prevSeries.zoom, center: prevSeries.center }
            : s,
        ),
      } as EChartsOption;
    } else if (
      nextMap &&
      prevGeo?.map === nextMap &&
      option.geo &&
      !Array.isArray(option.geo)
    ) {
      // 只回灌有效值：把 null/NaN 的 center 写回 option 会污染 geo
      // 坐标换算，导致 scatter-on-geo 的全部点位静默消失（曾在线上翻车）。
      const geo = option.geo as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      const roamed =
        (typeof prevGeo.zoom === "number" &&
          Number.isFinite(prevGeo.zoom) &&
          prevGeo.zoom !== 1) ||
        (Array.isArray(prevGeo.center) &&
          prevGeo.center.every(
            (v) => typeof v === "number" && Number.isFinite(v),
          ));
      // 只在用户真实漫游过（zoom≠1 或有有效 center）时回灌；
      // 默认态注入 zoom:1 同样会扰动 scatter-on-geo 投影。
      if (
        roamed &&
        typeof prevGeo.zoom === "number" &&
        Number.isFinite(prevGeo.zoom) &&
        geo.zoom == null
      )
        patch.zoom = prevGeo.zoom;
      if (
        roamed &&
        Array.isArray(prevGeo.center) &&
        prevGeo.center.every(
          (v) => typeof v === "number" && Number.isFinite(v),
        ) &&
        geo.center == null
      )
        patch.center = prevGeo.center;
      if (Object.keys(patch).length)
        next = { ...option, geo: { ...geo, ...patch } } as EChartsOption;
    }
    // 入场动画在部分 webview 中 rAF 不推进，符号会永久停在 scale=0
    // （表现为有地图无点位），统一关闭。
    const noAnim = { animation: false, ...(next as object) } as EChartsOption;
    chart.setOption(noAnim, { notMerge: true });
  }, [option, maps]);

  return (
    <div ref={elRef} className={className} style={{ width: "100%", height }} />
  );
}
