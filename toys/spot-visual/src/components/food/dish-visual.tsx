'use client';

import { useMemo } from 'react';
import type { TasteKey } from '@/lib/food-data';
import { getDishPhoto } from '@/lib/dish-photo';
import { cn } from '@/lib/utils';

const TASTE_COLOR: Record<TasteKey, string> = {
  咸: '#92400E', 甜: '#DB2777', 酸: '#D97706',
  辣: '#DC2626', 香: '#B45309', 鲜: '#0891B2',
};

export interface DishVisualProps {
  dish: string;
  cuisine: string;
  cuisineColor: string;
  taste: Record<TasteKey, number>;
  /** 高度，默认 132 */
  height?: number;
}

/**
 * 菜品视觉卡。
 * 有真实照片时渲染照片（带署名），否则按「菜系色 + 主导口味色」生成一张本地卡面，
 * 明确标注「口味卡面」而不是伪装成实拍。生成过程零网络、零外部依赖。
 */
export function DishVisual({ dish, cuisine, cuisineColor, taste, height = 132 }: DishVisualProps) {
  const photo = getDishPhoto(dish);

  const { c1, c2, angle, plateX } = useMemo(() => {
    const sorted = (Object.keys(taste) as TasteKey[]).sort((a, b) => taste[b] - taste[a]);
    const top = sorted[0];
    // 主色取菜系色，辅色取主导口味色，二者混合出层次
    const a = cuisineColor;
    const b = TASTE_COLOR[top] ?? cuisineColor;
    // 用菜名做确定性扰动，避免所有卡面长一样
    let h = 0;
    for (let i = 0; i < dish.length; i++) h = (h * 31 + dish.charCodeAt(i)) % 997;
    return {
      c1: a,
      c2: b,
      angle: 100 + (h % 80),
      plateX: 66 + (h % 18),
    };
  }, [dish, cuisineColor, taste]);

  if (photo) {
    return (
      <figure className="relative w-full rounded-xl overflow-hidden bg-gray-100" style={{ height }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          alt={dish}
          className="w-full h-full object-cover"
          style={{ objectPosition: photo.focus ?? '50% 50%' }}
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 to-transparent" />
        <figcaption className="absolute left-3 bottom-2 right-3 flex items-end justify-between gap-2">
          <span className="text-white font-bold text-xl leading-tight drop-shadow">{dish}</span>
          {photo.credit && (
            <span className="text-[9px] text-white/70 shrink-0">{photo.credit}</span>
          )}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure
      className="relative w-full rounded-xl overflow-hidden"
      style={{ height, background: `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)` }}
    >
      {/* 盘面 */}
      <svg
        className="absolute inset-y-0 right-0 h-full opacity-20"
        viewBox="0 0 200 200"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <circle cx={plateX + 30} cy="104" r="70" fill="#fff" fillOpacity="0.75" />
        <circle cx={plateX + 30} cy="104" r="70" fill="none" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.5" />
        <circle cx={plateX + 30} cy="104" r="54" fill="none" stroke={c2} strokeWidth="1.5" strokeOpacity="0.8" />
        <path d={`M${plateX + 8} 48 q 10 -16 0 -30`} stroke="#fff" strokeWidth="3" fill="none" strokeOpacity="0.7" strokeLinecap="round" />
        <path d={`M${plateX + 36} 42 q 10 -16 0 -30`} stroke="#fff" strokeWidth="3" fill="none" strokeOpacity="0.5" strokeLinecap="round" />
        <path d={`M${plateX + 64} 50 q 10 -16 0 -30`} stroke="#fff" strokeWidth="3" fill="none" strokeOpacity="0.35" strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />

      <figcaption className="absolute left-3 bottom-2.5 right-3">
        <span
          className={cn(
            'block text-white font-bold leading-tight drop-shadow-sm',
            dish.length > 6 ? 'text-lg' : 'text-2xl',
          )}
        >
          {dish}
        </span>
        <span className="text-[10px] text-white/80">{cuisine}</span>
      </figcaption>
      <span className="absolute right-2 top-2 text-[9px] text-white/85 bg-black/25 rounded px-1.5 py-0.5 backdrop-blur-sm">
        口味卡面
      </span>
    </figure>
  );
}
