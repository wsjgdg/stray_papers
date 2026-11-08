// 成就状态机子 hook（从 useHome 渐进拆出）：解锁幂等判定 / 右上角 toast / 成就墙数据源 / 清档复位。
// 触发点仍散落在 useHome 各剧情节点, 本 hook 只管「记录 + 播报」, 通过 opts 回拿任务时钟与所属任务。
import { useCallback, useEffect, useRef, useState } from "react";
import { achievementById, type AchievementDef } from "@/lib/achievements";
import { playAckConfirm } from "@/lib/missionAudio";
import type { MissionId } from "@/lib/missions";

/** 已解锁成就记录（含解锁瞬间的任务时钟与所属任务徽标） */
export interface UnlockedAchievement {
  id: string;
  clockText: string;
  missionBadge: string;
  missionId: MissionId;
}

export interface UseAchievementsOptions {
  /** 初始解锁表（来自本地存档, 无存档为空对象） */
  initial: Record<string, UnlockedAchievement>;
  /** 解锁瞬间的任务时钟文案（T-/T+ 由调用方按飞行态格式化） */
  getClockText: () => string;
  /** 解锁瞬间所属任务的 id 与徽标 */
  getMissionMeta: () => { id: MissionId; badge: string };
  /** 解锁即存点 */
  scheduleSave: () => void;
}

export function useAchievements(opts: UseAchievementsOptions) {
  // opts 每渲染刷新到 ref：unlockAchievement 保持稳定引用（十几处剧情 effect 依赖它）
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [achievementMap, setAchievementMap] = useState<Record<string, UnlockedAchievement>>(opts.initial);
  const [achievementToast, setAchievementToast] = useState<UnlockedAchievement | null>(null);
  const achievementMapRef = useRef<Record<string, UnlockedAchievement>>(opts.initial);
  const achievementToastTimerRef = useRef<number | null>(null);

  /** 成就解锁（幂等）：记录解锁瞬间任务时钟与所属任务徽标, 右上角 toast + 双短哔 */
  const unlockAchievement = useCallback((id: string) => {
    if (achievementMapRef.current[id]) return;
    const o = optsRef.current;
    const meta = o.getMissionMeta();
    const record: UnlockedAchievement = {
      id,
      clockText: o.getClockText(),
      missionBadge: meta.badge,
      missionId: meta.id,
    };
    achievementMapRef.current = { ...achievementMapRef.current, [id]: record };
    setAchievementMap(achievementMapRef.current);
    setAchievementToast(record);
    o.scheduleSave(); // 成就解锁 = 存点
    playAckConfirm();
    if (achievementToastTimerRef.current !== null) window.clearTimeout(achievementToastTimerRef.current);
    achievementToastTimerRef.current = window.setTimeout(() => {
      setAchievementToast(null);
      achievementToastTimerRef.current = null;
    }, 3000);
  }, []);

  /** 清除存档联动：解锁表归零（toast 不打扰） */
  const resetAchievements = useCallback(() => {
    achievementMapRef.current = {};
    setAchievementMap({});
  }, []);

  // 卸载时清 toast 定时器
  useEffect(() => {
    return () => {
      if (achievementToastTimerRef.current !== null) window.clearTimeout(achievementToastTimerRef.current);
    };
  }, []);

  /** 当前 toast 对应的成就定义（换 id 触发 View 的 burst 动画） */
  const achievementToastDef: AchievementDef | null = achievementToast
    ? achievementById(achievementToast.id) ?? null
    : null;

  return {
    achievementMap,
    achievementMapRef,
    achievementToast,
    achievementToastDef,
    unlockAchievement,
    resetAchievements,
  };
}
