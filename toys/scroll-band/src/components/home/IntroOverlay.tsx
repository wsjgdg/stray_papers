import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { useHome } from "@/pages/Home/useHome";
import { prefersReducedMotion } from "./usePanelMotion";

// 启动层：文字逐行浮现 + 呼吸圆从缩放到舒张、随后持续呼吸律动（用户偏好减少动效时静止呈现）
export function IntroOverlay(p: ReturnType<typeof useHome>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const rm = prefersReducedMotion();
    const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: rm ? 0 : 0.7 } });
    tl.from("[data-intro-line]", { y: rm ? 0 : 16, autoAlpha: 0, stagger: rm ? 0 : 0.12 });
    if (ringRef.current) {
      tl.from(
        ringRef.current,
        { scale: rm ? 1 : 0.5, autoAlpha: 0, ease: rm ? "power2.out" : "back.out(1.6)" },
        rm ? 0 : "<0.15",
      );
      // 舒张完成后接管为持续呼吸律动（同一条时间线，属性交接不冲突）
      if (!rm)
        tl.to(
          ringRef.current,
          { scale: 1.1, opacity: 0.72, duration: 2.4, ease: "sine.inOut", repeat: -1, yoyo: true },
          "+=0.1",
        );
    }
  }, { scope: rootRef });

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center gap-8 bg-background text-center"
      onClick={p.onStart}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          p.onStart();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="进入声音世界"
    >
      <div className="flex flex-col items-center gap-8 px-6">
        <p data-intro-line className="font-mono text-xs tracking-widest text-muted-foreground">
          SCROLL ORCHESTRA
        </p>
        <div className="relative flex items-center justify-center">
          <div
            ref={ringRef}
            className="h-28 w-28 rounded-full border border-primary/40 bg-gradient-to-b from-primary/10 to-transparent"
          />
          <div data-intro-line className="absolute h-2 w-2 rounded-full bg-primary" />
        </div>
        <h1 data-intro-line className="font-mono text-5xl font-bold text-foreground md:text-6xl">
          滚动乐团
        </h1>
        <p data-intro-line className="text-lg text-foreground/80">
          移动鼠标或轻点屏幕，唤醒声音
        </p>
        <p data-intro-line className="font-mono text-xs text-muted-foreground">
          点击任意处进入 · 进入后随时按 ? 查看使用说明
        </p>
      </div>
    </div>
  );
}
