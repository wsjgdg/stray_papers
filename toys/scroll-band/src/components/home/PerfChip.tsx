import type { useHome } from "@/pages/Home/useHome";

// 「性能」chip：三态循环 自动 → 完整 → 省电。
// 自动 = 实测帧率连续偏低时自行减粒子/关光带，流畅了自动回到完整；
// 完整 = 永不降级；省电 = 手动常驻降级（老设备/投屏用）。
export function PerfChip(p: ReturnType<typeof useHome>) {
  const next = p.perfMode === "auto" ? "full" : p.perfMode === "full" ? "perf" : "auto";
  const label =
    p.perfMode === "auto" ? "性能·自动" : p.perfMode === "full" ? "性能·完整" : "性能·省电";
  const hot = p.perfActive;
  return (
    <button
      type="button"
      onClick={() => p.onSetPerfMode(next)}
      aria-pressed={hot}
      aria-label={`性能模式：${label}，实测 ${p.fpsNow} FPS，画面降级${hot ? "已生效" : "未生效"}`}
      title={`实测帧率 ${p.fpsNow} FPS——自动模式下连续低于 30 FPS 会减粒子、关光带拖尾与抖动，回到 55 FPS 以上自动恢复完整；省电则常驻降级`}
      className={
        hot
          ? "border border-primary bg-primary/10 px-2 py-0.5 text-primary focus-visible:shadow-[var(--focus-ring)]"
          : "border border-border px-2 py-0.5 hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
      }
    >
      {hot ? "⚡" : ""}
      {label}
    </button>
  );
}
