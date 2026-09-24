// Tiny external store for high-frequency engine HUD values (clock / fps / dpr / simT).
// These update ~2 Hz from the render loop; routing them through React state would force the
// whole viewer tree to re-render every 500 ms. Instead the engine writes them here and small
// leaf components subscribe via useSyncExternalStore, so only those leaves re-render.

export interface HudState {
  clock: string;
  fps: number;
  dprScale: number;
  simT: number;
  drawCalls: number;
  triangles: number;
}

let hud: HudState = {
  clock: "————–—— –——:——",
  fps: 0,
  dprScale: 1,
  simT: 0,
  drawCalls: 0,
  triangles: 0,
};

const listeners = new Set<() => void>();

export const hudStore = {
  get: (): HudState => hud,
  set: (next: Partial<HudState>) => {
    hud = { ...hud, ...next };
    listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
