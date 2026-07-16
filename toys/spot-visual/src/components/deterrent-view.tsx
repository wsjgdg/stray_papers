'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Sun, Heart, Footprints, ThermometerSun, Volume2, X, Accessibility, MapPin, Clock, ChevronDown } from 'lucide-react';

/* ═══ 工具函数 ═══ */
const vibrate = (pattern: number | number[]) => {
  try { navigator.vibrate?.(pattern); } catch { /* iOS 不支持 */ }
};
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
   拨盘组件
   ═══════════════════════════════════════════════════ */
function Dial({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  const handleStart = (clientX: number) => {
    dragging.current = true;
    startX.current = clientX - dragOffset;
  };
  const handleMove = (clientX: number) => {
    if (!dragging.current) return;
    const offset = clientX - startX.current;
    const clamped = Math.max(-160, Math.min(160, offset));
    setDragOffset(clamped);
  };
  const handleEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    // 找最近的槽位
    const slotWidth = 160;
    let nearest = Math.round(dragOffset / slotWidth);
    nearest = Math.max(-1, Math.min(1, nearest));
    const newIndex = value + nearest;
    if (newIndex !== value) {
      onChange(newIndex);
      vibrate(50);
    }
    setDragOffset(0);
  };

  const period = TIME_PERIODS[value];

  return (
    <div
      className="relative select-none touch-none"
      ref={containerRef}
      onMouseDown={(e) => handleStart(e.clientX)}
      onMouseMove={(e) => handleMove(e.clientX)}
      onMouseUp={handleEnd}
      onMouseLeave={() => { if (dragging.current) handleEnd(); }}
      onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={handleEnd}
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
          return (
            <motion.div
              key={t.label}
              className={`absolute text-center transition-colors duration-300 ${isActive ? 'text-gray-900' : 'text-gray-400'}`}
              animate={{ x: (i - value) * 160 + dragOffset, scale: isActive ? 1.15 : 0.85, opacity: isActive ? 1 : 0.4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <span className="text-2xl">{t.emoji}</span>
              <div className={`text-sm font-bold ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>{t.label}</div>
            </motion.div>
          );
        })}
      </div>

      {/* UV & 阴影数据 */}
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

/* ═══════════════════════════════════════════════════
   身体条件圆钮
   ═══════════════════════════════════════════════════ */
function ConditionButton({ condition, active, onToggle, onDoubleClick }: {
  condition: typeof CONDITIONS[0]; active: boolean; onToggle: () => void; onDoubleClick: () => void;
}) {
  const Icon = condition.icon;
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  const clickCount = useRef(0);

  const handleClick = () => {
    clickCount.current++;
    if (clickCount.current === 1) {
      clickTimer.current = setTimeout(() => {
        if (clickCount.current === 1) onToggle();
        clickCount.current = 0;
      }, 280);
    } else {
      clearTimeout(clickTimer.current);
      clickCount.current = 0;
      onDoubleClick();
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      whileTap={{ scale: 0.85 }}
      className={`relative w-20 h-20 rounded-full flex flex-col items-center justify-center gap-0.5 shadow-lg transition-all duration-200 ${active ? `bg-gradient-to-br ${condition.color} text-white shadow-xl ring-4 ring-white/50` : 'bg-white text-gray-500 border-2 border-gray-200'}`}
      style={active ? { boxShadow: '0 0 20px rgba(239,68,68,0.3)' } : {}}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[10px] font-bold leading-tight">{condition.label}</span>
      {active && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-red-400"
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.button>
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

      {/* 巨幅照片 */}
      <div className="relative flex-1 rounded-2xl overflow-hidden shadow-xl">
        <img src={item.photo} alt={item.time} className="w-full h-full object-cover" loading="lazy" />
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

function ReviewPopup({ conditionId, onClose }: { conditionId: string; onClose: () => void }) {
  const data = BAD_REVIEWS[conditionId];
  if (!data) return null;
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
        initial={{ y: 400 }}
        animate={{ y: 0 }}
        exit={{ y: 400 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
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
        {/* 关闭按钮 - 右下角 */}
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
   劝退结论悬浮球
   ═══════════════════════════════════════════════════ */
function ConclusionButton({ timeIndex, activeConditions }: { timeIndex: number; activeConditions: Set<string> }) {
  const [pressing, setPressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<'go' | 'nogo'>('go');
  const [reasonText, setReasonText] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const progressRef = useRef(0);

  // ═══ 劝退评分（0-100，越高越不建议出行）═══
  // 时段：根据 TIME_PERIODS 的 uv 值折算（正午 UV=11 最严苛）
  const evaluate = useCallback(() => {
    const uv = TIME_PERIODS[timeIndex]?.uv ?? 0;
    const uvScore = uv >= 10 ? 50 : uv >= 5 ? 30 : uv >= 3 ? 10 : 0;
    const condScore = activeConditions.size * 20; // 每个身体红灯 +20
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
    return { nogo: nogo ? 'nogo' : 'go' as const, text };
  }, [timeIndex, activeConditions]);

  const handleStart = useCallback(() => {
    setPressing(true);
    progressRef.current = 0;
    setProgress(0);
    timerRef.current = setInterval(() => {
      progressRef.current += 100 / 30; // 3秒 = 30个100ms
      setProgress(progressRef.current);
      vibrate(20);
      if (progressRef.current >= 100) {
        clearInterval(timerRef.current);
        setPressing(false);
        const { nogo, text } = evaluate();
        setResult(nogo);
        setReasonText(text);
        setShowResult(true);
        vibrate([100, 50, 100, 50, 200]);
      }
    }, 100);
  }, [evaluate]);

  const handleEnd = useCallback(() => {
    clearInterval(timerRef.current);
    setPressing(false);
    progressRef.current = 0;
    setProgress(0);
  }, []);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40">
        <motion.button
          className="relative w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-white text-xl font-bold overflow-hidden"
          style={{
            background: pressing
              ? `linear-gradient(135deg, #EF4444 ${progress}%, #22C55E ${progress}%)`
              : 'linear-gradient(135deg, #22C55E, #EF4444)',
          }}
          onMouseDown={handleStart}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchEnd={handleEnd}
          whileTap={{ scale: 0.95 }}
        >
          <span className="relative z-10 text-2xl">🎯</span>
          {pressing && (
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="30" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="3" />
              <circle cx="32" cy="32" r="30" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${progress * 1.88} 188`} strokeLinecap="round" />
            </svg>
          )}
        </motion.button>
        <p className="text-center text-[10px] text-gray-400 mt-1">长按3秒</p>
      </div>

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
  const [showPopup, setShowPopup] = useState<string | null>(null);
  const [timelineIdx, setTimelineIdx] = useState(0);

  const period = TIME_PERIODS[timeIndex];

  const toggleCondition = (id: string) => {
    setActiveConditions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    vibrate(30);
  };

  return (
    <div className="min-h-full" style={{ background: `linear-gradient(180deg, ${period.bgFrom} 0%, ${period.bgTo} 30%, #F9FAFB 100%)` }}>
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
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
          <Dial value={timeIndex} onChange={setTimeIndex} />
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
                onDoubleClick={() => setShowPopup(c.id)}
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

        <div
          className="overflow-y-auto snap-y snap-mandatory rounded-2xl"
          style={{ height: 'calc(100vh - 60px)', maxHeight: '85vh' }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const idx = Math.round(el.scrollTop / el.clientHeight);
            if (idx !== timelineIdx) {
              setTimelineIdx(idx);
              vibrate(15);
            }
          }}
        >
          {TIMELINE_DATA.map((item, i) => (
            <TimelineCard key={i} item={item} index={i} activeConditions={activeConditions} />
          ))}
        </div>
      </div>

      {/* 差评弹窗 */}
      <AnimatePresence>
        {showPopup && <ReviewPopup conditionId={showPopup} onClose={() => setShowPopup(null)} />}
      </AnimatePresence>

      {/* 劝退结论悬浮球 */}
      <ConclusionButton timeIndex={timeIndex} activeConditions={activeConditions} />
    </div>
  );
}