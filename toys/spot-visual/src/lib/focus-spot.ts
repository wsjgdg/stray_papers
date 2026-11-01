"use client";

// ═══ 当前关注的景点（会话级） ═══
// 为什么单独放一份：劝退指南的「假想目的地」和 PTSI 的「7 日出行窗口」
// 各选各的景点，同一个页面里一个人可能看到两个不同的目的地/两套天气。
// 这里收成一个共享意图：谁设置，两处都跟着走。
//
// 刻意**不用**主 store（`spot-app`）：
//  1) 它是会话内的一次性意图，不该写进 localStorage（否则下次打开还背着旧景点）；
//  2) 主 store 的 partialize 正被别的改动动过，放这里避免冲突。

import { create } from "zustand";

interface FocusSpotState {
  id: string | null;
  setName: (id: string | null) => void;
}

export const useFocusSpot = create<FocusSpotState>((set) => ({
  id: null,
  setName: (id) => set({ id }),
}));
