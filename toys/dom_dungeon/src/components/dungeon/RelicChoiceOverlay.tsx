import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import {
  Check,
  CornerDownRight,
  HeartPulse,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react"

import {
  MAX_RELIC_SLOTS,
  RELIC_RARITY_LABEL,
  RELIC_RARITY_STYLE,
  RELIC_RISK_LABEL,
  RELIC_RISK_STYLE,
  RELIC_SCHOOL_LABEL,
  RELIC_SCHOOL_STYLE,
  RELIC_SKIP_HEAL,
  getActiveBondDefs,
  getRelicComboProgress,
  type DungeonCharacter,
  type Relic,
} from "@/lib/dungeonData"
import { cn } from "@/lib/utils"
import { playSfx } from "@/lib/sfx"

import { RelicDetailPanel } from "./RelicDetailPanel"

type RelicChoiceOverlayProps = {
  /** 刚清掉的那一层，标题写「第 N 层已清除」 */
  floor: number
  character: DungeonCharacter
  choices: Relic[]
  relics: Relic[]
  /** 非空 = 词条槽已满，正在挑一个旧词条替换 */
  pendingRelic: Relic | null
  rerollsLeft: number
  /** 局内碎片余额：付费刷新 / 升级回复都从这里扣 */
  shards: number
  /** 本层付费刷新是否已用（每层限 1 次） */
  paidRerollUsed: boolean
  paidRerollCost: number
  skipUpgradeCost: number
  skipUpgradeAmount: number
  lowSpec: boolean
  /** 持有「超时重试」（批次 C·N6 独立金色按钮，耗内存、每层 1 次、必出稀有+） */
  retryRelic?: boolean
  /** 本层金色重试还能不能用（每层 1 次） */
  timeoutRetryLeft?: boolean
  /** 当前内存够不够付重试的 3 点 */
  timeoutRetryAffordable?: boolean
  timeoutRetryCost?: number
  /** 持有「热更新」（批次 C·G2 每局 1 次耗内存刷新，不占刷新次数） */
  hotReloadHeld?: boolean
  hotReloadUsed?: boolean
  hotReloadAffordable?: boolean
  hotReloadCost?: number
  onSelect: (relic: Relic) => void
  onReplace: (slotId: string) => void
  onCancelReplace: () => void
  onReroll: () => void
  onPaidReroll: () => void
  onTimeoutRetry: () => void
  onHotReloadRefresh: () => void
  onSkip: (upgrade: boolean) => void
}

type FlyingCard = {
  relic: Relic
  x: number
  y: number
  width: number
  height: number
}

/** 按住多久算长按（毫秒） */
const LONG_PRESS_MS = 450
/** 长按抬手后要吃掉的那一次 click，超过这个时间自动解禁 */
const SUPPRESS_CLICK_MS = 320
/** 窄屏断点，跟卡片堆叠用的 sm: 保持一致 */
const NARROW_QUERY = "(max-width: 639px)"

/** 这次选择会新点亮哪些流派 combo */
function newlyActivatedBonds(relics: Relic[], picked: Relic): string[] {
  const before = new Set(getActiveBondDefs(relics).map((bond) => bond.id))
  return getActiveBondDefs([...relics, picked])
    .filter((bond) => !before.has(bond.id))
    .map((bond) => bond.name)
}

/** 卡面上的内存一行：消 X / 产 X / 无 */
function memoryCostLabel(relic: Relic): string {
  if (relic.memoryCost === undefined || relic.memoryCost === 0) return "无"
  return relic.memoryCost > 0 ? `消 ${relic.memoryCost}` : `产 ${-relic.memoryCost}`
}

export function RelicChoiceOverlay({
  floor,
  character,
  choices,
  relics,
  pendingRelic,
  rerollsLeft,
  shards,
  paidRerollUsed,
  paidRerollCost,
  skipUpgradeCost,
  skipUpgradeAmount,
  lowSpec,
  retryRelic = false,
  timeoutRetryLeft = false,
  timeoutRetryAffordable = false,
  timeoutRetryCost = 3,
  hotReloadHeld = false,
  hotReloadUsed = false,
  hotReloadAffordable = false,
  hotReloadCost = 2,
  onSelect,
  onReplace,
  onCancelReplace,
  onReroll,
  onPaidReroll,
  onTimeoutRetry,
  onHotReloadRefresh,
  onSkip,
}: RelicChoiceOverlayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [skipAsk, setSkipAsk] = useState(false)
  /** 跳过确认里勾选的「加碎片升级回复」 */
  const [skipUpgrade, setSkipUpgrade] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [flying, setFlying] = useState<FlyingCard | null>(null)
  const [flyingAway, setFlyingAway] = useState(false)
  /** 正在看详情的卡片；detailPinned = 钉住（不随松手收起） */
  const [detailRelicId, setDetailRelicId] = useState<string | null>(null)
  const [detailPinned, setDetailPinned] = useState(false)
  /** 窄屏：点卡片只展开详情，卡片上的「确认选择」才真正选中 */
  const [narrow, setNarrow] = useState(false)

  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const busy = useRef(false)
  const timers = useRef<number[]>([])
  const pressTimer = useRef<number | null>(null)
  const longPressFired = useRef(false)
  const suppressClick = useRef(false)

  const canReroll = rerollsLeft > 0
  const canPaidReroll = !paidRerollUsed && shards >= paidRerollCost
  const paidRerollShort = paidRerollUsed
    ? 0
    : Math.max(0, paidRerollCost - shards)
  const canSkipUpgrade = shards >= skipUpgradeCost
  const skipUpgradeShort = Math.max(0, skipUpgradeCost - shards)
  const isReplaceMode = pendingRelic !== null

  /** 打开跳过确认：勾选框每次从「否」开始 */
  const openSkipAsk = useCallback(() => {
    setSkipUpgrade(false)
    setSkipAsk(true)
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }, [])

  const clearPress = useCallback(() => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }, [])

  const closeDetail = useCallback(() => {
    clearPress()
    longPressFired.current = false
    setDetailRelicId(null)
    setDetailPinned(false)
  }, [clearPress])

  const openDetail = useCallback((relicId: string, pinned: boolean) => {
    setDetailRelicId(relicId)
    setDetailPinned(pinned)
  }, [])

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id))
      timers.current = []
      if (pressTimer.current !== null) {
        window.clearTimeout(pressTimer.current)
        pressTimer.current = null
      }
    }
  }, [])

  /* 窄屏判定：跟卡片堆叠用的 sm: 断点一致 */
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const query = window.matchMedia(NARROW_QUERY)
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  /* 详情面板：点卡片以外的地方就收起 */
  useEffect(() => {
    if (detailRelicId === null) return
    const onDocPointerDown = (ev: PointerEvent) => {
      const el = ev.target as HTMLElement | null
      if (!el) return
      if (el.closest("[data-relic-detail]")) return
      const card = el.closest("[data-relic-card]")
      if (card?.getAttribute("data-relic-id") === detailRelicId) return
      closeDetail()
    }
    window.addEventListener("pointerdown", onDocPointerDown)
    return () => window.removeEventListener("pointerdown", onDocPointerDown)
  }, [closeDetail, detailRelicId])

  /* 换了一批选项 / 进出替换模式：选中态、提交锁、详情一起清零 */
  useEffect(() => {
    setSelectedId(null)
    busy.current = false
    closeDetail()
  }, [choices, closeDetail])

  useEffect(() => {
    busy.current = false
    if (!isReplaceMode) setSlotId(null)
  }, [isReplaceMode])

  useEffect(() => {
    if (!flying) return
    setFlyingAway(false)
    const id = window.requestAnimationFrame(() => setFlyingAway(true))
    return () => window.cancelAnimationFrame(id)
  }, [flying])

  /** 确认：稀有卡微光 / 史诗卡脉冲 / 飞入词条栏 / 羁绊横幅都在这收口 */
  const commit = useCallback(
    (relic: Relic) => {
      if (busy.current) return
      busy.current = true
      closeDetail()

      const fresh = newlyActivatedBonds(relics, relic)
      const rect = cardRefs.current[relic.id]?.getBoundingClientRect()
      const animated = !lowSpec && !!rect
      if (animated && rect) {
        setFlying({
          relic,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        })
      }

      if (fresh.length > 0) {
        setBanner(`${fresh.join(" / ")} 已激活`)
        if (!lowSpec) {
          setShake(true)
          later(() => setShake(false), 520)
        }
        later(() => onSelect(relic), animated ? 1500 : 1000)
        return
      }

      later(() => onSelect(relic), animated ? 420 : 0)
    },
    [closeDetail, later, lowSpec, onSelect, relics],
  )

  const confirmSelected = useCallback(() => {
    const relic = choices.find((item) => item.id === selectedId)
    if (relic) commit(relic)
  }, [choices, commit, selectedId])

  const confirmReplace = useCallback(() => {
    if (slotId) onReplace(slotId)
  }, [onReplace, slotId])

  /* ---------------- 卡片：长按看详情 / 窄屏两段式选择 ---------------- */

  const startPress = (relic: Relic) => {
    if (busy.current) return
    clearPress()
    longPressFired.current = false
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      longPressFired.current = true
      suppressClick.current = true
      // 长按 → 钉住详情面板：松手不收起，点卡片外才关（旧版松手即收，用户来不及读）
      openDetail(relic.id, true)
    }, LONG_PRESS_MS)
  }

  /** 松手 / 移出：未钉住的面板（点开的预览）跟着收起；长按钉住的保持打开，长按过的那次抬手不算选中 */
  const endPress = () => {
    clearPress()
    if (!longPressFired.current) return
    longPressFired.current = false
    if (!detailPinned) setDetailRelicId(null)
    window.setTimeout(() => {
      suppressClick.current = false
    }, SUPPRESS_CLICK_MS)
  }

  const handleCardClick = (ev: ReactMouseEvent<HTMLButtonElement>, relic: Relic) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    /* 键盘激活（detail === 0）永远走原来的选中路径 */
    if (narrow && ev.detail !== 0) {
      if (detailRelicId !== relic.id) openDetail(relic.id, true)
      return
    }
    setSelectedId(relic.id)
  }

  const confirmFromCard = (relic: Relic) => {
    setSelectedId(relic.id)
    playSfx("pick")
    closeDetail()
  }

  /* 浮层打开时键盘由它接管：1/2/3 选择，R 刷新，空格跳过 */
  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      if (typing) return

      /* 详情面板：卡片聚焦时按 I 展开 / 收起，Esc 收起 */
      if (ev.key === "Escape" && detailRelicId !== null && !skipAsk) {
        ev.preventDefault()
        closeDetail()
        return
      }
      if (!skipAsk && (ev.key === "i" || ev.key === "I")) {
        const card = target?.closest("[data-relic-card]") ?? null
        const focusedRelicId = card?.getAttribute("data-relic-id") ?? null
        if (focusedRelicId) {
          ev.preventDefault()
          if (focusedRelicId === detailRelicId) closeDetail()
          else openDetail(focusedRelicId, true)
          return
        }
        if (detailRelicId !== null) {
          ev.preventDefault()
          closeDetail()
          return
        }
      }

      if (skipAsk) {
        if (ev.key === "Escape") {
          ev.preventDefault()
          setSkipAsk(false)
        } else if (ev.key === "Enter") {
          ev.preventDefault()
          setSkipAsk(false)
          onSkip(skipUpgrade)
        }
        return
      }

      if (isReplaceMode) {
        if (ev.key === "Escape") {
          ev.preventDefault()
          onCancelReplace()
          return
        }
        if (ev.key === "Enter" && slotId) {
          ev.preventDefault()
          onReplace(slotId)
          return
        }
        const slotIndex = Number.parseInt(ev.key, 10)
        if (Number.isFinite(slotIndex) && slotIndex >= 1 && slotIndex <= relics.length) {
          ev.preventDefault()
          setSlotId(relics[slotIndex - 1].id)
        }
        return
      }

      if (ev.key === " " || ev.code === "Space") {
        ev.preventDefault()
        openSkipAsk()
        return
      }
      if (ev.key === "r" || ev.key === "R") {
        ev.preventDefault()
        /* R 优先白嫖：免费次数用光且买得起时自动转付费刷新 */
        if (canReroll) onReroll()
        else if (canPaidReroll) onPaidReroll()
        return
      }
      if (ev.key === "Enter" && selectedId) {
        ev.preventDefault()
        confirmSelected()
        return
      }
      const index = Number.parseInt(ev.key, 10)
      if (Number.isFinite(index) && index >= 1 && index <= choices.length) {
        ev.preventDefault()
        const relic = choices[index - 1]
        /* 同一个数字再按一次 = 确认，省得摸鼠标 */
        if (relic.id === selectedId) {
          commit(relic)
          return
        }
        setSelectedId(relic.id)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    canPaidReroll,
    canReroll,
    choices,
    closeDetail,
    commit,
    confirmSelected,
    detailRelicId,
    isReplaceMode,
    onCancelReplace,
    onPaidReroll,
    onReroll,
    onReplace,
    onSkip,
    openDetail,
    openSkipAsk,
    relics,
    selectedId,
    skipAsk,
    skipUpgrade,
    slotId,
  ])

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 grid place-items-center bg-background/85 p-3 backdrop-blur-sm",
        lowSpec ? "animate-in fade-in duration-150" : "animate-in fade-in duration-300",
      )}
      style={shake ? { animation: "dungeon-shake 460ms ease-in-out" } : undefined}
    >
      <style>{`@keyframes dungeon-shake{0%,100%{transform:translate3d(0,0,0)}20%{transform:translate3d(-6px,2px,0)}40%{transform:translate3d(5px,-3px,0)}60%{transform:translate3d(-4px,-2px,0)}80%{transform:translate3d(3px,2px,0)}}`}</style>

      {/* 流派 combo 点亮：全屏横幅 */}
      {banner ? (
        <div
          role="status"
          aria-live="assertive"
          className="pointer-events-none absolute inset-x-0 top-6 z-30 flex justify-center px-4"
        >
          {/* 规范·combo 横幅：主色实底、深渊黑字 20px/700、从中间展开 */}
          <p className="animate-in fade-in zoom-in-50 rounded-md bg-primary px-6 py-3 text-center font-display text-xl font-bold text-primary-foreground shadow-glow-cyan duration-400">
            {banner}
          </p>
        </div>
      ) : null}

      {/* 卡牌飞入顶部词条栏 */}
      {flying ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] transition-all duration-500 ease-out"
          style={{
            left: flying.x,
            top: flying.y,
            width: flying.width,
            height: flying.height,
            transform: flyingAway
              ? `translate(${16 - flying.x}px, ${16 - flying.y}px) scale(0.25)`
              : "translate(0, 0) scale(1)",
            opacity: flyingAway ? 0 : 1,
          }}
        >
          <div className="flex h-full flex-col gap-1 rounded-lg border border-primary bg-card p-3 text-card-foreground shadow-lg">
            <span className="font-mono text-xs text-primary">
              {RELIC_SCHOOL_LABEL[flying.relic.school]}
            </span>
            <span className="font-display text-base font-bold">
              {flying.relic.name}
            </span>
          </div>
        </div>
      ) : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          isReplaceMode ? "选择要替换掉的旧词条" : `第 ${floor} 层已清除`
        }
        className={cn(
          "max-h-full w-full overflow-y-auto rounded-xl border border-border bg-card p-4 text-card-foreground shadow-md sm:p-5",
          isReplaceMode ? "max-w-3xl" : "max-w-4xl",
          lowSpec
            ? "animate-in fade-in duration-150"
            : "animate-in fade-in slide-in-from-bottom-8 duration-300",
        )}
      >
        {isReplaceMode ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  碎片已满 · {MAX_RELIC_SLOTS} / {MAX_RELIC_SLOTS}
                </p>
                <h2 className="mt-0.5 font-display text-2xl font-bold tracking-tight">
                  碎片已满
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  选择 1 个旧词条替换
                </p>
              </div>
              <button
                type="button"
                onClick={onCancelReplace}
                aria-label="取消替换"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-border text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-md border border-primary/50 bg-primary/10 p-3">
              <p className="font-mono text-xs text-primary">
                新碎片 · {RELIC_SCHOOL_LABEL[pendingRelic.school]} ·{" "}
                {RELIC_RARITY_LABEL[pendingRelic.rarity]}
              </p>
              <p className="mt-1 font-display text-base font-bold">
                {pendingRelic.name}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {pendingRelic.desc}
              </p>
            </div>

            <p className="mt-4 font-mono text-xs text-muted-foreground">
              点一个要丢掉的旧词条
            </p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {relics.map((relic, index) => {
                const style = RELIC_SCHOOL_STYLE[relic.school]
                const active = relic.id === slotId
                return (
                  <li key={relic.id}>
                    <button
                      type="button"
                      onClick={() => setSlotId(relic.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border p-3 text-left transition focus-visible:outline-none focus-visible:shadow-focus",
                        active
                          ? "-translate-y-0.5 border-destructive/70 bg-destructive/10 shadow-md"
                          : "border-border hover:-translate-y-0.5 hover:border-destructive/60",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          style.dot,
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block font-mono text-xs text-muted-foreground">
                          {index + 1} · {RELIC_SCHOOL_LABEL[relic.school]}
                        </span>
                        <span className="block font-display text-sm font-bold">
                          {relic.name}
                        </span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {relic.desc}
                        </span>
                      </span>
                      <CornerDownRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancelReplace}
                className="rounded-sm border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmReplace}
                disabled={!slotId}
                className={cn(
                  "rounded-sm border px-4 py-2 font-mono text-xs font-bold transition focus-visible:outline-none focus-visible:shadow-focus",
                  slotId
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed border-border bg-foreground/5 text-muted-foreground",
                )}
              >
                确认替换
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-mono text-xs text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {character.displayName} · 已带 {relics.length} / {MAX_RELIC_SLOTS}
                </p>
                <h2 className="mt-0.5 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  第 {floor} 层已清除
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  选择 1 个记忆碎片
                </p>
              </div>
              <p className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:block">
                1 / 2 / 3 选择 · R 刷新 · 空格跳过 · I 看详情
              </p>
            </div>

            <ul
              className={cn(
                "mt-4 grid gap-3",
                choices.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
              )}
            >
              {choices.map((relic, index) => {
                const style = RELIC_SCHOOL_STYLE[relic.school]
                const combo = getRelicComboProgress(relics, relic)
                const active = relic.id === selectedId
                const dimmed = selectedId !== null && !active
                const recommended = character.recommendedSchools.includes(
                  relic.school as (typeof character.recommendedSchools)[number],
                )
                const detailOpen = relic.id === detailRelicId
                const detailPanelId = `relic-detail-${relic.id}`
                return (
                  <li key={relic.id} className="flex flex-col">
                    <button
                      type="button"
                      ref={(node) => {
                        cardRefs.current[relic.id] = node
                      }}
                      data-relic-card
                      data-relic-id={relic.id}
                      onClick={(ev) => handleCardClick(ev, relic)}
                      onPointerDown={() => startPress(relic)}
                      onPointerUp={endPress}
                      onPointerLeave={endPress}
                      onPointerCancel={endPress}
                      onContextMenu={(ev) => ev.preventDefault()}
                      aria-pressed={active}
                      aria-expanded={detailOpen}
                      aria-describedby={detailOpen ? detailPanelId : undefined}
                      aria-label={`${RELIC_SCHOOL_LABEL[relic.school]} ${RELIC_RARITY_LABEL[relic.rarity]} ${relic.name}：${relic.desc}`}
                      className={cn(
                        "group flex w-full grow select-none flex-col gap-2 rounded-lg border bg-background/40 p-3 text-left transition duration-200 focus-visible:outline-none focus-visible:shadow-focus",
                        // 边框跟随系别色（规范·词条卡：1px 系别色，普通 40% 透明度）
                        style.ring,
                        // 稀有度光效：稀有=微弱外发光 / 史诗=脉冲外发光
                        relic.rarity === "rare" &&
                          "bg-[image:var(--grad-rare)] shadow-[0_0_8px_rgba(0,229,255,0.25)]",
                        relic.rarity === "epic" &&
                          "bg-[image:var(--grad-epic)] shadow-[0_0_16px_rgba(177,78,255,0.35)]",
                        relic.rarity === "epic" &&
                          !lowSpec &&
                          !dimmed &&
                          "motion-safe:animate-glow-pulse",
                        active
                          ? "-translate-y-1 border-2 bg-background/70"
                          : "hover:-translate-y-1",
                        active && style.glow,
                        dimmed && "opacity-40 saturate-0",
                        detailOpen && "border-2",
                        detailOpen && style.glow,
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                            style.chip,
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn("h-1.5 w-1.5 rounded-full", style.dot)}
                          />
                          {RELIC_SCHOOL_LABEL[relic.school]}
                        </span>
                        <span
                          className={cn(
                            "rounded-sm border px-1.5 py-0.5 font-mono text-xs",
                            RELIC_RARITY_STYLE[relic.rarity],
                          )}
                        >
                          {RELIC_RARITY_LABEL[relic.rarity]}
                        </span>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                      </span>

                      <span className="font-display text-base font-bold">
                        {relic.name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {relic.desc}
                      </span>

                      <span className="mt-auto space-y-1">
                        <span className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-muted-foreground">
                          <span>内存 · {memoryCostLabel(relic)}</span>
                          <span className={RELIC_RISK_STYLE[relic.risk]}>
                            风险 · {RELIC_RISK_LABEL[relic.risk]}
                          </span>
                        </span>
                        {combo ? (
                          combo.remain === 0 ? (
                            <span className="block font-mono text-xs text-primary">
                              {`选它点亮【${combo.combo.name}】`}
                            </span>
                          ) : (
                            <span className="block font-mono text-xs text-muted-foreground">
                              {`凑【${combo.combo.name}】还差 ${combo.remain} 件`}
                            </span>
                          )
                        ) : null}
                      </span>

                      {recommended ? (
                        <span
                          className={cn(
                            "block rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary transition-opacity",
                            active
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                          )}
                        >
                          推荐给{character.displayName}
                        </span>
                      ) : null}
                    </button>

                    {detailOpen ? (
                      <RelicDetailPanel
                        panelId={detailPanelId}
                        relic={relic}
                        character={character}
                        relics={relics}
                        floor={floor}
                        lowSpec={lowSpec}
                        showConfirm={narrow}
                        onConfirm={() => confirmFromCard(relic)}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>

            <p className="mt-3 font-mono text-xs text-muted-foreground">
              长按卡片钉住详细数值（点别处收起）· 键盘聚焦卡片后按 I
            </p>

            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={onReroll}
                disabled={!canReroll}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus",
                  canReroll
                    ? "border-primary/60 bg-primary/10 text-primary hover:border-primary"
                    : "cursor-not-allowed border-border bg-foreground/5 text-muted-foreground",
                )}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {canReroll ? `刷新（剩余 ${rerollsLeft} 次）` : "本层刷新已用完"}
              </button>

              {/* 超时重试（网络系 N6）：金色按钮，每层 1 次、耗内存、必出稀有以上 */}
              {retryRelic ? (
                <button
                  type="button"
                  onClick={onTimeoutRetry}
                  disabled={!timeoutRetryLeft || !timeoutRetryAffordable}
                  title={`耗 ${timeoutRetryCost} 内存重随三选一 · 每层 1 次 · 必出稀有以上`}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus",
                    timeoutRetryLeft && timeoutRetryAffordable
                      ? "border-sys-network/70 bg-sys-network/15 text-sys-network ring-1 ring-sys-network/40 hover:border-sys-network"
                      : "cursor-not-allowed border-border bg-foreground/5 text-muted-foreground",
                  )}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {!timeoutRetryLeft
                    ? "超时重试 · 本层已用"
                    : !timeoutRetryAffordable
                      ? `超时重试 · 内存不足（需 ${timeoutRetryCost}）`
                      : `超时重试 −${timeoutRetryCost} 内存`}
                </button>
              ) : null}

              {/* 热更新（通用系 G2）：每局 1 次耗内存刷新，不占免费/付费刷新次数 */}
              {hotReloadHeld ? (
                <button
                  type="button"
                  onClick={onHotReloadRefresh}
                  disabled={hotReloadUsed || !hotReloadAffordable}
                  title={`热更新：耗 ${hotReloadCost} 内存重随三选一 · 每局 1 次 · 不占刷新次数`}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus",
                    !hotReloadUsed && hotReloadAffordable
                      ? "border-primary/60 bg-primary/10 text-primary hover:border-primary"
                      : "cursor-not-allowed border-border bg-foreground/5 text-muted-foreground",
                  )}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {hotReloadUsed
                    ? "热更新 · 本局已用"
                    : !hotReloadAffordable
                      ? `热更新 · 内存不足（需 ${hotReloadCost}）`
                      : `热更新刷新 −${hotReloadCost} 内存`}
                </button>
              ) : null}

              {/* 付费刷新：花局内碎片，每层限 1 次，效果与免费刷新相同 */}
              <button
                type="button"
                onClick={onPaidReroll}
                disabled={!canPaidReroll}
                title={`花 ${paidRerollCost} 局内碎片重抽三选一 · 每层限 1 次`}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus",
                  canPaidReroll
                    ? "border-sys-network/60 bg-sys-network/10 text-sys-network hover:border-sys-network"
                    : "cursor-not-allowed border-border bg-foreground/5 text-muted-foreground",
                )}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {paidRerollUsed
                  ? "本层付费刷新已用"
                  : paidRerollShort > 0
                    ? `付费刷新 −${paidRerollCost} 碎片 · 还差 ${paidRerollShort}`
                    : `付费刷新 −${paidRerollCost} 碎片`}
              </button>

              <button
                type="button"
                onClick={openSkipAsk}
                className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
              >
                <HeartPulse className="h-3.5 w-3.5" />
                跳过并回复 {RELIC_SKIP_HEAL} 生命
              </button>

              <button
                type="button"
                onClick={confirmSelected}
                disabled={selectedId === null}
                className={cn(
                  "rounded-sm border px-5 py-2 font-mono text-xs font-bold transition focus-visible:outline-none focus-visible:shadow-focus",
                  selectedId !== null
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed border-border bg-foreground/5 text-muted-foreground",
                )}
              >
                确认
              </button>
            </div>
          </>
        )}
      </div>

      {/* 跳过二次确认 */}
      {skipAsk ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="确定跳过？"
            className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-md duration-200"
          >
            <h3 className="font-display text-lg font-bold">确定跳过？</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {skipUpgrade
                ? `跳过将回复 ${skipUpgradeAmount} 生命（花 ${skipUpgradeCost} 局内碎片），但不会获得词条`
                : `跳过将回复 ${RELIC_SKIP_HEAL} 生命，但不会获得词条`}
            </p>

            {/* 回复升级：花局内碎片把跳过回复从 15 升到 25 */}
            <button
              type="button"
              onClick={() => {
                if (!canSkipUpgrade) return
                setSkipUpgrade((prev) => !prev)
              }}
              disabled={!canSkipUpgrade}
              aria-pressed={skipUpgrade}
              className={cn(
                "mt-3 flex w-full items-start gap-2 rounded-md border p-2.5 text-left font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus",
                skipUpgrade
                  ? "border-sys-network bg-sys-network/10 text-sys-network"
                  : canSkipUpgrade
                    ? "border-border text-muted-foreground hover:border-sys-network/60 hover:text-sys-network"
                    : "cursor-not-allowed border-border bg-foreground/5 text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border",
                  skipUpgrade
                    ? "border-sys-network bg-sys-network text-background"
                    : "border-border",
                )}
              >
                {skipUpgrade ? <Check className="h-2.5 w-2.5" /> : null}
              </span>
              <span>
                加 {skipUpgradeCost} 碎片把回复升到 {skipUpgradeAmount}
                {!canSkipUpgrade ? ` · 还差 ${skipUpgradeShort}` : ""}
              </span>
            </button>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSkipAsk(false)}
                className="rounded-sm border border-border px-3 py-2 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setSkipAsk(false)
                  onSkip(skipUpgrade)
                }}
                className="rounded-sm border border-primary bg-primary px-4 py-2 font-mono text-xs font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:shadow-focus"
              >
                确认跳过
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
