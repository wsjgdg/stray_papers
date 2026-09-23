import { useState } from "react"
import {
  MAX_RELIC_SLOTS,
  RELIC_RARITY_STYLE,
  RELIC_RISK_LABEL,
  RELIC_RISK_STYLE,
  RELIC_SCHOOL_STYLE,
} from "@/lib/dungeonData"
import type { useBossRush } from "@/pages/BossRush/useBossRush"

/** 波间三选一：确认 / 替换（满 6 时先点旧词条再点新卡）/ 跳过 */
export function WaveRelicOverlay(p: ReturnType<typeof useBossRush>) {
  const [replaceId, setReplaceId] = useState<string | null>(null)
  if (p.phase !== "relic" || !p.choices) return null
  const needReplace = p.relicFull
  const confirmed = !needReplace || replaceId !== null

  const confirmPick = (index: number) => {
    const choice = p.choices?.[index]
    if (!choice) return
    p.pickChoice(choice, needReplace ? (replaceId ?? undefined) : undefined)
    setReplaceId(null)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="波间三选一"
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background/85 p-4 backdrop-blur-sm animate-in fade-in duration-300"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-bold tracking-widest text-primary">第 {p.wave} 波已清空</p>
            <h2 className="mt-1 text-2xl font-black">⚡ 三选一 · 带走一条词条</h2>
          </div>
          <span className="rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary tabular-nums">
            本局 +{p.runCoins} 🪙
          </span>
        </div>

        {needReplace ? (
          <p className="mt-2 rounded-md border border-sys-network/50 bg-sys-network/10 px-3 py-2 text-sm text-sys-network">
            词条已满 {MAX_RELIC_SLOTS}/{MAX_RELIC_SLOTS}：先点下面想淘汰的旧词条，再点新卡替换；不想要就直接跳过。
          </p>
        ) : null}

        {needReplace ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.relics.map((relic) => (
              <button
                key={relic.id}
                type="button"
                onClick={() => setReplaceId(replaceId === relic.id ? null : relic.id)}
                className={`rounded-md border px-2 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:shadow-focus ${
                  replaceId === relic.id
                    ? "border-primary bg-primary/10 text-primary"
                    : `${RELIC_SCHOOL_STYLE[relic.school].chip} opacity-80 hover:opacity-100`
                }`}
              >
                {relic.name}
                {replaceId === relic.id ? " ❌待淘汰" : ""}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {p.choices.map((relic, index) => {
            const style = RELIC_SCHOOL_STYLE[relic.school]
            return (
              <button
                key={relic.id}
                type="button"
                disabled={!confirmed}
                onClick={() => confirmPick(index)}
                className={`flex h-full flex-col rounded-lg border bg-background p-3 text-left shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 ${style.ring} ${RELIC_RARITY_STYLE[relic.rarity]}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
                  <span className="text-xs font-mono text-muted-foreground">{relic.code}</span>
                </span>
                <span className="mt-1 text-base font-black text-foreground">{relic.name}</span>
                <span className="mt-1 flex-1 text-xs leading-relaxed text-card-foreground">
                  {relic.desc}
                </span>
                <span className="mt-2 flex items-center justify-between text-xs">
                  <span className={`rounded border px-1.5 py-0.5 font-semibold ${style.chip}`}>
                    {relic.school === "general" ? "通用" : relic.school}
                  </span>
                  <span className={RELIC_RISK_STYLE[relic.risk]}>
                    风险 {RELIC_RISK_LABEL[relic.risk]}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex justify-between gap-2">
          <button
            type="button"
            onClick={p.skipChoice}
            className="rounded-btn border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
          >
            都不要，直接下一波
          </button>
          {needReplace ? (
            <p className="self-center text-xs text-muted-foreground">
              {confirmed ? "已选好淘汰对象，点上面新卡确认" : "先选一条旧词条淘汰"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
