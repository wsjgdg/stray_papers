import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ *
 * HUD 构筑包（hud-forge-pack.md）：两个 72px 圆形钮已迁出为页面级
 * FloatingAction（可拖拽构筑）。本组件保留技能名称 / 描述 / 蓄力提示 /
 * 切目标小对钮，原位渲染；两个等尺寸占位锚点（data-skill-home /
 * data-dodge-home）让 FloatingAction 的 default 停靠位实测贴回原位置。
 * ------------------------------------------------------------------ */

export type SkillBarProps = {
  activeName: string
  activeDesc: string
  /** 长按蓄力：是否正在蓄力（只用于提示文案） */
  skillCharging: boolean
  /** 拇指区（ui-pack.md v2 四）：存活目标 >1 时显示「‹ ›」切目标，等价键盘 ←→ */
  canSwitchTarget?: boolean
  onSwitchTarget?: (dir: number) => void
  /** drift 故障（fun-pack.md 二）：信息列 ±14px 慢漂移（圆钮漂移在 FloatingAction 上） */
  drift?: boolean
}

export function SkillBar({
  activeName,
  activeDesc,
  skillCharging,
  canSwitchTarget = false,
  onSwitchTarget,
  drift = false,
}: SkillBarProps) {
  return (
    <section className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-md sm:p-4">
      <div className="min-h-[3.5rem] min-w-0">
        <p className="truncate font-display text-base font-bold">
          {activeName}
          <kbd className="ml-2 shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            空格
          </kbd>
        </p>
        <p className="line-clamp-2 font-mono text-xs text-muted-foreground">
          {activeDesc}
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {skillCharging
            ? "蓄力中…松手释放"
            : "按住可蓄力翻倍 · 按住拖出：贴屏幕边缘=构筑收益，落在敌人=故障打击"}
        </p>
      </div>

      {/* 拇指区：切目标小对钮原位保留（等价键盘 ←→）；圆钮位置上留等尺寸占位，
          FloatingAction 实测这里作为「default 停靠位」。touch-manipulation 去点击延迟 */}
      <div
        className={cn(
          "mt-auto flex touch-manipulation items-end justify-between",
          drift && "skill-drift",
        )}
      >
        {canSwitchTarget && onSwitchTarget ? (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSwitchTarget(-1)}
              aria-label="切换上一个目标"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border font-mono text-base font-bold text-muted-foreground transition hover:border-primary/60 hover:text-primary active:scale-90 focus-visible:outline-none focus-visible:shadow-focus"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => onSwitchTarget(1)}
              aria-label="切换下一个目标"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border font-mono text-base font-bold text-muted-foreground transition hover:border-primary/60 hover:text-primary active:scale-90 focus-visible:outline-none focus-visible:shadow-focus"
            >
              ›
            </button>
          </span>
        ) : (
          <span aria-hidden className="h-11 w-11 shrink-0" />
        )}
        {/* 闪避 / 主动技圆钮的等尺寸占位锚（FloatingAction default 位实测目标） */}
        <span
          aria-hidden
          data-dodge-home
          className="grid size-[72px] shrink-0 place-items-center rounded-full border border-dashed border-border/40"
        />
        <span
          aria-hidden
          data-skill-home
          className="grid size-[72px] shrink-0 place-items-center rounded-full border border-dashed border-border/40"
        />
      </div>
    </section>
  )
}
