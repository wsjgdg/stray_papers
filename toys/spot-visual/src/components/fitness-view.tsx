'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Mountain, MapPin, Route, Armchair, ChevronUp, ChevronDown, X, Footprints } from 'lucide-react';

/* ═══ 工具函数 ═══ */
const vibrate = (pattern: number | number[]) => {
  try { navigator.vibrate?.(pattern); } catch { /* iOS 不支持 */ }
};

/* ═══ 海拔数据（模拟全程路线） ═══ */
const ELEVATION_DATA = [
  { km: 0, alt: 420, type: 'flat' as const },
  { km: 0.3, alt: 435, type: 'up' as const },
  { km: 0.6, alt: 480, type: 'up' as const },
  { km: 0.9, alt: 520, type: 'up' as const },
  { km: 1.2, alt: 510, type: 'down' as const },
  { km: 1.5, alt: 470, type: 'down' as const },
  { km: 1.8, alt: 500, type: 'up' as const },
  { km: 2.1, alt: 560, type: 'up' as const },
  { km: 2.4, alt: 620, type: 'up' as const },
  { km: 2.7, alt: 610, type: 'down' as const },
  { km: 3.0, alt: 580, type: 'flat' as const },
  { km: 3.3, alt: 600, type: 'up' as const },
  { km: 3.6, alt: 680, type: 'up' as const },
  { km: 3.9, alt: 720, type: 'up' as const },
  { km: 4.2, alt: 690, type: 'down' as const },
  { km: 4.5, alt: 630, type: 'down' as const },
  { km: 4.8, alt: 580, type: 'down' as const },
  { km: 5.0, alt: 550, type: 'down' as const },
  { km: 5.3, alt: 500, type: 'down' as const },
  { km: 5.5, alt: 460, type: 'down' as const },
];

/* ═══ 补给点数据 ═══ */
const SUPPLY_POINTS = [
  { km: 0, name: '入口', type: 'entrance' as const },
  { km: 1.2, name: '休息亭A', type: 'rest' as const, hasToilet: true, chairs: 6, noise: 42 },
  { km: 2.4, name: '观景台', type: 'rest' as const, hasToilet: true, chairs: 4, noise: 55 },
  { km: 3.6, name: '半山服务站', type: 'supply' as const, hasToilet: true, chairs: 12, noise: 68 },
  { km: 4.8, name: '休息亭B', type: 'rest' as const, hasToilet: false, chairs: 3, noise: 75 },
  { km: 5.5, name: '出口', type: 'exit' as const },
];

/* ═══ 体力模式选项 ═══ */
const MOBILITY_OPTIONS = [
  { id: 'active', label: '腿脚灵便', emoji: '🚶', tag: '灵活', tagColor: 'bg-green-100 text-green-700', lineW: 3 },
  { id: 'assist', label: '需要搀扶', emoji: '🧑‍🤝‍🧑', tag: '慢行', tagColor: 'bg-amber-100 text-amber-700', lineW: 5 },
  { id: 'wheelchair', label: '轮椅出行', emoji: '♿', tag: '轮椅', tagColor: 'bg-red-100 text-red-700', lineW: 7 },
];

/* ═══ 分段休息数据 ═══ */
const SEGMENTS = [
  { name: '入口→休息亭A', dist: 1.2, climb: 100, difficulty: '⭐⭐' },
  { name: '休息亭A→观景台', dist: 1.2, climb: 150, difficulty: '⭐⭐⭐' },
  { name: '观景台→半山站', dist: 1.2, climb: 160, difficulty: '⭐⭐⭐⭐' },
  { name: '半山站→休息亭B', dist: 1.2, climb: -90, difficulty: '⭐⭐' },
  { name: '休息亭B→出口', dist: 0.7, climb: -120, difficulty: '⭐' },
];

/* ═══════════════════════════════════════════════════
   同行人头像组件
   ═══════════════════════════════════════════════════ */
function CompanionAvatar({ label, mobility, onSelect }: {
  label: string; mobility: string | null; onSelect: () => void;
}) {
  const option = MOBILITY_OPTIONS.find(o => o.id === mobility);
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onSelect}
        className="relative w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden hover:border-emerald-400 transition-colors"
      >
        {option ? (
          <>
            <span className="text-3xl">{option.emoji}</span>
            <div className="absolute bottom-0 inset-x-0 h-6 bg-black/40 flex items-end justify-center pb-0.5">
              <span className="text-white text-[9px] font-bold">{label}</span>
            </div>
          </>
        ) : (
          <>
            <Users className="w-6 h-6 text-gray-400" />
            <span className="absolute bottom-0 inset-x-0 h-5 bg-gray-200 flex items-center justify-center">
              <span className="text-[9px] font-bold text-gray-500">{label}</span>
            </span>
          </>
        )}
      </button>
      {option && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${option.tagColor}`}
        >
          {option.emoji} {option.tag}
        </motion.span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   底部动作栏（选择出行方式）
   ═══════════════════════════════════════════════════ */
function MobilitySheet({ open, onClose, onSelect, current }: {
  open: boolean; onClose: () => void; onSelect: (id: string) => void; current: string | null;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <motion.div
            initial={{ y: 300 }}
            animate={{ y: 0 }}
            exit={{ y: 300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl p-6 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
            <h3 className="text-base font-bold text-gray-900 mb-4">选择出行方式</h3>
            <div className="space-y-2">
              {MOBILITY_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { onSelect(opt.id); onClose(); vibrate(30); }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 transition-all ${current === opt.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  <span className="text-sm font-semibold text-gray-800">{opt.label}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${opt.tagColor}`}>{opt.tag}</span>
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════
   海拔折线图 + 红色游标
   ═══════════════════════════════════════════════════ */
function ElevationChart({
  cursorKm, onCursorChange, lineWidth, easyMode,
}: {
  cursorKm: number; onCursorChange: (km: number) => void; lineWidth: number; easyMode: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 700, H = 200, PAD = 40;

  const alts = ELEVATION_DATA.map(d => d.alt);
  const maxAlt = Math.max(...alts);
  const minAlt = Math.min(...alts);
  const range = maxAlt - minAlt || 1;
  const totalKm = ELEVATION_DATA[ELEVATION_DATA.length - 1].km;

  const points = ELEVATION_DATA.map((d, i) => {
    const x = PAD + (d.km / totalKm) * (W - PAD * 2);
    const y = H - PAD - ((d.alt - minAlt) / range) * (H - PAD * 2);
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // 当前游标位置
  const cursorX = PAD + (cursorKm / totalKm) * (W - PAD * 2);
  // 插值海拔
  let cursorAlt = alts[0];
  for (let i = 1; i < ELEVATION_DATA.length; i++) {
    if (ELEVATION_DATA[i].km >= cursorKm) {
      const prev = ELEVATION_DATA[i - 1];
      const t = (cursorKm - prev.km) / (ELEVATION_DATA[i].km - prev.km);
      cursorAlt = Math.round(prev.alt + t * (ELEVATION_DATA[i].alt - prev.alt));
      break;
    }
    cursorAlt = ELEVATION_DATA[i].alt;
  }

  // 计算体力数据
  const climbedFloors = Math.round(((cursorAlt - 420) / 3.2)); // 1层 ≈ 3.2m
  const totalClimb = maxAlt - 420;
  const remaining = Math.max(0, Math.round(100 - (cursorAlt - 420) / totalClimb * 100));
  const nextSupply = SUPPLY_POINTS.find(s => s.km > cursorKm);
  const distToSupply = nextSupply ? ((nextSupply.km - cursorKm) * 1000).toFixed(0) : '0';

  // 坡度 > 10° 标记
  const steepSegments: { x1: number; x2: number }[] = [];
  for (let i = 1; i < ELEVATION_DATA.length; i++) {
    const dx = ELEVATION_DATA[i].km - ELEVATION_DATA[i - 1].km;
    const dy = ELEVATION_DATA[i].alt - ELEVATION_DATA[i - 1].alt;
    const angle = Math.atan2(dy, dx * 1000) * (180 / Math.PI);
    if (Math.abs(angle) > 10) {
      steepSegments.push({ x1: points[i - 1].x, x2: points[i].x });
    }
  }

  const handleInteraction = (clientX: number) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * W;
    const km = Math.max(0, Math.min(totalKm, ((x - PAD) / (W - PAD * 2)) * totalKm));
    onCursorChange(Math.round(km * 10) / 10);
  };

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={(e) => handleInteraction(e.clientX)}
        onTouchMove={(e) => handleInteraction(e.touches[0].clientX)}
        onClick={(e) => handleInteraction(e.clientX)}
      >
        {/* 背景网格 */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={PAD} y1={H - PAD - t * (H - PAD * 2)} x2={W - PAD} y2={H - PAD - t * (H - PAD * 2)}
            stroke="#E5E7EB" strokeWidth="0.5" />
        ))}
        {/* Y轴标签 */}
        {[0, 0.5, 1].map(t => (
          <text key={t} x={PAD - 6} y={H - PAD - t * (H - PAD * 2) + 4} textAnchor="end" fontSize="10" fill="#9CA3AF">
            {Math.round(minAlt + t * range)}m
          </text>
        ))}

        {/* 面积填充 */}
        <path d={`${pathD} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`}
          fill="url(#elevGrad)" opacity="0.3" />

        {/* 陡坡标记 */}
        {!easyMode && steepSegments.map((seg, i) => (
          <line key={i} x1={seg.x1} y1={H - PAD - 20} x2={seg.x2} y2={H - PAD - 20}
            stroke="#EF4444" strokeWidth="2" strokeDasharray="6 4" opacity="0.7" />
        ))}

        {/* 路线 */}
        <path d={pathD} fill="none"
          stroke={easyMode ? '#10B981' : '#3B82F6'}
          strokeWidth={lineWidth}
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={lineWidth > 5 ? '12 6' : undefined}
        />

        {/* 补给点标记 */}
        {SUPPLY_POINTS.map((sp) => {
          const x = PAD + (sp.km / totalKm) * (W - PAD * 2);
          const pt = points.find(p => Math.abs(p.km - sp.km) < 0.05);
          const y = pt ? pt.y : H - PAD;
          return (
            <g key={sp.name}>
              <circle cx={x} cy={y} r="6" fill="white" stroke={sp.type === 'supply' ? '#F59E0B' : sp.type === 'entrance' ? '#22C55E' : sp.type === 'exit' ? '#EF4444' : '#6B7280'} strokeWidth="2" />
              <text x={x} y={y + 3} textAnchor="middle" fontSize="7" fill="#374151" fontWeight="bold">
                {sp.type === 'supply' ? '补给' : sp.type === 'toilet' ? 'WC' : ''}
              </text>
            </g>
          );
        })}

        {/* 红色游标 */}
        <line x1={cursorX} y1={PAD - 5} x2={cursorX} y2={H - PAD} stroke="#EF4444" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
        <circle cx={cursorX} cy={H - PAD - ((cursorAlt - minAlt) / range) * (H - PAD * 2)} r="7" fill="#EF4444" stroke="white" strokeWidth="2.5">
          <animate attributeName="r" values="7;9;7" dur="1.5s" repeatCount="indefinite" />
        </circle>

        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={easyMode ? '#10B981' : '#3B82F6'} stopOpacity="0.4" />
            <stop offset="100%" stopColor={easyMode ? '#10B981' : '#3B82F6'} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* 底部数据卡片 */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div className="text-[28px] font-black text-orange-500 leading-none">{climbedFloors}</div>
          <div className="text-[11px] text-gray-500 mt-1 font-medium">已爬 (层楼)</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <div className={`text-[28px] font-black leading-none ${remaining < 30 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}>{remaining}%</div>
          <div className="text-[11px] text-gray-500 mt-1 font-medium">剩余体力</div>
        </div>
        <div className={`bg-white rounded-xl border p-3 text-center ${Number(distToSupply) > 500 ? 'border-red-200 animate-pulse' : 'border-gray-200'}`}>
          <div className={`text-[28px] font-black leading-none ${Number(distToSupply) > 500 ? 'text-red-500' : 'text-blue-500'}`}>{distToSupply}</div>
          <div className="text-[11px] text-gray-500 mt-1 font-medium">下个补给 (米)</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   3D 翻转容器
   ═══════════════════════════════════════════════════ */
function FlipView({ front, back, flipped }: { front: React.ReactNode; back: React.ReactNode; flipped: boolean }) {
  return (
    <div className="relative" style={{ perspective: 1200 }}>
      <motion.div
        className="relative"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div style={{ backfaceVisibility: 'hidden' }}>{front}</div>
        <div className="absolute inset-0 overflow-y-auto" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>{back}</div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   紧急按钮
   ═══════════════════════════════════════════════════ */
function EmergencyButton() {
  const [showOptions, setShowOptions] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <>
      {/* 紧急按钮 - 底部常驻 */}
      <button
        onClick={() => setShowOptions(true)}
        className="w-full py-5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xl font-bold rounded-2xl shadow-lg active:scale-[0.98] transition-transform flex items-center justify-center"
        style={{ minHeight: '8vh' }}
      >
        我现在累了
      </button>

      {/* 选项弹窗 */}
      <AnimatePresence>
        {showOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            onClick={() => setShowOptions(false)}
          >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="relative w-full max-w-sm space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setShowOptions(false);
                  setFeedback('🚐 电瓶车呼叫中，请稍候…');
                  vibrate(30);
                  setTimeout(() => setFeedback(null), 3000);
                }}
                className="w-full py-8 bg-emerald-500 text-white rounded-2xl text-xl font-bold shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
              >
                🚐 叫电瓶车
              </button>
              <button
                onClick={() => {
                  setShowOptions(false);
                  setFeedback('🚶 已规划最近出口路线，请沿指示行走');
                  vibrate(30);
                  setTimeout(() => setFeedback(null), 3000);
                }}
                className="w-full py-8 bg-blue-500 text-white rounded-2xl text-xl font-bold shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
              >
                🚶 去出口
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 操作反馈提示 */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl whitespace-nowrap"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════════════════════════════
   体力账本主页面
   ═══════════════════════════════════════════════════ */
export default function FitnessView() {
  const [companions, setCompanions] = useState<{ '我': string | null; '我的老伴': string | null }>({ '我': null, '我的老伴': null });
  const [sheetTarget, setSheetTarget] = useState<string | null>(null);
  const [cursorKm, setCursorKm] = useState(0);
  const [easyMode, setEasyMode] = useState(false);
  const [flipped, setFlipped] = useState(false);

  // 根据同行人中最"受限"的模式决定路线样式
  const effectiveMobility = useMemo(() => {
    const ids = Object.values(companions).filter(Boolean) as string[];
    if (ids.includes('wheelchair')) return 'wheelchair';
    if (ids.includes('assist')) return 'assist';
    if (ids.length > 0) return 'active';
    return 'active';
  }, [companions]);

  const lineConfig = MOBILITY_OPTIONS.find(o => o.id === effectiveMobility) || MOBILITY_OPTIONS[0];

  // 平路/下坡占比（轻松模式）
  const totalSegs = ELEVATION_DATA.length - 1;
  const flatSegs = ELEVATION_DATA.filter(d => d.type === 'flat').length;
  const downSegs = ELEVATION_DATA.filter(d => d.type === 'down').length;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">
        {/* ═══ 标题 ═══ */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg">
            <Mountain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">体力账本</h2>
            <p className="text-xs text-gray-500">智能评估行程体力消耗，规划最优路线</p>
          </div>
        </div>

        {/* ═══ 同行人录入 ═══ */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-5">
          <div className="flex items-center gap-1.5 mb-4">
            <Users className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">同行人</span>
          </div>
          <div className="flex justify-center gap-10">
            {Object.entries(companions).map(([name, mobility]) => (
              <CompanionAvatar
                key={name}
                label={name}
                mobility={mobility}
                onSelect={() => setSheetTarget(name)}
              />
            ))}
          </div>
        </div>

        {/* ═══ 视图切换标签（3D翻转触发） ═══ */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={() => setFlipped(false)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${!flipped ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-100 text-gray-500'}`}
          >
            🗺️ 全程路线
          </button>
          <button
            onClick={() => { setFlipped(true); vibrate(30); }}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${flipped ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-100 text-gray-500'}`}
          >
            🪑 分段休息
          </button>
        </div>

        {/* ═══ 主内容区（3D翻转） ═══ */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-5">
          {/* 缓震路线切换 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">疲劳度</span>
            <div className="flex flex-col items-center gap-0.5">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { setEasyMode(true); vibrate(30); }}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${easyMode ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}
              >
                <ChevronUp className="w-5 h-5" />
              </motion.button>
              <span className="text-[9px] text-gray-400">省力</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { setEasyMode(false); vibrate(30); }}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${!easyMode ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
              >
                <ChevronDown className="w-5 h-5" />
              </motion.button>
              <span className="text-[9px] text-gray-400">标准</span>
            </div>
            {easyMode && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full"
              >
                轻松模式
              </motion.span>
            )}
          </div>

          <FlipView
            flipped={flipped}
            front={
              <ElevationChart
                cursorKm={cursorKm}
                onCursorChange={setCursorKm}
                lineWidth={lineConfig.lineW}
                easyMode={easyMode}
              />
            }
            back={
              <div className="space-y-3 py-4">
                {easyMode ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-black text-green-600">{Math.round(flatSegs / totalSegs * 100)}%</div>
                        <div className="text-xs text-gray-500 mt-1 font-medium">平路占比</div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-4 text-center">
                        <div className="text-3xl font-black text-blue-600">{Math.round(downSegs / totalSegs * 100)}%</div>
                        <div className="text-xs text-gray-500 mt-1 font-medium">下坡占比</div>
                      </div>
                    </div>
                    <div className="text-center text-sm text-gray-400 mt-4">轻松模式已隐藏上坡数据</div>

                    {/* 休息椅标注 */}
                    <div className="mt-4">
                      <div className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                        <Armchair className="w-4 h-4" /> 沿途休息点
                      </div>
                      <div className="space-y-2">
                        {SUPPLY_POINTS.filter(s => s.type === 'rest' || s.type === 'supply').map(sp => (
                          <div key={sp.name} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                            <motion.div
                              animate={{ scale: [1, 1.15, 1] }}
                              transition={{ duration: 2, repeat: Infinity }}
                              className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"
                            >
                              <Armchair className="w-4 h-4 text-emerald-600" />
                            </motion.div>
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-800">{sp.name}</div>
                              <div className="text-xs text-gray-400">
                                {sp.km}km · {sp.chairs}个座位 · {sp.noise}dB{sp.hasToilet ? ' · 🚻' : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2.5">
                    {SEGMENTS.map((seg, i) => {
                      const pct = (seg.dist / 5.5 * 100).toFixed(0);
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="bg-gray-50 rounded-xl p-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-gray-800">{seg.name}</span>
                            <span className="text-xs text-gray-400">{seg.difficulty}</span>
                          </div>
                          <div className="flex gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><Route className="w-3 h-3" /> {seg.dist}km</span>
                            <span className="flex items-center gap-1"><Mountain className="w-3 h-3" /> {seg.climb > 0 ? '+' : ''}{seg.climb}m</span>
                          </div>
                          <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, delay: i * 0.1 }}
                              className={`h-full rounded-full ${seg.climb > 150 ? 'bg-red-400' : seg.climb > 100 ? 'bg-amber-400' : 'bg-green-400'}`}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            }
          />
        </div>

        {/* ═══ 路线统计摘要 ═══ */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {[
            { label: '总路程', value: '5.5km', icon: Footprints, color: 'text-blue-600' },
            { label: '总爬升', value: '300m', icon: Mountain, color: 'text-orange-500' },
            { label: '预计用时', value: '2.5h', icon: Clock, color: 'text-purple-500' },
            { label: '补给点', value: '4个', icon: MapPin, color: 'text-emerald-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
              <stat.icon className={`w-4 h-4 ${stat.color} mx-auto mb-1`} />
              <div className={`text-base font-black ${stat.color}`}>{stat.value}</div>
              <div className="text-[10px] text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 紧急按钮 - 底部常驻 ═══ */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
        <EmergencyButton />
      </div>

      {/* 底部动作栏 */}
      <MobilitySheet
        open={!!sheetTarget}
        onClose={() => setSheetTarget(null)}
        onSelect={(id) => setCompanions(prev => ({ ...prev, [sheetTarget!]: id }))}
        current={sheetTarget ? companions[sheetTarget as keyof typeof companions] : null}
      />
    </div>
  );
}

// 需要的图标
function Clock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}