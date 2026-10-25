"use client";

// gaokao views 共用的常量与工具
export type Tier = "reach" | "match" | "safe";

export const TIER_COLOR: Record<Tier, string> = {
  reach: "#F59E0B",
  match: "#10B981",
  safe: "#3B82F6",
};

export const TIER_LABEL: Record<Tier, string> = {
  reach: "冲一冲",
  match: "稳一稳",
  safe: "保一保",
};

export const TIERS: Tier[] = ["reach", "match", "safe"];

export function tierOf(gap: number): Tier | "none" {
  if (gap >= -18 && gap <= 0) return "reach";
  if (gap > 0 && gap <= 22) return "match";
  if (gap > 22 && gap <= 55) return "safe";
  return "none";
}

/** 可解释录取概率信号（透明权重，非黑盒推荐） */
export function admitProb(
  gap: number,
  plan?: number,
  delta?: number,
  planDelta?: number,
): {
  pct: number;
  signals: { label: string; effect: string; detail: string }[];
} {
  const signals: { label: string; effect: string; detail: string }[] = [];
  let pct = 50;
  // 1. 分差（核心信号，±40 分）
  if (gap < -18) {
    pct -= 35;
    signals.push({
      label: "分差",
      effect: "-35%",
      detail: `投档线高出你 ${-gap} 分，超出冲档`,
    });
  } else if (gap <= 0) {
    const d = Math.round((1 - -gap / 18) * 15);
    pct -= 15 - d;
    signals.push({
      label: "分差",
      effect: `-${15 - d}%`,
      detail: `冲档：投档线高出你 ${-gap} 分`,
    });
  } else if (gap <= 22) {
    const d = Math.round((gap / 22) * 25);
    pct += d;
    signals.push({
      label: "分差",
      effect: `+${d}%`,
      detail: `稳档：超投档线 ${gap} 分`,
    });
  } else if (gap <= 55) {
    const d = 25 + Math.round(((gap - 22) / 33) * 15);
    pct += d;
    signals.push({
      label: "分差",
      effect: `+${d}%`,
      detail: `保档：超投档线 ${gap} 分`,
    });
  } else {
    pct += 40;
    signals.push({
      label: "分差",
      effect: "+40%",
      detail: `远超投档线 ${gap} 分`,
    });
  }
  // 2. 招生计划（名额少波动大，±10%）
  if (plan != null) {
    if (plan <= 5) {
      pct -= 10;
      signals.push({
        label: "招生计划",
        effect: "-10%",
        detail: `仅 ${plan} 个名额，波动大`,
      });
    } else if (plan <= 20) {
      pct -= 5;
      signals.push({
        label: "招生计划",
        effect: "-5%",
        detail: `${plan} 个名额，偏少`,
      });
    } else {
      pct += 5;
      signals.push({
        label: "招生计划",
        effect: "+5%",
        detail: `${plan} 个名额，较充裕`,
      });
    }
  }
  // 3. 投档线同比（涨分年风险高，±10%）
  if (delta != null) {
    if (delta > 5) {
      pct -= 8;
      signals.push({
        label: "同比",
        effect: "-8%",
        detail: `去年涨 ${delta} 分，竞争加剧`,
      });
    } else if (delta < -5) {
      pct += 8;
      signals.push({
        label: "同比",
        effect: "+8%",
        detail: `去年降 ${-delta} 分，可能回暖`,
      });
    } else {
      signals.push({
        label: "同比",
        effect: "0%",
        detail: `去年${delta > 0 ? "涨" : "降"} ${Math.abs(delta)} 分，基本持平`,
      });
    }
  }
  // 4. 计划同比（缩招风险，±5%）
  if (planDelta != null && planDelta < 0) {
    pct -= 5;
    signals.push({
      label: "计划",
      effect: "-5%",
      detail: `缩招 ${-planDelta} 人`,
    });
  }
  pct = Math.max(2, Math.min(95, Math.round(pct)));
  return { pct, signals };
}
