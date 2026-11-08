// 迁跃过场动画（增强 N 扩展）：飞行阶段链点击迁跃 / 跳过后确认瞬间全屏播放——
// 中心 primary 闪光 + 两道扩散光环 + 24 道径向光迹四散, 中央显示目标阶段; 到时自动退出。
// portal 到 body, z-index 高于迁跃确认框; 省动画模式退化为快速淡入淡出纯文字。颜色全部 token 类。
import { useEffect } from "react";
import { createPortal } from "react-dom";

const STREAK_ANGLES = Array.from({ length: 24 }, (_, i) => i * 15 + 7);

interface WarpTransitionProps {
  /** 目标阶段中文名 */
  label: string;
  reducedMotion?: boolean;
  /** 动画播完回调（Logic 层清空迁跃标记） */
  onDone: () => void;
}

export function WarpTransition({ label, reducedMotion = false, onDone }: WarpTransitionProps) {
  useEffect(() => {
    const t = window.setTimeout(onDone, reducedMotion ? 550 : 1600);
    return () => window.clearTimeout(t);
  }, [onDone, reducedMotion]);

  return createPortal(
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-background/95 ${
        reducedMotion ? "warp-in-out-fast" : "warp-in-out"
      }`}
      role="status"
      aria-label={`空间迁跃中, 目标阶段${label}`}
    >
      {!reducedMotion && (
        <>
          <span className="absolute inset-0 bg-primary warp-flash" aria-hidden="true" />
          <span
            className="absolute left-1/2 top-1/2 h-40 w-40 rounded-full border-2 border-primary/70 warp-ring"
            aria-hidden="true"
          />
          <span
            className="absolute left-1/2 top-1/2 h-40 w-40 rounded-full border border-primary/40 warp-ring"
            style={{ animationDelay: "160ms" }}
            aria-hidden="true"
          />
          {STREAK_ANGLES.map((deg, i) => (
            <span
              key={deg}
              className="absolute left-1/2 top-1/2 h-px w-[45vmax] origin-left"
              style={{ transform: `rotate(${deg}deg)` }}
              aria-hidden="true"
            >
              <span
                className="warp-streak block h-full w-full origin-left bg-gradient-to-r from-transparent via-primary to-transparent"
                style={{ animationDelay: `${(i % 6) * 55}ms` }}
              />
            </span>
          ))}
        </>
      )}
      <div className={`relative text-center ${reducedMotion ? "" : "toast-pop"}`}>
        <p className="font-mono text-[10px] tracking-[0.5em] text-muted-foreground">TIMELINE WARP · IN PROGRESS</p>
        <p className="mt-2 font-display text-2xl font-bold tracking-widest text-primary">空间迁跃</p>
        <p className="mt-1.5 text-sm text-card-foreground">
          目标阶段「<span className="font-bold text-primary">{label}</span>」
        </p>
      </div>
    </div>,
    document.body,
  );
}
