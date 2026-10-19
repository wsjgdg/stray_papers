// 每日挑战子 hook（从 useHome 渐进拆出）：当日天体 + 修饰条件确定性生成、挑战进行态、
// 天气/表面事件倍率、达成记账（生涯连击）与弹层开关。纯本地逻辑, 不感知遥测循环——
// 主循环只读 challengeWeatherMultRef / challengeSurfaceMultRef / challengeRef 做调度缩放与配额计数。
import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { playAckConfirm } from "@/lib/missionAudio";
import { MISSIONS, type MissionDef, type MissionId, type PhaseId } from "@/lib/missions";
import { dailyDateKey, getDailyChallenge, type DailyChallengeInfo, type DailyModifierId } from "@/lib/dailySeed";
import type { CareerCounters } from "@/lib/dscSave";
import type { CommLine } from "@/lib/commScript";

/** 每日挑战弹层快照（openDaily 一次性构建, View 只消费） */
export interface DailyChallengeSnap {
  info: DailyChallengeInfo;
  completions: number;
  streak: number;
  bestStreak: number;
  doneToday: boolean;
  canStart: boolean;
  inProgress: boolean;
}

/** 进行中的挑战局（quota = 已采样品数, landedOk = 已软着陆） */
export interface DailyChallengeRun {
  missionId: MissionId;
  modIds: DailyModifierId[];
  landedOk: boolean;
  quota: number;
  done: boolean;
}

type LogLevel = "nominal" | "caution" | "critical";

export interface UseDailyChallengeOptions {
  /** 上电自检完成（挑战可开始的前置之一） */
  bootDone: boolean;
  /** 今日是否已完成（初值来自存档的最近完成日期） */
  initialDoneToday: boolean;
  careerRef: MutableRefObject<CareerCounters>;
  commQueueRef: MutableRefObject<CommLine[]>;
  missionRef: MutableRefObject<MissionDef>;
  flightActiveRef: MutableRefObject<boolean>;
  phaseRef: MutableRefObject<PhaseId>;
  replayModeRef: MutableRefObject<boolean>;
  /** 开始挑战时切换到目标天体（经 ref 转发避免声明顺序环） */
  switchMission: (id: MissionId) => void;
  pushLog: (system: string, message: string, level: LogLevel) => void;
  scheduleSave: () => void;
  unlockAchievement: (id: string) => void;
}

export function useDailyChallenge(opts: UseDailyChallengeOptions) {
  // opts 每渲染刷新到 ref：全部回调保持稳定引用（主循环/剧情 effect 依赖它们）
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [challengeActive, setChallengeActive] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailySnap, setDailySnap] = useState<DailyChallengeSnap | null>(null);
  const [dailyDoneToday, setDailyDoneToday] = useState(opts.initialDoneToday);

  const challengeRef = useRef<DailyChallengeRun | null>(null);
  const challengeWeatherMultRef = useRef(1);
  const challengeSurfaceMultRef = useRef(1);
  const dailyInfoRef = useRef<DailyChallengeInfo | null>(null);
  if (dailyInfoRef.current === null) dailyInfoRef.current = getDailyChallenge();
  const dailyOpenRef = useRef(false);

  /** 「窗口压缩」修饰（非金星）: 表面限时事件间隔缩放（频率 ×2 = 间隔 ÷2; 无挑战时恒 ÷1） */
  const scaledSurfaceGap = useCallback((base: number, span: number) => {
    return Math.floor((base + Math.random() * span) / challengeSurfaceMultRef.current);
  }, []);

  /** 结束本局挑战（金星撤离未完成 / 中途切任务: 静默退出, 不罚分, 不影响生涯连击） */
  const endDailyChallenge = useCallback(() => {
    if (!challengeRef.current) return;
    challengeRef.current = null;
    setChallengeActive(false);
    challengeWeatherMultRef.current = 1;
    challengeSurfaceMultRef.current = 1;
  }, []);

  /** 挑战达成: 播报 + career 记账（完成数 / 连击 / 最佳连击 / 最近完成日期）+ 存点 + 「连值三日」成就判定 */
  const completeDailyChallenge = useCallback(() => {
    const ch = challengeRef.current;
    if (!ch || ch.done) return;
    ch.done = true;
    const o = optsRef.current;
    const info = dailyInfoRef.current;
    const career = o.careerRef.current;
    career.dailyCompletions += 1;
    // 连击判定: 昨天完成过 → +1, 否则重置为 1
    const yesterdayKey = dailyDateKey(new Date(Date.now() - 86400000));
    career.dailyStreak = career.lastDailyDate === yesterdayKey ? career.dailyStreak + 1 : 1;
    career.dailyBestStreak = Math.max(career.dailyBestStreak, career.dailyStreak);
    career.lastDailyDate = info?.dateKey ?? dailyDateKey();
    o.scheduleSave();
    setDailyDoneToday(true);
    endDailyChallenge();
    playAckConfirm();
    o.pushLog(
      "DUTY",
      `每日挑战达成! 软着陆完成${ch.modIds.includes("quota_collection") ? ", 配额采集达标（3 件样品）" : ""}——累计完成 ${career.dailyCompletions} 次, 当前连击 ${career.dailyStreak} 天（历史最佳 ${career.dailyBestStreak}）`,
      "nominal",
    );
    o.commQueueRef.current.push({
      speaker: o.missionRef.current.comm.speakers.bj,
      text: `北京向全线通报: 今日每日挑战完成——在修饰条件下${ch.modIds.includes("quota_collection") ? "软着陆并采满配额" : "软着陆"}! 值班员连击 ${career.dailyStreak} 天, 明天继续保持火种!`,
    });
    if (career.dailyStreak >= 3) o.unlockAchievement("daily_streak_3");
  }, [endDailyChallenge]);

  /** 打开每日挑战弹层（构建当日挑战快照 + 生涯连击数据; ESC 链插在生涯统计之后） */
  const openDaily = useCallback(() => {
    const info = dailyInfoRef.current;
    if (!info) return;
    const o = optsRef.current;
    setDailySnap({
      info,
      completions: o.careerRef.current.dailyCompletions,
      streak: o.careerRef.current.dailyStreak,
      bestStreak: o.careerRef.current.dailyBestStreak,
      doneToday: o.careerRef.current.lastDailyDate === info.dateKey,
      canStart:
        o.bootDone && !o.flightActiveRef.current && !o.replayModeRef.current && o.phaseRef.current === "standby",
      inProgress: challengeRef.current !== null && !challengeRef.current.done,
    });
    dailyOpenRef.current = true;
    setDailyOpen(true);
  }, []);

  const closeDaily = useCallback(() => {
    dailyOpenRef.current = false;
    setDailyOpen(false);
  }, []);

  /** 开始今日挑战：切到目标天体 + 按修饰条件设置天气/表面事件倍率 */
  const startDailyChallenge = useCallback(() => {
    const info = dailyInfoRef.current;
    if (!info) return;
    const o = optsRef.current;
    if (o.flightActiveRef.current || o.replayModeRef.current || o.phaseRef.current !== "standby") return;
    if (o.careerRef.current.lastDailyDate === info.dateKey) return; // 今日已完成
    if (challengeRef.current && !challengeRef.current.done) return; // 已有进行中的挑战
    dailyOpenRef.current = false;
    setDailyOpen(false);
    o.switchMission(info.missionId);
    const modIds = info.modifiers.map((md) => md.id);
    challengeRef.current = { missionId: info.missionId, modIds, landedOk: false, quota: 0, done: false };
    setChallengeActive(true);
    // 「恶劣天象」: 该天体专属事件（风暴/酸雾/陨石雨/喷发）调度间隔减半
    challengeWeatherMultRef.current = modIds.includes("harsh_weather") ? 2 : 1;
    // 「窗口压缩」（非金星）: 表面限时事件频率 ×2（金星走生存窗口 180s, 不走该倍率）
    challengeSurfaceMultRef.current =
      info.missionId !== "venus1" && modIds.includes("window_compression") ? 2 : 1;
    playAckConfirm();
    o.pushLog(
      "DUTY",
      `每日挑战开始——目标天体 ${MISSIONS[info.missionId].code}, 修饰条件: ${info.modifiers.map((md) => `「${md.name}」`).join("")}。完成软着陆${modIds.includes("quota_collection") ? "并采满 3 件样品" : ""}即达成`,
      "nominal",
    );
  }, []);

  return {
    challengeActive,
    challengeRef,
    challengeWeatherMultRef,
    challengeSurfaceMultRef,
    dailyOpen,
    dailyOpenRef,
    dailySnap,
    dailyDoneToday,
    setDailyDoneToday,
    scaledSurfaceGap,
    startDailyChallenge,
    endDailyChallenge,
    completeDailyChallenge,
    openDaily,
    closeDaily,
  };
}
