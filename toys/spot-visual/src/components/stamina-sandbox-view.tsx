'use client';

// ═══ 体力沙盘 · 双轴优化引擎 ═══
// D1.4: 双轴沙盘主视图
// 在体力消耗 vs 游览体验之间找到最优平衡

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Shuffle, TrendingUp, Activity, ArrowUpDown } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { getStaminaCost } from '@/lib/spot-data';
import { calcStaminaBudget, calcTotalStaminaCost, calcStaminaCurve, generateStaminaAdvice } from '@/lib/stamina-calculator';

/* ═══ 体验分数模拟（0-100，基于景点特征） ═══ */
function calcExperienceScore(spotName: string): number {
  const scores: Record<string, number> = {
    '张家界国家森林公园': 95,
    '故宫博物院': 90,
    '上海迪士尼乐园': 88,
    '广州塔': 72,
    '三亚亚龙湾': 85,
    '黄山风景区': 92,
    '丽江古城': 82,
    '少林寺': 78,
    '九寨沟风景区': 96,
    '长城·八达岭': 88,
    '长隆海洋王国': 86,
    '鼓浪屿': 80,
  };
  return scores[spotName] || 70;
}

/* ═══ 散点图数据点 ═══ */
interface ScatterPoint {
  id: string;
  name: string;
  stamina: number;   // X轴：体力消耗
  experience: number; // Y轴：体验分数
  efficiency: number; // 体验/体力比
  selected: boolean;
}

/* ═══ 双轴散点图（纯 SVG，与 fitness-view 风格一致） ═══ */
function ScatterChart({ points, width = 500, height = 340 }: { points: ScatterPoint[]; width?: number; height?: number }) {
  const PAD = { top: 30, right: 20, bottom: 50, left: 50 };
  const W = width;
  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxStamina = Math.max(...points.map(p => p.stamina), 1);
  const maxExperience = 100;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {/* 网格线 */}
      {[0, 20, 40, 60, 80, 100].map(v => (
        <g key={v}>
          <line
            x1={PAD.left} y1={PAD.top + plotH - (v / maxExperience) * plotH}
            x2={PAD.left + plotW} y2={PAD.top + plotH - (v / maxExperience) * plotH}
            stroke="#E5E7EB" strokeWidth="0.5"
          />
          <text x={PAD.left - 6} y={PAD.top + plotH - (v / maxExperience) * plotH + 4}
            textAnchor="end" fontSize="9" fill="#9CA3AF">{v}</text>
        </g>
      ))}
      {[0, 20, 40, 60, 80, 100].map(v => (
        <line key={v}
          x1={PAD.left + (v / maxStamina) * plotW} y1={PAD.top}
          x2={PAD.left + (v / maxStamina) * plotW} y2={PAD.top + plotH}
          stroke="#E5E7EB" strokeWidth="0.5" />
      ))}

      {/* 坐标轴标签 */}
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="500">体力消耗 →</text>
      <text x={12} y={H / 2} textAnchor="middle" fontSize="10" fill="#6B7280" fontWeight="500"
        transform={`rotate(-90, 12, ${H / 2})`}>← 体验分数</text>

      {/* 最优效率参考线（对角线） */}
      <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top}
        stroke="#10B981" strokeWidth="1" strokeDasharray="6 4" opacity="0.4" />

      {/* 散点 */}
      {points.map((p, i) => {
        const cx = PAD.left + (p.stamina / maxStamina) * plotW;
        const cy = PAD.top + plotH - (p.experience / maxExperience) * plotH;
        const r = p.selected ? 10 : 8;
        return (
          <motion.g
            key={p.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03, type: 'spring' }}
          >
            <circle cx={cx} cy={cy} r={r}
              fill={p.selected ? '#059669' : '#6B7280'}
              opacity={p.selected ? 0.85 : 0.3}
              stroke="white" strokeWidth={2}
            />
            {p.selected && (
              <text x={cx} y={cy - r - 4} textAnchor="middle" fontSize="9" fill="#065F46" fontWeight="600">
                {p.name.length > 5 ? p.name.slice(0, 5) + '…' : p.name}
              </text>
            )}
          </motion.g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════
   体力沙盘主页面
   ═══════════════════════════════════════════════════ */
export default function StaminaSandboxView() {
  const { spots, staminaBudget, setStaminaBudget, activeSpotOrder, setActiveSpotOrder } = useAppStore();
  const [conditions, setConditions] = useState<string[]>([]);

  const toggleCondition = (id: string) => {
    setConditions(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  // 计算体力预算
  const budget = useMemo(() => calcStaminaBudget(conditions), [conditions]);

  // 同步到store（跨页联动）
  const budgetFromStore = useMemo(() => {
    setStaminaBudget(budget);
    return budget;
  }, [budget, setStaminaBudget]);

  // 默认顺序（按spot在数组中的顺序）
  const order = useMemo(() => {
    if (activeSpotOrder.length > 0) return activeSpotOrder;
    return spots.map(s => s.id);
  }, [spots, activeSpotOrder]);

  // 计算体力曲线
  const curve = useMemo(() => calcStaminaCurve(spots, order, budget), [spots, order, budget]);

  // 散点图数据
  const scatterData: ScatterPoint[] = useMemo(() => spots.map(s => {
    const stamina = getStaminaCost(s);
    const experience = calcExperienceScore(s.name);
    return {
      id: s.id,
      name: s.name,
      stamina,
      experience,
      efficiency: stamina > 0 ? experience / stamina : 0,
      selected: order.includes(s.id),
    };
  }), [spots, order]);

  // 是否超预算
  const totalCost = curve.length > 0 ? curve[curve.length - 1].cumulative : 0;
  const overBudget = totalCost > budget;

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 py-6 pb-8">
        {/* ═══ 标题 ═══ */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">体力沙盘</h2>
            <p className="text-xs text-gray-500">双轴优化引擎 · 平衡体力消耗与游览体验</p>
          </div>
        </div>

        {/* ═══ 身体条件设置 ═══ */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Activity className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-gray-700">身体条件</span>
            <span className="text-[10px] text-gray-400 ml-auto">每激活一项 -25% 体力上限</span>
          </div>
          <div className="flex gap-3">
            {[
              { id: 'knee', label: '膝盖不适', emoji: '🦵' },
              { id: 'heart', label: '心脏负担', emoji: '❤️' },
              { id: 'heat', label: '怕热中暑', emoji: '🌡️' },
            ].map(c => (
              <button key={c.id}
                onClick={() => toggleCondition(c.id)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  conditions.includes(c.id)
                    ? 'bg-red-100 text-red-700 ring-2 ring-red-300'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ 预算 vs 消耗 ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-400 mb-1">体力预算上限</div>
            <div className="text-4xl font-black text-emerald-600">{budget}<span className="text-lg text-gray-400 ml-1">/ 100</span></div>
            <div className="text-xs text-gray-500 mt-1">预算是基于身体条件的自动计算</div>
          </div>
          <div className={`bg-white rounded-2xl p-5 shadow-sm border ${overBudget ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
            <div className="text-xs text-gray-400 mb-1">当前行程消耗</div>
            <div className={`text-4xl font-black ${overBudget ? 'text-red-600' : 'text-blue-600'}`}>
              {totalCost}<span className="text-lg text-gray-400 ml-1">/ {budget}</span>
            </div>
            <div className="text-xs mt-1">
              {overBudget
                ? <span className="text-red-500 font-bold">⚠️ 超出预算 {totalCost - budget} 点</span>
                : <span className="text-emerald-600">✅ 预算充足，剩余 {budget - totalCost} 点</span>
              }
            </div>
          </div>
        </div>

        {/* ═══ 双轴散点图 ═══ */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
          <div className="flex items-center gap-1.5 mb-4">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">双轴优化图</span>
            <span className="text-[10px] text-gray-400 ml-auto">绿色虚线 = 最优体验/体力比</span>
          </div>
          <div className="w-full" style={{ height: 340 }}>
            <ScatterChart points={scatterData} />
          </div>
        </div>

        {/* ═══ 体力消耗曲线 ═══ */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
          <div className="flex items-center gap-1.5 mb-4">
            <ArrowUpDown className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">体力消耗曲线</span>
            <span className="text-[10px] text-gray-400 ml-auto">按游览顺序累计</span>
          </div>
          <div className="space-y-2">
            {curve.map((point, i) => {
              const pct = budget > 0 ? (point.cumulative / budget) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-6 text-right">{i + 1}</span>
                  <span className="text-xs text-gray-700 w-20 truncate">{point.spotName}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(pct, 100)}%` }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                      className={`h-full rounded-full ${
                        pct > 100 ? 'bg-red-400' : pct > 80 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-600 w-14 text-right">{point.cumulative}</span>
                  <span className={`text-xs w-14 text-right ${point.remaining < 10 ? 'text-red-500' : 'text-gray-400'}`}>
                    {point.remaining > 0 ? `剩${point.remaining}` : '已超'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ 项目排序（拖拽提示） ═══ */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-1.5 mb-3">
            <Shuffle className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">景点游览顺序</span>
            <span className="text-[10px] text-gray-400 ml-auto">拖拽调整（后续实现）</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.map((id, i) => {
              const spot = spots.find(s => s.id === id);
              if (!spot) return null;
              return (
                <div key={id}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200"
                >
                  <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                  <span className="text-sm text-gray-700">{spot.name}</span>
                  <span className="text-xs text-amber-600 font-medium">{getStaminaCost(spot)}点</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}