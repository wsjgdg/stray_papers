'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { PROVINCE_FOODS, CUISINE_COLORS } from '@/lib/food-data';

export interface TasteScatterProps {
  /** 当前选中的省份简称 */
  active?: string | null;
  /** 点击某个点 */
  onPick?: (provName: string) => void;
  height?: number;
}

/**
 * 口味图谱：把省域代表菜铺在「辣 × 甜」二维平面上。
 *
 * 为什么只放 34 个省级点：市级名食的口味取所属省域，坐标会完全重合，
 * 铺上去只是叠点，不增加信息。用横辣纵甜、点大小表示鲜度，能一眼看出
 * 「川渝贵在右下、江浙沪在左上」这种结构——这正是雷达图看不出来的东西。
 */
export function TasteScatter({ active, onPick, height = 620 }: TasteScatterProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const cb = useRef(onPick);
  cb.current = onPick;

  const option = useMemo<EChartsOption>(() => {
    const byCuisine = new Map<string, typeof PROVINCE_FOODS>();
    for (const p of PROVINCE_FOODS) {
      const k = p.cuisine;
      if (!byCuisine.has(k)) byCuisine.set(k, []);
      byCuisine.get(k)!.push(p);
    }

    const series = [...byCuisine.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([cuisine, list]) => ({
        name: cuisine,
        type: 'scatter' as const,
        emphasis: { focus: 'series' as const, scale: 1.4 },
        data: list.map((p) => ({
          name: p.name,
          value: [p.taste.辣, p.taste.甜, p.taste.鲜, p.dish, p.fullName],
          symbolSize: 10 + p.taste.鲜 / 8,
          itemStyle: {
            color: CUISINE_COLORS[cuisine] ?? '#64748B',
            opacity: active && active !== p.name ? 0.25 : 0.85,
            borderColor: active === p.name ? '#0F172A' : 'rgba(255,255,255,.85)',
            borderWidth: active === p.name ? 2.5 : 1.2,
          },
        })),
      }));

    return {
      animationDuration: 400,
      grid: { left: 56, right: 24, top: 44, bottom: 56 },
      tooltip: {
        formatter: (p: any) => {
          const v = p.value;
          return `<b>${v[1] === undefined ? '' : v[0] === undefined ? '' : p.name}</b> · ${v[4]}<br/>代表菜：${v[3]}<br/>辣 ${v[0]} ／ 甜 ${v[1]} ／ 鲜 ${v[2]}`;
        },
      },
      legend: {
        type: 'scroll',
        top: 6,
        left: 8,
        itemWidth: 9,
        itemHeight: 9,
        textStyle: { fontSize: 10, color: '#64748B' },
        pageTextStyle: { fontSize: 10, color: '#94A3B8' },
      },
      xAxis: {
        name: '辣度 →',
        nameTextStyle: { fontSize: 11, color: '#94A3B8' },
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: '#EEF2F7' } },
        axisLabel: { fontSize: 10, color: '#94A3B8' },
      },
      yAxis: {
        name: '甜度 →',
        nameTextStyle: { fontSize: 11, color: '#94A3B8' },
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: '#EEF2F7' } },
        axisLabel: { fontSize: 10, color: '#94A3B8' },
      },
      series,
    } as EChartsOption;
  }, [active]);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = c;
    c.on('click', (p: any) => {
      if (p?.name) cb.current?.(p.name as string);
    });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={el}
      className="w-full [&_canvas]:!h-full"
      style={{ width: '100%', height }}
    />
  );
}
