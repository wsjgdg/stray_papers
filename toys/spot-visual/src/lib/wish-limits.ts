/**
 * 各省本科批「志愿单位」上限（院校专业组 / 专业+院校）。
 *
 * ⚠️ 口径说明：这个上限逐省、逐年都可能变（如河南 2025 年首年新高考），
 * 这里只收录**比较确定**的省份，其余留空 → UI 回退成「以本省当年公告为准」。
 * 宁可少说，也不要给出一个精确但错误的数字。
 *
 * 单位：
 *   group  = 院校专业组（新高考 3+1+2 / 3+3 的组模式）
 *   major  = 专业（类）+ 院校（山东、辽宁、重庆、浙江等）
 *   school = 院校（老高考文理模式）
 */
export interface WishLimit {
  max: number;
  unit: "group" | "major" | "school";
}

export const WISH_LIMITS: Record<string, WishLimit> = {
  北京: { max: 30, unit: "group" },
  天津: { max: 50, unit: "group" },
  上海: { max: 24, unit: "group" },
  浙江: { max: 80, unit: "major" },
  山东: { max: 96, unit: "major" },
  河北: { max: 96, unit: "group" },
  辽宁: { max: 112, unit: "major" },
  重庆: { max: 96, unit: "major" },
  江苏: { max: 40, unit: "group" },
  湖北: { max: 45, unit: "group" },
  湖南: { max: 45, unit: "group" },
  广东: { max: 45, unit: "group" },
  福建: { max: 40, unit: "group" },
  安徽: { max: 45, unit: "group" },
  江西: { max: 45, unit: "group" },
  甘肃: { max: 45, unit: "group" },
  吉林: { max: 40, unit: "group" },
  黑龙江: { max: 40, unit: "group" },
  广西: { max: 40, unit: "group" },
};

export const WISH_UNIT_LABEL: Record<WishLimit["unit"], string> = {
  group: "院校专业组",
  major: "专业+院校",
  school: "院校",
};

/** 没收录的省份返回 null，调用方回退到「以本省规则为准」 */
export function wishLimitFor(prov: string): WishLimit | null {
  return WISH_LIMITS[prov] ?? null;
}
