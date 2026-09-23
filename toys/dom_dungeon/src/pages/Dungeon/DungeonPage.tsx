import { AllyPickOverlay } from "@/components/dungeon/AllyPickOverlay"
import { AltarOverlay } from "@/components/dungeon/AltarOverlay"
import { AutoAttackBadge } from "@/components/dungeon/AutoAttackBadge"
import { CacheBoxOverlay } from "@/components/dungeon/CacheBoxOverlay"
import { BattleFooter } from "@/components/dungeon/BattleFooter"
import { BossAdOverlay } from "@/components/dungeon/BossAdOverlay"
import { BossCrashOverlay } from "@/components/dungeon/BossCrashOverlay"
import { BossDefeatLine } from "@/components/dungeon/BossDefeatLine"
import { CharacterPanel } from "@/components/dungeon/CharacterPanel"
import { CoachTip } from "@/components/dungeon/CoachTip"
import { CrisisOverlay } from "@/components/dungeon/CrisisOverlay"
import { DungeonTopBar } from "@/components/dungeon/DungeonTopBar"
import { EdgePulse } from "@/components/dungeon/EdgePulse"
import { FloatingAction } from "@/components/dungeon/FloatingAction"
import { GhostTrack } from "@/components/dungeon/GhostTrack"
import { MirrorOverlay } from "@/components/dungeon/MirrorOverlay"
import { useMemo, useState } from "react"

import { HowToPlayOverlay } from "@/components/shared/HowToPlayOverlay"
import { PauseOverlay } from "@/components/dungeon/PauseOverlay"
import { QteOverlay } from "@/components/dungeon/QteOverlay"
import { ReadyFloorOverlay } from "@/components/dungeon/ReadyFloorOverlay"
import { RecycleBinOverlay } from "@/components/dungeon/RecycleBinOverlay"
import { RelicDockCard } from "@/components/dungeon/RelicDockCard"
import { RelicChoiceOverlay } from "@/components/dungeon/RelicChoiceOverlay"
import { RouteChoiceOverlay } from "@/components/dungeon/RouteChoiceOverlay"
import { RunEndOverlay } from "@/components/dungeon/RunEndOverlay"
import { HiddenOverlay } from "@/components/dungeon/HiddenOverlay"
import { ShopOverlay } from "@/components/dungeon/ShopOverlay"
import { SkillBar } from "@/components/dungeon/SkillBar"
import { TabBar } from "@/components/dungeon/TabBar"
import { TaskManagerOverlay } from "@/components/dungeon/TaskManagerOverlay"
import { TabEnemyStrip } from "@/components/dungeon/TabEnemyStrip"
import { WarningZone } from "@/components/dungeon/WarningZone"
import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"
import type { useDungeon } from "@/pages/Dungeon/useDungeon"

export function DungeonPage(p: ReturnType<typeof useDungeon>) {
  const [helpOpen, setHelpOpen] = useState(false)
  /* HUD 构筑包：字段比 SkillBarProps 宽——除信息面板外还整体透传给
     FloatingAction（圆钮 + 糊屏窗）与 Boss 面板内的 SkillBar 占位 */
  const skill = {
    skinStyle: p.skinStyle,
    activeName: p.activeName,
    activeDesc: p.activeDesc,
    blockedByCurse: p.curseBlockedSkill,
    activeReady: p.activeReady,
    activeCooldownLeft: p.activeCooldownLeft,
    activeCooldownRatio: p.activeCooldownRatio,
    skillCharging: p.skillCharging,
    chargeRatio: p.chargeRatio,
    chargeFull: p.chargeFull,
    dodgeReady: p.dodgeReady,
    dodgeCooldownLeft: p.dodgeCooldownLeft,
    dodgeCooldownRatio: p.dodgeCooldownRatio,
    canSwitchTarget: p.enemies.length > 1,
    onSwitchTarget: p.shiftLock,
    onActiveStart: p.pressActiveStart,
    onActiveMove: p.pressActiveMove,
    onActiveEnd: p.pressActiveEnd,
    skillDragPos: p.skillDragPos,
    /* 糊屏弹窗（popup-jam-pack.md）：盖住主动技按钮的垃圾广告窗 */
    screenJam: p.screenJam,
    screenJamRatio: p.screenJamRatio,
    lowSpec: p.lowSpec,
    onJamFling: p.flingScreenJam,
    onJamTapX: p.tapScreenJamX,
    /* 拟物化战斗包（skeuo-boss-pack.md 二）：恶意弹窗的假「立即领取」 */
    onJamClaim: p.onJamClaim,
    onDodge: p.pressDodge,
  }

  const boss = p.phase === "fighting" ? p.boss : null
  const isCrashBoss = boss?.defId === "boss-crash"
  const target = p.enemies.find((enemy) => enemy.uid === p.lockedUid) ?? null
  /* 法师自身脉冲（glitch-feel-pack.md 二）：uid=null 的取最新一条挂在角色面板 */
  const pulseFx = [...p.attackFx].reverse().find((item) => item.uid === null) ?? null

  /* 性能与体验包（perf-experience-pack.md C）：hudActivePerks 每次 render 都是新数组，
     但其内容纯由 dock 决定（hudPerks 是 dock 的纯函数）——以 dock 的 state 引用为依赖
     稳定 perkIds，让挂了 memo 的 RelicDockCard 在战斗 tick 间跳过重渲染 */
  const perkIds = useMemo(
    () => p.hudActivePerks.map((perk) => perk.id),
    [p.dock],
  )

  return (
    <div
      className={cn(
        "relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground",
        // invert 故障（fun-pack.md 二）：整页反色；低配降级为引擎侧 banner 提示
        p.glitchKind === "invert" && !p.lowSpec && "glitch-invert",
        // 表现包：暴击 4px / 穿透 2px / 斩杀 6px 震屏（低配关；alt 类名交替让动画可连续重放）
        p.shake &&
          !p.lowSpec &&
          (p.shake.alt ? "screen-shake-alt" : "screen-shake"),
      )}
      style={
        p.shake && !p.lowSpec
          ? ({ "--shake-px": `${p.shake.px}px` } as CSSProperties)
          : undefined
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-card to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-8 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-destructive/10 blur-3xl"
      />

      {/* 规范·故障感克制：低血（<30%）时屏幕边缘红色脉冲，仅战斗中，纯装饰不拦截点击 */}
      {p.lowHp && p.phase === "fighting" ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 shadow-[inset_0_0_72px_rgba(255,59,92,0.35)] motion-safe:animate-pulse-soft"
        />
      ) : null}

      {/* 内存边缘警戒（ui-pack.md 一）：卡顿黄弱呼吸 / 阻塞红强呼吸，低配不渲染 */}
      {p.phase === "fighting" && !p.lowSpec ? (
        <EdgePulse zone={p.memoryZone} />
      ) : null}

      {/* 完美闪避白闪：低配不铺全屏白闪，只留数值/音效反馈 */}
      {p.perfectFlash && !p.lowSpec ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 animate-in fade-in-0 duration-150 bg-foreground/70"
        />
      ) : null}

      {/* 表现包·主动技释放特写：上下黑边 + 青色闪光 + 技能名定格；蓄力满档升金色加强版。
          低配只留技能名文字（无黑边/闪光/金环），reduced-motion 由 CSS 关动画直接显字 */}
      {p.skillFocus ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
          {!p.lowSpec ? (
            <>
              <span className="skill-focus-bar absolute inset-x-0 top-0 h-[9vh] origin-top bg-background" />
              <span className="skill-focus-bar absolute inset-x-0 bottom-0 h-[9vh] origin-bottom bg-background" />
              <span className="skill-focus-flash absolute inset-0" />
            </>
          ) : null}
          <div className="absolute inset-0 grid place-items-center">
            {p.skillFocus.chargeFull && !p.lowSpec ? (
              <span className="skill-focus-ring absolute h-40 w-40 rounded-full" />
            ) : null}
            <span
              className={cn(
                "font-display text-3xl font-bold tracking-wide",
                p.lowSpec
                  ? "text-primary"
                  : cn(
                      "skill-focus-text",
                      p.skillFocus.chargeFull ? "text-sys-network" : "text-primary",
                    ),
              )}
            >
              {p.activeName}！
            </span>
          </div>
        </div>
      ) : null}

      {/* perf-experience-pack.md C：DungeonTopBar 不加 memo——relicTriggers 是 hook 内
          每 render 按当前时刻重建的派生对象（稳定它要改派生层，超出本包允许的
          useCallback 稳定化范围），加 memo 也永远命中不了 */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 pt-safe backdrop-blur">
        <DungeonTopBar
          floor={p.floor}
          floorTotal={p.floorTotal}
          floorLabel={p.floorLabel}
          floorShort={p.floorShort}
          isBossFloor={p.isBossFloor}
          blindCombat={p.blindCombat}
          canForceSkip={p.phase === "fighting" && !p.isBossFloor}
          onForceSkip={p.forceSkip}
          floors={p.floors}
          seed={p.seed}
          shortSeed={p.shortSeed}
          copiedSeed={p.copiedSeed}
          relics={p.relics}
          relicSlots={p.relicSlots}
          curses={p.curses}
          schoolCounts={p.schoolCounts}
          bonds={p.bonds}
          relicConflicts={p.relicConflicts}
          hiddenActive={p.hiddenActive}
          shards={p.shards}
          shardPulse={p.shardPulse}
          memory={p.memory}
          memoryMax={p.memoryMax}
          memoryZone={p.memoryZone}
          /* 核心体验包 v2：超上限金角标 + 顶栏缓存芯片 */
          memoryOverflow={p.memoryOverflow}
          cacheChip={
            p.cacheChipVisible
              ? {
                  filled: p.cacheView.slots.filter((value) => value > 0).length,
                  total: p.cacheSlotsTotal,
                  depositLeft: p.cacheView.depositLeft,
                  onOpen: p.openCacheBox,
                }
              : null
          }
          /* 深化包：碎片徽标 / 实际回满水位 / 超频按钮与徽标 */
          memFrags={p.memFrags}
          memoryRefill={p.memoryRefill}
          overclockReady={p.overclockReady}
          overclockActive={p.overclockActive}
          overclockLeftMs={p.overclockLeftMs}
          overclockHot={p.overclockHot}
          overclockHotLeftMs={p.overclockHotLeftMs}
          onOverclock={p.overclock}
          memoryDisplay={p.memoryDisplay}
          detailsExpanded={p.topDetailsExpanded}
          onToggleDetails={p.toggleTopDetails}
          memoryHist={p.memoryHist}
          buildPerks={p.hudActivePerks.map((perk) => perk.name)}
          lowSpec={p.lowSpec}
          paused={p.paused}
          playMode={p.playMode}
          relicTriggers={p.relicTriggers}
          scramble={p.glitchKind === "scramble" && !p.lowSpec}
          scrambleBucket={Math.floor(p.now / 350)}
          onCopySeed={p.copySeed}
          onTogglePause={p.pressPause}
          onTriggerRelic={p.triggerRelicCard}
          memFakeActive={p.memFakeActive}
          onMemFake={p.fakeMemoryRead}
          canClearCache={p.canClearCache}
          cacheCleared={p.cacheCleared}
          onClearCache={p.clearCache}
          onExit={p.exitToHome}
        />
      </header>

      {/* 教学浮字：只在战斗阶段显示，一局里每个关键时刻各弹一次 */}
      <CoachTip
        tip={p.phase === "fighting" ? p.coachTip : null}
        paused={p.paused}
        lowSpec={p.lowSpec}
      />

      {/* HUD 横幅：拖拽 / × 关闭、验证码成败等一次性提示，不受教学开关影响 */}
      {p.phase === "fighting" && !p.paused && p.banner ? (
        <div
          key={p.banner.seq}
          className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center px-4"
        >
          <span
            className={cn(
              "animate-in fade-in slide-in-from-top-2 rounded-md border bg-card/95 px-4 py-2 text-center font-display text-base font-bold shadow-md",
              p.banner.text.includes("失败")
                ? "border-destructive/60 text-destructive shadow-glow-red"
                : "border-primary/50 text-primary shadow-glow-cyan",
            )}
          >
            {p.banner.text}
          </span>
        </div>
      ) : null}

      {/* Boss QTE 中央覆盖层：只在战斗未暂停且有进行中 QTE 时出现 */}
      {p.phase === "fighting" && !p.paused && p.qte ? (
        <QteOverlay
          qte={p.qte}
          elapsedMs={p.qteElapsedMs}
          pressing={p.qtePressing}
          pressRatio={p.qtePressRatio}
          lowSpec={p.lowSpec}
          onTap={p.qteTap}
          onPopupClick={p.qtePopupClick}
          onPressStart={p.qtePressStart}
          onPressEnd={p.qtePressEnd}
        />
      ) : null}

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4">
        <section className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-md sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-xs text-primary">
                第 {p.floor} / {p.floorTotal} 层 · {p.floorShort}
              </p>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {p.floorLabel}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{p.floorNote}</p>
            </div>
            <p className="shrink-0 font-mono text-xs text-muted-foreground">
              种子 <span className="text-foreground">{p.seed}</span>
            </p>
          </div>

          {/* 幽灵对照：只在每日挑战里、且拉到了别人的成绩时才出现 */}
          <GhostTrack
            ghost={p.ghost}
            floor={p.floor}
            floorTotal={p.floorTotal}
            beaten={p.ghostBeaten}
            lowSpec={p.lowSpec}
          />
        </section>

        {/* 内核包 v1（kernel-tabs.md）：浏览器标签栏——普通层战斗中可开后台战场，
            点标签切页、冻结停手减半、强关折半收益；非普通层战斗 tabsView 为 null 不渲染 */}
        {/* perf-experience-pack.md C：TabBar 不加 memo——tabsView 在 hook return 里内联构建、
            且 advance 战斗帧每 tick 克隆 tabs 数组，引用每 tick 必新，memo 白加 */}
        {p.phase === "fighting" && p.tabsView ? (
          <TabBar
            tabs={p.tabsView}
            activeTabId={p.activeTabId}
            canOpen={p.canOpenTab}
            openCost={p.tabOpenCost}
            onOpen={p.openTabPage}
            onSwitch={p.switchTabPage}
            onFreeze={p.freezeTabPage}
            onClose={p.closeTabPage}
            taskmgr={{
              available: p.taskmgrAvailable,
              used: p.taskmgrUsed,
              cost: p.taskmgrOpenCost,
              onOpen: p.openTaskManager,
            }}
            /* 核心体验包 v2：援军召唤入口（页满/非战斗置灰，点开三选一浮层） */
            reinforce={{
              available: p.reinforceAvailable,
              cost: p.allyCost,
              onOpen: p.openAllyPick,
            }}
          />
        ) : null}

        {/* perf-experience-pack.md C：TabEnemyStrip 不加 memo——props 含 now（每 tick 必变）
            且 enemies 数组每 tick 由 advance 全量克隆，memo 永远失效 */}
        <section aria-label="本层标签条">
          <TabEnemyStrip
            enemies={p.enemies}
            lockedUid={p.lockedUid}
            now={p.now}
            hitFlashMs={p.hitFlashMs}
            pops={p.pops}
            shardDots={p.shardDots}
            dragCloseUsed={p.dragCloseUsed}
            lowSpec={p.lowSpec}
            darkTheme={p.darkTheme}
            miniShields={p.miniShields}
            closureEchoUid={p.closureEchoUid}
            adaptions={p.adaptions}
            executeMarkRatio={p.executeMarkRatio}
            attackFx={p.attackFx}
            onLock={p.lockTarget}
            onDragClose={p.dragCloseTarget}
            onDismissPopup={p.dismissPopup}
            onPickShard={p.pickShard}
            onEnemyDragging={p.setEnemyDragging}
            onExecute={p.executeEnemy}
            onDetonateVirus={p.detonateVirus}
          />
        </section>

        {/* 战斗区（闪避滑动入口）：水平滑动闪避，技能/闪避按钮自带指针、不触发滑动。
            顿帧（glitch-feel-pack.md 一）：冻结期整块定格提亮，引擎解冻后自然回弹 */}
        <div
          className={cn(
            "relative flex flex-1 touch-pan-y flex-col gap-3",
            p.hitStopHeld && !p.lowSpec && "hitstop-held",
          )}
          onPointerDown={p.battlePointerDown}
          onPointerMove={p.battlePointerMove}
          onPointerUp={p.battlePointerUp}
          onPointerCancel={p.battlePointerUp}
        >
          {/* 顿帧触发瞬间的冲击闪光：按 hitStopKey 重挂载播一次，不拦截点击 */}
          {p.hitStopHeld && !p.lowSpec ? (
            <span
              key={p.hitStopKey}
              aria-hidden
              className="hitstop-flash pointer-events-none absolute inset-0 z-20 bg-foreground/10"
            />
          ) : null}
          {/* perf-experience-pack.md C：WarningZone 不加 memo——props 含 now，每 tick 必变 */}
          <WarningZone
            now={p.now}
            lowSpec={p.lowSpec}
            enemies={p.enemies}
            challenge={p.challenge}
            bossPending={p.bossPending}
            bossClick={p.bossClick}
            bossFlash={p.bossFlash}
            bossSpeedCut={p.bossSpeedCut}
            overtime={p.overtime}
            floorTimeLeft={p.floorTimeLeft}
            floorTimeLimit={p.floorTimeLimit}
            paused={p.paused}
            frozen={p.freezeActive}
            freezeLeftMs={p.freezeLeftMs}
            blockActive={p.blockActive}
            blockLeftMs={p.blockLeftMs}
            onPickSymbol={p.pickChallengeSymbol}
            onBossSkip={p.pressBossSkip}
          />

          <section
            aria-label="角色与技能"
            className="grid flex-1 gap-3 lg:grid-cols-[3fr_2fr]"
          >
            <CharacterPanel
              character={p.character}
              skinStyle={p.skinStyle}
              playerHp={p.playerHp}
              playerMaxHp={p.playerMaxHp}
              hpRatio={p.hpRatio}
              lowHp={p.lowHp}
              shield={p.shield}
              shieldMax={p.shieldMax}
              combo={p.combo}
              clickCombo={p.clickCombo}
              clickComboMax={p.clickComboMax}
              clickComboActive={p.clickComboActive}
              clickComboFull={p.clickComboFull}
              dodgeDir={p.dodgeDir}
              lowSpec={p.lowSpec}
              dodgeActive={p.dodgeActive}
              decoyActive={p.decoyActive}
              hasteActive={p.hasteActive}
              dodgeHaste={p.dodgeHasteActive}
              doubleStrike={p.doubleStrikeActive}
              listenStacks={p.listenStacks}
              listenStacksMax={p.listenStacksMax}
              syncStacks={p.syncStacks}
              syncStacksMax={p.syncStacksMax}
              multithreadActive={p.multithreadActive}
              rootActive={p.rootActive}
              freezeActive={p.freezeActive}
              deathWards={p.deathWards}
              cursed={p.cursed}
              blindCombat={p.blindCombat}
              immuneActive={p.manualImmuneActive}
              pulseFxId={pulseFx?.id ?? null}
              pulseBig={pulseFx?.big ?? false}
              onToggleBlind={p.toggleBlind}
            />
            <SkillBar {...skill} drift={p.glitchKind === "drift" && !p.lowSpec} />
          </section>

          {/* 假按钮（fun-pack.md 二）：仿主动技按钮诱骗点击，点了扣血（casual 免）；
              战斗区的滑动闪避靠 pointer 事件，这里必须全部 stopPropagation，否则会误触发闪避 */}
          {p.fakeButton ? (
            <button
              key={p.fakeButton.id}
              type="button"
              aria-label="清理加速"
              onPointerDown={(ev) => ev.stopPropagation()}
              onPointerUp={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation()
                p.hitFakeButton()
              }}
              className="absolute z-20 grid h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 touch-none place-items-center rounded-full border-2 border-sys-script bg-card/90 text-sys-script shadow-glow-cyan transition active:scale-90 focus-visible:outline-none focus-visible:shadow-focus"
              style={{
                left: `${p.fakeButton.xPct}%`,
                top: `${p.fakeButton.yPct}%`,
              }}
            >
              <span className="flex flex-col items-center gap-0.5 font-mono text-xs font-bold leading-tight">
                <span>清理加速</span>
                <span className="font-normal opacity-80">点我免费</span>
              </span>
            </button>
          ) : null}

          {/* 崩溃 Boss 抢走主动技按钮（fun-pack v2）：战斗区浮一个发光小目标，点回按钮；
              滑动闪避靠 pointer 判定，这里全部 stopPropagation 防误触（与假按钮同款处理） */}
          {p.skillSnatched ? (
            <button
              key="snatched-skill-button"
              type="button"
              aria-label="被抢走的主动技按钮，点击找回"
              onPointerDown={(ev) => ev.stopPropagation()}
              onPointerUp={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation()
                p.recoverSkill()
              }}
              className="absolute z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 touch-none animate-pulse-soft place-items-center rounded-md border-2 border-primary bg-card/90 px-1 text-center font-mono text-xs font-bold text-primary shadow-glow-cyan transition active:scale-90 focus-visible:outline-none focus-visible:shadow-focus"
              style={{
                left: `${p.snatchPos.xPct}%`,
                top: `${p.snatchPos.yPct}%`,
              }}
            >
              我的按钮!
            </button>
          ) : null}
        </div>
      </main>

      <AutoAttackBadge
        autoAttacking={p.autoAttacking}
        nextAttackInMs={p.nextAttackInMs}
        targetName={target?.displayName ?? null}
        lowSpec={p.lowSpec}
        paused={p.paused}
      />

      {/* HUD 构筑包（hud-forge-pack.md）：圆钮 + 词条栏浮卡 = 页面级可拖拽构筑资产。
          渲染在战斗区 DOM 之外 → 滑动闪避的 pointer 判定结构上不可能被拖拽误触；
          zIndex 45 夹在 Boss 面板(z-40) 与 QTE(z-50) 之间——QTE 盖住按钮、Boss 下按钮
          仍可点的旧行为保持 */}
      {p.phase === "fighting" ? (
        <>
          <FloatingAction
            module="skill"
            dock={p.dock}
            lowSpec={p.lowSpec}
            drift={p.glitchKind === "drift" && !p.lowSpec}
            perkIds={perkIds}
            onDock={p.dragDock}
            skinStyle={p.skinStyle}
            activeName={p.activeName}
            blockedByCurse={p.curseBlockedSkill}
            activeReady={p.activeReady}
            activeCooldownLeft={p.activeCooldownLeft}
            activeCooldownRatio={p.activeCooldownRatio}
            skillCharging={p.skillCharging}
            chargeRatio={p.chargeRatio}
            chargeFull={p.chargeFull}
            skillDragPos={p.skillDragPos}
            onActiveStart={p.pressActiveStart}
            onActiveMove={p.pressActiveMove}
            onActiveEnd={p.pressActiveEnd}
            screenJam={p.screenJam}
            screenJamRatio={p.screenJamRatio}
            onJamFling={p.flingScreenJam}
            onJamTapX={p.tapScreenJamX}
            onJamClaim={p.onJamClaim}
          />
          <FloatingAction
            module="dodge"
            dock={p.dock}
            lowSpec={p.lowSpec}
            drift={p.glitchKind === "drift" && !p.lowSpec}
            perkIds={perkIds}
            onDock={p.dragDock}
            skinStyle={p.skinStyle}
            activeReady={false}
            activeCooldownLeft={0}
            activeCooldownRatio={0}
            skillCharging={false}
            chargeRatio={0}
            chargeFull={false}
            dodgeReady={p.dodgeReady}
            dodgeCooldownLeft={p.dodgeCooldownLeft}
            dodgeCooldownRatio={p.dodgeCooldownRatio}
            onDodge={p.pressDodge}
          />
          {p.dock.relic !== "default" ? (
            <RelicDockCard
              anchor={p.dock.relic}
              dock={p.dock}
              lowSpec={p.lowSpec}
              perkIds={perkIds}
              schoolCounts={p.schoolCounts}
              relicTotal={p.relics.length}
              relicSlots={p.relicSlots}
              onDock={p.dragDock}
            />
          ) : null}
        </>
      ) : null}

      {/* 底部信息条可关闭（ui-pack.md v2 三）：× 关掉后整条不渲染，设置页可重新打开 */}
      {p.combatFooter ? (
        <footer className="relative z-10 border-t border-border bg-card/60 pb-safe backdrop-blur">
          <BattleFooter
            log={p.log}
            kills={p.kills}
            damageDealt={p.damageDealt}
            combo={p.combo}
            bondCount={p.bonds.length}
            onHide={p.toggleCombatFooter}
          />
        </footer>
      ) : null}

      {boss && !isCrashBoss ? (
        <BossAdOverlay
          boss={boss}
          line={p.bossLine}
          lockedButtonId={p.lockedButtonId}
          countdownMs={p.bossCountdownMs}
          countdownTotal={p.bossCountdownTotal}
          now={p.now}
          hitFlashMs={p.hitFlashMs}
          pops={p.pops}
          lowSpec={p.lowSpec}
          playerHp={p.playerHp}
          playerMaxHp={p.playerMaxHp}
          shield={p.shield}
          skill={skill}
          skills={p.bossSkills}
          passive={p.bossPassive}
          pending={p.bossPending}
          click={p.bossClick}
          minions={p.minions}
          overtime={p.overtime}
          /* 拟物化战斗包（skeuo-boss-pack.md 一）：阶段 2 本体弱点 × */
          weak={p.bossWeak}
          onWeakHit={p.hitAdWeakSpot}
          /* 浏览器特性包 v1（browser-powers-pack.md 一）：分身窗口透传 */
          clone={p.bossClone}
          onTapClone={p.tapBossClone}
          onLockButton={p.lockButton}
          onBossSkip={p.pressBossSkip}
        />
      ) : null}

      {boss && isCrashBoss ? (
        <BossCrashOverlay
          boss={boss}
          line={p.bossLine}
          countdownMs={p.bossCountdownMs}
          countdownTotal={p.bossCountdownTotal}
          now={p.now}
          pops={p.pops}
          lowSpec={p.lowSpec}
          playerHp={p.playerHp}
          playerMaxHp={p.playerMaxHp}
          shield={p.shield}
          skill={skill}
          skills={p.bossSkills}
          passive={p.bossPassive}
          pending={p.bossPending}
          click={p.bossClick}
          minions={p.minions}
          overtime={p.overtime}
          onBossSkip={p.pressBossSkip}
        />
      ) : null}

      {/* Boss 面板卸载后，把「被击败」那句台词在页面层级补显示一次 */}
      <BossDefeatLine
        line={p.bossLine}
        panelMounted={boss !== null}
        lowSpec={p.lowSpec}
      />

      {p.phase === "relic" ? (
        <RelicChoiceOverlay
          floor={p.floor}
          character={p.character}
          choices={p.choices}
          relics={p.relics}
          pendingRelic={p.pendingRelic}
          rerollsLeft={p.rerollsLeft}
          shards={p.shards}
          paidRerollUsed={p.paidRerollUsed}
          paidRerollCost={p.paidRerollCost}
          skipUpgradeCost={p.skipUpgradeCost}
          skipUpgradeAmount={p.skipUpgradeAmount}
          lowSpec={p.lowSpec}
          retryRelic={p.timeoutRetryHeld}
          timeoutRetryLeft={p.timeoutRetryLeft}
          timeoutRetryAffordable={p.timeoutRetryAffordable}
          timeoutRetryCost={p.timeoutRetryCost}
          hotReloadHeld={p.hotReloadHeld}
          hotReloadUsed={p.hotReloadUsed}
          hotReloadAffordable={p.hotReloadAffordable}
          hotReloadCost={p.hotReloadCost}
          onSelect={p.selectRelic}
          onReplace={p.replaceRelic}
          onCancelReplace={p.cancelReplace}
          onReroll={p.reroll}
          onPaidReroll={p.paidReroll}
          onTimeoutRetry={p.timeoutRetry}
          onHotReloadRefresh={p.hotReloadRefresh}
          onSkip={p.skipRelic}
        />
      ) : null}

      {p.phase === "overlay" && p.overlayKind === "shop" ? (
        <ShopOverlay
          shards={p.shards}
          stock={p.shopStock}
          playerHp={p.playerHp}
          playerMaxHp={p.playerMaxHp}
          relicSlotsFull={p.relicSlotsFull}
          memFrags={p.memFrags}
          lowSpec={p.lowSpec}
          onBuy={p.buyShopItem}
          onLeave={p.leaveShop}
        />
      ) : null}

      {p.phase === "route" ? (
        <RouteChoiceOverlay
          nextFloor={p.floor + 1}
          choices={p.routeChoices}
          lowSpec={p.lowSpec}
          onPick={p.pickRoute}
        />
      ) : null}

      {p.phase === "overlay" && p.overlayKind === "recycle" ? (
        <RecycleBinOverlay
          relics={p.relics}
          curses={p.curses}
          mode={p.pendingRemoveMode ?? "recycle"}
          lowSpec={p.lowSpec}
          onRemove={p.removeTarget}
          onSkip={p.skipRemove}
        />
      ) : null}

      {p.phase === "overlay" && p.overlayKind === "mirror" ? (
        <MirrorOverlay
          relics={p.relics}
          lowSpec={p.lowSpec}
          onCopy={p.copyMirrorRelic}
          onSkip={p.skipMirrorPanel}
        />
      ) : null}

      {p.phase === "overlay" && p.overlayKind === "altar" ? (
        <AltarOverlay
          altarType={p.altarType}
          offer={p.altarOffer}
          relics={p.relics}
          pendingRelic={p.altarPendingRelic}
          cost={p.altarCost}
          bloodToll={p.bloodToll}
          lifeCost={p.altarLifeCost}
          memoryHpCost={p.altarMemoryHpCost}
          shards={p.shards}
          playerHp={p.playerHp}
          playerMaxHp={p.playerMaxHp}
          lowSpec={p.lowSpec}
          onChooseCost={p.chooseAltarCost}
          onReplace={p.replaceAltarRelic}
          onLeave={p.leaveAltar}
        />
      ) : null}

      {p.phase === "overlay" && p.overlayKind === "crisis" && p.crisis ? (
        <CrisisOverlay
          crisis={p.crisis}
          lowSpec={p.lowSpec}
          onChoose={p.chooseCrisis}
        />
      ) : null}

      {p.phase === "overlay" && p.overlayKind === "hidden" && p.hiddenOffer ? (
        <HiddenOverlay
          offer={p.hiddenOffer}
          lowSpec={p.lowSpec}
          onEnter={p.enterHidden}
          onReject={p.rejectHidden}
        />
      ) : null}

      {/* 任务管理器（内核包 v2）：普通层战斗里每层一次的暂停决策 */}
      {p.phase === "overlay" && p.overlayKind === "taskmgr" ? (
        <TaskManagerOverlay
          enemies={p.taskmgrEnemies}
          memFrags={p.memFrags}
          lowSpec={p.lowSpec}
          onAction={p.applyTaskAction}
          onDismiss={p.dismissTaskManager}
        />
      ) : null}

      {/* 核心体验包 v2·援军三选一：点卡召唤（引擎复验余额/页位，失败横幅不关面板） */}
      {p.phase === "overlay" && p.overlayKind === "allyPick" ? (
        <AllyPickOverlay
          cost={p.allyCost}
          lowSpec={p.lowSpec}
          onSummon={p.summonAlly}
          onCancel={p.dismissAllyPick}
        />
      ) : null}

      {/* 核心体验包 v2·缓存电池盒：三槽取出 + 存入/清空；键盘 1/2/3 接管 */}
      {p.phase === "overlay" && p.overlayKind === "cache" ? (
        <CacheBoxOverlay
          slots={p.cacheView.slots}
          total={p.cacheSlotsTotal}
          depositLeft={p.cacheView.depositLeft}
          canDeposit={p.cacheView.canDeposit}
          canBurn={p.cacheView.canBurn}
          per={p.cachePer}
          takeCost={p.cacheTakeCost}
          burnBonus={p.cacheBurnBonus}
          memory={p.memory}
          lowSpec={p.lowSpec}
          onDeposit={p.cacheDeposit}
          onTake={p.cacheTake}
          onBurn={p.cacheBurn}
          onDismiss={p.dismissCacheBox}
        />
      ) : null}

      {p.phase === "dead" || p.phase === "victory" ? (
        <RunEndOverlay
          cleared={p.cleared}
          cause={p.cause}
          floor={p.floor}
          floorTotal={p.floorTotal}
          seed={p.seed}
          reward={p.reward}
          reviveCount={p.reviveCount}
          routeLog={p.routeLog}
          unlockedSkin={p.victorySkin}
          deathCount={p.deathCount}
          canRevive={p.canPaidRevive}
          reviveCost={p.paidReviveCost}
          onRevive={p.paidRevive}
          onViewResult={p.viewResult}
          onRestart={p.restart}
          onExit={p.exitToHome}
        />
      ) : null}

      {p.paused && p.phase === "fighting" ? (
        p.readyFloor ? (
          <ReadyFloorOverlay
            floor={p.floor}
            floorTotal={p.floorTotal}
            floorLabel={p.floorLabel}
            enemies={p.enemies}
            isBossFloor={p.isBossFloor}
            onStart={p.pressFloorStart}
          />
        ) : (
          <PauseOverlay
            floor={p.floor}
            floorTotal={p.floorTotal}
            seed={p.seed}
            onResume={p.pressPause}
            onRestart={p.restart}
            onExit={p.exitToHome}
            onHelp={() => setHelpOpen(true)}
          />
        )
      ) : null}

      {helpOpen ? <HowToPlayOverlay onClose={() => setHelpOpen(false)} /> : null}
    </div>
  )
}
