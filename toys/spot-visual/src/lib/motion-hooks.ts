'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  motionValue,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  type MotionValue,
} from 'framer-motion';

/* ═══ 工具：静默震动（桌面端不支持时自动跳过）═══ */
const vibrate = (pattern: number | number[]) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* iOS / 桌面端不支持，静默 */
  }
};

/* ═══════════════════════════════════════════════════
   useRatchetDrag —— 磁吸棘轮拨盘拖动
   运动值驱动位移；拖动跨过 slot 边界时触发短震动；
   松手 spring 回弹到最近刻度（damping 12，多滑半格再回弹）。
   ═══════════════════════════════════════════════════ */
export function useRatchetDrag(
  slotWidth: number,
  onSlotCross?: (dir: 1 | -1) => void,
) {
  const motionX = useMotionValue(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const lastSlot = useRef(0);
  const animControls = useRef<ReturnType<typeof animate> | null>(null);

  /** 以 spring 回弹到目标 slot */
  const springTo = useCallback(
    (targetX: number) => {
      animControls.current?.stop();
      animControls.current = animate(motionX, targetX, {
        type: 'spring',
        stiffness: 320,
        damping: 12,
      });
    },
    [motionX],
  );

  const handleStart = useCallback(
    (clientX: number) => {
      dragging.current = true;
      startX.current = clientX;
      startOffset.current = motionX.get();
      animControls.current?.stop();
    },
    [motionX],
  );

  const handleMove = useCallback(
    (clientX: number) => {
      if (!dragging.current) return;
      const delta = clientX - startX.current;
      const next = startOffset.current + delta;
      motionX.set(next);
      const slot = Math.round(next / slotWidth);
      if (slot !== lastSlot.current) {
        const dir = (slot > lastSlot.current ? 1 : -1) as 1 | -1;
        lastSlot.current = slot;
        vibrate(18);
        onSlotCross?.(dir);
      }
    },
    [motionX, slotWidth, onSlotCross],
  );

  /** 松手：返回当前 offset，由调用方决定落到哪个 slot。 */
  const handleEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const raw = motionX.get();
    return raw;
  }, [motionX]);

  /** 落到指定 slot：让 spring 弹回（含过冲半格）。 */
  const snapTo = useCallback(
    (slotIndex: number) => {
      lastSlot.current = slotIndex;
      const overshoot = slotIndex * slotWidth;
      springTo(overshoot);
    },
    [springTo, slotWidth],
  );

  // 清理动画
  useEffect(() => () => animControls.current?.stop(), []);

  return { motionX, handleStart, handleMove, handleEnd, snapTo, dragging };
}

/* ═══════════════════════════════════════════════════
   usePressurePress —— 重按压感
   depth（0~1）由 pointer pressure 映射（缺省 0.5），
   松手 spring 回弹（stiffness 400）。
   ═══════════════════════════════════════════════════ */
export function usePressurePress() {
  const depth = useMotionValue(0);
  const springDepth = useSpring(depth, { stiffness: 400, damping: 18 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 非触屏设备 pressure 恒为 0.5，这里直接用作基准强度
      const p = typeof e.pressure === 'number' && e.pressure > 0 ? e.pressure : 0.5;
      depth.set(Math.min(1, p * 1.2));
    },
    [depth],
  );
  const onPointerUp = useCallback(() => depth.set(0), [depth]);
  const onPointerLeave = useCallback(() => depth.set(0), [depth]);

  return { depth: springDepth, onPointerDown, onPointerUp, onPointerLeave };
}

/* ═══════════════════════════════════════════════════
   useLongPressCharge —— 长按充能
   rAF 推进 progress 0→1；松手时若未满则置 broken（粒子飞溅 + x 抖 3 次），
   满则触发 onComplete。
   ═══════════════════════════════════════════════════ */
export function useLongPressCharge(
  durationMs: number,
  onComplete: () => void,
  onCancel?: () => void,
) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [broken, setBroken] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const tickVibrateRef = useRef(0);

  const clear = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const elapsed = performance.now() - startRef.current;
    const p = Math.min(1, elapsed / durationMs);
    setProgress(p);
    // 每 10% 充一次短震动
    if (p - tickVibrateRef.current >= 0.1) {
      tickVibrateRef.current = p;
      vibrate(15);
    }
    if (p >= 1) {
      clear();
      setHolding(false);
      vibrate([100, 50, 100, 50, 200]);
      onComplete();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [durationMs, onComplete, clear]);

  const start = useCallback(() => {
    clear();
    setBroken(false);
    setHolding(true);
    setProgress(0);
    tickVibrateRef.current = 0;
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [clear, tick]);

  const cancel = useCallback(() => {
    clear();
    setHolding(false);
    const cur = progress;
    setProgress(0);
    if (cur > 0.05 && cur < 1) {
      setBroken(true);
      // 触发 x 抖 3 次由调用方通过 broken 读取 + useSteadyShake
      onCancel?.();
      // 自动复位 broken（粒子飞溅动画播完后由组件清）
      window.setTimeout(() => setBroken(false), 700);
    }
  }, [clear, progress, onCancel]);

  useEffect(() => () => clear(), [clear]);

  return { progress, holding, broken, start, cancel, clearBroken: () => setBroken(false) };
}

/* ═══════════════════════════════════════════════════
   useCountUp —— 老虎机式数字翻滚累加
   active 为 true 时从 0 累加到 target（duration 600ms）。
   ═══════════════════════════════════════════════════ */
export function useCountUp(target: number, active: boolean, durationMs = 600) {
  const [value, setValue] = useState(0);
  const controls = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    controls.current?.cancel();
    controls.current = animate(0, target, {
      duration: durationMs / 1000,
      ease: 'easeOut',
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.current?.cancel();
  }, [target, active, durationMs]);

  return value;
}

/* ═══════════════════════════════════════════════════
   useAudioClick —— Web Audio 程序合成金属咔嗒
   懒加载 AudioContext，首次调用（用户手势内）解锁。
   返回 playClick()：极短白噪(20ms) + 衰减正弦波(800Hz, 60ms)。
   ═══════════════════════════════════════════════════ */
export function useAudioClick() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensure = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const playClick = useCallback(() => {
    const ctx = ensure();
    if (!ctx) return;
    const now = ctx.currentTime;

    // —— 白噪脉冲（20ms）——
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.25;
    noise.connect(noiseGain).connect(ctx.destination);
    noise.start(now);

    // —— 衰减正弦（800Hz, 60ms）——
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.3, now + 0.005);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }, [ensure]);

  return { playClick };
}

/* ═══════════════════════════════════════════════════
   useSteadyShake —— x 轴来回抖动 count 次后停止
   返回 { shakeX (MotionValue), trigger() }。trigger 后立即开始抖动。
   ═══════════════════════════════════════════════════ */
export function useSteadyShake(count = 3, intensity = 6) {
  const shakeX = useMotionValue(0);

  const trigger = useCallback(() => {
    let i = 0;
    const step = () => {
      if (i >= count) {
        shakeX.set(0);
        return;
      }
      shakeX.set(intensity * (i % 2 === 0 ? 1 : -1));
      i++;
      window.setTimeout(step, 70);
    };
    step();
  }, [count, intensity, shakeX]);

  return { shakeX, trigger };
}

/* ═══════════════════════════════════════════════════
   useRatchetDrag 的鼠标/触摸事件绑定辅助
   返回一组可直接挂到元素上的事件 props（mouse + touch）。
   ═══════════════════════════════════════════════════ */
export function bindDragHandlers(
  start: (x: number) => void,
  move: (x: number) => void,
  end: () => void,
) {
  return {
    onMouseDown: (e: React.MouseEvent) => start(e.clientX),
    onMouseMove: (e: React.MouseEvent) => move(e.clientX),
    onMouseUp: () => end(),
    onMouseLeave: () => end(),
    onTouchStart: (e: React.TouchEvent) => start(e.touches[0].clientX),
    onTouchMove: (e: React.TouchEvent) => move(e.touches[0].clientX),
    onTouchEnd: () => end(),
  };
}

export { vibrate };
export type { MotionValue };
