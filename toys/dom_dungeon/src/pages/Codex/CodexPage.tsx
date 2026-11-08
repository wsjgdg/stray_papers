import { BookOpen } from "lucide-react"

import { AchievementCodexPanel } from "@/components/codex/AchievementCodexPanel"
import { BossCodexPanel } from "@/components/codex/BossCodexPanel"
import { CharacterCodexPanel } from "@/components/codex/CharacterCodexPanel"
import { CodexFooter } from "@/components/codex/CodexFooter"
import { CodexTabs } from "@/components/codex/CodexTabs"
import { CodexTopBar } from "@/components/codex/CodexTopBar"
import { CollectionOverview } from "@/components/codex/CollectionOverview"
import { EnemyCodexPanel } from "@/components/codex/EnemyCodexPanel"
import { RelicCodexPanel } from "@/components/codex/RelicCodexPanel"
import type { useCodex } from "@/pages/Codex/useCodex"

export function CodexPage(p: ReturnType<typeof useCodex>) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-secondary to-card"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative">
        <CodexTopBar
          litCount={p.litCount}
          totalCount={p.totalCount}
          fragments={p.fragments}
          cores={p.cores}
          seeds={p.seeds}
          onGoHome={p.goHome}
        />

        <main>
          <section className="mx-auto w-full max-w-6xl px-4 pt-8">
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-end">
              <div>
                <p className="inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-xs uppercase tracking-widest text-primary">
                  <BookOpen className="h-3.5 w-3.5" />
                  Codex
                </p>
                <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
                  地牢图鉴
                </h1>
                <p className="mt-3 max-w-2xl text-base text-muted-foreground">
                  打过的每一层都留在这里：角色、词条、敌人、层主、成就，见过一次就点亮一次。
                  碎片或核心都能当场招募新角色、换外观；没见过的词条也能直接补全，打够通关数还会有神秘角色现身。
                </p>
              </div>
              <div className="rounded-lg border border-dashed border-border bg-card p-4 text-card-foreground shadow-md">
                <p className="font-mono text-xs text-muted-foreground">
                  当前页签
                </p>
                <p className="mt-1 font-display text-2xl font-bold text-primary">
                  {p.activeProgress.label}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.activeProgress.lit} / {p.activeProgress.total} 已点亮 ·{" "}
                  {p.activeProgress.hint}
                </p>
              </div>
            </div>
          </section>

          <CollectionOverview
            litCount={p.litCount}
            totalCount={p.totalCount}
            fragments={p.fragments}
            tabs={p.tabProgress}
            activeTab={p.activeTab}
            onSelectTab={p.selectTab}
          />

          <CodexTabs
            tabs={p.tabProgress}
            activeTab={p.activeTab}
            onSelect={p.selectTab}
          />

          {p.activeTab === "characters" ? (
            <CharacterCodexPanel
              characters={p.characters}
              pendingSkin={p.pendingSkin}
              pendingChar={p.pendingChar}
              onTapSkin={p.tapSkin}
              onRequestSkinBuy={p.requestSkinBuy}
              onConfirmSkin={p.confirmSkin}
              onCancelSkin={p.cancelSkin}
              onRequestCharBuy={p.requestCharBuy}
              onConfirmChar={p.confirmChar}
              onCancelChar={p.cancelChar}
            />
          ) : null}

          {p.activeTab === "relics" ? (
            <RelicCodexPanel
              groups={p.relicGroups}
              seenCount={p.activeProgress.lit}
              totalCount={p.activeProgress.total}
              onFix={p.fixRelic}
              onGoHome={p.goHome}
            />
          ) : null}

          {p.activeTab === "enemies" ? (
            <EnemyCodexPanel
              enemies={p.enemies}
              defeatedCount={p.activeProgress.lit}
              onGoHome={p.goHome}
            />
          ) : null}

          {p.activeTab === "bosses" ? (
            <BossCodexPanel
              bosses={p.bosses}
              defeatedCount={p.activeProgress.lit}
            />
          ) : null}

          {p.activeTab === "achievements" ? (
            <AchievementCodexPanel
              achievements={p.achievements}
              unlockedCount={p.activeProgress.lit}
              totalCount={p.activeProgress.total}
            />
          ) : null}
        </main>

        <CodexFooter
          litCount={p.litCount}
          totalCount={p.totalCount}
          hiddenPending={p.hiddenPendingCount}
          onGoHome={p.goHome}
        />
      </div>

      {p.notice ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <p className="animate-in fade-in slide-in-from-bottom-4 rounded-md border border-primary/50 bg-card px-4 py-2 font-mono text-sm text-primary shadow-lg duration-500">
            {p.notice}
          </p>
        </div>
      ) : null}
    </div>
  )
}
