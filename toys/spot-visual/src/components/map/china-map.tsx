'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { CHINA_GEO, CHINA_MAP_NAME } from '@/lib/china-geo';

let registered = false;
function ensureRegistered() {
  if (registered) return;
  echarts.registerMap(CHINA_MAP_NAME, CHINA_GEO as unknown as Parameters<typeof echarts.registerMap>[1]);
  registered = true;
}

export interface ChinaMapProps {
  option: EChartsOption;
  /** 点击地图元素（省份区块 / 散点）时回调，参数为 ECharts 事件对象 */
  onSelect?: (params: any) => void;
  className?: string;
  height?: string | number;
}

/**
 * 共享的中国矢量地图（ECharts）。
 * - 首次挂载时注册 china-compliant 地图（含台湾/港澳/南海诸岛要素）
 * - 随 option 变化更新；容器尺寸变化自动 resize
 * - 点击事件通过 onSelect 抛出（参数含 seriesType / name / data）
 */
export default function ChinaMap({ option, onSelect, className, height = '100%' }: ChinaMapProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const cbRef = useRef(onSelect);
  cbRef.current = onSelect;

  useEffect(() => {
    if (!elRef.current) return;
    ensureRegistered();
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
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={elRef} className={className} style={{ width: '100%', height }} />;
}
