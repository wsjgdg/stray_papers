import { AltarPanel } from "@/components/boss-rush/AltarPanel"
import { BossArena } from "@/components/boss-rush/BossArena"
import { RushSettleOverlay } from "@/components/boss-rush/RushSettleOverlay"
import { RushSkillBar } from "@/components/boss-rush/RushSkillBar"
import { RushTopBar } from "@/components/boss-rush/RushTopBar"
import { WaveRelicOverlay } from "@/components/boss-rush/WaveRelicOverlay"
import type { useBossRush } from "@/pages/BossRush/useBossRush"

/** Boss Rush 页：零摩擦无尽连战（View 层，全部状态来自 Logic hook） */
export function BossRushPage(p: ReturnType<typeof useBossRush>) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* 背景层：渐变 + 两处主色光斑，Boss 战氛围 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-card to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />

      <RushTopBar {...p} />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
        {/* hero：标题 + 本局进度一行 */}
        <section className="animate-in fade-in slide-in-from-bottom-4 flex flex-wrap items-end justify-between gap-3 duration-500">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              ⚡ Boss <span className="text-primary">Rush</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              无尽波次单挑广告 Boss：每波打完三选一，随时收手带走祭坛币。不计入今日挑战与主线进度。
            </p>
          </div>
          <div className="flex gap-2 text-center">
            {[
              { label: "本局波数", value: p.wave },
              { label: "击败", value: p.kills },
              { label: "局内币", value: p.runCoins },
              { label: "纪录", value: p.bestWave },
            ].map((cell) => (
              <div
                key={cell.label}
                className="min-w-16 rounded-lg border border-border bg-card px-3 py-2 shadow-md"
              >
                <p className="text-xl font-bold tabular-nums text-primary">{cell.value}</p>
                <p className="text-xs text-muted-foreground">{cell.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 分栏：战斗主区 + 操作侧栏 */}
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <BossArena {...p} />
          <div className="flex flex-col gap-4">
            <RushSkillBar {...p} />
            {p.coinPulse ? (
              <p
                key={p.coinPulse.at}
                className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-sm font-bold text-primary animate-in fade-in slide-in-from-bottom-2 duration-500"
              >
                🪙 +{p.coinPulse.amount} 祭坛币入账（收手或死亡都不掉）
              </p>
            ) : null}
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {p.characterNote} · 波次越深 Boss 血量与攻击按循环递增；
              小 Boss 半血变奏，大 Boss 三阶段（后期你攻速减半、它攻击翻倍，靠闪避保命）。
              召唤物尽快清掉，不然 Boss 会回血。
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        祭坛币只在 Boss Rush 里赚，祭坛永久升级也只在这里生效
      </footer>

      <WaveRelicOverlay {...p} />
      <AltarPanel {...p} />
      <RushSettleOverlay {...p} />
    </div>
  )
}
