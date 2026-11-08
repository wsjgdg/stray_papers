import {
  admissionsFor,
  activeProvinces,
  activeSchools,
  getSchool,
  rankForScore,
  type Admission,
  type BatchGroup,
  type School,
} from "@/lib/gaokao-data";

export interface RecommendItem {
  admission: Admission;
  schoolName: string;
  schoolProv: string;
  is985: boolean;
  is211: boolean;
  isDFC: boolean;
  rank?: string; // 软科排名（未上榜无）
  rankNum?: number;
  planCount?: number; // 该省该科类本科招生计划人数
  scoreDelta?: number; // 投档线同比（正=涨分）
  gap: number; // 用户分 - 投档线（正=稳/保，负=冲）
}

export interface RecommendResult {
  userRank: number;
  reach: RecommendItem[]; // 冲
  match: RecommendItem[]; // 稳
  safe: RecommendItem[]; // 保
}

function toItem(a: Admission, score: number): RecommendItem {
  const s = getSchool(a.schoolName);
  return {
    admission: a,
    schoolName: a.schoolName,
    schoolProv: s?.prov ?? "",
    is985: s?.is985 ?? false,
    is211: s?.is211 ?? false,
    isDFC: s?.isDFC ?? false,
    rank: s?.rank,
    rankNum: s?.rankNum,
    planCount: a.planCount,
    scoreDelta: a.scoreDelta,
    gap: score - a.minScore,
  };
}

// 冲稳保分层（基于用户分与院校投档线的差值）
//   冲：投档线高于用户 0~18 分（有机会）
//   稳：投档线在用户 -22~0 分（较匹配）
//   保：投档线在用户 -55~-23 分（较安全）
// keep：可选院校筛选（如只看 985），筛选后再取各档前 12
export function recommend(
  score: number,
  prov: string,
  cat: string,
  keep?: (s: School | undefined) => boolean,
  group: BatchGroup = "benke",
): RecommendResult {
  const lines = admissionsFor(prov, cat, group);
  const reach: RecommendItem[] = [];
  const match: RecommendItem[] = [];
  const safe: RecommendItem[] = [];
  for (const a of lines) {
    const gap = score - a.minScore;
    if (keep && !keep(getSchool(a.schoolName))) continue;
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
  return activeProvinces().find((p) => p.name === prov)?.cats ?? [];
}

export function schoolCount(): number {
  return activeSchools().length;
}
