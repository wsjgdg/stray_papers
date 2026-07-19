// ═══ PTSI 计算引擎 ═══
// 从 deterrent-view.tsx evaluate() 提取并标准化

import type { PTSIResult } from './spot-data';

/**
 * 模拟一天中不同小时的紫外线强度
 * 基于通用 UV 日变化规律：6am=2, 8am=4, 10am=7, 12pm=11, 2pm=10, 4pm=7, 6pm=4, 8pm=1
 */
export function getUVByHour(hour: number): number {
  // 日出前/日落后 UV≈0
  if (hour < 6 || hour > 20) return 0;
  // 分段线性插值
  const keyframes: [number, number][] = [
    [6, 2], [8, 4], [10, 7], [12, 11], [14, 10], [16, 7], [18, 4], [20, 1],
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
export function calcPTSI(
  uvIndex: number,
  conditions: string[],
  crowdMinutes: number = 0,
): PTSIResult {
  // UV 分数 (0-50)
  const uvScore = uvIndex >= 10 ? 50 : uvIndex >= 8 ? 40 : uvIndex >= 5 ? 30 : uvIndex >= 3 ? 10 : 0;

  // 身体条件分数 (0-60)，每激活1个 +20
  const bodyScore = Math.min(60, conditions.length * 20);

  // 拥挤分数 (0-30)
  const crowdScore = crowdMinutes > 120 ? 30 : crowdMinutes > 60 ? 20 : crowdMinutes > 30 ? 10 : 0;

  // PTSI = 100 - (负向分数汇总)
  const score = Math.max(0, Math.min(100, 100 - uvScore - bodyScore - crowdScore));

  // 适宜度判定
  const verdict: PTSIResult['verdict'] =
    score >= 80 ? 'go' : score >= 50 ? 'caution' : 'nogo';

  // 原因汇总
  const reasons: string[] = [];
  if (uvScore >= 50) reasons.push('紫外线极强');
  else if (uvScore >= 30) reasons.push('紫外线较强');
  if (conditions.includes('heat')) reasons.push('怕热中暑风险');
  if (conditions.includes('heart')) reasons.push('心脏负担大');
  if (conditions.includes('knee')) reasons.push('膝盖不适');
  if (crowdScore >= 20) reasons.push('排队时间过长');

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
  spots: { name: string }[],
  conditions: string[],
  timeHour: number = new Date().getHours(),
): { name: string; ptsi: PTSIResult }[] {
  const uvIndex = getUVByHour(timeHour);
  return spots.map(s => ({
    name: s.name,
    ptsi: calcPTSI(uvIndex, conditions, 0),
  }));
}