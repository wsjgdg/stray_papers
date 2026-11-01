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

/** 暴露时长扣分（0–10，线性）：建议游玩时长越长，暴露在日晒/爬坡里的时间越久。
 *  12 小时满扣。旧实现「2 小时内不扣」会让一大堆半日游景点同分（1.5h 与 2h 完全一样），
 *  排行榜看起来还是一串相同的数字——线性化后 0.5 小时的差也能体现出来。 */
export function exposurePenalty(hours: number | null | undefined): number {
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0)
    return 0;
  return Math.min(10, Math.round((hours / 12) * 10 * 10) / 10);
}

/** 体力扣分（0–30）：按景点体力消耗值（0–100，来自分类/项目/累计爬升推导）。
 *  这一项替换掉了原来的「拥挤分钟」——那是我方**没有**的实时客流数据，
 *  用评分反推出来的分钟数属于假精度，已整体删除。体力消耗是库内真实字段。 */
export function effortPenalty(stamina: number | null | undefined): number {
  if (typeof stamina !== "number" || !Number.isFinite(stamina)) return 0;
  const s = Math.max(0, Math.min(100, stamina));
  return Math.round((s / 100) * 30 * 10) / 10;
}

/**
 * 核心 PTSI 计算
 * PTSI = 100 − (紫外线 + 身体条件 + 体力消耗 + 降水 + 暴露时长)
 * 五个维度全部来自库内真实字段或用户勾选，不含任何推测的客流数据。
 *
 * @param uvIndex 紫外线指数 (0-11+)
 * @param conditions 激活的身体条件 ID 数组 ['knee', 'heart', 'heat']
 * @param extra 可选维度：降水概率、建议游玩时长、景点体力消耗
 */
export function calcPTSI(
  uvIndex: number,
  conditions: string[],
  extra: {
    precipProb?: number | null;
    exposureHours?: number | null;
    stamina?: number | null;
  } = {},
): PTSIResult {
  // UV 分数 (0-50)：连续计分，避免台阶化后多天同分
  const uvScore = uvPenalty(uvIndex);

  // 身体条件分数 (0-60)，每激活1个 +20
  const bodyScore = Math.min(60, conditions.length * 20);

  // 体力分数 (0-30)：来自景点体力消耗值（真实字段），不是客流推测。
  const effortScore = effortPenalty(extra.stamina);

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
          100 - uvScore - bodyScore - effortScore - rainScore - exposureScore,
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
  if (effortScore >= 20) reasons.push("体力消耗大");
  if (rainScore >= 8) reasons.push("降水概率偏高");
  if (exposureScore >= 6) reasons.push("游玩时长较长，暴露久");

  return { score, uvScore, bodyScore, effortScore, verdict, reasons };
}

/**
 * 计算一个景点一天 24 小时的 PTSI 变化曲线
 */
export function calcPTSIHourly(
  conditions: string[],
): { hour: number; uvIndex: number; ptsi: PTSIResult }[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const uvIndex = getUVByHour(hour);
    const ptsi = calcPTSI(uvIndex, conditions);
    return { hour, uvIndex, ptsi };
  });
}

/**
 * 逐景点计算：把库内真实字段（体力消耗、建议游玩时长）代入 PTSI。
 *
 * 这里**不再**估算客流。原实现用「评分 − 4.0」反推排队分钟数，
 * 既没有数据来源，又把评分高的名景区排到榜尾（评分越高越扣分），
 * 属于假精度 + 逻辑倒挂，已整体删除。
 */
export function calcPTSIForSpots(
  spots: {
    name: string;
    /** 高德评分 4.0–5.0，仅用于同分排序，不参与扣分 */
    rating?: number;
    level?: string | null;
    /** 建议游玩时长（小时）→ 暴露时长扣分 */
    suggestedHours?: number | null;
    /** 景点体力消耗值 0–100 → 体力扣分 */
    stamina?: number | null;
  }[],
  conditions: string[],
  timeHour: number = new Date().getHours(),
): {
  name: string;
  ptsi: PTSIResult;
  hours: number | null;
  stamina: number | null;
}[] {
  const uvIndex = getUVByHour(timeHour);
  return spots.map((s) => {
    const hours = s.suggestedHours ?? null;
    const stamina = typeof s.stamina === "number" ? s.stamina : null;
    return {
      name: s.name,
      hours,
      stamina,
      ptsi: calcPTSI(uvIndex, conditions, {
        exposureHours: hours,
        stamina,
      }),
    };
  });
}
