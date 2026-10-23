'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Check, UtensilsCrossed, MapPin, Flame } from 'lucide-react';
import {
  PROVINCE_FOODS, CUISINE_COLORS, TASTE_KEYS, getProvince,
} from '@/lib/food-data';
import { TasteRadar } from '@/components/food/taste-radar';
import { cn } from '@/lib/utils';

export default function FoodPage() {
  const [code, setCode] = useState('SC');
  const [copied, setCopied] = useState(false);
  const selected = getProvince(code)!;

  const cuisineColor = CUISINE_COLORS[selected.cuisine] ?? '#64748B';

  const sortedTaste = useMemo(
    () => TASTE_KEYS.map((k) => ({ k, v: selected.taste[k] })).sort((a, b) => b.v - a.v),
    [selected],
  );

  const shareText = useMemo(() => {
    const top = sortedTaste.slice(0, 2).map((t) => t.k).join('·');
    return `【中国味道 · ${selected.fullName}】\n代表菜：${selected.dish}（${selected.cuisine}）\n口味标签：${top}\n风味印象：${selected.desc}\n—— 用 WorkBuddy 打造的《华夏探索》探索中国味道 #WorkBuddy #1024程序员节`;
  }, [selected, sortedTaste]);

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <UtensilsCrossed className="w-5 h-5 text-rose-500" />
          <h1 className="text-xl font-bold text-gray-900">中国味道 · 一省一菜</h1>
        </div>
        <p className="text-sm text-gray-500">点击省份，探索 34 个地域的代表菜与口味档案。</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* ══ 味道地图（省份网格） ══ */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {PROVINCE_FOODS.map((p) => {
              const color = CUISINE_COLORS[p.cuisine] ?? '#64748B';
              const active = p.code === code;
              return (
                <button
                  key={p.code}
                  onClick={() => setCode(p.code)}
                  className={cn(
                    'text-left rounded-xl border bg-white p-3 transition-all duration-200 hover:shadow-sm',
                    active ? 'border-emerald-400 ring-2 ring-emerald-100 shadow-sm' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                  </div>
                  <p className="text-xs text-gray-700 font-medium leading-tight">{p.dish}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{p.cuisine}</p>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            数据汇编自公开资料（百度百科《中国菜》名录、今晚报《地名与特色美食》等），口味雷达数值为按菜系特征的估算标签，仅供文化科普与演示。
          </p>
        </section>

        {/* ══ 详情面板 ══ */}
        <aside className="lg:sticky lg:top-[68px] bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.code}
              initial={{ opacity: 0, y: 8 }}
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
    </div>
  );
}
