// 生涯统计子 hook（从 useHome 渐进拆出）：生涯快照构建 / 弹层开关 / 驾驶累计增量记账。
// careerRef（生涯计数器本体）仍由 useHome 持有——十几处剧情触发点直接对它累加, 本 hook 经 opts 共享。
// 「清除存档」是跨模块编排, 留在 useHome; 它调用这里的 buildCareerSnapshot 与 resetCareerProgress。
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ACHIEVEMENTS, ACHIEVEMENT_TOTAL } from "@/lib/achievements";
import { defaultCareer, type CareerCounters, type CareerSnapshot, type RallyBests } from "@/lib/dscSave";

/** 驾驶累计增量记账的输入（rover 快照每 tick 变化, 增量非正不回退） */
export interface CareerDriveInput {
  odometer: number;
  spinSecs: number;
  photos: number;
}

export interface UseCareerOptions {
  careerRef: MutableRefObject<CareerCounters>;
  dutyMeritRef: MutableRefObject<number>;
  dutyDoneRef: MutableRefObject<number>;
  achievementMapRef: MutableRefObject<Record<string, unknown>>;
  rallyBestsRef: MutableRefObject<RallyBests>;
  saveMetaRef: MutableRefObject<{ savedAt: string | null }>;
  /** 当前驾驶增量输入（里程/漂移秒数/拍照数, 来自巡视车快照与驾驶统计） */
  driveInput: CareerDriveInput;
  /** 每新增行驶满 100m 调度一次节流写盘 */
  scheduleSave: () => void;
}

export function useCareer(opts: UseCareerOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [careerOpen, setCareerOpen] = useState(false);
  const [careerSnap, setCareerSnap] = useState<CareerSnapshot | null>(null);
  const careerOpenRef = useRef(false);
  const careerPrevRef = useRef({ odo: 0, spin: 0, photos: 0, savedOdo: 0 });

  /** 构建生涯快照：全部读稳定 ref, 打开弹层 / 清除存档后调用一次 */
  const buildCareerSnapshot = useCallback((): CareerSnapshot => {
    const o = optsRef.current;
    return {
      career: { ...o.careerRef.current, landings: { ...o.careerRef.current.landings } },
      merit: o.dutyMeritRef.current,
      dutyDone: o.dutyDoneRef.current,
      achCount: Object.keys(o.achievementMapRef.current).length,
      achTotal: ACHIEVEMENT_TOTAL,
      rareUnlocked: ACHIEVEMENTS.filter((a) => a.rare && o.achievementMapRef.current[a.id]).map((a) => a.name),
      rareTotal: ACHIEVEMENTS.filter((a) => a.rare).length,
      rally: { ...o.rallyBestsRef.current },
      savedAt: o.saveMetaRef.current.savedAt,
    };
  }, []);

  const openCareer = useCallback(() => {
    setCareerSnap(buildCareerSnapshot());
    careerOpenRef.current = true;
    setCareerOpen(true);
  }, [buildCareerSnapshot]);

  const closeCareer = useCallback(() => {
    careerOpenRef.current = false;
    setCareerOpen(false);
  }, []);

  // 生涯驾驶累计：里程 / 漂移秒数 / 拍照张数按增量累加进 career（rover 复位时增量非正, 不回退）
  const { driveInput, scheduleSave } = opts;
  useEffect(() => {
    const career = optsRef.current.careerRef.current;
    const prev = careerPrevRef.current;
    const odo = driveInput.odometer;
    if (odo > prev.odo) career.odometerM += odo - prev.odo;
    prev.odo = odo;
    if (driveInput.spinSecs > prev.spin) career.spinSecs += driveInput.spinSecs - prev.spin;
    prev.spin = driveInput.spinSecs;
    if (driveInput.photos > prev.photos) career.photos += driveInput.photos - prev.photos;
    prev.photos = driveInput.photos;
    // 每新增行驶满 100m 才调度一次节流写盘, 避免逐帧高频落盘
    if (career.odometerM - prev.savedOdo >= 100) {
      prev.savedOdo = career.odometerM;
      scheduleSave();
    }
  }, [driveInput.odometer, driveInput.spinSecs, driveInput.photos, scheduleSave]);

  /** 清除存档联动：生涯计数归零 + 增量记账基准复位（弹层快照由调用方刷新） */
  const resetCareerProgress = useCallback(() => {
    optsRef.current.careerRef.current = defaultCareer();
    careerPrevRef.current = { odo: 0, spin: 0, photos: 0, savedOdo: 0 };
  }, []);

  return {
    careerOpen,
    careerSnap,
    careerOpenRef,
    careerPrevRef,
    setCareerSnap,
    buildCareerSnapshot,
    openCareer,
    closeCareer,
    resetCareerProgress,
  };
}
