import type { useDaily } from "@/pages/Daily/useDaily"

import { DailyBestPanel } from "@/components/daily/DailyBestPanel"
import { DailyFooter } from "@/components/daily/DailyFooter"
import { DailyHero } from "@/components/daily/DailyHero"
import { DailyTopBar } from "@/components/daily/DailyTopBar"
import { LeaderboardPanel } from "@/components/daily/LeaderboardPanel"
import { TodaySeedCard } from "@/components/daily/TodaySeedCard"

export function DailyPage(p: ReturnType<typeof useDaily>) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/10 via-background to-background"
      />

      <div className="relative flex min-h-screen flex-col">
        <DailyTopBar
          dateLabel={p.dateLabel}
          myRank={p.myRank}
          fragments={p.fragments}
          cores={p.cores}
          seeds={p.seeds}
          onGoHome={p.goHome}
          onAccountChange={p.handleAccountChange}
        />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          <DailyHero dateLabel={p.dateLabel} shortCode={p.dailyShortCode} />

          <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_3fr]">
            <div className="flex flex-col gap-6">
              <TodaySeedCard
                dateLabel={p.dateLabel}
                dailySeed={p.dailySeed}
                dailyShortCode={p.dailyShortCode}
                copied={Boolean(p.copiedSeed)}
                characterLabel={p.characterLabel}
                curseLabel={p.curseLabel}
                relicPoolSize={p.relicPoolSize}
                routePoolSize={p.routePoolSize}
                enemyPoolSize={p.enemyPoolSize}
                attemptsLeft={p.dailyAttemptsLeft}
                attemptsTotal={p.dailyAttemptsTotal}
                canRetry={p.canRetry}
                dailyDone={p.dailyDone}
                countdownLabel={p.countdownLabel}
                onCopySeed={p.copySeed}
                onStartRun={p.startDailyRun}
              />
              <DailyBestPanel bestToday={p.bestToday} floorTotal={p.floorTotal} />
            </div>

            <LeaderboardPanel
              boardState={p.boardState}
              boardRows={p.boardRows}
              boardLimit={p.boardLimit}
              myRank={p.myRank}
              loggedIn={p.loggedIn}
              weeklyState={p.weeklyState}
              weeklyRows={p.weeklyRows}
              onReload={p.reloadBoard}
            />
          </div>
        </main>

        <DailyFooter onGoHome={p.goHome} />

        {p.notice ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
            <p className="rounded-md border border-border bg-card px-4 py-2 text-sm text-card-foreground shadow-md">
              {p.notice}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
