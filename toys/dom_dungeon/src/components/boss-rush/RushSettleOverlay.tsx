import type { useBossRush } from "@/pages/BossRush/useBossRush"

/** 结算弹层：死亡 / 收手两种口径 + 三按钮 */
export function RushSettleOverlay(p: ReturnType<typeof useBossRush>) {
  if (p.phase !== "settle" || !p.settle) return null
  const dead = p.settle.kind === "dead"
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="本局结算"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
        <p className={`text-xs font-bold tracking-widest ${dead ? "text-destructive" : "text-primary"}`}>
          {dead ? "连战中断线" : "见好就收"}
        </p>
        <h2 className="mt-1 text-3xl font-bold">
          {dead ? "你倒下了" : "带币回营"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{p.settle.cause}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "打到波数", value: p.wave },
            { label: "击败 Boss", value: p.kills },
            { label: "入账祭坛币", value: p.runCoins },
          ].map((cell) => (
            <div
              key={cell.label}
              className="rounded-lg border border-border bg-background p-3 shadow-md"
            >
              <p className="text-2xl font-bold tabular-nums text-primary">{cell.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{cell.label}</p>
            </div>
          ))}
        </div>

        {p.settle.newRecord ? (
          <p className="mt-3 rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-center text-sm font-bold text-primary shadow-glow-cyan animate-in fade-in duration-500">
            🏆 新纪录！个人最深 {p.wave} 波
          </p>
        ) : (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            个人纪录 {p.bestWave} 波
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={p.restart}
            className="rounded-btn bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-focus"
          >
            ⚡ 再来一局（祭坛升级已生效）
          </button>
          <button
            type="button"
            onClick={p.openAltar}
            className="rounded-btn border border-border px-4 py-2.5 text-sm font-semibold transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            ⛩ 去祭坛花币
          </button>
          <button
            type="button"
            onClick={p.goHome}
            className="rounded-btn border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
          >
            回首页
          </button>
        </div>
      </div>
    </div>
  )
}
