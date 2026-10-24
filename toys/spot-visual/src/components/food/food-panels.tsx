'use client';

import { useMemo, useState } from 'react';
import { PROVINCE_FOODS, TASTE_KEYS, type ProvinceFood } from '@/lib/food-data';
import { TasteRadar } from './taste-radar';
import { cn } from '@/lib/utils';
import { DISH_IMPACT } from '@/lib/dish-impact.generated';
import { DISH_SODIUM } from '@/lib/dish-sodium.generated';

/* ── 口味测试：自评 6 维，匹配最接近的菜 ────────────────────────── */
export function TasteTest({ onPick }: { onPick: (p: ProvinceFood) => void }) {
  const [vals, setVals] = useState<Record<string, number>>(Object.fromEntries(TASTE_KEYS.map((k) => [k, 50])));

  const top = useMemo(() => {
    const v = TASTE_KEYS.map((k) => vals[k] ?? 50);
    return PROVINCE_FOODS.map((p) => {
      const u = TASTE_KEYS.map((k) => p.taste[k] ?? 0);
      let dot = 0;
      let na = 0;
      let nb = 0;
      for (let i = 0; i < 6; i++) {
        dot += v[i] * u[i];
        na += v[i] * v[i];
        nb += u[i] * u[i];
      }
      return { p, sim: dot / (Math.sqrt(na) * Math.sqrt(nb) || 1) };
    })
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 6);
  }, [vals]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-base font-bold text-gray-900 mb-1">口味测试</h2>
      <p className="text-[11px] text-gray-500 mb-3">拖动六个维度，系统匹配口味最接近的 6 道省域代表菜。</p>
      <div className="space-y-2">
        {TASTE_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-4 text-xs text-gray-500">{k}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={vals[k] ?? 50}
              onChange={(e) => setVals((s) => ({ ...s, [k]: Number(e.target.value) }))}
              className="flex-1 accent-emerald-600"
            />
            <span className="w-7 text-right text-xs text-gray-400">{vals[k]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {top.map(({ p, sim }) => (
          <button
            key={p.name}
            onClick={() => onPick(p)}
            className="px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100 transition-colors"
          >
            {p.dish} <span className="text-emerald-500">{(sim * 100).toFixed(0)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 对比模式：两道菜并排比雷达与 6 维差值 ───────────────────────── */
export function DishCompare({ left, right, onLeft, onRight }: {
  left: ProvinceFood;
  right: ProvinceFood;
  onLeft: (p: ProvinceFood) => void;
  onRight: (p: ProvinceFood) => void;
}) {
  const sel = (cur: ProvinceFood, set: (p: ProvinceFood) => void, tag: string) => (
    <select
      value={cur.name}
      onChange={(e) => set(PROVINCE_FOODS.find((x) => x.name === e.target.value)!)}
      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
      aria-label={tag}
    >
      {PROVINCE_FOODS.map((p) => (
        <option key={p.name} value={p.name}>{p.fullName} · {p.dish}</option>
      ))}
    </select>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-base font-bold text-gray-900 mb-1">口味对比</h2>
      <p className="text-[11px] text-gray-500 mb-3">并排看两道菜的雷达与六维差值（右减左）。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          {sel(left, onLeft, '左侧菜')}
          <div className="flex justify-center mt-2">
            <TasteRadar taste={left.taste} size={170} color="#B91C1C" />
          </div>
        </div>
        <div>
          {sel(right, onRight, '右侧菜')}
          <div className="flex justify-center mt-2">
            <TasteRadar taste={right.taste} size={170} color="#0F766E" />
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {[
          ['每份价格(元)', DISH_IMPACT[left.dish]?.price, DISH_IMPACT[right.dish]?.price],
          ['碳足迹(g)', DISH_IMPACT[left.dish]?.carbon, DISH_IMPACT[right.dish]?.carbon],
          ['每份钠(mg)', DISH_SODIUM[left.dish]?.na, DISH_SODIUM[right.dish]?.na],
        ].map(([label, lv, rv]) => (
          <div key={String(label)} className="flex items-center gap-2 text-[11px]">
            <span className="w-16 text-gray-500">{label}</span>
            <span className="flex-1 text-right text-rose-600">{lv == null ? '—' : String(lv)}</span>
            <span className="w-4 text-center text-gray-300">vs</span>
            <span className="flex-1 text-emerald-600">{rv == null ? '—' : String(rv)}</span>
          </div>
        ))}
        {TASTE_KEYS.map((k) => {
          const d = (right.taste[k] ?? 0) - (left.taste[k] ?? 0);
          return (
            <div key={k} className="flex items-center gap-2 text-[11px]">
              <span className="w-4 text-gray-500">{k}</span>
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.abs(d))}%`,
                    backgroundColor: d >= 0 ? '#0F766E' : '#B91C1C',
                    marginLeft: d >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(d))}%`,
                  }}
                />
              </div>
              <span className={cn('w-8 text-right', d >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {d > 0 ? `+${d}` : d}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
