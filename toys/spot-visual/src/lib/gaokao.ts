import {
  SCHOOLS, PROVINCES, activeAdmissions, getSchool, rankForScore, type Admission,
} from '@/lib/gaokao-data';

export interface RecommendItem {
  admission: Admission;
  schoolName: string;
  schoolProv: string;
  is985: boolean;
  is211: boolean;
  isDFC: boolean;
  gap: number; // 用户分 - 投档线（正=稳/保，负=冲）
}

export interface RecommendResult {
  userRank: number;
  reach: RecommendItem[]; // 冲
  match: RecommendItem[]; // 稳
  safe: RecommendItem[]; // 保
}

function toItem(a: Admission, score: number): RecommendItem {
  const s = getSchool(a.schoolCode)!;
  return {
    admission: a,
    schoolName: s.name,
    schoolProv: s.prov,
    is985: s.is985,
    is211: s.is211,
    isDFC: s.isDFC,
    gap: score - a.minScore,
  };
}

// 冲稳保分层（基于用户分与院校投档线的差值）
//   冲：投档线高于用户 0~18 分（有机会）
//   稳：投档线在用户 -22~0 分（较匹配）
//   保：投档线在用户 -55~-23 分（较安全）
export function recommend(score: number, prov: string, cat: string): RecommendResult {
  const lines = activeAdmissions().filter((a) => a.prov === prov && a.cat === cat);
  const reach: RecommendItem[] = [];
  const match: RecommendItem[] = [];
  const safe: RecommendItem[] = [];
  for (const a of lines) {
    const gap = score - a.minScore;
    if (gap >= -18 && gap <= 0) reach.push(toItem(a, score));
    else if (gap > 0 && gap <= 22) match.push(toItem(a, score));
    else if (gap > 22 && gap <= 55) safe.push(toItem(a, score));
  }
  const byGap = (arr: RecommendItem[]) => arr.sort((x, y) => y.gap - x.gap);
  return {
    userRank: rankForScore(prov, cat, score),
    reach: byGap(reach).slice(0, 12),
    match: byGap(match).slice(0, 12),
    safe: byGap(safe).slice(0, 12),
  };
}

export function provinceCats(prov: string): string[] {
  return PROVINCES.find((p) => p.name === prov)?.cats ?? [];
}

export function schoolCount(): number {
  return SCHOOLS.length;
}
