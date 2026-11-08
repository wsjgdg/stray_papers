// ═══ 体力计算引擎 ═══
// 从 fitness-view.tsx 中提取核心计算逻辑，泛化为可复用工具函数

import type { Spot } from './spot-data';
import { getStaminaCost, getProjectStaminaFactor } from './spot-data';

/**
 * 根据用户身体红灯计算体力预算上限 (0-100)
 * @param conditions 激活的身体条件 ID 集合
 * @returns 体力预算值：无红灯=100，每激活一个扣25%，最低25%
 */
export function calcStaminaBudget(conditions: Set<string> | string[]): number {
  const count = conditions instanceof Set ? conditions.size : conditions.length;
  // 无红灯 → 100% 体力
  // 每激活1个 → -25%
  // 全部3个激活 → 25%（最低保障）
  return Math.max(25, 100 - count * 25);
}

/**
 * 计算选中景点+项目的总体力消耗
 * @param spots 全部景点列表
 * @param selectedSpotIds 选中的景点 ID 集合
 * @param selectedProjects 选中的项目名称集合（跨景点）
 * @returns 总体力消耗值
 */
export function calcTotalStaminaCost(
  spots: Spot[],
  selectedSpotIds: Set<string>,
  selectedProjects: Set<string>,
): number {
  let total = 0;
  const selectedSpots = spots.filter(s => selectedSpotIds.has(s.id));
  for (const spot of selectedSpots) {
    // 景点基础体力
    const base = getStaminaCost(spot);
    // 项目体力调整
    const projectAdj = spot.projects
      .filter(p => selectedProjects.has(p))
      .reduce((sum, p) => sum + base * (getProjectStaminaFactor(p) - 1), 0);
    total += base + projectAdj;
  }
  return Math.max(0, Math.round(total));
}

/**
 * 模拟体力下降曲线
 * @param spots 景点列表
 * @param order 景点 ID 序列（代表游览顺序）
 * @param staminaBudget 体力预算上限
 * @returns 累计体力消耗曲线数据
 */
export function calcStaminaCurve(
  spots: Spot[],
  order: string[],
  staminaBudget: number,
): { index: number; spotName: string; staminaCost: number; cumulative: number; remaining: number }[] {
  let cumulative = 0;
  return order.map((id, i) => {
    const spot = spots.find(s => s.id === id);
    if (!spot) return { index: i, spotName: '?', staminaCost: 0, cumulative: 0, remaining: staminaBudget };
    const cost = getStaminaCost(spot);
    cumulative += cost;
    return {
      index: i,
      spotName: spot.name,
      staminaCost: cost,
      cumulative,
      remaining: Math.max(0, staminaBudget - cumulative),
    };
  });
}

/**
 * 反向建议生成：如果必须去某景点，给出体力预算建议
 */
export function generateStaminaAdvice(
  spot: Spot,
  staminaBudget: number,
  timePeriod: string,
): string {
  const cost = getStaminaCost(spot);
  if (cost > staminaBudget) {
    const shortage = cost - staminaBudget;
    const alternatives = spot.projects
      .filter(p => getProjectStaminaFactor(p) < 0.7)
      .slice(0, 3);
    let advice = `⚠️ 该景点体力消耗(${cost})超过你的预算(${staminaBudget})，差${shortage}点。`;
    if (timePeriod === '正午') advice += ' 建议避开正午时段，改为清晨/黄昏前往。';
    if (alternatives.length > 0) advice += ` 可优先体验低体力项目：${alternatives.join('、')}。`;
    return advice;
  }
  return `✅ 体力预算充足（${staminaBudget} ≥ ${cost}），可以放心前往。`;
}