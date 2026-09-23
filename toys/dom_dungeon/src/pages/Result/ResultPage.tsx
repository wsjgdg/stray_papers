import { Sparkles } from "lucide-react"

import { FragmentRewardPanel } from "@/components/result/FragmentRewardPanel"
import { MilestoneRewardsPanel } from "@/components/result/MilestoneRewardsPanel"
import { NewAchievementsBanner } from "@/components/result/NewAchievementsBanner"
import { RelicLoadoutPanel } from "@/components/result/RelicLoadoutPanel"
import { ResultActions } from "@/components/result/ResultActions"
import { ResultTopBar } from "@/components/result/ResultTopBar"
import { RunStoryPanel } from "@/components/result/RunStoryPanel"
import { RunSummaryCard } from "@/components/result/RunSummaryCard"
import { ScoreBreakdownPanel } from "@/components/result/ScoreBreakdownPanel"
import { SeedPanel } from "@/components/result/SeedPanel"
import { ShareImagePanel } from "@/components/result/ShareImagePanel"
import type { useResult } from "@/pages/Result/useResult"

export function ResultPage(p: ReturnType<typeof useResult>) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-card to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-destructive/10 blur-3xl"
      />

      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <ResultTopBar
          characterName={p.characterName}
          cleared={p.cleared}
          floor={p.floor}
          floorTotal={p.floorTotal}
          seed={p.seed}
          copiedSeed={p.copiedSeed}
          fragments={p.fragments}
          cores={p.cores}
          seeds={p.seeds}
          onCopySeed={p.copySeed}
        />
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-5xl flex-1 content-start gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[3fr_2fr]">
        <section
          aria-label="本局结局"
          className="animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5 lg:col-span-2"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-primary">
                {p.cleared ? "地牢打穿" : "本局结束"}
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {p.cleared ? "这一局，你赢了" : "标签还没关完"}
              </h1>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              本局用时 {p.durationLabel} · 历史最深 {p.bestFloor} 层
            </p>
          </div>
          <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {p.cause}
          </p>
        </section>

        <NewAchievementsBanner
          achievements={p.newAchievements}
          lowSpec={p.lowSpec}
        />

        <section aria-label="战绩详情" className="flex flex-col gap-4">
          <RunSummaryCard
            characterName={p.characterName}
            roleLabel={p.roleLabel}
            characterStats={p.characterStats}
            skinStyle={p.skinStyle}
            skinName={p.skinName}
            cleared={p.cleared}
            floor={p.floor}
            floorTotal={p.floorTotal}
            cause={p.cause}
            kills={p.kills}
            damageDealt={p.damageDealt}
            reward={p.reward}
            durationLabel={p.durationLabel}
            bestFloor={p.bestFloor}
            memoryEff={p.memoryEff}
            memoryGained={p.memoryGained}
            memorySpent={p.memorySpent}
            maxFrags={p.maxFrags}
            defrags={p.defrags}
            overclocks={p.overclocks}
          />
          <RelicLoadoutPanel
            relics={p.relics}
            bonds={p.bonds}
            schoolSummary={p.schoolSummary}
          />
          <RunStoryPanel
            story={p.story}
            seed={p.seed}
            durationLabel={p.durationLabel}
            lowSpec={p.lowSpec}
          />
        </section>

        <section aria-label="碎片与分享" className="flex flex-col gap-4">
          {p.runScore ? (
            <ScoreBreakdownPanel
              score={p.runScore}
              diagnosis={p.scoreDiagnosis}
              advice={p.scoreAdvice}
              lowSpec={p.lowSpec}
            />
          ) : null}
          <MilestoneRewardsPanel items={p.settleItems} />
          <FragmentRewardPanel
            earnedFragments={p.earnedFragments}
            fragments={p.fragments}
            animatedTotal={p.animatedTotal}
            progressRatio={p.progressRatio}
            unlockCost={p.unlockCost}
            rangerName={p.rangerName}
            rangerUnlocked={p.rangerUnlocked}
            fragmentsNeeded={p.fragmentsNeeded}
            canUnlock={p.canUnlock}
            onUnlock={p.unlockRanger}
          />
          <SeedPanel
            seed={p.seed}
            copiedSeed={p.copiedSeed}
            onCopySeed={p.copySeed}
            buildCode={p.buildCode}
            copiedBuild={p.copiedBuild}
            onCopyBuild={p.copyBuild}
            onStartNewRun={p.startNewRun}
          />
          <ShareImagePanel
            shareStatus={p.shareStatus}
            onSave={p.saveShareImage}
          />
        </section>
      </main>

      <footer className="relative z-10 border-t border-border bg-card/60 backdrop-blur">
        <ResultActions
          characterName={p.characterName}
          durationLabel={p.durationLabel}
          bestFloor={p.bestFloor}
          floor={p.floor}
          onStartNewRun={p.startNewRun}
          onGoHome={p.goHome}
        />
      </footer>

      {p.notice ? (
        <p
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 rounded-md border border-primary/50 bg-card px-4 py-2 font-mono text-xs text-card-foreground shadow-md duration-300"
        >
          {p.notice}
        </p>
      ) : null}
    </div>
  )
}
