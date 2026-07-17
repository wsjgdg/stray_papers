'use client';

import { create } from 'zustand';

/**
 * 跨组件手势联动状态。
 * 独立于主 store（lib/store.ts），不进入 persist —— 这些都是瞬时手感信号，
 * 切页后靠“入场触发”消费，不需要跨刷新保留。
 *
 * 语义：
 * - heatWarning：劝退页处于“正午 + 怕热中暑”时置 true，并刷新 pulseAt 时间戳；
 *   体力页挂载时若处于窗口期，则“预计体力消耗”数值入场跳动 + 变淡红。
 * - sosActive：SOS 长按触发中，供两个页面共享边缘红光晕（单页渲染下只在当前页生效）。
 */

interface SharedMotionState {
  heatWarning: boolean;
  heatWarningPulseAt: number;
  sosActive: boolean;
  setHeatWarning: (active: boolean) => void;
  setSosActive: (active: boolean) => void;
}

export const useSharedMotionStore = create<SharedMotionState>((set) => ({
  heatWarning: false,
  heatWarningPulseAt: 0,
  sosActive: false,
  setHeatWarning: (active) =>
    set((s) =>
      active
        ? { heatWarning: true, heatWarningPulseAt: Date.now() }
        : s.heatWarning
          ? { heatWarning: false }
          : s,
    ),
  setSosActive: (active) => set({ sosActive: active }),
}));

/** 入场联动窗口期（ms）：超过则忽略本次 pulse。 */
export const HEAT_WARNING_WINDOW = 5000;
