'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Check, UtensilsCrossed, MapPin, Flame } from 'lucide-react';
import type { EChartsOption } from 'echarts';
import {
  PROVINCE_FOODS, CUISINE_COLORS, TASTE_KEYS, getProvince,
} from '@/lib/food-data';
import { TasteRadar } from '@/components/food/taste-radar';
import ChinaMap from '@/components/map/china-map';
import { cn } from '@/lib/utils';

const REGION_COLORS: Record<string, string> = {
  华北: '#F59E0B', 东北: '#10B981', 华东: '#3B82F6', 华中: '#8B5CF6',
  华南: '#EC4899', 西南: '#EF4444', 西北: '#D97706',
};
const REGION_ORDER = ['华北', '东北', '华东', '华中', '华南', '西南', '西北'];

export default function FoodPage() {
  const [code, setCode] = useState('SC');
  const [copied, setCopied] = useState(false);
  const selected = getProvince(code) ?? PROVINCE_FOODS[0];

  const cuisineColor = CUISINE_COLORS[selected.cuisine] ?? '#64748B';

  const nameToCode = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of PROVINCE_FOODS) m[p.name] = p.code;
    return m;
  }, []);

  const sortedTaste = useMemo(
    () => TASTE_KEYS.map((k) => ({ k, v: selected.taste[k] })).sort((a, b) => b.v - a.v),
    [selected],
  );

  const shareText = useMemo(() => {
    const top = sortedTaste.slice(0, 2).map((t) => t.k).join('·');
    return `【中国味道 · ${selected.fullName}】\n代表菜：${selected.dish}（${selected.cuisine}）\n口味标签：${top}\n风味印象：${selected.desc}\n—— 用 WorkBuddy 打造的《华夏探索》探索中国味道 #WorkBuddy #1024程序员节`;
  }, [selected, sortedTaste]);

  const option = useMemo<EChartsOption>(() => {
    const data = PROVINCE_FOODS.map((p) => ({
      name: p.name,
      value: 1,
      itemStyle: {
        areaColor: p.code === code ? '#0F766E' : (REGION_COLORS[p.region] ?? '#94A3B8'),
        opacity: p.code === code ? 1 : 0.78,
        borderColor: '#ffffff',
        borderWidth: 0.6,
      },
    }));
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const prov = PROVINCE_FOODS.find((x) => x.name === p.name);
          return prov
            ? `<b>${prov.fullName}</b><br/>代表菜：${prov.dish}<br/>菜系：${prov.cuisine}`
            : String(p.name ?? '');
        },
      },
      series: [
        {
          type: 'map',
          map: 'china-compliant',
          roam: true,
          layoutCenter: ['50%', '52%'],
          layoutSize: '116%',
          selectedMode: 'single',
          label: { show: false },
          emphasis: {
            label: { show: true, color: '#ffffff', fontWeight: 'bold', fontSize: 11 },
            itemStyle: { areaColor: '#0F766E' },
          },
          itemStyle: { borderColor: '#ffffff', borderWidth: 0.6 },
          data,
        },
      ],
    };
  }, [code]);

  const onSelect = (p: any) => {
    if (p?.seriesType === 'map' && p.name && nameToCode[p.name]) setCode(nameToCode[p.name]);
  };

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="w-5 h-5 text-rose-500" />
          <h1 className="text-xl font-bold text-gray-900">中国味道 · 一省一菜</h1>
        </div>
        <p className="text-sm text-gray-500">在地图上点击任意省份，右侧查看该省代表菜与口味档案。</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
        {/* ══ 味道地图 ══ */}
        <section className="relative bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <ChinaMap
            option={option}
            onSelect={onSelect}
            height={560}
            className="w-full [&_canvas]:!h-full"
          />
          {/* 大区图例 */}
          <div className="absolute left-3 bottom-3 flex flex-wrap gap-1.5 bg-white/85 backdrop-blur-sm rounded-lg border border-gray-200 px-2.5 py-2 max-w-[85%]">
            {REGION_ORDER.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: REGION_COLORS[r] }} />
                {r}
              </span>
            ))}
          </div>
          <div className="absolute right-3 top-3 text-[10px] text-gray-400 bg-white/80 rounded px-1.5 py-0.5">
            可滚轮缩放 / 拖拽
          </div>
        </section>

        {/* ══ 详情面板 ══ */}
        <aside className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm lg:sticky lg:top-[68px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.code}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-lg font-bold text-gray-900">{selected.fullName}</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cuisineColor }}>{selected.cuisine}</span>
              </div>
              <p className="text-xs text-gray-400 mb-4 flex items-center gap-1"><MapPin className="w-3 h-3" />{selected.region}地区 · 代表菜</p>

              <div className="text-center mb-2">
                <div className="text-3xl font-bold" style={{ color: cuisineColor }}>{selected.dish}</div>
              </div>

              <div className="flex justify-center mb-4">
                <TasteRadar taste={selected.taste} color={cuisineColor} size={240} />
              </div>

              {/* taste bars */}
              <div className="space-y-2 mb-4">
                {sortedTaste.map((t) => (
                  <div key={t.k} className="flex items-center gap-2">
                    <span className="w-4 text-xs font-medium text-gray-500">{t.k}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${t.v}%`, backgroundColor: cuisineColor }} />
                    </div>
                    <span className="w-6 text-right text-xs text-gray-400">{t.v}</span>
                  </div>
                ))}
              </div>

              <p className="text-sm text-gray-600 leading-relaxed mb-4">{selected.desc}</p>

              {/* share card */}
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 mb-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1">
                  <Flame className="w-3.5 h-3.5 text-rose-500" /> 分享卡 · #WorkBuddy #1024程序员节
                </div>
                <pre className="text-[11px] text-gray-500 whitespace-pre-wrap font-sans leading-relaxed">{shareText}</pre>
              </div>

              <button
                onClick={copyShare}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors border border-emerald-200"
              >
                {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                {copied ? '已复制分享文案' : '复制分享文案（带话题标签）'}
              </button>
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>

      <p className={cn('text-[11px] text-gray-400 mt-3 leading-relaxed')}>
        数据汇编自公开资料（百度百科《中国菜》名录、今晚报《地名与特色美食》等），口味雷达数值为按菜系特征的估算标签，仅供文化科普与演示。
        地图为 DataV 省级矢量边界（含台湾、南海诸岛），非在线地图服务。
      </p>
    </div>
  );
}
