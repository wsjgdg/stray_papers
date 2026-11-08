import type { ReactNode } from "react"
import {
  Cpu,
  HeartHandshake,
  Languages,
  Lightbulb,
  Scale,
  Skull,
  Sparkles,
  Terminal,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react"

import { AccountSection } from "@/components/settings/AccountSection"
import { CloudSaveSection } from "@/components/settings/CloudSaveSection"
import { DangerZone } from "@/components/settings/DangerZone"
import { SettingsFooter } from "@/components/settings/SettingsFooter"
import { SettingsReadonlyRow } from "@/components/settings/SettingsReadonlyRow"
import { SettingsSection } from "@/components/settings/SettingsSection"
import { SettingsSliderRow } from "@/components/settings/SettingsSliderRow"
import { SettingsToggleRow } from "@/components/settings/SettingsToggleRow"
import { SettingsTopBar } from "@/components/settings/SettingsTopBar"
import { Button } from "@/components/ui/button"
import { DUNGEON_RUN_FLOORS } from "@/lib/dungeonData"
import { PLAY_MODES, type PlayMode } from "@/lib/dungeonSave"
import { cn } from "@/lib/utils"
import type { useSettings } from "@/pages/Settings/useSettings"

/** 三档操作模式的卡片文案 */
const PLAY_MODE_CARDS: Record<
  PlayMode,
  { label: string; blurb: string; icon: ReactNode }
> = {
  casual: {
    label: "休闲",
    blurb: "特殊互动失败不受罚，专心享受连招与关标签的乐趣",
    icon: <HeartHandshake className="h-4 w-4" />,
  },
  standard: {
    label: "标准",
    blurb: "平衡体验：失败按原始数值结算，也是默认档",
    icon: <Scale className="h-4 w-4" />,
  },
  hardcore: {
    label: "硬核",
    blurb: "失败惩罚 ×1.5、为老玩家准备，第 4 层起还会追加加罚",
    icon: <Skull className="h-4 w-4" />,
  },
}

export function SettingsPage(p: ReturnType<typeof useSettings>) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
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
        <SettingsTopBar onBack={p.goHome} />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:py-12">
        <section className="animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md duration-500 sm:p-6">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            设置
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            把地牢调成你喜欢的样子
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            开关改动立刻存进本地，回到战斗页就按新设置跑。老设备开低配模式会更顺，戴耳机想安静就把音效关掉。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={p.goDungeon}
              className="gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              回地牢开打
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={p.goHome}
            >
              返回首页
            </Button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-6">
            <SettingsSection
              eyebrow="体验"
              title="游戏体验"
              description="音效与画质都只影响本地表现，改完马上生效。"
            >
              <SettingsToggleRow
                icon={
                  p.settings.sound ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )
                }
                label="音效"
                description="攻击、技能与闪避命中时的提示音"
                checked={p.settings.sound}
                onToggle={() => p.toggleSetting("sound")}
                activeNote="战斗中会听到合成提示音"
              />

              <SettingsSliderRow
                icon={<Volume2 className="h-4 w-4" />}
                label="音量"
                description="松手会放一声试听音，按现在的音量来"
                value={p.settings.volume}
                disabled={!p.settings.sound}
                onChange={p.setVolume}
                onCommit={p.previewVolume}
              />

              <SettingsToggleRow
                icon={<Lightbulb className="h-4 w-4" />}
                label="教程提示"
                description="战斗中在屏幕上方弹一次性的操作提醒"
                checked={p.settings.tips}
                onToggle={() => p.toggleSetting("tips")}
                activeNote="首次挨打、技能就绪等关键时刻各提醒一次"
              />

              <SettingsToggleRow
                icon={<Zap className="h-4 w-4" />}
                label="低配模式"
                description="关掉多余特效与动画，让老设备更流畅"
                checked={p.settings.lowSpec}
                onToggle={() => p.toggleSetting("lowSpec")}
                activeNote="伤害飘字、标签抖动与层数切换动画已关掉"
              />

              <SettingsToggleRow
                icon={<Terminal className="h-4 w-4" />}
                label="战斗信息条"
                description="底部的快捷键说明、战斗日志与击杀统计"
                checked={p.settings.combatFooter}
                onToggle={() => p.toggleSetting("combatFooter")}
                activeNote="关掉后界面更干净，战斗日志与统计不再显示"
              />

              {/* 内存显示形态（ui-pack.md 一）：格子逐格读数 / 条一眼看余量 */}
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground"
                  >
                    <Cpu className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">内存显示</span>
                    <span className="block text-xs text-muted-foreground">
                      格子：一格一点，花掉一格看得见；条：数字读数，一眼看余量
                    </span>
                  </span>
                </span>
                <span
                  role="radiogroup"
                  aria-label="内存显示"
                  className="flex shrink-0 overflow-hidden rounded-md border border-border"
                >
                  {(
                    [
                      { id: "cells", label: "格子" },
                      { id: "bar", label: "条" },
                    ] as const
                  ).map((item) => {
                    const selected = p.settings.memoryDisplay === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => p.setMemoryDisplay(item.id)}
                        className={cn(
                          "px-3 py-1.5 font-mono text-xs font-bold transition focus-visible:outline-none focus-visible:shadow-focus",
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:text-primary",
                        )}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </span>
              </div>

              <SettingsReadonlyRow
                icon={<Languages className="h-4 w-4" />}
                label="语言"
                description="目前只有一项，暂不可切换"
                value={p.languageLabel}
              />
            </SettingsSection>

            {/* 外观（ui-appearance.md）：深浅色 + 强调配色，点一下全站即时生效 */}
            <SettingsSection
              eyebrow="外观"
              title="界面外观"
              description="深浅色管整体明暗；强调色只换主按钮与高亮的颜色，词条的四系颜色是信息编码、不跟着变。"
            >
              <div
                role="radiogroup"
                aria-label="深浅色模式"
                className="flex flex-wrap items-center gap-2"
              >
                {(
                  [
                    { id: "dark", label: "深色模式" },
                    { id: "light", label: "浅色模式" },
                  ] as const
                ).map((item) => {
                  const selected = p.settings.theme === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => p.setTheme(item.id)}
                      className={cn(
                        "rounded-full border px-4 py-2 font-mono text-xs font-bold transition focus-visible:outline-none focus-visible:shadow-focus",
                        selected
                          ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/40"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
                      )}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>

              <div
                role="radiogroup"
                aria-label="强调配色"
                className="flex flex-wrap items-center gap-2.5"
              >
                {(
                  [
                    { id: "cyan", label: "霓虹青", cssVar: "--sys-script" },
                    { id: "purple", label: "电光紫", cssVar: "--sys-style" },
                    { id: "green", label: "回复绿", cssVar: "--sys-cache" },
                    { id: "amber", label: "金币黄", cssVar: "--sys-network" },
                  ] as const
                ).map((item) => {
                  const selected = p.settings.accent === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`强调色 ${item.label}`}
                      title={item.label}
                      onClick={() => p.setAccent(item.id)}
                      style={{ background: `hsl(var(${item.cssVar}))` }}
                      className={cn(
                        "h-9 w-9 rounded-full border-2 transition focus-visible:outline-none focus-visible:shadow-focus",
                        selected
                          ? "border-foreground ring-2 ring-primary"
                          : "border-border hover:border-foreground/50",
                      )}
                    />
                  )
                })}
                <span className="font-mono text-xs text-muted-foreground">
                  当前强调：
                  {(
                    {
                      cyan: "霓虹青",
                      purple: "电光紫",
                      green: "回复绿",
                      amber: "金币黄",
                    } as const
                  )[p.settings.accent]}
                </span>
              </div>
            </SettingsSection>

            <SettingsSection
              eyebrow="操作"
              title="操作模式"
              description="决定 Boss 关键帧、验证这类特殊互动失败时的惩罚力度，选完下一局生效。奖励侧（完美闪避、蓄力、连击）三档通用。"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {PLAY_MODES.map((mode) => {
                  const card = PLAY_MODE_CARDS[mode]
                  const selected = p.settings.playMode === mode
                  const isHardcore = mode === "hardcore"
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => p.setPlayMode(mode)}
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-col gap-2 rounded-md border bg-background p-4 text-left shadow-sm transition",
                        "focus-visible:outline-none focus-visible:shadow-focus",
                        selected
                          ? isHardcore
                            ? "border-destructive/70 ring-1 ring-destructive/40"
                            : "border-primary/70 ring-1 ring-primary/40"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <span
                        className={cn(
                          "flex items-center gap-2 font-display text-lg font-bold",
                          selected
                            ? isHardcore
                              ? "text-destructive"
                              : "text-primary"
                            : "text-foreground",
                        )}
                      >
                        {card.icon}
                        {card.label}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {card.blurb}
                      </span>
                      {selected ? (
                        <span
                          className={cn(
                            "mt-auto inline-flex w-max items-center rounded-sm px-1.5 py-0.5 font-mono text-xs",
                            isHardcore
                              ? "bg-destructive/10 text-destructive"
                              : "bg-primary/10 text-primary",
                          )}
                        >
                          当前模式
                        </span>
                      ) : (
                        <span className="mt-auto inline-flex w-max items-center font-mono text-xs text-muted-foreground">
                          点击选择
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </SettingsSection>

            <DangerZone
              clearStep={p.clearStep}
              onRequest={p.requestClear}
              onCancel={p.cancelClear}
              onConfirm={p.confirmClear}
              onDismiss={p.dismissClear}
            />
          </div>

          <div className="flex flex-col gap-6">
            <AccountSection
              account={p.account}
              ready={p.accountReady}
              onAccountChange={p.syncAccount}
            />

            <CloudSaveSection
              loggedIn={p.loggedIn}
              accountReady={p.accountReady}
              autoBackup={p.autoBackup}
              lastBackupText={p.lastBackupText}
              hasCloudBackup={p.hasCloudBackup}
              busy={p.cloudBusy}
              restoreStep={p.restoreStep}
              conflict={p.conflict}
              onAccountChange={p.syncAccount}
              onToggleAutoBackup={p.toggleAutoBackup}
              onBackupNow={p.backupNow}
              onRequestRestore={p.requestRestore}
              onCancelRestore={p.cancelRestore}
              onConfirmRestore={p.confirmRestore}
              onDismissConflict={p.dismissConflict}
            />

            <SettingsSection
              eyebrow="存档"
              title="这一局到哪了"
              description="本地是主档，登录后可以再往云端备一份。"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border p-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    碎片
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold text-primary">
                    {p.fragments}
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    最深纪录
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">
                    {p.bestFloor}
                  </p>
                </div>
                <div className="col-span-2 rounded-md border border-dashed border-border p-3">
                  <p className="font-mono text-xs text-muted-foreground">
                    已解锁角色
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">
                    {p.unlockedCount}
                  </p>
                </div>
              </div>
            </SettingsSection>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border bg-card/60 backdrop-blur">
        <SettingsFooter
          version={p.version}
          fragments={p.fragments}
          bestFloor={p.bestFloor}
          floorTotal={DUNGEON_RUN_FLOORS.length}
        />
      </footer>

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
