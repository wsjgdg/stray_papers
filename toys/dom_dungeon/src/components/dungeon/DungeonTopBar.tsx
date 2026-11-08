import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FastForward,
  Gem,
  Cpu,
  Link2,
  LogOut,
  MoonStar,
  Pause,
  Play,
  Skull,
  Zap,
} from "lucide-react"

import { MemoryCells } from "@/components/dungeon/MemoryCells"
import { RhAccountMenu } from "@/components/rh/RhAccountMenu"
import {
  CURSE_DEFS,
  RELIC_RARITY_LABEL,
  RELIC_SCHOOL_LABEL,
  RELIC_SCHOOL_STYLE,
  scramblifyText,
  type BondDef,
  type CurseId,
  type FloorConfig,
  type HiddenFloorId,
  type Relic,
  type RelicConflictDef,
  type RelicSchool,
} from "@/lib/dungeonData"
import type { PlayMode } from "@/lib/dungeonSave"
import { cn } from "@/lib/utils"

/** 顶栏操作模式小字标：硬核用警报红描边，其余低存在感 */
const PLAY_MODE_LABEL: Record<PlayMode, string> = {
  casual: "休闲",
  standard: "标准",
  hardcore: "硬核",
}

type DungeonTopBarProps = {
  floor: number
  floorTotal: number
  floorLabel: string
  floorShort: string
  isBossFloor: boolean
  /** 盲战（fun-pack v2）：顶栏内存数字换成 ??（条形/外框保留） */
  blindCombat: boolean
  /** 战斗中的非 Boss 层：层数文字变成可点的强行跳层按钮 */
  canForceSkip: boolean
  onForceSkip: () => void
  floors: FloorConfig[]
  seed: string
  shortSeed: string
  copiedSeed: string | null
  relics: Relic[]
  relicSlots: number
  /** 当前携带的诅咒（回收站 / 商店清理服务可清） */
  curses: CurseId[]
  schoolCounts: Record<RelicSchool, number>
  bonds: BondDef[]
  /** 词条打架（fun-pack v3）：同时持有 requires 两条后正在「打架」的词条对 */
  relicConflicts: RelicConflictDef[]
  /** 正在隐藏裂隙内的额外战斗：层数旁挂小文字标「裂隙中」 */
  hiddenActive: HiddenFloorId | null
  /** 本局临时碎片余额（只在本局有效，没花完的结算时 1:1 折算） */
  shards: number
  /** 刚拿到碎片：数字跳一下 */
  shardPulse: boolean
  /** 内存：当前余额（向上取整） */
  memory: number
  /** 内存：当前上限 */
  memoryMax: number
  /** 内存 4 区间（v2）：充裕霓虹青 / 稳定青 / 卡顿黄 / 阻塞红+脉冲（配色唯一判定处） */
  memoryZone: "abundant" | "normal" | "tense" | "exhausted"
  /** 核心体验包 v2：缓存取出导致的超上限点数（读数夹满 + 金角标「+N」） */
  memoryOverflow: number
  /** 核心体验包 v2：顶栏缓存芯片（实心点 = 有货槽；点击开缓存盒；null = 不渲染） */
  cacheChip?: {
    filled: number
    total: number
    depositLeft: number
    onOpen: () => void
  } | null
  /* ---- 深化包（deepening-pack.md）：碎片徽标 + 超频按钮 ---- */
  /** 当前内存碎片数（0~8） */
  memFrags: number
  /** 下次进层回满的实际水位（碎片 >0 时低于上限） */
  memoryRefill: number
  /** 超频按钮此刻能不能按 */
  overclockReady: boolean
  /** 超频爆发进行中 */
  overclockActive: boolean
  /** 爆发剩余毫秒 */
  overclockLeftMs: number
  /** 过热惩罚进行中 */
  overclockHot: boolean
  /** 惩罚剩余毫秒 */
  overclockHotLeftMs: number
  onOverclock: () => void
  /** 内存显示形态（ui-pack.md 一）：cells = 格子条，bar = 存量数字徽章 */
  memoryDisplay: "cells" | "bar"
  /** 二级信息是否展开（ui-pack.md v3 一，受控）：收起 = 禅模式，攻速 +5% 在引擎侧生效 */
  detailsExpanded: boolean
  onToggleDetails: () => void
  /** 内存历史采样点（ui-pack.md v3 二）：展开态画迷你曲线 */
  memoryHist: number[]
  /** HUD 构筑包：当前激活的构筑收益名（展开态「构筑：…」行） */
  buildPerks?: string[]
  /** 低配模式：层数进度不做切换过渡 */
  lowSpec?: boolean
  /** 战斗是否已暂停 */
  paused: boolean
  /** 本局操作模式：进局定死，休闲 / 标准 / 硬核 */
  playMode: PlayMode
  /** scramble 故障（fun-pack.md 二）：词条名字打乱成乱码 */
  scramble?: boolean
  /** 乱码批次号（每 ~0.35s 换一批），页面按 now 传入 */
  scrambleBucket?: number
  /** 词条手动触发状态：id → { name, status, label } */
  relicTriggers: Record<
    string,
    { name: string; status: "ready" | "cooldown" | "used"; label: string }
  >
  onCopySeed: (seed: string) => void
  /** 地址栏「清理缓存」（ui-arsenal-pack.md 二）：本层 1 次、3 内存 */
  canClearCache: boolean
  cacheCleared: boolean
  onClearCache: () => void
  onTogglePause: () => void
  /** 点击可触发的词条卡手动激活 */
  onTriggerRelic: (relicId: string) => void
  /* ---- 故障手感包（glitch-feel-pack.md 四）：内存错位 ---- */
  /** 错位进行态：内存数字换成抖动的假值（真值在 title 里） */
  memFakeActive: boolean
  /** 点内存徽章触发错位（碎片 +2，6 秒迷惑管理员与泄漏） */
  onMemFake: () => void
  onExit: () => void
}

const SCHOOL_ORDER: RelicSchool[] = ["script", "style", "network", "cache"]

export function DungeonTopBar({
  floor,
  floorTotal,
  floorLabel,
  floorShort,
  isBossFloor,
  blindCombat,
  canForceSkip,
  onForceSkip,
  floors,
  seed,
  shortSeed,
  copiedSeed,
  relics,
  relicSlots,
  curses,
  schoolCounts,
  bonds,
  relicConflicts,
  hiddenActive,
  shards,
  shardPulse,
  memory,
  memoryMax,
  memoryZone,
  memoryOverflow,
  cacheChip,
  memFrags,
  memoryRefill,
  overclockReady,
  overclockActive,
  overclockLeftMs,
  overclockHot,
  overclockHotLeftMs,
  onOverclock,
  memoryDisplay,
  detailsExpanded,
  onToggleDetails,
  memoryHist,
  buildPerks = [],
  lowSpec = false,
  paused,
  playMode,
  scramble = false,
  scrambleBucket = 0,
  relicTriggers,
  onCopySeed,
  canClearCache,
  cacheCleared,
  onClearCache,
  onTogglePause,
  onTriggerRelic,
  memFakeActive,
  onMemFake,
  onExit,
}: DungeonTopBarProps) {
  const emptySlots = Math.max(0, relicSlots - relics.length)
  /* 内存错位进行态：显示一个「抖动的假值」（比真值多 1~3，每 220ms 换一次），真值在 title 里 */
  /* 核心体验包 v2：缓存取出的超上限余额——读数夹到上限，超额部分显「+N」金角标 */
  const shownMemory = Math.min(
    memFakeActive
      ? memory + 1 + (Math.floor(Date.now() / 220) % 3)
      : memory,
    memoryMax,
  )
  /* 折叠态仍露「可触发」徽标与打架警告——那是操作和异常，不是装饰 */
  const readyRelics = relics.filter(
    (relic) => relicTriggers[relic.id]?.status === "ready",
  )
  /* 内存曲线点位（ui-pack.md v3 二）：按窗口内最大值归一，贴底留 1 单位 */
  const histMax = memoryHist.length > 0 ? Math.max(1, ...memoryHist) : 1
  const histPoints =
    memoryHist.length > 1
      ? memoryHist
          .map(
            (value, index) =>
              `${((index / (memoryHist.length - 1)) * 60).toFixed(1)},${(
                13 -
                (value / histMax) * 11
              ).toFixed(1)}`,
          )
          .join(" ")
      : null

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-primary/40 bg-primary/10 font-mono text-xs font-bold text-primary"
        >
          {String(floor).padStart(2, "0")}
        </span>

        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-display text-sm font-bold tracking-tight sm:text-base">
            {floorLabel}
            {isBossFloor ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-destructive/15 px-1.5 py-0.5 font-mono text-xs text-destructive">
                <Skull className="h-3 w-3" />
                Boss
              </span>
            ) : null}
            <span
              title={
                playMode === "hardcore"
                  ? "硬核模式：特殊互动失败惩罚 ×1.5"
                  : playMode === "casual"
                    ? "休闲模式：特殊互动失败不受罚"
                    : "标准模式：平衡体验"
              }
              className={cn(
                "inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-mono text-xs",
                playMode === "hardcore"
                  ? "border border-destructive/70 text-destructive"
                  : "border border-border text-muted-foreground",
              )}
            >
              {PLAY_MODE_LABEL[playMode]}
            </span>
          </p>
          <p className="truncate font-mono text-xs">
            {/* 强行跳层（fun-pack v2）：仅战斗中非 Boss 层可点，校验与横幅在引擎侧；样式低调不抢主视觉 */}
            {canForceSkip ? (
              <button
                type="button"
                onClick={onForceSkip}
                title="强行跳层：跳过本层战斗，-30 血"
                className="inline-flex items-center gap-1 rounded-sm border border-border px-1 py-0.5 text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
              >
                <FastForward className="h-3 w-3" />
                {floorShort} · {floor} / {floorTotal} 层
              </button>
            ) : (
              <span className="text-muted-foreground">
                {floorShort} · {floor} / {floorTotal} 层
              </span>
            )}
            {hiddenActive ? (
              <span
                title="裂隙内的额外战斗 · 打完按原计划继续"
                className="ml-1.5 inline-flex items-center gap-1 rounded-sm border border-sys-general/60 bg-sys-general/10 px-1 py-0.5 text-sys-general"
              >
                <MoonStar aria-hidden className="h-3 w-3" />
                裂隙中
              </span>
            ) : null}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onMemFake}
            disabled={memFakeActive}
            title={
              memFakeActive
                ? `内存错位中 · 屏幕上是假数字（真值 ${memory}/${memoryMax}）· 管理员与泄漏都被骗`
                : "内存 · 进层回满、击杀 / 碎片 / 词条回内存 · 主动技 / 闪避 / 补刀 / 拖拽都花它 · 低于 15% 阻塞主动技与闪避\n点我：错位 6 秒，迷惑读取你状态的敌人（碎片 +2）"
            }
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-xs font-bold transition",
              memoryZone === "abundant" &&
                "border-primary/60 bg-primary/10 text-primary shadow-glow-cyan",
              memoryZone === "normal" &&
                "border-border bg-background/40 text-foreground hover:border-primary/40",
              memoryZone === "tense" &&
                "border-sys-network/70 bg-sys-network/10 text-sys-network",
              memoryZone === "exhausted" &&
                "border-destructive/70 bg-destructive/10 text-destructive",
              memoryZone === "exhausted" && !lowSpec && "animate-pulse-soft",
              /* 错位态：假数字用故障红描边，提示这是「被篡改」的显示 */
              memFakeActive &&
                cn(
                  "border-sys-style/70 bg-sys-style/10 text-sys-style",
                  !lowSpec && "animate-pulse-soft",
                ),
            )}
          >
            <Cpu className="h-3.5 w-3.5" />
            {memoryDisplay === "cells" && !blindCombat ? (
              <MemoryCells
                memory={shownMemory}
                memoryMax={memoryMax}
                memoryZone={memoryZone}
                overflow={memFakeActive ? 0 : memoryOverflow}
              />
            ) : (
              <span className={cn("tabular-nums", blindCombat && "text-muted-foreground")}>
                {blindCombat ? "??/??" : `${shownMemory}/${memoryMax}`}
              </span>
            )}
            {/* 核心体验包 v2：条形态下超上限用同款金角标补读数 */}
            {!blindCombat && !memFakeActive && memoryOverflow > 0 && memoryDisplay !== "cells" ? (
              <span
                title={`缓存取出超上限 +${memoryOverflow}（显示夹满，扣减从真实值扣）`}
                className="rounded-sm border border-sys-network/70 bg-sys-network/10 px-0.5 text-[10px] font-bold leading-4 text-sys-network"
              >
                +{memoryOverflow}
              </span>
            ) : null}
            <span className="hidden font-normal opacity-80 sm:inline">
              {memFakeActive ? "内存·错位" : "内存"}
            </span>
            {/* 深化包：碎片 >0 时注明下次进层实际回到的水位 */}
            {memFrags > 0 && !memFakeActive ? (
              <span className="hidden font-normal text-[10px] opacity-80 md:inline">
                回满至 {memoryRefill}/{memoryMax}
              </span>
            ) : null}
          </button>
          {/* 核心体验包 v2：缓存电池芯片（实心点 = 有货槽 · 本层剩余存入次数 · 点开缓存盒） */}
          {cacheChip ? (
            <button
              type="button"
              onClick={cacheChip.onOpen}
              title={`缓存电池：每层 ${cacheChip.depositLeft} 次免费「存入 5」· 取出花 1 内存、余额可超限 · 清空全转额外 +2 · 换层清空`}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-sys-cache/60 bg-sys-cache/10 px-2 py-1 font-mono text-xs font-bold text-sys-cache transition hover:border-sys-cache focus-visible:outline-none focus-visible:shadow-focus"
            >
              缓存 ▍
              <span aria-label={`缓存 ${cacheChip.filled}/${cacheChip.total}`}>
                {Array.from({ length: cacheChip.total }, (_, i) => (
                  <span key={i} className={i < cacheChip.filled ? undefined : "opacity-40"}>
                    {i < cacheChip.filled ? "●" : "○"}
                  </span>
                ))}
              </span>
              <span className="hidden font-normal opacity-80 sm:inline">存{cacheChip.depositLeft}</span>
            </button>
          ) : null}
          {/* 深化包·超频：爆发/过热显示徽标，平时是可点的 ⚡ 按钮 */}
          {overclockActive ? (
            <span
              title="超频中：忽略一切内存区间惩罚，攻速 +20%，主动技内存费减半"
              className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-sys-style/70 bg-sys-style/10 px-2 py-1 font-mono text-xs font-bold text-sys-style shadow-glow-purple"
            >
              <Zap aria-hidden className="h-3.5 w-3.5" />
              超频中 {Math.ceil(overclockLeftMs / 1000)}s
            </span>
          ) : overclockHot ? (
            <span
              title="超频过热：按卡顿区处理，还崩出了 3 块碎片"
              className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-sys-network/70 bg-sys-network/10 px-2 py-1 font-mono text-xs font-bold text-sys-network"
            >
              超频过热 · 卡顿中 {Math.ceil(overclockHotLeftMs / 1000)}s
            </span>
          ) : (
            <button
              type="button"
              onClick={onOverclock}
              disabled={!overclockReady}
              title={
                overclockReady
                  ? "内存超频：−3 内存，8 秒火力全开，随后 10 秒过热（每层一次）"
                  : "本层已用过 / 内存不足 6 · 超频要留到刀刃上"
              }
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs font-bold transition touch-manipulation active:scale-95 focus-visible:outline-none focus-visible:shadow-focus",
                overclockReady
                  ? cn(
                      "border-sys-style/70 bg-sys-style/10 text-sys-style",
                      !lowSpec && "animate-pulse-soft shadow-glow-purple",
                    )
                  : "cursor-not-allowed border-border text-muted-foreground/50",
              )}
            >
              <Zap aria-hidden className="h-3.5 w-3.5" />
              超频
            </button>
          )}
          {/* 深化包·碎片徽标：≥5 红 + 脉冲（长期不整理的代价） */}
          {memFrags > 0 ? (
            <span
              title={`内存碎片 ×${memFrags}：不清理的话进层回满只回到 ${memoryRefill}/${memoryMax}${
                memFrags >= 5 ? "，5 块起还常驻攻速 −10%" : ""
              } · 整理方式：任务管理器「磁盘整理」/ 回收站路线 / 商店整理服务`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs font-bold",
                memFrags >= 5
                  ? "border-destructive/70 bg-destructive/10 text-destructive"
                  : "border-sys-network/70 bg-sys-network/10 text-sys-network",
                memFrags >= 5 && !lowSpec && "animate-pulse-soft",
              )}
            >
              🧩 ×{memFrags}
            </span>
          ) : null}
          <span
            title="局内碎片 · 死亡作废 · 可用于复活 / 付费刷新 / 升级回复；没花完的结算时按 1:1 折算"
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-primary/50 bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary",
              !lowSpec && "transition-transform duration-150",
              shardPulse && !lowSpec && "scale-110",
            )}
          >
            <Gem className="h-3.5 w-3.5" />
            <span className="tabular-nums">{shards}</span>
            <span className="hidden font-normal opacity-80 sm:inline">碎片</span>
          </span>
          <button
            type="button"
            onClick={() => onCopySeed(seed)}
            title="复制本局种子码"
            className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 font-mono text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
          >
            {copiedSeed === seed ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {shortSeed}
          </button>
          {/* 假地址栏 + 清理缓存（ui-arsenal-pack.md 二）：浏览器感 HUD，
              每层一次、3 内存，拔光本层敌人的护盾与回血 */}
          <span className="hidden items-center md:inline-flex">
            <span className="rounded-l-sm border border-r-0 border-border px-2 py-1 font-mono text-xs text-muted-foreground">
              🔒 dungeon://L{floor}
            </span>
          </span>
          <button
            type="button"
            onClick={onClearCache}
            disabled={!canClearCache}
            title={
              cacheCleared
                ? "本层缓存已清理 · 护盾与回血已被拔线"
                : canClearCache
                  ? "清理缓存：花 3 内存，本层敌人护盾清零、回血关停（每层 1 次）"
                  : "Boss 层与管理员层无法清理缓存"
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-xs transition focus-visible:outline-none focus-visible:shadow-focus",
              cacheCleared
                ? "border-border/60 text-textDisabled"
                : canClearCache
                  ? "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
                  : "border-border/60 text-textDisabled",
            )}
          >
            🧹
            <span className="hidden sm:inline">清缓存</span>
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            aria-pressed={paused}
            aria-label={paused ? "继续战斗" : "暂停战斗"}
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-sm border transition focus-visible:outline-none focus-visible:shadow-focus",
              paused
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
            )}
          >
            {paused ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label="离开地牢"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-border text-muted-foreground transition hover:border-destructive/60 hover:text-destructive focus-visible:outline-none focus-visible:shadow-focus"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <RhAccountMenu />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {/* 折叠开关（ui-pack.md v2 二 / v3 一）：折叠 = 禅模式，攻速 +5% */}
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={detailsExpanded}
          aria-label={detailsExpanded ? "收起词条与流派信息" : "展开词条与流派信息"}
          title={
            detailsExpanded
              ? "展开中：信息全显示，攻速基准"
              : "禅模式：信息收起，攻速 +5%"
          }
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-sm border transition focus-visible:outline-none focus-visible:shadow-focus",
            detailsExpanded
              ? "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
              : "border-primary bg-primary/10 text-primary",
          )}
        >
          {detailsExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {/* 禅徽标（ui-pack.md v3 一）：折叠态明示当前吃着的攻速加成 */}
        {!detailsExpanded ? (
          <span
            title="禅模式：二级信息收起时攻速 +5%，展开即失效"
            className="shrink-0 rounded-sm border border-primary/60 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary"
          >
            禅 · 攻速 +5%
          </span>
        ) : null}

        {/* 内存历史曲线（ui-pack.md v3 二）：展开态显示，≈12 秒余额走势 */}
        {detailsExpanded && histPoints ? (
          <svg
            viewBox="0 0 60 14"
            aria-hidden
            className="h-3.5 w-14 shrink-0 text-primary"
            fill="none"
          >
            <polyline
              points={histPoints}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : null}

        {detailsExpanded ? (
          <ol className="flex shrink-0 items-center gap-1" aria-label="层数进度">
          {floors.map((item) => (
            <li
              key={item.floor}
              title={item.label}
              className={cn(
                "h-1.5 w-4 rounded-full",
                !lowSpec && "transition",
                item.floor < floor
                  ? "bg-primary"
                  : item.floor === floor
                    ? "bg-primary/70"
                    : item.isBoss
                      ? "border border-destructive/60"
                      : "bg-foreground/10",
              )}
            />
          ))}
          </ol>
        ) : null}

        {detailsExpanded ? (
        <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {relics.map((relic) => {
            const style = RELIC_SCHOOL_STYLE[relic.school]
            const trigger = relicTriggers[relic.id]
            const triggerable = Boolean(trigger)
            const isReady = trigger?.status === "ready"

            const cardBody = (
              <>
                <span
                  aria-hidden
                  className={cn("h-1.5 w-1.5 rounded-full", style.dot)}
                />
                <span className="max-w-24 truncate">
                  {scramble ? scramblifyText(relic.name, scrambleBucket) : relic.name}
                </span>
                {triggerable && trigger ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-sm px-1 text-[10px] font-bold leading-4",
                      isReady
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {trigger.label}
                  </span>
                ) : null}
              </>
            )

            const baseCls = cn(
              "flex shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-xs",
              style.chip,
            )
            const title = `${relic.code} ${relic.name} · ${RELIC_RARITY_LABEL[relic.rarity]} · ${relic.desc}`

            return (
              <li key={relic.id}>
                {triggerable ? (
                  <button
                    type="button"
                    onClick={() => onTriggerRelic(relic.id)}
                    disabled={!isReady}
                    title={
                      isReady
                        ? `点击主动触发 · ${relic.name}`
                        : `${relic.name} · ${trigger?.label ?? ""}`
                    }
                    className={cn(
                      baseCls,
                      "touch-manipulation focus-visible:outline-none focus-visible:shadow-focus",
                      isReady &&
                        !lowSpec &&
                        "animate-pulse border-primary ring-1 ring-primary/60",
                      isReady && lowSpec && "border-primary ring-1 ring-primary/60",
                      !isReady && "opacity-50",
                    )}
                  >
                    {cardBody}
                  </button>
                ) : (
                  <span title={title} className={baseCls}>
                    {cardBody}
                  </span>
                )}
              </li>
            )
          })}
          {Array.from({ length: emptySlots }, (_, i) => (
            <li
              key={`empty-${i}`}
              aria-hidden
              className="h-5 w-10 shrink-0 rounded-sm border border-dashed border-border"
            />
          ))}
          {curses.map((curseId) => {
            const curse = CURSE_DEFS[curseId]
            return (
              <li key={curse.id}>
                <span
                  title={curse.desc}
                  className="flex shrink-0 items-center gap-1.5 rounded-sm border border-destructive/60 bg-destructive/10 px-1.5 py-0.5 font-mono text-xs text-destructive"
                >
                  <Skull aria-hidden className="h-3 w-3" />
                  <span className="max-w-24 truncate">{curse.name}</span>
                </span>
              </li>
            )
          })}
          </ul>
        ) : (
          /* 折叠态细栏：只露「可触发」徽标（操作不许被折叠藏走），其余一句话提示 */
          <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {readyRelics.map((relic) => {
              const style = RELIC_SCHOOL_STYLE[relic.school]
              return (
                <li key={relic.id}>
                  <button
                    type="button"
                    onClick={() => onTriggerRelic(relic.id)}
                    title={`点击主动触发 · ${relic.name}`}
                    className={cn(
                      "flex shrink-0 touch-manipulation items-center gap-1 rounded-sm border border-primary px-1.5 py-0.5 font-mono text-xs",
                      style.chip,
                      !lowSpec && "animate-pulse ring-1 ring-primary/60",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("h-1.5 w-1.5 rounded-full", style.dot)}
                    />
                    <span className="max-w-24 truncate">{relic.name}</span>
                    可触发
                  </button>
                </li>
              )
            })}
            {readyRelics.length === 0 ? (
              <li className="font-mono text-xs text-muted-foreground">
                二级信息已收起 · 点左侧箭头展开
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {/* 词条打架警告：折叠也要显示（这是异常提示，不是二级装饰） */}
      {relicConflicts.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {relicConflicts.map((conflict) => (
            <span
              key={conflict.id}
              title={conflict.desc}
              className="inline-flex items-center gap-1 rounded-sm border border-sys-network/60 bg-sys-network/10 px-1.5 py-0.5 font-mono text-xs font-bold text-sys-network"
            >
              <AlertTriangle aria-hidden className="h-3 w-3" />
              {conflict.name}
            </span>
          ))}
        </div>
      ) : null}

      {detailsExpanded ? (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {SCHOOL_ORDER.map((school) => {
          const count = schoolCounts[school]
          return (
            <span
              key={school}
              title={`本局已带走 ${RELIC_SCHOOL_LABEL[school]} 系词条 ${count} 个`}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-background/40 px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
            >
              <span
                aria-hidden
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  count > 0 ? RELIC_SCHOOL_STYLE[school].dot : "bg-muted-foreground",
                )}
              />
              {RELIC_SCHOOL_LABEL[school]} {count}
            </span>
          )
        })}
        <span className="font-mono text-xs text-muted-foreground">
          {relics.length} / {relicSlots} 槽
        </span>
        {/* HUD 构筑包：拖拽界面模块激活的收益（primary 强调） */}
        {buildPerks.length > 0 ? (
          <span
            title="构筑收益 · 拖动主动技 / 闪避 / 词条栏到屏幕边缘激活"
            className="inline-flex items-center gap-1 rounded-sm border border-primary/60 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary"
          >
            构筑：{buildPerks.join(" · ")}
          </span>
        ) : null}
      </div>
      ) : null}

      {bonds.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {bonds.map((bond) => (
            <li
              key={bond.id}
              title={bond.desc}
              className="inline-flex items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary"
            >
              <Link2 className="h-3 w-3" />
              流派 · {bond.name}
            </li>
          ))}
        </ul>
      ) : detailsExpanded ? (
        <p className="mt-1.5 font-mono text-xs text-muted-foreground">
          集齐同一流派的全部词条点亮流派 combo · 持有跨域可顶替缺的 1 件
        </p>
      ) : null}
    </div>
  )
}
