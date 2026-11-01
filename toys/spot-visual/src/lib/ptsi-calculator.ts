// ═══ PTSI 计算引擎 ═══
// 从 deterrent-view.tsx evaluate() 提取并标准化

import type { PTSIResult } from "./spot-data";

/**
 * 模拟一天中不同小时的紫外线强度
 * 基于通用 UV 日变化规律：6am=2, 8am=4, 10am=7, 12pm=11, 2pm=10, 4pm=7, 6pm=4, 8pm=1
 */
export function getUVByHour(hour: number): number {
  // 日出前/日落后 UV≈0
  if (hour < 6 || hour > 20) return 0;
  // 分段线性插值
  const keyframes: [number, number][] = [
    [6, 2],
    [8, 4],
    [10, 7],
    [12, 11],
    [14, 10],
    [16, 7],
    [18, 4],
    [20, 1],
  ];
  for (let i = 1; i < keyframes.length; i++) {
    const [h1, uv1] = keyframes[i - 1];
    const [h2, uv2] = keyframes[i];
    if (hour <= h2) {
      const t = (hour - h1) / (h2 - h1);
      return Math.round(uv1 + t * (uv2 - uv1));
    }
  }
  return 0;
}

/**
 * 核心 PTSI 计算（复用 deterrent-view.tsx evaluate() 逻辑）
 * PTSI = 100 - (UV分数 + 身体条件分数 + 拥挤分数)
 *
 * @param uvIndex 紫外线指数 (0-11+)
 * @param conditions 激活的身体条件 ID 数组 ['knee', 'heart', 'heat']
 * @param crowdMinutes 排队等待分钟数 (可选，默认0)
 * @returns PTSIResult 标准化结果
 */
/** UV 扣分（0–50，连续）：uvIndex 0→0 分、11+→50 分。
 *  旧实现是 5 档台阶（0/10/30/40/50），7 天预报里多数日子会落进同一档 → 每天同分、
 *  条形图全一样，用户看不出差别。改成线性后 1 个 UV 点约 4.5 分，逐日可区分。 */
export function uvPenalty(uvIndex: number): number {
  const x = Math.max(0, Math.min(11, uvIndex));
  return Math.round((x / 11) * 50);
}

/** 降水扣分（0–15）：按逐日降水概率，≥80% 满扣。晴天出行体验与紫外线是两件事，分开计。 */
export function precipPenalty(prob: number | null | undefined): number {
  if (typeof prob !== "number" || !Number.isFinite(prob)) return 0;
  const p = Math.max(0, Math.min(100, prob));
  return Math.round((p / 100) * 15);
}

/** 暴露时长扣分（0–10）：建议游玩时长越长，暴露在日晒/爬坡里的时间越久。
 *  2 小时以内不扣，12 小时满扣——只用于「景点之间」拉开差距，不改变身体/UV 的语义。 */
export function exposurePenalty(hours: number | null | undefined): number {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 2)
    return 0;
  return Math.round(Math.min(10, ((hours - 2) / 10) * 10));
}

export function calcPTSI(
  uvIndex: number,
  conditions: string[],
  crowdMinutes: number = 0,
  extra: { precipProb?: number | null; exposureHours?: number | null } = {},
): PTSIResult {
  // UV 分数 (0-50)：连续计分，避免台阶化后多天同分
  const uvScore = uvPenalty(uvIndex);

  // 身体条件分数 (0-60)，每激活1个 +20
  const bodyScore = Math.min(60, conditions.length * 20);

  // 拥挤分数 (0-30)：连续计分。旧版是 10/20/30 三档，景点之间大量同分，
  // 排行榜看起来「所有项一个值」——分档越粗越只能靠评分 tiebreak。
  const crowdScore = Math.min(30, (Math.max(0, crowdMinutes) / 150) * 30);

  // 降水与暴露时长（可选维度，只影响给定数据的场景）
  const rainScore = precipPenalty(extra.precipProb);
  const exposureScore = exposurePenalty(extra.exposureHours);

  // PTSI = 100 - (负向分数汇总)；保留 1 位小数，让相邻景点之间能看出差别
  const score =
    Math.round(
      Math.max(
        0,
        Math.min(
          100,
          100 - uvScore - bodyScore - crowdScore - rainScore - exposureScore,
        ),
      ) * 10,
    ) / 10;

  // 适宜度判定
  const verdict: PTSIResult["verdict"] =
    score >= 80 ? "go" : score >= 50 ? "caution" : "nogo";

  // 原因汇总
  const reasons: string[] = [];
  if (uvScore >= 50) reasons.push("紫外线极强");
  else if (uvScore >= 30) reasons.push("紫外线较强");
  if (conditions.includes("heat")) reasons.push("怕热中暑风险");
  if (conditions.includes("heart")) reasons.push("心脏负担大");
  if (conditions.includes("knee")) reasons.push("膝盖不适");
  if (crowdScore >= 20) reasons.push("排队时间偏长（估算）");
  if (rainScore >= 8) reasons.push("降水概率偏高");
  if (exposureScore >= 6) reasons.push("游玩时长较长，暴露久");

  return { score, uvScore, bodyScore, crowdScore, verdict, reasons };
}

/**
 * 计算一个景点一天 24 小时的 PTSI 变化曲线
 */
export function calcPTSIHourly(
  conditions: string[],
): { hour: number; uvIndex: number; ptsi: PTSIResult }[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const uvIndex = getUVByHour(hour);
    const ptsi = calcPTSI(uvIndex, conditions, 0);
    return { hour, uvIndex, ptsi };
  });
}

/**
 * 对战排行榜辅助：对给定条件计算基准 UV（通用小时 UV）
 * 实际使用时每个景点的 UV 应基于其地理位置和天气数据
 */
export function calcPTSIForSpots(
  spots: {
    name: string;
    /** 高德评分 4.0–5.0，用作「热度→排队时长」的代理指标 */
    rating?: number;
    level?: string | null;
    /** 建议游玩时长（小时），用作「暴露时长」代理 */
    suggestedHours?: number | null;
  }[],
  conditions: string[],
  timeHour: number = new Date().getHours(),
): {
  name: string;
  ptsi: PTSIResult;
  crowdMinutes: number;
  hours: number | null;
}[] {
  const uvIndex = getUVByHour(timeHour);
  return spots.map((s) => {
    // 旧实现给每个景点传同一个 UV 和 0 拥挤 → 全库同分，排行榜其实是按评分排的。
    // 这里用**已有字段**做逐景点代理（不是实时客流，UI 有说明）：
    //   热度 = 评分（4.0 起算）+ 5A 加成 → 折成排队分钟
    //   暴露 = 建议游玩时长
    const ratingHeat =
      typeof s.rating === "number" ? Math.max(0, s.rating - 4.0) : 0;
    const levelBoost = s.level === "5A" ? 12 : s.level === "4A" ? 6 : 0;
    const crowdMinutes = Math.round(
      Math.min(150, ratingHeat * 180 + levelBoost),
    );
    return {
      name: s.name,
      crowdMinutes,
      hours: s.suggestedHours ?? null,
      ptsi: calcPTSI(uvIndex, conditions, crowdMinutes, {
        exposureHours: s.suggestedHours ?? null,
      }),
    };
  });
}
