'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, animate } from 'framer-motion';
import { AlertTriangle, Sun, Heart, Footprints, ThermometerSun, Volume2, X, MapPin, Clock, ChevronDown } from 'lucide-react';
import { useRatchetDrag, useLongPressCharge, useSteadyShake, vibrate } from '@/lib/motion-hooks';
import { useSharedMotionStore } from '@/lib/shared-motion-store';
import { BreathRing } from '@/components/shared/breath-ring';
import { LiquidCharge } from '@/components/shared/liquid-charge';
import { PressureButton } from '@/components/shared/pressure-button';

/* ═══ 工具函数 ═══ */
// vibrate 已抽到 motion-hooks，这里保留 speak
const speak = (text: string) => {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.volume = 0.8; u.rate = 0.9;
      window.speechSynthesis.speak(u);
    }
  } catch { /* 静默 */ }
};

/* ═══ 时段数据 ═══ */
const TIME_PERIODS = [
  { label: '清晨', uv: 2, shadow: 68, bgFrom: '#EFF6FF', bgTo: '#DBEAFE', emoji: '🌅' },
  { label: '正午', uv: 11, shadow: 8, bgFrom: '#FFF7ED', bgTo: '#FDBA74', emoji: '☀️' },
  { label: '黄昏', uv: 4, shadow: 42, bgFrom: '#FEF3C7', bgTo: '#FDE68A', emoji: '🌇' },
];

/* ═══ 身体条件 ═══ */
const CONDITIONS = [
  { id: 'knee', label: '膝盖不适', icon: Footprints, color: 'from-red-400 to-red-600' },
  { id: 'heart', label: '心脏负担', icon: Heart, color: 'from-rose-400 to-rose-600' },
  { id: 'heat', label: '怕热中暑', icon: ThermometerSun, color: 'from-orange-400 to-orange-600' },
];

/* ═══ 劝退原因模板 ═══ */
const REASON_TEMPLATES = [
  { id: 'stairs', label: '台阶密集度', icon: '🪜', good: '全程平缓，台阶少于50级', bad: '共328级台阶，连续80级无扶手' },
  { id: 'sun', label: '暴晒路段', icon: '🔥', good: '树荫覆盖率85%，全程舒适', bad: '正午12-14点有600米全暴晒段' },
  { id: 'toilet', label: '卫生间间隔', icon: '🚻', good: '每300米一个卫生间', bad: '入口至第一个厕所1.2公里' },
  { id: 'slope', label: '坡度路面', icon: '⛰️', good: '柏油路为主，最大坡度6°', bad: '石板路+沙土路，最陡处15°' },
  { id: 'noise', label: '噪音休息区', icon: '🔇', good: '安静区域，45dB，休息椅充足', bad: '近游乐区持续75dB，长椅仅3个' },
  { id: 'exit', label: '急救出口', icon: '🚑', good: '出口200米，沿途有呼叫桩', bad: '最近出口800米，无紧急呼叫桩' },
];

/* ═══ 时间轴数据 ═══ */
const TIMELINE_DATA = [
  {
    time: '10:00 · 1小时前', queue: 15,
    photo: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900&h=600&fit=crop&q=80',
    reasons: [true, true, true, true, true, true],
  },
  {
    time: '11:00 · 刚才', queue: 45,
    photo: 'https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=900&h=600&fit=crop&q=80',
    reasons: [true, false, true, true, false, true],
  },
  {
    time: '12:00 · 现在', queue: 90,
    photo: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&h=600&fit=crop&q=80',
    reasons: [false, false, false, false, false, false],
  },
  {
    time: '13:00 · 1小时后', queue: 120,
    photo: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=900&h=600&fit=crop&q=80',
    reasons: [false, false, false, false, false, false],
  },
  {
    time: '14:00 · 2小时后', queue: 75,
    photo: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=900&h=600&fit=crop&q=80',
    reasons: [false, true, false, false, false, true],
  },
];

/* ═══════════════════════════════════════════════════
   拨盘组件 —— 磁吸棘轮感 + spring 回弹
   ═══════════════════════════════════════════════════ */
const SLOT_WIDTH = 160;

function Dial({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  // 棘轮拖动：motionX 跟手，跨 slot 边界触发短震，松手 spring 回弹到刻度
  const { motionX, handleStart, handleMove, handleEnd, snapTo } = useRatchetDrag(SLOT_WIDTH);

  // 松手：定位到最近 slot 并通知上层，让 spring 弹回
  const handleRelease = () => {
    const raw = handleEnd() ?? 0;
    let nearest = Math.round(raw / SLOT_WIDTH);
    nearest = Math.max(-1, Math.min(1, nearest));
    const newIndex = Math.max(0, Math.min(TIME_PERIODS.length - 1, value + nearest));
    // 让 spring 弹到目标 slot（含过冲回弹）
    snapTo(nearest);
    if (newIndex !== value) {
      onChange(newIndex);
      vibrate(50);
    } else {
      // 未切档，仍触发一次回弹震感
      vibrate(15);
    }
  };

  const period = TIME_PERIODS[value];

  return (
    <div
      className="relative select-none touch-none"
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleRelease}
      onMouseLeave={() => { /* 等同松手 */ handleRelease(); }}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={handleRelease}
    >
      {/* 指示三角 */}
      <div className="flex justify-center mb-1">
        <div className="w-0 h-0 border-l-[8px] border-r-[8px] border-t-[12px] border-l-transparent border-r-transparent border-t-gray-400" />
      </div>

      {/* 拨盘轨道 */}
      <div className="relative h-16 overflow-hidden flex items-center justify-center">
        <div className="absolute inset-x-0 top-0 bottom-0 bg-gradient-to-r from-white via-transparent to-white z-10 pointer-events-none" />
        {TIME_PERIODS.map((t, i) => {
          const isActive = i === value;
          // 每个时段的 x = (i-value)*SLOT + motionX（跟手偏移）
          const baseX = (i - value) * SLOT_WIDTH;
          return (
            <motion.div
              key={t.label}
              className={`absolute text-center ${isActive ? 'text-gray-900' : 'text-gray-400'}`}
              style={{ x: useTransform(motionX, (mv) => baseX + mv) }}
              animate={{ scale: isActive ? 1.15 : 0.85, opacity: isActive ? 1 : 0.4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <span className="text-2xl">{t.emoji}</span>
              <div className={`text-sm font-bold ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>{t.label}</div>
            </motion.div>
          );
        })}
      </div>

      {/* UV & 阴影数据 —— 切档时阶梯跳色：清晨→正午闪白再渐入橙红 */}
      <motion.div
        className="mt-4 flex justify-center gap-10"
        key={value}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="text-center">
          <div className="text-[36px] font-black leading-none" style={{ color: period.uv >= 8 ? '#DC2626' : period.uv >= 5 ? '#F59E0B' : '#16A34A' }}>
            {period.uv}
          </div>
          <div className="text-xs text-gray-500 mt-1 font-medium">紫外线强度</div>
        </div>
        <div className="text-center">
          <div className="text-[36px] font-black leading-none text-sky-600">{period.shadow}%</div>
          <div className="text-xs text-gray-500 mt-1 font-medium">阴影占比</div>
        </div>
      </motion.div>
    </div>
  );
}

// 阶梯跳色背景：清晨→正午闪白再渐入橙红，其它档位直接渐变
function DialBackground({ period, fromIdx, toIdx }: { period: typeof TIME_PERIODS[0]; fromIdx: number; toIdx: number }) {
  const isNoonFlash = fromIdx === 0 && toIdx === 1; // 清晨→正午
  if (isNoonFlash) {
    return (
      <motion.div
        key={toIdx}
        className="absolute inset-0"
        style={{ background: `linear-gradient(180deg, ${period.bgFrom} 0%, ${period.bgTo} 30%, #F9FAFB 100%)` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 1 }}
          animate={{ opacity: [1, 0.9, 0] }}
          transition={{ duration: 0.35, times: [0, 0.15, 1] }}
        />
      </motion.div>
    );
  }
  return (
    <motion.div
      key={toIdx}
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{ background: `linear-gradient(180deg, ${period.bgFrom} 0%, ${period.bgTo} 30%, #F9FAFB 100%)` }}
    />
  );
}

/* ═══════════════════════════════════════════════════
   身体条件圆钮 —— Z 轴下沉 + 果冻回弹 + 呼吸波环
   双击时记录按钮屏幕坐标，供弹窗撕裂展开
   ═══════════════════════════════════════════════════ */
function ConditionButton({ condition, active, onToggle, onDoubleClick }: {
  condition: typeof CONDITIONS[0]; active: boolean; onToggle: () => void; onDoubleClick: (origin: { x: number; y: number }) => void;
}) {
  const Icon = condition.icon;
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCount = useRef<number>(0);

  const handleClick = (e: React.MouseEvent) => {
    clickCount.current++;
    if (clickCount.current === 1) {
      const origin = { x: e.clientX, y: e.clientY };
      clickTimer.current = setTimeout(() => {
        if (clickCount.current === 1) onToggle();
        clickCount.current = 0;
      }, 280);
      // 暂存 origin 供可能的二次点击
      (handleClick as any)._lastOrigin = origin;
    } else {
      if (clickTimer.current !== null) clearTimeout(clickTimer.current);
      clickCount.current = 0;
      const origin = (handleClick as any)._lastOrigin || { x: 0, y: 0 };
      onDoubleClick(origin);
    }
  };

  return (
    <div style={{ perspective: 400 }}>
      <motion.button
        onClick={handleClick}
        whileTap={{ translateY: 4, scaleZ: 0.92 }}
        whileHover={{ scale: active ? 1.04 : 1.02 }}
        transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        style={{ transformStyle: 'preserve-3d' }}
        className={`relative w-20 h-20 rounded-full flex flex-col items-center justify-center gap-0.5 shadow-lg ${active ? `bg-gradient-to-br ${condition.color} text-white shadow-xl ring-4 ring-white/50` : 'bg-white text-gray-500 border-2 border-gray-200'}`}
      >
        <Icon className="w-6 h-6" />
        <span className="text-[10px] font-bold leading-tight">{condition.label}</span>
        {/* 呼吸波环：激活时 2 层错相扩散 */}
        {active && <BreathRing color="rgba(239,68,68,0.55)" layers={2} />}
      </motion.button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   翻车时间轴
   ═══════════════════════════════════════════════════ */
function TimelineCard({ item, index, activeConditions }: { item: typeof TIMELINE_DATA[0]; index: number; activeConditions: Set<string> }) {
  const [queueDisplay, setQueueDisplay] = useState(item.queue);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    setFlipping(true);
    const timer = setTimeout(() => {
      setQueueDisplay(item.queue);
      setFlipping(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [item.queue]);

  // 判断该时段是否"翻车"（有任一条件不通过）
  const hasFail = item.reasons.some(r => !r);

  return (
    <div className="snap-start h-[85vh] flex-shrink-0 flex flex-col px-4 py-3">
      {/* 时间标签 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-700">{item.time}</span>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${hasFail ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          {hasFail ? '⚠️ 建议避峰' : '✅ 适合游览'}
        </span>
      </div>

      {/* 巨幅照片 —— 翻页挤压：旧图 scaleY 压为 0 消失，新图从 0 拉伸复原 */}
      <div className="relative flex-1 rounded-2xl overflow-hidden shadow-xl">
        <AnimatePresence mode="popLayout">
          <motion.img
            key={item.photo}
            src={item.photo}
            alt={item.time}
            className="w-full h-full object-cover"
            loading="lazy"
            initial={{ scaleY: 0, transformOrigin: 'bottom' }}
            animate={{ scaleY: 1, transformOrigin: 'bottom' }}
            exit={{ scaleY: 0, transformOrigin: 'bottom' }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          />
        </AnimatePresence>
        {/* 红色蒙层（条件激活时） */}
        {activeConditions.size > 0 && (
          <div className="absolute inset-0 bg-gradient-to-t from-red-600/40 via-red-500/20 to-transparent pointer-events-none" />
        )}
        {/* 呼吸灯边框 */}
        {hasFail && (
          <div className="absolute inset-0 rounded-2xl border-2 border-red-400 pointer-events-none animate-pulse" />
        )}

        {/* 排队分钟数 - 右下角固定 */}
        <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-md rounded-xl px-4 py-2 text-center">
          <div className="text-[10px] text-gray-300 font-medium">排队等待</div>
          <div className="relative overflow-hidden h-10 flex items-center justify-center">
            <motion.span
              key={queueDisplay}
              className="text-white font-black text-3xl"
              initial={{ rotateX: 90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ duration: 0.4, type: 'spring' }}
            >
              {queueDisplay}
            </motion.span>
          </div>
          <div className="text-[10px] text-gray-400">分钟</div>
        </div>
      </div>

      {/* 劝退原因列表 */}
      <div className="mt-3 space-y-1.5 pb-4">
        {REASON_TEMPLATES.map((reason, ri) => {
          const pass = item.reasons[ri];
          // 根据激活条件高亮相关项
          const highlightKnee = activeConditions.has('knee') && reason.id === 'stairs';
          const highlightHeat = activeConditions.has('heat') && reason.id === 'sun';
          const highlightHeart = activeConditions.has('heart') && (reason.id === 'slope' || reason.id === 'stairs');
          const isHighlighted = highlightKnee || highlightHeat || highlightHeart;

          return (
            <div
              key={reason.id}
              className={`flex items-start gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200 ${isHighlighted ? 'bg-red-50 ring-2 ring-red-300' : 'bg-yellow-50'} ${pass ? '' : ''}`}
              style={{ fontSize: '16px' }}
            >
              <span className="text-xl leading-none mt-0.5 shrink-0">{reason.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900">{reason.label}</div>
                <div className={`text-xs mt-0.5 ${pass ? 'text-green-700' : 'text-red-700 font-semibold'}`}>
                  {pass ? reason.good : reason.bad}
                </div>
              </div>
              <span className="text-2xl leading-none shrink-0">{pass ? '✅' : '❌'}</span>
              <button
                onClick={() => speak(`${reason.label}：${pass ? reason.good : reason.bad}`)}
                className="shrink-0 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                title="语音播报"
              >
                <Volume2 className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   重锤惯性时间轴 —— drag y + 低 elastic + 松手位移放大 1.3 倍衰减
   ═══════════════════════════════════════════════════ */
function HeavyTimeline({
  count, activeConditions, onIndexChange,
}: {
  count: number;
  activeConditions: Set<string>;
  onIndexChange: (idx: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(0);
  const itemH = viewH; // 每张占满视口高度
  const y = useMotionValue(0);
  const lastIndex = useRef(0);

  useEffect(() => {
    if (!viewportRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setViewH(e.contentRect.height);
    });
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  const snapBack = useCallback(
    (from: number, targetIdx: number) => {
      const target = -targetIdx * itemH;
      // 松手放大 1.3 倍位移再回弹：先推到 from*1.3 处衰减
      const overshoot = from + (from - target) * 0.3;
      animate(y, [from, overshoot, target], {
        times: [0, 0.35, 1],
        duration: 0.7,
        ease: [0.2, 0.8, 0.2, 1],
      });
    },
    [itemH, y],
  );

  return (
    <div
      ref={viewportRef}
      className="relative rounded-2xl overflow-hidden select-none touch-none"
      style={{ height: 'calc(100vh - 60px)', maxHeight: '85vh' }}
    >
      <motion.div
        drag="y"
        dragConstraints={{ top: -(count - 1) * itemH, bottom: 0 }}
        dragElastic={0.2}
        dragMomentum
        style={{ y }}
        onDragEnd={() => {
          const cur = y.get();
          // 位移放大 1.3 倍后选最近刻度
          const amplified = cur * 1.3;
          let idx = Math.round(-amplified / itemH);
          idx = Math.max(0, Math.min(count - 1, idx));
          if (idx !== lastIndex.current) {
            lastIndex.current = idx;
            onIndexChange(idx);
          }
          snapBack(cur, idx);
        }}
        className="absolute inset-x-0 top-0"
      >
        {TIMELINE_DATA.map((item, i) => (
          <div key={i} style={{ height: itemH || '85vh' }}>
            <TimelineCard item={item} index={i} activeConditions={activeConditions} />
          </div>
        ))}
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   差评原文弹窗
   ═══════════════════════════════════════════════════ */
const BAD_REVIEWS: Record<string, { title: string; reviews: string[] }> = {
  knee: {
    title: '膝盖不适 · 差评原文',
    reviews: [
      '"台阶太多了，膝盖全程在抖，下山的时候简直要命"',
      '"连续80级台阶没有扶手，老人根本不敢走"',
      '"带了个护膝还是顶不住，回来疼了三天"',
      '"强烈建议膝盖不好的朋友别来，真的不是闹着玩的"',
    ],
  },
  heart: {
    title: '心脏负担 · 差评原文',
    reviews: [
      '"海拔爬升太快，心脏跳到180，吓得赶紧下山"',
      '"坡度太陡了，中间没有平缓休息段，一口气喘不上来"',
      '"有冠心病历史的千万别逞强，山上没有医疗点"',
    ],
  },
  heat: {
    title: '怕热中暑 · 差评原文',
    reviews: [
      '"中午12点到的，暴晒了40分钟差点中暑，全靠自带藿香正气水"',
      '"600米完全没有遮挡，地面温度估计有50度"',
      '"带了两瓶水根本不够喝，山上水卖15块一瓶"',
    ],
  },
};

function ReviewPopup({ conditionId, origin, onClose }: { conditionId: string; origin: { x: number; y: number }; onClose: () => void }) {
  const data = BAD_REVIEWS[conditionId];
  if (!data) return null;
  // 撕裂膨胀：从按钮位置 scale 0.2 + 圆角 9999 展开
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <motion.div
        layoutId={`popup-${conditionId}`}
        initial={{
          position: 'fixed',
          left: origin.x,
          top: origin.y,
          width: 40,
          height: 40,
          borderRadius: 9999,
          scale: 0.2,
          opacity: 0,
        }}
        animate={{
          left: 0,
          top: 'auto',
          bottom: 0,
          width: '100%',
          maxWidth: '32rem',
          height: 'auto',
          maxHeight: '70vh',
          borderRadius: 24,
          scale: 1,
          opacity: 1,
          x: 0,
          y: 0,
        }}
        exit={{ scale: 0.2, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 240 }}
        className="relative w-full max-w-lg bg-white/80 backdrop-blur-xl rounded-t-3xl shadow-2xl p-6 pb-10 max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 mb-4">{data.title}</h3>
        <div className="space-y-3">
          {data.reviews.map((r, i) => (
            <div key={i} className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-sm text-red-800 leading-relaxed">{r}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-yellow-500 text-xs">{'★'.repeat(1)}{'☆'.repeat(4)}</span>
                <span className="text-xs text-gray-400">匿名用户</span>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg hover:bg-gray-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   劝退结论悬浮球 —— 重按压 + 水波血条充能 + 失败飞溅抖动 + 联动写入
   ═══════════════════════════════════════════════════ */
function ConclusionButton({ timeIndex, activeConditions }: { timeIndex: number; activeConditions: Set<string> }) {
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<'go' | 'nogo'>('go');
  const [reasonText, setReasonText] = useState('');
  const setHeatWarning = useSharedMotionStore((s) => s.setHeatWarning);

  // ═══ 劝退评分（0-100，越高越不建议出行）═══
  const evaluate = useCallback(() => {
    const uv = TIME_PERIODS[timeIndex]?.uv ?? 0;
    const uvScore = uv >= 10 ? 50 : uv >= 5 ? 30 : uv >= 3 ? 10 : 0;
    const condScore = activeConditions.size * 20;
    const total = uvScore + condScore;

    const reasons: string[] = [];
    if (uvScore >= 50) reasons.push('正午紫外线极强');
    else if (uvScore >= 30) reasons.push('紫外线较强');
    if (activeConditions.has('heat')) reasons.push('当前怕热中暑');
    if (activeConditions.has('heart')) reasons.push('当前心脏负担大');
    if (activeConditions.has('knee')) reasons.push('当前膝盖不适');

    const nogo = total >= 60;
    const text = reasons.length > 0
      ? (nogo ? `劝退原因：${reasons.join('、')}` : `注意：${reasons.join('、')}`)
      : '时段良好、无身体红灯';
    return { nogo: nogo ? ('nogo' as const) : ('go' as const), text };
  }, [timeIndex, activeConditions]);

  // 长按充能 3 秒
  const onComplete = useCallback(() => {
    const { nogo, text } = evaluate();
    setResult(nogo);
    setReasonText(text);
    setShowResult(true);
    // 跨页联动：正午 + 怕热中暑 时写入高温预警
    if (nogo && timeIndex === 1 && activeConditions.has('heat')) {
      setHeatWarning(true);
    }
  }, [evaluate, timeIndex, activeConditions, setHeatWarning]);

  const { progress, holding, broken, start, cancel } = useLongPressCharge(3000, onComplete);
  const { shakeX, trigger: triggerShake } = useSteadyShake(3, 6);

  // broken 时触发抖动
  useEffect(() => {
    if (broken) triggerShake();
  }, [broken, triggerShake]);

  const fill = progress >= 1 ? '#22C55E' : '#EF4444';

  return (
    <>
      <motion.div className="fixed bottom-6 right-6 z-40" style={{ x: shakeX }}>
        <PressureButton
          maxDepth={6}
          onPointerDown={() => start()}
          onPointerUp={() => cancel()}
          onPointerLeave={() => cancel()}
          className="relative w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-white text-xl font-bold overflow-hidden"
          style={{
            background: holding
              ? `linear-gradient(135deg, ${fill} ${progress}%, #22C55E ${progress}%)`
              : 'linear-gradient(135deg, #22C55E, #EF4444)',
          }}
        >
          <span className="relative z-10 text-2xl">🎯</span>
          {holding && (
            <LiquidCharge progress={progress} broken={broken} width={64} height={64} fill={fill} baseFill="#22C55E" />
          )}
        </PressureButton>
        <p className="text-center text-[10px] text-gray-400 mt-1">长按3秒</p>
      </motion.div>

      {/* 结论全屏 */}
      <AnimatePresence>
        {showResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md"
            onClick={() => setShowResult(false)}
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.5, repeat: 2 }}
              className="text-8xl mb-6"
            >
              {result === 'nogo' ? '👎' : '👍'}
            </motion.div>
            <div className="text-white text-2xl font-bold mb-3">
              {result === 'nogo' ? '建议改日再来' : '今天可以冲！'}
            </div>
            <div className="text-white/80 text-sm max-w-xs text-center mb-4 leading-relaxed">{reasonText}</div>
            <div className="text-white/70 text-sm">点击任意处关闭</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ═══════════════════════════════════════════════════
   劝退指南主页面
   ═══════════════════════════════════════════════════ */
export default function DeterrentView() {
  const [timeIndex, setTimeIndex] = useState(1); // 默认正午
  const [activeConditions, setActiveConditions] = useState<Set<string>>(new Set());
  const [showPopup, setShowPopup] = useState<{ id: string; origin: { x: number; y: number } } | null>(null);
  const [timelineIdx, setTimelineIdx] = useState(0);
  const [prevTimeIdx, setPrevTimeIdx] = useState(1);

  const period = TIME_PERIODS[timeIndex] || TIME_PERIODS[1];

  const toggleCondition = (id: string) => {
    setActiveConditions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    vibrate(30);
  };

  // 拨盘切档：刷新 prevTimeIdx 供背景阶梯跳色
  const handleTimeChange = (i: number) => {
    setPrevTimeIdx(timeIndex);
    setTimeIndex(i);
  };

  return (
    <div className="relative min-h-full">
      <DialBackground period={period} fromIdx={prevTimeIdx} toIdx={timeIndex} />
      <div className="relative max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* ═══ 顶部标题 ═══ */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">劝退指南</h2>
            <p className="text-xs text-gray-500">根据时段和身体条件评估是否适合出行</p>
          </div>
        </div>

        {/* ═══ 健康预警拨盘 ═══ */}
        <div className="bg-white/70 backdrop-blur-md rounded-2xl p-5 shadow-sm border border-white/50 mb-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Sun className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-gray-700">健康预警拨盘</span>
            <span className="text-[10px] text-gray-400 ml-auto">← 左右滑动 →</span>
          </div>
          <Dial value={timeIndex} onChange={handleTimeChange} />
        </div>

        {/* ═══ 身体红灯筛选器 ═══ */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Heart className="w-4 h-4 text-red-500" />
            <span className="text-sm font-semibold text-gray-700">身体红灯</span>
            <span className="text-[10px] text-gray-400 ml-auto">单击切换 · 双击看差评</span>
          </div>
          <div className="flex justify-center gap-6">
            {CONDITIONS.map(c => (
              <ConditionButton
                key={c.id}
                condition={c}
                active={activeConditions.has(c.id)}
                onToggle={() => toggleCondition(c.id)}
                onDoubleClick={(origin) => setShowPopup({ id: c.id, origin })}
              />
            ))}
          </div>
        </div>

        {/* ═══ 翻车时间轴 ═══ */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">翻车时间轴</span>
            <span className="text-[10px] text-gray-400 ml-auto">上下滑动浏览</span>
          </div>
        </div>

        {/* 重锤惯性滚动容器：drag y + 低 elastic，松手位移放大 1.3 倍衰减 */}
        <HeavyTimeline
          count={TIMELINE_DATA.length}
          activeConditions={activeConditions}
          onIndexChange={(idx) => {
            if (idx !== timelineIdx) {
              setTimelineIdx(idx);
              vibrate(15);
            }
          }}
        />
      </div>

      {/* 差评弹窗 —— 从被双击按钮位置撕裂展开 */}
      <AnimatePresence>
        {showPopup && <ReviewPopup conditionId={showPopup.id} origin={showPopup.origin} onClose={() => setShowPopup(null)} />}
      </AnimatePresence>

      {/* 劝退结论悬浮球 */}
      <ConclusionButton timeIndex={timeIndex} activeConditions={activeConditions} />
    </div>
  );
}