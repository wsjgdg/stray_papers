'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { CHINA_GEO, CHINA_MAP_NAME } from '@/lib/china-geo';

/** 已注册的 ECharts 地图名集合（模块级去重，避免重复 registerMap） */
const registeredMaps = new Set<string>();

function registerChina() {
  if (registeredMaps.has(CHINA_MAP_NAME)) return;
  echarts.registerMap(CHINA_MAP_NAME, CHINA_GEO as unknown as Parameters<typeof echarts.registerMap>[1]);
  registeredMaps.add(CHINA_MAP_NAME);
}

export interface MapRegistration {
  name: string;
  geo: unknown;
}

/** 从 option 里取出当前使用的 map 名（map series 或 geo 组件） */
function mapNameOf(option: EChartsOption): string | undefined {
  const series = Array.isArray(option.series) ? (option.series as Record<string, unknown>[]) : [];
  const fromSeries = series.find((s) => typeof s?.map === 'string')?.map as string | undefined;
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
}

/**
 * 共享的中国矢量地图（ECharts）。
 * - 首次挂载时注册 china-compliant 地图（含台湾/港澳/南海诸岛要素）
 * - 支持通过 maps 传入按需加载的下级地图（省级 → 市级）
 * - 随 option 变化更新；容器尺寸变化自动 resize
 */
export default function ChinaMap({ option, onSelect, maps, className, height = '100%' }: ChinaMapProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cbRef = useRef(onSelect);
  cbRef.current = onSelect;

  useEffect(() => {
    if (!elRef.current) return;
    registerChina();
    const chart = echarts.init(elRef.current, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.setOption(option);
    const handler = (p: any) => cbRef.current?.(p);
    chart.on('click', handler);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      chart.off('click', handler);
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (maps?.length) {
      for (const m of maps) {
        if (!m?.name || !m.geo || registeredMaps.has(m.name)) continue;
        echarts.registerMap(m.name, m.geo as Parameters<typeof echarts.registerMap>[1]);
        registeredMaps.add(m.name);
      }
    }
    const chart = chartRef.current;
    if (!chart) return;

    // 同一张地图上的数据更新（如选中某个市）会走 notMerge 全量重建，
    // 那样会把用户已经缩放/拖拽的视野重置回初始 boundingCoords。
    // 这里先取出当前 roam 状态，再回灌到新 option，保证「选择后视野不动」。
    const nextMap = mapNameOf(option);
    const prev = chart.getOption() as { series?: Array<{ map?: string; zoom?: number; center?: number[] }> } | undefined;
    const prevSeries = prev?.series?.[0];
    let next = option;
    if (nextMap && prevSeries?.map === nextMap && (prevSeries.zoom != null || prevSeries.center != null)) {
      const series = (Array.isArray(option.series) ? option.series : []) as Record<string, unknown>[];
      next = {
        ...option,
        series: series.map((s, i) =>
          i === 0 ? { ...s, zoom: prevSeries.zoom, center: prevSeries.center } : s,
        ),
      } as EChartsOption;
    }
    chart.setOption(next, { notMerge: true });
  }, [option, maps]);

  return <div ref={elRef} className={className} style={{ width: '100%', height }} />;
}
