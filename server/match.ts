import type { LlmModel } from './types.js';
import { bareName } from './sources/openrouter.js';

/** 归一化：小写、去括号修饰、仅留字母数字 */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .match(/[a-z]+|\d+(?:\.\d+)?/g) ?? [];
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const t of new Set(a)) if (setB.has(t)) hit += 1;
  return hit / Math.min(new Set(a).size, setB.size);
}

/**
 * 把 Artificial Analysis 榜单条目映射到 OpenRouter 模型。
 * 同名模型在两家命名习惯不同（AA 带 (max)/(high) 后缀、OR 带厂商前缀），
 * 因此按 精确 → slug → 包含 → 词元相似 的顺序降级匹配。
 */
export function matchModel(
  label: string,
  aaSlug: string | null,
  keys: { model: LlmModel; key: string; bare: string; slug: string }[],
): LlmModel | null {
  const labelKey = normKey(label);
  const labelTokens = tokenize(label);
  const slugKey = aaSlug ? normKey(aaSlug) : '';

  let best: { model: LlmModel; score: number; idLen: number } | null = null;
  for (const cand of keys) {
    let score = 0;
    if (cand.key === labelKey || cand.bare === labelKey) {
      score = 3;
    } else if (slugKey && cand.slug === slugKey) {
      score = 2;
    } else {
      const longer = Math.max(cand.bare.length, labelKey.length);
      if (longer > 0 && labelKey.length >= 5 && (cand.bare.includes(labelKey) || labelKey.includes(cand.bare))) {
        const shorter = Math.min(cand.bare.length, labelKey.length);
        score = 0.75 + 0.2 * (shorter / longer);
      } else {
        score = jaccard(labelTokens, tokenize(cand.model.name)) * 0.9;
      }
    }
    // 同分时优先标准版（id 更短），避免匹配到 -fast / -thinking 等推理档位变体
    const idLen = cand.model.id.length;
    const better =
      !best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && idLen < best.idLen);
    if (score >= 0.6 && better) best = { model: cand.model, score, idLen };
  }
  return best?.model ?? null;
}

export function buildIndex(models: LlmModel[]) {
  const keys = models.map((model) => ({
    model,
    key: normKey(model.name),
    bare: normKey(bareName(model.name)),
    // canonical_slug 常带 8 位日期后缀（...-20260827），剥离后才能与 AA slug 对齐
    slug: normKey(model.slug.split('/').pop() ?? model.slug).replace(/(19|20)\d{6}$/, ''),
  }));
  return keys;
}
