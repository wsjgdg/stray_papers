import type { useBossRush } from "@/pages/BossRush/useBossRush"

/** 祭坛弹层：永久升级购买 + 个人纪录 + 最近战绩 */
export function AltarPanel(p: ReturnType<typeof useBossRush>) {
  if (!p.altarOpen) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Boss Rush 祭坛"
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold tracking-widest text-primary">PERMANENT UPGRADE</p>
            <h2 className="mt-1 text-2xl font-black">⛩ 祭坛</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              花祭坛币买永久强化，只影响 Boss Rush 开局，不动主线存档。
            </p>
          </div>
          <button
            type="button"
            onClick={p.closeAltar}
            aria-label="关闭祭坛"
            className="rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-sm font-bold text-primary tabular-nums">
          当前祭坛币 🪙 {p.coins}
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {p.upgradeDefs.map((def) => {
            const level = p.upgrades[def.key]
            const maxed = level >= def.maxLevel
            const cost = def.costOf(level)
            const affordable = !maxed && p.coins >= cost
            return (
              <li
                key={def.key}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 shadow-md"
              >
                <span className="text-2xl" aria-hidden>
                  {def.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{def.name}</span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                      Lv.{level}/{def.maxLevel}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{def.perLevel}</span>
                  {/* 等级点：一眼看清买了多少 */}
                  <span className="mt-1.5 flex gap-1" aria-hidden>
                    {Array.from({ length: def.maxLevel }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-4 rounded-full ${
                          i < level ? p.skin.style.bar : "bg-muted"
                        }`}
                      />
                    ))}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => p.buyUpgrade(def.key)}
                  className={`shrink-0 rounded-btn px-3 py-1.5 text-sm font-bold transition active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-40 ${
                    affordable
                      ? "bg-primary text-primary-foreground hover:brightness-110"
                      : "border border-border text-muted-foreground"
                  }`}
                >
                  {maxed ? "已满级" : `🪙 ${cost}`}
                </button>
              </li>
            )
          })}
        </ul>

        <section className="mt-4 rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            个人纪录：最深 {p.bestWave} 波
          </p>
          {p.rushHistory.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">还没有战绩，去连战几波吧</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {p.rushHistory.slice(0, 5).map((rec, i) => (
                <li
                  key={`${rec.endedAt}-${i}`}
                  className="flex items-center justify-between text-xs tabular-nums"
                >
                  <span className="truncate text-card-foreground">
                    {rec.characterName} · {rec.wave} 波 · 击败 {rec.kills}
                  </span>
                  <span className="ml-2 shrink-0 font-semibold text-primary">+{rec.coins} 🪙</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {p.purchaseNotice ? (
          <p
            role="status"
            className="mt-3 rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-center text-sm font-semibold text-primary animate-in fade-in duration-300"
          >
            {p.purchaseNotice}
          </p>
        ) : null}
      </div>
    </div>
  )
}
