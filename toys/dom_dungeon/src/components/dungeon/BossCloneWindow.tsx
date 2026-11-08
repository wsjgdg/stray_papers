import { CLONE_CAST_MS, CLONE_TAPS } from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

type BossCloneWindowProps = {
  /** 分身读条剩余比例 1→0（底部读条反色用：越接近满越逼近放完） */
  ratio: number
  /** 主窗口实时血量百分比（父级每帧现算，张力读数） */
  hpPercent: number
  /** 打断还差的 × 连点数 */
  tapsLeft: number
  /** 低配：关入场动画与进度条过渡，机制照常 */
  lowSpec: boolean
  /** 点 ×：引擎扣 bossCloneTaps，归零 = 打断成功（本体眩晕 2.5 秒） */
  onTap: () => void
}

/**
 * 分身窗口（browser-powers-pack.md 一）：Boss「多标签同步」在标签栏强行开出的
 * fake 垃圾窗口审美「广告分身.exe」。中央大 × 连点 3 下 = 打断大招；
 * 不管它 7 秒读满 = 吃 20 伤的跨窗口大招（主战场期间照常挨打）。
 * 全部 pointer 事件 stopPropagation——防误触战斗区的滑动闪避（假按钮/糊屏窗同款教训）。
 * 读满或被打断时由父级卸载（bossClone 变 null 即卸载 = 输入恢复）。
 */
export function BossCloneWindow({
  ratio,
  hpPercent,
  tapsLeft,
  lowSpec,
  onTap,
}: BossCloneWindowProps) {
  const fill = Math.max(0, Math.min(1, 1 - ratio))

  return (
    <div
      className="fixed inset-0 z-50 grid touch-none place-items-center bg-background/85 p-4 backdrop-blur-sm"
      onPointerDown={(ev) => ev.stopPropagation()}
      onPointerMove={(ev) => ev.stopPropagation()}
      onPointerUp={(ev) => ev.stopPropagation()}
      onClick={(ev) => ev.stopPropagation()}
    >
      <div
        role="dialog"
        aria-label="广告分身窗口：连点中央大 × 三下打断它的大招"
        className={cn(
          "relative w-72 select-none rounded-md border-2 border-destructive bg-card p-3 text-card-foreground shadow-glow-red",
          !lowSpec && "animate-in fade-in zoom-in-95 duration-300",
        )}
      >
        {/* 标题栏（fake 垃圾窗口：⚠ + 假最小化/最大化钮，纯装饰不可点） */}
        <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
          <span className="truncate font-mono text-xs font-bold text-destructive">
            ⚠ 广告分身.exe — 正在放大招
          </span>
          <span aria-hidden className="flex shrink-0 items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border" />
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border" />
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border" />
          </span>
        </div>

        {/* 正文：主窗口实时血量——你看分身的时候，主战场在挨打 */}
        <p className="pt-2 text-center font-mono text-xs">
          主窗口 HP{" "}
          <span className="font-bold text-destructive">{hpPercent}%</span>
        </p>
        <p className="mt-0.5 text-center text-[10px] text-muted-foreground">
          它正借这个窗口读大招 · 你不在的时候主战场照常挨打
        </p>

        {/* 中央大 ×：连点 3 下打断；徽标 = 还差点数 / 总需点数 */}
        <button
          type="button"
          aria-label={`砸 × 打断大招，还差 ${tapsLeft} 下`}
          onPointerDown={(ev) => ev.stopPropagation()}
          onPointerUp={(ev) => ev.stopPropagation()}
          onClick={(ev) => {
            ev.stopPropagation()
            onTap()
          }}
          className={cn(
            "relative mx-auto mt-3 grid h-16 w-16 touch-none place-items-center rounded-md border-2 border-destructive bg-destructive/10 font-mono text-3xl font-bold leading-none text-destructive transition active:scale-90 focus-visible:outline-none focus-visible:shadow-glow-red",
            !lowSpec && "hover:brightness-125",
          )}
        >
          ×
          <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {tapsLeft}/{CLONE_TAPS}
          </span>
        </button>

        {/* 底部读条：反色逼近满格（剩余越少填得越满） */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-muted">
          <div
            className={cn(
              "h-full bg-destructive",
              !lowSpec && "transition-[width] duration-200 ease-linear",
            )}
            style={{ width: `${Math.round(fill * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          大招还有 {Math.ceil((ratio * CLONE_CAST_MS) / 1000)} 秒放完 · 砸 × 打断它
        </p>
      </div>
    </div>
  )
}
