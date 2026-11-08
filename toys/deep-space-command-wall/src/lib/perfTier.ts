// 性能档位（localStorage 键 dsc-perf-tier）：full / balanced / saver 三档。
// 顶栏 Gauge 按钮循环切换; canvas 帧率封顶走时间戳跳帧; 粒子密度 / 常驻动画按档降载。
// reducedMotion 优先级最高：开启时无视档位, 一律取最省 saver 剖面。

export type PerfTier = "full" | "balanced" | "saver";

export const PERF_TIERS: PerfTier[] = ["full", "balanced", "saver"];

export const PERF_TIER_LABEL: Record<PerfTier, string> = {
  full: "画质 FULL",
  balanced: "均衡 BALANCED",
  saver: "省电 SAVER",
};

export const PERF_TIER_HINT: Record<PerfTier, string> = {
  full: "全特效 · 高帧率",
  balanced: "减半粒子 · 帧率封顶 45",
  saver: "最低负载 · 帧率封顶 30",
};

const PERF_KEY = "dsc-perf-tier";

/** 读档（存储不可用 / 非法值静默回 full） */
export function loadPerfTier(): PerfTier {
  try {
    const raw = window.localStorage.getItem(PERF_KEY);
    return raw === "balanced" || raw === "saver" ? raw : "full";
  } catch {
    return "full";
  }
}

export function savePerfTier(tier: PerfTier): void {
  try {
    window.localStorage.setItem(PERF_KEY, tier);
  } catch {
    // 存储不可用时仅内存态
  }
}

export function nextPerfTier(tier: PerfTier): PerfTier {
  const i = PERF_TIERS.indexOf(tier);
  return PERF_TIERS[(i + 1) % PERF_TIERS.length];
}

/** 单档降载剖面（canvas / 粒子 / 常驻屏幕层统一从这里取数） */
export interface PerfProfile {
  /** 帧率上限, 0 = 不封顶 */
  fpsCap: number;
  /** 流星调度密度系数（间隔倒数） */
  meteorMult: number;
  /** 轮尘 / 漂移尘 / 环境尘土粒子上限系数 */
  dustMult: number;
  /** 爆散（lockBurst 等）粒子上限系数 */
  burstMult: number;
  /** 落地 confetti 片数 */
  confettiCount: number;
  /** 是否渲染全屏幕布层（film-grain / 极光 veil） */
  screenLayers: boolean;
  /** 星空常驻星数系数 */
  starMult: number;
}

export const PERF_PROFILE: Record<PerfTier, PerfProfile> = {
  full: {
    fpsCap: 0,
    meteorMult: 1,
    dustMult: 1,
    burstMult: 1,
    confettiCount: 12,
    screenLayers: true,
    starMult: 1,
  },
  balanced: {
    fpsCap: 45,
    meteorMult: 0.5,
    dustMult: 0.5,
    burstMult: 0.5,
    confettiCount: 12,
    screenLayers: true,
    starMult: 1,
  },
  saver: {
    fpsCap: 30,
    meteorMult: 1 / 3,
    dustMult: 1 / 3,
    burstMult: 1 / 3,
    confettiCount: 6,
    screenLayers: false,
    starMult: 0.75,
  },
};

/** 生效剖面：reducedMotion 开启时无视档位, 取 saver（优先级最高） */
export function effectiveProfile(tier: PerfTier, reducedMotion: boolean): PerfProfile {
  return PERF_PROFILE[reducedMotion ? "saver" : tier];
}

/** raf 时间戳跳帧判定：true = 本帧跳过绘制（fpsCap<=0 永不跳） */
export function shouldSkipFrame(now: number, lastDrawMs: number, fpsCap: number): boolean {
  if (fpsCap <= 0) return false;
  return now - lastDrawMs < 1000 / fpsCap - 2;
}

/* ---- 模块级生效剖面单例（canvas 渲染循环逐帧读取, 免 props 逐层透传） ---- */

let activeProfile: PerfProfile = effectiveProfile(loadPerfTier(), false);

/** 档位 / 减弱动画变化时由 useHome 同步一次 */
export function setActivePerf(tier: PerfTier, reducedMotion: boolean): void {
  activeProfile = effectiveProfile(tier, reducedMotion);
}

/** canvas draw 循环每帧读取当前生效剖面 */
export function getActivePerf(): PerfProfile {
  return activeProfile;
}
