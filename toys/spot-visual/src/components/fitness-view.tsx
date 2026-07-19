'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, animate } from 'framer-motion';
import { Users, Mountain, MapPin, Route, Armchair, ChevronUp, ChevronDown, X, Footprints, Activity } from 'lucide-react';
import { useRatchetDrag, useLongPressCharge, useCountUp, useAudioClick, vibrate } from '@/lib/motion-hooks';
import { useSharedMotionStore, HEAT_WARNING_WINDOW } from '@/lib/shared-motion-store';
import { PressureButton } from '@/components/shared/pressure-button';
import { calcStaminaBudget } from '@/lib/stamina-calculator';

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
   同行人头像组件 —— 弹簧依次弹入
   ═══════════════════════════════════════════════════ */
function CompanionAvatar({ label, mobility, onSelect, index = 0 }: {
  label: string; mobility: string | null; onSelect: () => void; index?: number;
}) {
  const option = MOBILITY_OPTIONS.find(o => o.id === mobility);
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        onClick={onSelect}
        initial={{ scale: 0, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 25, delay: index * 0.08 }}
        whileTap={{ scale: 0.92 }}
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
      </motion.button>
      {option && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, delay: index * 0.08 + 0.15 }}
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${option.tagColor}`}
        >
          {option.emoji} {option.tag}
        </motion.span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   底部动作栏（选择出行方式）—— 弹簧依次弹入
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
              {MOBILITY_OPTIONS.map((opt, i) => (
                <motion.button
                  key={opt.id}
                  onClick={() => { onSelect(opt.id); onClose(); vibrate(30); }}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28, delay: i * 0.08 }}
                  whileTap={{ scale: 0.96 }}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border-2 transition-all ${current === opt.id ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <span className="text-3xl">{opt.emoji}</span>
                  <span className="text-sm font-semibold text-gray-800">{opt.label}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${opt.tagColor}`}>{opt.tag}</span>
                </motion.button>
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
   翻转数字（老虎机式累加）—— 用于 3D 翻转背面数字炸裂
   ═══════════════════════════════════════════════════ */
function FlipNumber({ value, active }: { value: number; active: boolean }) {
  const display = useCountUp(value, active, 600);
  return <span className="font-black text-blue-600">{display}</span>;
}

/* ═══════════════════════════════════════════════════
   海拔折线图 + 红色游标 —— 磁吸探测、陡坡高频震、补给点气泡、低体力残影
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

  // 当前游标位置（受控）
  const cursorX = PAD + (cursorKm / totalKm) * (W - PAD * 2);

  // ── 插值海拔：根据 km 在两个数据点之间线性插值（连续平滑，不会跳跃）──
  const interpolateAlt = useCallback((km: number): number => {
    if (km <= ELEVATION_DATA[0].km) return ELEVATION_DATA[0].alt;
    if (km >= totalKm) return ELEVATION_DATA[ELEVATION_DATA.length - 1].alt;
    for (let i = 1; i < ELEVATION_DATA.length; i++) {
      if (ELEVATION_DATA[i].km >= km) {
        const prev = ELEVATION_DATA[i - 1];
        const t = (km - prev.km) / (ELEVATION_DATA[i].km - prev.km);
        return prev.alt + t * (ELEVATION_DATA[i].alt - prev.alt);
      }
    }
    return ELEVATION_DATA[ELEVATION_DATA.length - 1].alt;
  }, [totalKm]);

  // 根据 km 求曲线上的 y 坐标（用于游标圆点贴合曲线）
  const kmToY = useCallback((km: number): number => {
    const alt = interpolateAlt(km);
    return H - PAD - ((alt - minAlt) / range) * (H - PAD * 2);
  }, [interpolateAlt, minAlt, range]);

  const cursorAlt = interpolateAlt(cursorKm);

  // 计算体力数据
  // 已爬楼层：从起点海拔累计爬升（只计爬升，不计下降，下坡不算负数）
  let cumulativeClimb = 0;
  for (let i = 1; i < ELEVATION_DATA.length; i++) {
    if (ELEVATION_DATA[i].km > cursorKm) {
      const prev = ELEVATION_DATA[i - 1];
      const t = (cursorKm - prev.km) / (ELEVATION_DATA[i].km - prev.km);
      const altHere = prev.alt + t * (ELEVATION_DATA[i].alt - prev.alt);
      const delta = altHere - ELEVATION_DATA[i - 1].alt;
      if (delta > 0) cumulativeClimb += delta;
      break;
    }
    const delta = ELEVATION_DATA[i].alt - ELEVATION_DATA[i - 1].alt;
    if (delta > 0) cumulativeClimb += delta;
  }
  const climbedFloors = Math.max(0, Math.round(cumulativeClimb / 3.2)); // 1层 ≈ 3.2m，下坡不计入
  // 总爬升（全程累计正向爬升）
  let totalClimb = 0;
  for (let i = 1; i < ELEVATION_DATA.length; i++) {
    const d = ELEVATION_DATA[i].alt - ELEVATION_DATA[i - 1].alt;
    if (d > 0) totalClimb += d;
  }
  // 剩余体力 = 100 - 已累计爬升占比，严格夹在 [0, 100]
  const remaining = Math.max(0, Math.min(100, Math.round(100 - cumulativeClimb / Math.max(1, totalClimb) * 100)));
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

  // ──────────────────────────────────────────────
  // 平滑拖拽：用 MotionValue 直接驱动，松手 snap 回最近 km
  // ──────────────────────────────────────────────
  const dragX = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragKm, setDragKm] = useState(cursorKm);

  const pointerX = useMotionValue(0);

  const handleDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!svgRef.current) return;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    pointerX.set(clientX);
    dragX.set((cursorKm / totalKm) * (W - PAD * 2));
    setIsDragging(true);
    setDragKm(cursorKm);
  }, [cursorKm, totalKm]);

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const delta = clientX - pointerX.get();
    const newDragX = dragX.get() + delta;
    const clampedDragX = Math.max(0, Math.min(W - PAD * 2, newDragX));
    dragX.set(clampedDragX);
    const km = Math.round((clampedDragX / (W - PAD * 2)) * totalKm * 10) / 10;
    setDragKm(km);
    pointerX.set(clientX);
  }, [isDragging, totalKm]);

  const handleUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    // 松手 snap 到最近 0.1km
    const finalDragX = dragX.get();
    const snappedKm = Math.round((finalDragX / (W - PAD * 2)) * totalKm * 10) / 10;
    const clamped = Math.max(0, Math.min(totalKm, snappedKm));
    onCursorChange(clamped);
    // 用 spring 回弹到 snapped 位置（视觉反馈）
    animate(dragX, (clamped / totalKm) * (W - PAD * 2), { type: 'spring', stiffness: 400, damping: 30 });
  }, [isDragging, onCursorChange, totalKm]);

  // 触摸滑动时阻止浏览器默认行为（页面滚动 + 文本选择）
  // React 的 onTouchMove 是 passive 的，需用 addEventListener 显式 { passive: false }
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const preventTouchDefault = (e: TouchEvent) => {
      if (isDragging) e.preventDefault();
    };
    node.addEventListener('touchmove', preventTouchDefault, { passive: false });
    return () => node.removeEventListener('touchmove', preventTouchDefault);
  }, [isDragging]);

  // 陡坡段高频震动（节流 50ms）——使用受控 cursorKm
  const lastSteepVibrate = useRef(0);
  useEffect(() => {
    const now = performance.now();
    if (now - lastSteepVibrate.current < 50) return;
    const inSteep = steepSegments.some(s => cursorX >= s.x1 && cursorX <= s.x2);
    if (inSteep) {
      lastSteepVibrate.current = now;
      vibrate([8, 8, 8, 8, 8]);
    }
  }, [cursorX, steepSegments, cursorKm]);

  // 补给点检测：游标经过时放大 + 气泡
  const [activeSupply, setActiveSupply] = useState<string | null>(null);
  useEffect(() => {
    const supply = SUPPLY_POINTS.find(s => Math.abs(s.km - cursorKm) < 0.08);
    if (supply && activeSupply !== supply.name) {
      setActiveSupply(supply.name);
      const t = setTimeout(() => setActiveSupply(null), 2000);
      return () => clearTimeout(t);
    }
  }, [cursorKm, activeSupply]);

  // 低体力残影
  const showTrail = remaining < 30;

  // 跨页联动入场：热量预警触发时，体力消耗数值跳动 + 变淡红
  const { heatWarning, heatWarningPulseAt } = useSharedMotionStore();
  const heatActive = heatWarning && Date.now() - heatWarningPulseAt < HEAT_WARNING_WINDOW;
  const [heatPulseTriggered, setHeatPulseTriggered] = useState(false);

  useEffect(() => {
    if (heatActive && !heatPulseTriggered) {
      setHeatPulseTriggered(true);
      const t = setTimeout(() => setHeatPulseTriggered(false), 2000);
      return () => clearTimeout(t);
    }
  }, [heatActive, heatPulseTriggered]);

  // 实际渲染用的游标位置：拖拽时用 dragX 对应的 km，否则用受控 cursorKm
  const renderCursorKm = isDragging ? dragKm : cursorKm;
  const renderCursorX = PAD + (renderCursorKm / totalKm) * (W - PAD * 2);
  // 游标圆点 Y：始终用插值海拔计算，完全贴合曲线（不会跳跃）
  const renderCursorY = kmToY(renderCursorKm);

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'none' }}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
        onTouchStart={handleDown}
        onTouchMove={handleMove}
        onTouchEnd={handleUp}
      >
        {/* 背景网格 */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={PAD} y1={H - PAD - t * (H - PAD * 2)} x2={W - PAD} y2={H - PAD - t * (H - PAD * 2)}
            stroke="#E5E7EB" strokeWidth="0.5" />
        ))}
        {/* Y轴标签 —— pointer-events:none 不可被拖拽选中 */}
        {[0, 0.5, 1].map(t => (
          <text key={t} x={PAD - 6} y={H - PAD - t * (H - PAD * 2) + 4} textAnchor="end" fontSize="10" fill="#9CA3AF" style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {Math.round(minAlt + t * range)}m
          </text>
        ))}

        {/* 面积填充 */}
        <path d={`${pathD} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`}
          fill="url(#elevGrad)" opacity="0.3" />

        {/* 陡坡标记：直接叠在曲线段上（贴合 y，不在曲线下方留独立虚线） */}
        {!easyMode && steepSegments.map((seg, i) => {
          const startPt = points.find(p => Math.abs(p.x - seg.x1) < 0.5);
          const endPt = points.find(p => Math.abs(p.x - seg.x2) < 0.5);
          return (
            <line
              key={i}
              x1={seg.x1}
              y1={startPt ? startPt.y : 0}
              x2={seg.x2}
              y2={endPt ? endPt.y : 0}
              stroke="#EF4444"
              strokeWidth={lineWidth + 2}
              strokeDasharray="4 3"
              opacity="0.55"
              strokeLinecap="round"
            />
          );
        })}

        {/* 路线 —— strokeWidth 为 motion 值，支持“充气管道”动画 */}
        <motion.path
          d={pathD}
          fill="none"
          stroke={easyMode ? '#10B981' : '#3B82F6'}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ strokeWidth: lineWidth, strokeDasharray: lineWidth > 5 ? '12 6' : undefined }}
        />

        {/* 补给点标记 —— pointer-events:none 避免拖动时被选中 */}
        {SUPPLY_POINTS.map((sp) => {
          const x = PAD + (sp.km / totalKm) * (W - PAD * 2);
          const pt = points.find(p => Math.abs(p.km - sp.km) < 0.05);
          const y = pt ? pt.y : H - PAD;
          const isActive = activeSupply === sp.name;
          return (
            <g key={sp.name} style={{ pointerEvents: 'none' }}>
              <motion.circle
                cx={x}
                cy={y}
                r={6}
                fill="white"
                stroke={sp.type === 'supply' ? '#F59E0B' : sp.type === 'entrance' ? '#22C55E' : sp.type === 'exit' ? '#EF4444' : '#6B7280'}
                strokeWidth={2}
                animate={{ scale: isActive ? 1.5 : 1 }}
                transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              />
              <text x={x} y={y + 3} textAnchor="middle" fontSize="7" fill="#374151" fontWeight="bold" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {sp.hasToilet ? '🚻' : sp.type === 'supply' ? '补给' : ''}
              </text>
            </g>
          );
        })}

        {/* 低体力残影：5 个延迟递减的圆点 */}
        {showTrail && Array.from({ length: 5 }).map((_, i) => {
          const trailIdx = Math.max(0, points.findIndex(p => p.x <= renderCursorX) - i * 2);
          const trailPt = points[trailIdx] || points[0];
          return (
            <motion.circle
              key={i}
              cx={trailPt.x}
              cy={trailPt.y}
              r={7 - i}
              fill="#EF4444"
              opacity={0.5 - i * 0.08}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 - i * 0.08 }}
              transition={{ delay: i * 0.04 }}
            />
          );
        })}

        {/* 红色游标 */}
        <line x1={renderCursorX} y1={PAD - 5} x2={renderCursorX} y2={H - PAD} stroke="#EF4444" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
        {/* 脉动游标：用两个交替的 spring 动画模拟 1→1.15→1，spring 只支持两帧 */}
        {activeSupply ? (
          <motion.circle
            cx={renderCursorX}
            cy={renderCursorY}
            r={7}
            fill="#EF4444"
            stroke="white"
            strokeWidth={2.5}
            animate={{ scale: 1.5 }}
            transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          />
        ) : (
          <>
            <motion.circle
              cx={renderCursorX}
              cy={renderCursorY}
              r={7}
              fill="#EF4444"
              stroke="white"
              strokeWidth={2.5}
              animate={{ scale: [1, 1.15] }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 20,
                duration: 0.75,
                repeat: Infinity,
                repeatDelay: 0.75,
              }}
            />
            <motion.circle
              cx={renderCursorX}
              cy={renderCursorY}
              r={7}
              fill="#EF4444"
              stroke="white"
              strokeWidth={2.5}
              animate={{ scale: [1.15, 1] }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 20,
                duration: 0.75,
                delay: 0.75,
                repeat: Infinity,
                repeatDelay: 0.75,
              }}
            />
          </>
        )}

        {/* 补给点微型气泡 */}
        {activeSupply && (
          <motion.g
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 25 }}
          >
            <rect
              x={renderCursorX - 50}
              y={PAD - 30}
              width={100}
              height={24}
              rx={12}
              fill="#1F2937"
              opacity="0.9"
            />
            <text x={renderCursorX} y={PAD - 13} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {activeSupply}
            </text>
          </motion.g>
        )}

        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={easyMode ? '#10B981' : '#3B82F6'} stopOpacity="0.4" />
            <stop offset="100%" stopColor={easyMode ? '#10B981' : '#3B82F6'} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* 底部数据卡片 —— select-none 防止拖拽时选中文字 */}
      <div className="grid grid-cols-3 gap-3 mt-4 select-none">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <motion.div
            key={climbedFloors}
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
            className="text-[28px] font-black text-orange-500 leading-none"
          >
            {climbedFloors}
          </motion.div>
          <div className="text-[11px] text-gray-500 mt-1 font-medium">已爬 (层楼)</div>
        </div>
        <motion.div
          key={`${remaining}-${heatActive}`}
          className="bg-white rounded-xl border border-gray-200 p-3 text-center"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500 }}
            className={`text-[28px] font-black leading-none ${heatActive ? 'text-red-300 animate-pulse' : remaining < 30 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`}
          >
            {remaining}%
          </motion.div>
          <div className="text-[11px] text-gray-500 mt-1 font-medium">
            {heatActive ? '高温预警' : '剩余体力'}
          </div>
        </motion.div>
        <div className={`bg-white rounded-xl border p-3 text-center ${Number(distToSupply) > 500 ? 'border-red-200 animate-pulse' : 'border-gray-200'}`}>
          <div className={`text-[28px] font-black leading-none ${Number(distToSupply) > 500 ? 'text-red-500' : 'text-blue-500'}`}>{distToSupply}</div>
          <div className="text-[11px] text-gray-500 mt-1 font-medium">下个补给 (米)</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   3D 翻转容器 —— rotateY + 数字炸裂 + 金属咔嗒声
   ═══════════════════════════════════════════════════ */
function FlipView({ front, back, flipped }: { front: React.ReactNode; back: React.ReactNode; flipped: boolean }) {
  const { playClick } = useAudioClick();
  const flipProgress = useMotionValue(0);

  // 翻转进度 0→1，背面显示时触发数字累加
  useEffect(() => {
    animate(flipProgress, flipped ? 1 : 0, {
      duration: 0.8,
      ease: [0.4, 0, 0.2, 1],
      onUpdate: (v) => {
        // 90° 过半时触发咔嗒声
        if (!flipped && v > 0.5) {
          playClick();
        }
      },
    });
  }, [flipped, flipProgress, playClick]);

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
   紧急按钮 —— 累了卡片弧线上甩 + SOS 长按描边生长 + 边缘红光晕
   ═══════════════════════════════════════════════════ */
function EmergencyButton() {
  const [showOptions, setShowOptions] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [sosActive, setSosActive] = useState(false);
  const setSosStore = useSharedMotionStore((s) => s.setSosActive);
  const btnRef = useRef<HTMLButtonElement>(null);

  // 单击"累了"：从按钮位置弧线甩出卡片
  const handleClick = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const originY = rect.bottom - window.innerHeight; // 相对视口底部
    setShowOptions(true);
    // 触发弹窗入场动画（由 motion.div initial 处理）
  }, []);

  // 长按 1.5s 触发 SOS
  const onSosComplete = useCallback(() => {
    setSosActive(true);
    setSosStore(true);
    setShowOptions(false);
    // 触发边缘红光晕（通过 sosActive 控制）
  }, [setSosStore]);

  const { progress, holding, broken, start, cancel } = useLongPressCharge(1500, onSosComplete, () => {
    setSosActive(false);
    setSosStore(false);
  });

  // 监听 broken/holding 变化
  useEffect(() => {
    if (!holding && progress > 0 && progress < 1) {
      // 中途松手取消
    }
  }, [holding, progress]);

  useEffect(() => {
    if (sosActive) {
      // SOS 期间屏幕边缘红光晕
      // 箭头描边生长在路线上（由父级地图渲染，这里只做全局状态）
      const t = setTimeout(() => {
        setSosActive(false);
        setSosStore(false);
      }, 10000);
      return () => clearTimeout(t);
    }
  }, [sosActive, setSosStore]);

  // 单击弹出卡片：用 motion.div 布局动画，从按钮位置甩出
  const optionsContent = useMemo(() => (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, rotate: -5 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, y: 20, rotate: 3 }}
      transition={{ type: 'spring', damping: 15, stiffness: 200 }}
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
  ), []);

  return (
    <>
      {/* 屏幕边缘红光晕 */}
      <AnimatePresence>
        {sosActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="fixed inset-0 pointer-events-none z-40"
            style={{ boxShadow: 'inset 0 0 100px 50px rgba(239,68,68,0.4)' }}
          />
        )}
      </AnimatePresence>

      {/* 紧急按钮 - 底部常驻 + PressureButton 重按压感 */}
      <PressureButton
        ref={btnRef}
        maxDepth={8}
        onClick={handleClick}
        className="w-full py-5 bg-gradient-to-r from-red-500 to-red-600 text-white text-xl font-bold rounded-2xl shadow-lg flex items-center justify-center"
        style={{ minHeight: '8vh' }}
      >
        我现在累了
      </PressureButton>

      {/* SOS 充能进度环（长按时显示在按钮上方） */}
      {holding && progress < 1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-36 left-1/2 -translate-x-1/2 z-50"
        >
          <svg width={80} height={80} viewBox="0 0 80 80" className="-rotate-90">
            <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="6" />
            <motion.circle
              cx="40"
              cy="40"
              r="35"
              fill="none"
              stroke="white"
              strokeWidth="6"
              strokeLinecap="round"
              style={{ strokeDasharray: 220 }}
              initial={{ strokeDashoffset: 220 }}
              animate={{ strokeDashoffset: 220 - progress * 220 }}
              transition={{ duration: 0.01 }}
            />
          </svg>
          <p className="text-center text-white text-xs mt-1">松手取消 · 1.5s触发SOS</p>
        </motion.div>
      )}

      {/* 选项弹窗：从按钮位置弧线甩出 */}
      <AnimatePresence>
        {showOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-6"
            onClick={() => setShowOptions(false)}
          >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            {optionsContent}
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
            className="fixed bottom-40 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl whitespace-nowrap"
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

  // ═══ D1.5：体力预算（从同行人模式推断身体红灯） ═══
  // 轮椅出行 = 膝盖不适；需要搀扶 = 心脏负担；两者都激活 = +怕热中暑
  const staminaConditions = useMemo(() => {
    const conds: string[] = [];
    const ids = Object.values(companions).filter(Boolean) as string[];
    if (ids.includes('wheelchair')) conds.push('knee');
    if (ids.includes('assist')) conds.push('heart');
    if (conds.length >= 2) conds.push('heat');
    return conds;
  }, [companions]);
  const staminaBudget = useMemo(() => calcStaminaBudget(staminaConditions), [staminaConditions]);

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
            {Object.entries(companions).map(([name, mobility], idx) => (
              <CompanionAvatar
                key={name}
                label={name}
                mobility={mobility}
                onSelect={() => setSheetTarget(name)}
                index={idx}
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
                              animate={{ scale: [1, 1.15] }}
                              transition={{ type: 'spring', stiffness: 300, damping: 20, duration: 1, repeat: Infinity, repeatDelay: 1 }}
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
                            <span className="flex items-center gap-1"><Route className="w-3 h-3" /> <FlipNumber value={seg.dist} active={!easyMode} />km</span>
                            <span className="flex items-center gap-1"><Mountain className="w-3 h-3" /> {seg.climb > 0 ? '+' : ''}<FlipNumber value={seg.climb} active={!easyMode} />m</span>
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

        {/* ═══ D1.5：体力预算卡片（复用 stamina-calculator） ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-white rounded-2xl border p-4 mb-4 ${staminaBudget < 50 ? 'border-red-200 bg-red-50/40' : 'border-gray-100'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Activity className={`w-4 h-4 ${staminaBudget < 50 ? 'text-red-500' : 'text-emerald-500'}`} />
              <span className="text-sm font-semibold text-gray-700">体力预算评估</span>
              <span className="text-[10px] text-gray-400 ml-1">基于同行人状态推断</span>
            </div>
            <motion.span
              key={staminaBudget}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              className={`text-2xl font-black ${staminaBudget < 50 ? 'text-red-500' : 'text-emerald-600'}`}
            >
              {staminaBudget}<span className="text-xs text-gray-400">/100</span>
            </motion.span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${staminaBudget}%` }}
              transition={{ duration: 0.5 }}
              className={`h-full rounded-full ${staminaBudget < 50 ? 'bg-red-400' : 'bg-emerald-400'}`}
            />
          </div>
          {staminaConditions.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {staminaConditions.map(c => (
                <span key={c} className="text-[10px] text-gray-500 px-1.5 py-0.5 bg-gray-100 rounded-full">
                  {c === 'knee' ? '🦵 膝盖' : c === 'heart' ? '❤️ 心脏' : '🌡️ 中暑'}
                </span>
              ))}
            </div>
          )}
        </motion.div>

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