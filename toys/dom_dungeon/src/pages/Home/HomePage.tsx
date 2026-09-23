import { HowToPlayOverlay } from "@/components/shared/HowToPlayOverlay"
import { ChallengeEntries } from "@/components/home/ChallengeEntries"
import { CharacterRoster } from "@/components/home/CharacterRoster"
import { DiskJunkPanel } from "@/components/home/DiskJunkPanel"
import { EntryReadyPanel } from "@/components/home/EntryReadyPanel"
import { HeroBanner } from "@/components/home/HeroBanner"
import { HomeTopBar } from "@/components/home/HomeTopBar"
import { LastRunFooter } from "@/components/home/LastRunFooter"
import { MailboxPanel } from "@/components/home/MailboxPanel"
import { RecentRunsPanel } from "@/components/home/RecentRunsPanel"
import { RotatingTips } from "@/components/home/RotatingTips"
import { SettingsPanel } from "@/components/home/SettingsPanel"
import { TodayStatsPanel } from "@/components/home/TodayStatsPanel"
import type { useHome } from "@/pages/Home/useHome"

export function HomePage(p: ReturnType<typeof useHome>) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-card to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-1/2 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />

      <HomeTopBar
        fragments={p.fragments}
        cores={p.cores}
        seeds={p.seeds}
        onOpenSettings={p.openSettings}
        onOpenHelp={() => p.setHelpOpen(true)}
      />

      {p.recordBanner ? (
        <div
          role="status"
          className="relative z-20 mx-auto w-full max-w-6xl animate-in fade-in slide-in-from-top-4 px-4 pt-4 duration-500"
        >
          <div className="rounded-md border border-primary/50 bg-primary/10 px-4 py-2.5 text-center text-sm font-bold text-primary shadow-glow-cyan">
            {p.recordBanner}
          </div>
        </div>
      ) : null}

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:py-12">
        {/* 好友种子挑战：分享链接带 ?seed= 进来时挂横幅，不自动开局 */}
        {p.friendSeed ? (
          <section className="animate-in fade-in slide-in-from-top-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/50 bg-primary/10 px-4 py-3 shadow-glow-cyan">
            <p className="text-sm font-semibold text-primary">
              🎁 好友种子挑战 · 对方留下了种子{" "}
              <span className="font-mono font-bold">{p.friendSeed}</span>
              ，用当前角色来挑战同一座地牢？
            </p>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={p.startWithFriendSeed}
                className="rounded-btn bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus"
              >
                用这个种子开局
              </button>
              <button
                type="button"
                onClick={p.dismissFriendSeed}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
              >
                先不了
              </button>
            </span>
          </section>
        ) : null}

        <HeroBanner
          dailyShortCode={p.dailyShortCode}
          dailyCleared={p.dailyCleared}
          devMode={p.devMode}
          onStartDaily={p.startDailyChallenge}
        />

        {p.entryReady && p.entryCharacter ? (
          <EntryReadyPanel
            character={p.entryCharacter}
            seed={p.entrySeed}
            daily={p.entryDaily}
            seedError={p.entrySeedError}
            onSeedChange={p.changeEntrySeed}
            buildCode={p.entryBuild}
            buildError={p.entryBuildError}
            buildPreview={p.buildPreview}
            onBuildChange={p.changeEntryBuild}
            onEnter={p.enterDungeon}
            onReroll={() => {
              if (p.entryCharacter) {
                p.startRun(p.entryCharacter.id, { daily: p.entryDaily })
              }
            }}
            onLeave={p.leaveEntry}
          />
        ) : null}

        <CharacterRoster
          roster={p.roster}
          activeIndex={p.activeIndex}
          isUnlocked={p.isUnlocked}
          fragmentsNeeded={p.fragmentsNeeded}
          coresNeeded={p.coresNeeded}
          skinFor={p.skinFor}
          onHighlight={p.highlightCharacter}
          onStart={p.startRun}
          onBuy={p.purchaseCharacter}
          showHint={!p.hintSeen}
        />

        <ChallengeEntries
          dailyShortCode={p.dailyShortCode}
          dailyCleared={p.dailyCleared}
          unlockedCount={p.unlockedCharacters.length}
          totalCount={p.characters.length}
          settings={p.settings}
          rushCoins={p.rushCoins}
          rushBestWave={p.rushBestWave}
          onStartDaily={p.startDailyChallenge}
          onOpenBossRush={p.openBossRush}
          onOpenCodex={p.openCodex}
          onOpenSettings={p.openSettings}
        />

        <MailboxPanel
          mailItems={p.mailItems}
          unclaimed={p.mailUnclaimed}
          onClaim={p.claimMail}
        />

        <TodayStatsPanel {...p.todayStats} />
        {/* 浏览器特性包 v1（browser-powers-pack.md 二）：磁盘垃圾文件面板（真读数真删除） */}
        <DiskJunkPanel />
        <RecentRunsPanel runs={p.recentRuns} />
        <RotatingTips />
      </main>

      <LastRunFooter
        lastRun={p.lastRun}
        open={p.runDetailOpen}
        copiedSeed={p.copiedSeed}
        onToggle={() => p.setRunDetailOpen(!p.runDetailOpen)}
        onCopySeed={p.copySeed}
      />

      <SettingsPanel
        open={p.settingsOpen}
        settings={p.settings}
        onToggle={p.toggleSetting}
        onClose={() => p.setSettingsOpen(false)}
      />

      {p.helpOpen ? <HowToPlayOverlay onClose={() => p.setHelpOpen(false)} /> : null}

      {p.notice ? (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-40 w-max max-w-[90vw] -translate-x-1/2 rounded-md border border-primary/50 bg-card px-4 py-2 text-sm text-card-foreground shadow-md animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          {p.notice}
        </div>
      ) : null}
    </div>
  )
}
