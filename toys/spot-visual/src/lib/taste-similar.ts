// 口味相似度：用 6 维雷达向量算余弦相似度，给「口味相近的菜」。
// 只比较省域代表菜（市级口味取所属省域，向量完全相同，比了也没有信息）。
import { PROVINCE_FOODS, TASTE_KEYS, type ProvinceFood } from './food-data';

function vec(p: ProvinceFood): number[] {
  return TASTE_KEYS.map((k) => p.taste[k] ?? 0);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** 返回与给定省域菜口味最接近的 n 道（不含自己） */
export function getSimilarTaste(provName: string, n = 5): { prov: ProvinceFood; sim: number }[] {
  const me = PROVINCE_FOODS.find((p) => p.name === provName);
  if (!me) return [];
  const v = vec(me);
  return PROVINCE_FOODS.filter((p) => p.name !== me.name)
    .map((p) => ({ prov: p, sim: cosine(v, vec(p)) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, n);
}

export type EvidenceTier = 'dish' | 'nutrition' | 'ingredient' | 'self';

export const TIER_LABEL: Record<EvidenceTier, string> = {
  dish: '菜肴实测',
  nutrition: '营养库',
  ingredient: '主料参照',
  self: '仅自评',
};

export const TIER_STYLE: Record<EvidenceTier, string> = {
  dish: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  nutrition: 'bg-teal-50 text-teal-700 border-teal-200',
  ingredient: 'bg-sky-50 text-sky-700 border-sky-200',
  self: 'bg-gray-50 text-gray-500 border-gray-200',
};

export function tierOf(flags: { dish?: boolean; nutrition?: boolean; ingredient?: boolean }): EvidenceTier {
  if (flags.dish) return 'dish';
  if (flags.nutrition) return 'nutrition';
  if (flags.ingredient) return 'ingredient';
  return 'self';
}
