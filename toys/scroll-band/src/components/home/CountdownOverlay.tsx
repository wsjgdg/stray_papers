import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { useHome } from "@/pages/Home/useHome";
import { prefersReducedMotion } from "./usePanelMotion";

// 挑战模式 · 3·2·1 倒计时（UI 动画由 Logic 的 rAF 驱动，音符时刻仍走音频时钟）
// 每个数字落下时带一次从大到小的冲击式入场（用户偏好减少动效时只淡入）
export function CountdownOverlay(p: ReturnType<typeof useHome>) {
  const numRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = numRef.current;
    if (!el) return;
    const rm = prefersReducedMotion();
    gsap.fromTo(
      el,
      { scale: rm ? 1 : 2.2, autoAlpha: 0 },
      {
        scale: 1,
        autoAlpha: 1,
        duration: rm ? 0 : 0.45,
        ease: rm ? "power2.out" : "expo.out",
        overwrite: true,
      },
    );
  }, { dependencies: [p.countdownNum] });

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center">
      <div
        key={p.countdownNum}
        ref={numRef}
        className="font-mono text-9xl font-bold text-foreground"
      >
        {p.countdownNum}
      </div>
      <div className="mt-4 border border-border bg-background/60 px-3 py-1 font-mono text-xs tracking-widest text-muted-foreground backdrop-blur">
        {p.challengeLevelName} · 准备
      </div>
    </div>
  );
}
