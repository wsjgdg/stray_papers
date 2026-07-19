'use client';

// ═══ PTSI 出行指数 · 标准化出行适宜指数 ═══
// D2.2: PTSI 主视图
// Personal Travel Suitability Index

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Thermometer, Sun, Heart, Users, TrendingUp, Clock } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { calcPTSI, calcPTSIHourly, getUVByHour, calcPTSIForSpots } from '@/lib/ptsi-calculator';
import type { PTSIResult } from '@/lib/spot-data';

/* ═══ 身体条件选项 ═══ */
const CONDITIONS = [
  { id: 'knee', label: '膝盖不适', emoji: '🦵' },
  { id: 'heart', label: '心脏负担', emoji: '❤️' },
  { id: 'heat', label: '怕热中暑', emoji: '🌡️' },
];

/* ═══ 时段显示 ═══ */
const PERIOD_LABELS = ['凌晨', '清晨', '上午', '正午', '下午', '傍晚', '夜间'];

function getPeriodLabel(hour: number): string {
  if (hour < 5) return '凌晨';
  if (hour < 8) return '清晨';
  if (hour < 11) return '上午';
  if (hour < 13) return '正午';
  if (hour < 17) return '下午';
  if (hour < 19) return '傍晚';
  return '夜间';
}

/* ═══ 判定配色 ═══ */
const VERDICT_STYLE: Record<string, { bg: string; text: string; emoji: string }> = {
  go: { bg: 'bg-emerald-100', text: 'text-emerald-700', emoji: '✅' },
  caution: { bg: 'bg-amber-100', text: 'text-amber-700', emoji: '⚠️' },
  nogo: { bg: 'bg-red-100', text: 'text-red-700', emoji: '🚫' },
};

/* ═══ 当前时刻PTSI ═══ */
function CurrentPTSI({ conditions }: { conditions: string[] }) {
  const now = new Date();
  const hour = now.getHours();
  const uv = getUVByHour(hour);
  const ptsi = calcPTSI(uv, conditions, 0);
  const vs = VERDICT_STYLE[ptsi.verdict];

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
      <div className="text-xs text-gray-400 mb-1">
        <Clock className="w-3 h-3 inline mr-1" />
        当前 · {hour}:00 · {getPeriodLabel(hour)}
      </div>
      <div className="text-6xl font-black mb-2" style={{ color: ptsi.score >= 80 ? '#10B981' : ptsi.score >= 50 ? '#F59E0B' : '#EF4444' }}>
        {ptsi.score}
      </div>
      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${vs.bg} ${vs.text} mb-3`}>
        <span>{vs.emoji}</span>
        <span>{ptsi.verdict === 'go' ? '适宜出行' : ptsi.verdict === 'caution' ? '谨慎出行' : '不宜出行'}</span>
      </div>
      {ptsi.reasons.length > 0 && (
        <div className="text-xs text-gray-500 space-y-1">
          {ptsi.reasons.map((r, i) => <p key={i}>• {r}</p>)}
        </div>
      )}
    </div>
  );
}

/* ═══ 24小时PTSI曲线 ═══ */
function HourlyChart({ conditions }: { conditions: string[] }) {
  const data = useMemo(() => calcPTSIHourly(conditions), [conditions]);

  const W = 600, H = 200, PAD = { top: 20, right: 10, bottom: 30, left: 35 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
      {/* 阈值线 */}
      {[50, 80].map(v => {
        const y = PAD.top + plotH - (v / 100) * plotH;
        return (
          <g key={v}>
            <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#E5E7EB" strokeWidth="0.5" strokeDasharray="4 3" />
            <text x={PAD.left + plotW + 2} y={y + 3} fontSize="8" fill="#9CA3AF">{v}</text>
          </g>
        );
      })}

      {/* 时段色带 */}
      {[
        { start: 6, end: 8, color: '#FEF3C7' },
        { start: 11, end: 13, color: '#FED7AA' },
        { start: 17, end: 19, color: '#FFEDD5' },
      ].map(zone => {
        const x1 = PAD.left + (zone.start / 24) * plotW;
        const x2 = PAD.left + (zone.end / 24) * plotW;
        return (
          <rect key={zone.start} x={x1} y={PAD.top} width={x2 - x1} height={plotH} fill={zone.color} opacity="0.3" />
        );
      })}

      {/* 折线 */}
      <path d={data.map((d, i) => {
        const x = PAD.left + (d.hour / 24) * plotW;
        const y = PAD.top + plotH - (d.ptsi.score / 100) * plotH;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ')}
        fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* 数据点 */}
      {data.filter((_, i) => i % 2 === 0).map(d => {
        const x = PAD.left + (d.hour / 24) * plotW;
        const y = PAD.top + plotH - (d.ptsi.score / 100) * plotH;
        const color = d.ptsi.score >= 80 ? '#10B981' : d.ptsi.score >= 50 ? '#F59E0B' : '#EF4444';
        return (
          <circle key={d.hour} cx={x} cy={y} r={3} fill={color} stroke="white" strokeWidth={1.5} />
        );
      })}

      {/* X轴标签 */}
      {[0, 6, 12, 18, 24].map(h => {
        if (h === 24) return null;
        const x = PAD.left + (h / 24) * plotW;
        return (
          <text key={h} x={x} y={H - 6} textAnchor="middle" fontSize="8" fill="#9CA3AF">{h}:00</text>
        );
      })}

      {/* 轴标签 */}
      <text x={W / 2} y={H - 2} textAnchor="middle" fontSize="9" fill="#6B7280">时段</text>
      <text x={8} y={H / 2} textAnchor="middle" fontSize="9" fill="#6B7280"
        transform={`rotate(-90, 8, ${H / 2})`}>PTSI</text>
    </svg>
  );
}

/* ═══ 景点排行榜 ═══ */
function SpotRanking({ conditions }: { conditions: string[] }) {
  const { spots } = useAppStore();
  const ranking = useMemo(() => {
    const results = calcPTSIForSpots(spots, conditions);
    return results.sort((a, b) => b.ptsi.score - a.ptsi.score);
  }, [spots, conditions]);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-1.5 mb-4">
        <TrendingUp className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-700">景点适宜度排行</span>
      </div>
      <div className="space-y-2">
        {ranking.slice(0, 10).map((item, i) => {
          const vs = VERDICT_STYLE[item.ptsi.verdict];
          return (
            <div key={item.name} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50">
              <span className={`w-6 text-center font-bold text-sm ${i < 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </span>
              <span className="flex-1 text-sm text-gray-700 truncate">{item.name}</span>
              <div className="flex items-center gap-2">
                <motion.div
                  key={item.ptsi.score}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  className="text-sm font-bold"
                  style={{ color: item.ptsi.score >= 80 ? '#10B981' : item.ptsi.score >= 50 ? '#F59E0B' : '#EF4444' }}
                >
                  {item.ptsi.score}
                </motion.div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${vs.bg} ${vs.text}`}>
                  {vs.emoji}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PTSI 主页面
   ═══════════════════════════════════════════════════ */
export default function PTSIView() {
  const [conditions, setConditions] = useState<string[]>([]);

  const toggleCondition = useCallback((id: string) => {
    setConditions(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }, []);

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 py-6 pb-8">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg">
            <Thermometer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">PTSI 出行指数</h2>
            <p className="text-xs text-gray-500">Personal Travel Suitability Index · 综合紫外线、身体条件、拥挤度评分</p>
          </div>
        </div>

        {/* 身体条件 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Heart className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-semibold text-gray-700">你的身体条件</span>
            <span className="text-[10px] text-gray-400 ml-auto">选中的条件会降低 PTSI 分数</span>
          </div>
          <div className="flex gap-3">
            {CONDITIONS.map(c => (
              <button key={c.id}
                onClick={() => toggleCondition(c.id)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  conditions.includes(c.id)
                    ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 当前PTSI + 24h曲线 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div className="md:col-span-1">
            <CurrentPTSI conditions={conditions} />
          </div>
          <div className="md:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-1.5 mb-3">
              <Sun className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-700">PTSI 日变化曲线</span>
              <span className="text-[10px] text-gray-400 ml-auto">浅色区 = 清晨/正午/黄昏</span>
            </div>
            <HourlyChart conditions={conditions} />
          </div>
        </div>

        {/* 景点排行榜 */}
        <SpotRanking conditions={conditions} />
      </div>
    </div>
  );
}