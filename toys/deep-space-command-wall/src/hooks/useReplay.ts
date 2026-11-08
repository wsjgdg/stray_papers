// 发射回放子 hook（从 useHome 渐进拆出）：关键帧环形缓冲录制调度 / 进出回放 / 播放驱动 /
// 帧步进与倍速 / 多机位与回放成就。帧内容由调用方的 captureFrame 产出（业务 ref 不外泄给本 hook）。
import { useCallback, useEffect, useRef, useState } from "react";
import type { PhaseId } from "@/lib/missions";

/** 发射回放关键帧（~2Hz 录进内存环形缓冲, 回放时按帧下发快照） */
export interface ReplayFrame {
  flightT: number;
  clockText: string;
  phaseId: PhaseId;
  phaseIndex: number;
  phaseLabel: string;
  phaseLabelEn: string;
  moonMix: number;
  /** 各指标当前值（按 mission.metricDefs 顺序, 只存数值不存 60 点曲线——回放展示时由相邻帧窗口重建 series,
   *  环形缓冲内存从 ~10MB 降到 <1MB） */
  values: number[];
  logCount: number;
  /** 火星沙尘暴强度 0..1（着陆后沙尘暴窗口继续录制, 回放按帧重现天空变暗） */
  dustIntensity: number;
  /** 泰坦甲烷浓雾浓度 0..1（雾情窗口延续录制, 回放按帧重现橙褐雾幕） */
  fogLevel: number;
}

export type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 4;
export type ReplayCamId = "cam1" | "cam2" | "cam3" | "cam4";

const FRAME_CAP = 3600; // 环形缓冲上限: 30 分钟 @2Hz
const RECORDER_INTERVAL_MS = 500;
const REPLAY_MIN_FRAMES = 20;

export interface UseReplayOptions {
  /** 上电自检完成后才启动录制调度 */
  bootDone: boolean;
  /** 每个录制节拍调用：返回一帧关键帧, 返回 null 表示本拍不录（未飞行 / 着陆后录制已收尾） */
  captureFrame: () => ReplayFrame | null;
  /** 进入回放瞬间的一次性动作（关指标详情浮层 + 掐警报蜂鸣） */
  onEnter: () => void;
  /** 回放成就（cams_4 / replay_full） */
  unlockAchievement: (id: string) => void;
}

export function useReplay(opts: UseReplayOptions) {
  // opts 每渲染刷新到 ref：录制 interval 与各回调保持稳定引用
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const { bootDone } = opts;

  const [replayMode, setReplayMode] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [replayFrameIndex, setReplayFrameIndex] = useState(0);
  const [replayFrameCount, setReplayFrameCount] = useState(0);
  const [replayReady, setReplayReady] = useState(false);
  const [replayCam, setReplayCam] = useState<ReplayCamId>("cam1");

  const replayFramesRef = useRef<ReplayFrame[]>([]);
  const replayModeRef = useRef(false);
  const replayPlayingRef = useRef(false);
  const replayIndexRef = useRef(0);
  const replayCountRef = useRef(0);
  const camsSeenRef = useRef<Set<ReplayCamId>>(new Set());

  // 回放录制器: 点火后 ~2Hz 调 captureFrame 收帧（帧内容判定在调用方）, 环形缓冲满帽丢最旧帧
  useEffect(() => {
    if (!bootDone) return;
    const recorder = window.setInterval(() => {
      if (replayModeRef.current) return;
      const frame = optsRef.current.captureFrame();
      if (!frame) return;
      const frames = replayFramesRef.current;
      frames.push(frame);
      if (frames.length > FRAME_CAP) frames.shift();
    }, RECORDER_INTERVAL_MS);
    return () => window.clearInterval(recorder);
  }, [bootDone]);

  const enterReplay = useCallback(() => {
    if (replayModeRef.current) return;
    const count = replayFramesRef.current.length;
    if (!replayReady || count < REPLAY_MIN_FRAMES) return;
    optsRef.current.onEnter();
    replayCountRef.current = count;
    setReplayFrameCount(count);
    replayIndexRef.current = 0;
    setReplayFrameIndex(0);
    replayPlayingRef.current = true;
    setReplayPlaying(true);
    replayModeRef.current = true;
    setReplayMode(true);
    setReplayCam("cam1");
    camsSeenRef.current.add("cam1");
  }, [replayReady]);

  const exitReplay = useCallback(() => {
    if (!replayModeRef.current) return;
    replayModeRef.current = false;
    replayPlayingRef.current = false;
    setReplayMode(false);
    setReplayPlaying(false);
    setReplayCam("cam1");
  }, []);

  const selectReplayCam = useCallback((cam: ReplayCamId) => {
    setReplayCam(cam);
    camsSeenRef.current.add(cam);
    if (camsSeenRef.current.size >= 4) optsRef.current.unlockAchievement("cams_4");
  }, []);

  const toggleReplay = useCallback(() => {
    if (replayModeRef.current) exitReplay();
    else enterReplay();
  }, [enterReplay, exitReplay]);

  const toggleReplayPlay = useCallback(() => {
    const next = !replayPlayingRef.current;
    // 已停在片尾再按播放 → 从头重放
    if (next && replayIndexRef.current >= replayCountRef.current - 1) {
      replayIndexRef.current = 0;
      setReplayFrameIndex(0);
    }
    replayPlayingRef.current = next;
    setReplayPlaying(next);
  }, []);

  const seekReplayFrame = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(replayCountRef.current - 1, Math.round(index)));
    replayIndexRef.current = clamped;
    setReplayFrameIndex(clamped);
    if (replayCountRef.current > 0 && clamped >= replayCountRef.current - 1) {
      optsRef.current.unlockAchievement("replay_full");
    }
  }, []);

  const changeReplaySpeed = useCallback((speed: ReplaySpeed) => setReplaySpeed(speed), []);

  /** 单帧步进：暂停态下按录制关键帧逐帧前后移（一帧 = 0.5s 任务时间, 即步即渲染） */
  const stepReplayFrame = useCallback(
    (delta: number) => {
      if (!replayModeRef.current) return;
      if (replayPlayingRef.current) {
        replayPlayingRef.current = false;
        setReplayPlaying(false);
      }
      seekReplayFrame(replayIndexRef.current + delta);
    },
    [seekReplayFrame],
  );

  // 回放驱动: 按倍速推进帧指针（帧指针以 ref 为准, 避免 interval 闭包过期）
  useEffect(() => {
    if (!replayMode || !replayPlaying) return;
    const stepMs = Math.max(110, RECORDER_INTERVAL_MS / replaySpeed);
    const driver = window.setInterval(() => {
      const next = replayIndexRef.current + 1;
      if (next >= replayCountRef.current) {
        replayPlayingRef.current = false;
        setReplayPlaying(false);
        return;
      }
      replayIndexRef.current = next;
      setReplayFrameIndex(next);
      if (next >= replayCountRef.current - 1) optsRef.current.unlockAchievement("replay_full");
    }, stepMs);
    return () => window.clearInterval(driver);
  }, [replayMode, replayPlaying, replaySpeed]);

  // 回放模式键盘 ←/→ = 帧退/帧进（回放中巡视车遥控已挂起, 不与方向键冲突）
  useEffect(() => {
    const onStepKey = (e: KeyboardEvent) => {
      if (!replayModeRef.current) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepReplayFrame(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepReplayFrame(1);
      }
    };
    window.addEventListener("keydown", onStepKey);
    return () => window.removeEventListener("keydown", onStepKey);
  }, [stepReplayFrame]);

  /** 着陆达成: 回放入口解锁 */
  const markReplayReady = useCallback(() => setReplayReady(true), []);

  /** 任务切换全量复位: 帧缓冲/计数/就绪/机位归零并退出回放态 */
  const resetReplayState = useCallback(() => {
    replayFramesRef.current = [];
    replayCountRef.current = 0;
    replayIndexRef.current = 0;
    setReplayReady(false);
    setReplayFrameCount(0);
    setReplayFrameIndex(0);
    setReplayCam("cam1");
  }, []);

  /** 点火前清空录制缓冲（本次任务时间线从头录） */
  const clearRecording = useCallback(() => {
    replayFramesRef.current = [];
    setReplayReady(false);
    setReplayFrameCount(0);
  }, []);

  // 当前回放帧（非回放模式为 null）与入口可用态: 渲染期派生, View 直接消费
  const replayFrame = replayMode
    ? replayFramesRef.current[Math.min(replayFrameIndex, replayCountRef.current - 1)] ?? null
    : null;
  const replayEnabled = replayReady && replayFramesRef.current.length >= REPLAY_MIN_FRAMES;

  return {
    replayMode,
    replayModeRef,
    replayPlaying,
    replayPlayingRef,
    replaySpeed,
    replayFrameIndex,
    replayFrameCount,
    replayReady,
    replayCam,
    replayFramesRef,
    replayCountRef,
    replayFrame,
    replayEnabled,
    enterReplay,
    exitReplay,
    toggleReplay,
    toggleReplayPlay,
    seekReplayFrame,
    changeReplaySpeed,
    stepReplayFrame,
    selectReplayCam,
    markReplayReady,
    resetReplayState,
    clearRecording,
  };
}
