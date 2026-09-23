import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { EyeOff, HeartPulse, Shield, Skull, Sparkles, X } from "lucide-react"

import { BOSS_CRASH_PHASE_LABEL } from "@/lib/dungeonData"
import {
  ENEMY_TAG_DEFS,
  TAG_MUTATION_HINTS,
  type EnemyTagId,
} from "@/lib/seedGen"
import type {
  AttackFx,
  DamagePop,
  EnemyInstance,
  MiniShield,
  ShardDot,
} from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

/** 拖拽关闭：血量阈值 / 位移阈值（与引擎侧常量同值，UI 侧只做展示与手势判定） */
const DRAG_CLOSE_HP_RATIO = 0.3
const DRAG_CLOSE_THRESHOLD_PX = 40
/** 弹窗 × 窗口时长（与引擎侧 POPUP_X_WINDOW_MS 同值，供倒计时条算比例） */
const POPUP_X_WINDOW_MS = 1500

/** 敌人适应（fun-pack v2）：一局永久旗标的固定文案映射（效果数值见引擎侧） */
const ADAPTION_LABELS: {
  key: "bounce" | "crit" | "skill"
  name: string
  hint: string
}[] = [
  { key: "bounce", name: "弹射衰减", hint: "敌人适应了弹射伤害：弹射伤害 ×0.5" },
  { key: "crit", name: "暴击护甲", hint: "敌人长出暴击护甲：暴伤倍率减半" },
  { key: "skill", name: "技能抗性", hint: "敌人对主动技产生抗性：技能伤害 ×0.6" },
]

type TabEnemyStripProps = {
  enemies: EnemyInstance[]
  lockedUid: string | null
  now: number
  hitFlashMs: number
  pops: DamagePop[]
  /** 手动拾取的碎片点：金色小圆点，点击全额入账 */
  shardDots: ShardDot[]
  /** 拖拽关闭本层是否已用尽（用尽后不再出现「拖拽关闭」标） */
  dragCloseUsed: boolean
  /** 低配模式：关掉伤害飘字与标签抖动，血条与锁定反馈照旧 */
  lowSpec?: boolean
  /** C7 暗黑模式：非锁定目标卡大幅压成剪影（交互层不剪影） */
  darkTheme?: boolean
  /** C5 伪元素·分裂小护盾：青色光点飞向目标卡 */
  miniShields?: MiniShield[]
  /** S3 闭包：残像挂在哪个目标上（该卡画延时残像框） */
  closureEchoUid?: string | null
  /** 敌人适应（fun-pack v2）：集体适应徽标，挂在标签条整条共用的位置 */
  adaptions?: { bounce: boolean; crit: boolean; skill: boolean }
  /** 斩杀线比例（ui-pack.md 二）：持有秒杀/暗黑斩杀词条时给可斩敌人挂「⚔ 可斩」标；null = 没带 */
  executeMarkRatio?: number | null
  /** 攻击轨迹特效（glitch-feel-pack.md 二）：引擎按角色分流的短命记录，按 uid 分挂到卡 */
  attackFx?: AttackFx[]
  onLock: (uid: string) => void
  onDragClose: (uid: string) => void
  onDismissPopup: (uid: string) => void
  onPickShard: (dotId: number) => void
  /** 正在拖拽某个敌人时置位，页面据此禁用闪避 */
  onEnemyDragging: (active: boolean) => void
  /** 表现包：血骷髅斩杀（≤20% 血普通敌人，3 内存当场关闭） */
  onExecute: (uid: string) => void
  /** 深化包：点病毒芯片引爆（2 内存，40 固定伤 + 传染邻居） */
  onDetonateVirus: (uid: string) => void
}

/**
 * 飘字六色六制（v4·批次 B 扩展三种脚本/样式系机制字，注释见 useDungeon PopKind）：
 * 普通=主文字 / 暴击=金币黄放大 / 治疗=回复绿 / 护盾=霓虹青 / 闪避免疫诱饵=次文字灰 /
 * 斩杀·弹射·响应式重构=电光紫（脚本·样式系机制统一用 sys-style 紫） / 碎片=灰色
 */
function popTone(pop: DamagePop): string {
  if (pop.kind === "crit" || pop.crit) return "text-sys-network text-3xl"
  if (pop.kind === "hurt") return "text-destructive"
  if (pop.kind === "heal") return "text-sys-cache"
  if (pop.kind === "shield") return "text-sys-script"
  if (pop.kind === "execute") return "text-sys-style"
  /* 拟物化战斗包（skeuo-boss-pack.md 一）：弱点 × 命中=金色放大「弱」，专属通道 */
  if (pop.kind === "weak") return "text-sys-network text-2xl"
  /* 批次 B：弹射与响应式重构都归「脚本/样式系」紫色系（spec：弹射飘紫字） */
  if (pop.kind === "bounce" || pop.kind === "refactor") return "text-sys-style"
  /* 诱饵是「假目标」语义，走闪避同灰 */
  if (
    pop.kind === "dodge" ||
    pop.kind === "immune" ||
    pop.kind === "decoy"
  )
    return "text-muted-foreground"
  if (pop.kind === "shard") return "text-muted-foreground"
  return "text-foreground"
}

/** 飘字进入方向：闪避 / 诱饵侧移淡出，其余上浮 */
function popMotion(kind: DamagePop["kind"]): string {
  if (kind === "dodge" || kind === "decoy") return "slide-in-from-left-4"
  return "slide-in-from-bottom-4"
}

function popText(pop: DamagePop): string {
  if (pop.kind === "dodge") return "闪避"
  if (pop.kind === "immune") return "免疫"
  if (pop.kind === "shield") return "护盾"
  if (pop.kind === "heal") return `+${pop.amount}`
  if (pop.kind === "hurt") return `-${pop.amount}`
  if (pop.kind === "execute") return "斩杀"
  if (pop.kind === "weak") return "弱"
  if (pop.kind === "bounce") return "弹射"
  if (pop.kind === "decoy") return "残影诱饵"
  if (pop.kind === "refactor") return "响应式重构"
  if (pop.kind === "shard") return `自动 +${pop.amount}`
  return pop.crit ? `${pop.amount}!` : `${pop.amount}`
}

function phaseLabel(enemy: EnemyInstance): string | null {
  if (!enemy.boss) return null
  if (enemy.defId === "boss-fullscreen") {
    return enemy.boss.phase === 1 ? "阶段 1 · 关闭按钮" : "阶段 2 · 本体"
  }
  return BOSS_CRASH_PHASE_LABEL[enemy.boss.phase - 1] ?? null
}

/** 攻击轨迹样式表（glitch-feel-pack.md 二）：每角色一种辨识度，暴击/斩杀那条更粗带光。
 *  动画关键帧在 index.css（attack-slash / attack-tracer / attack-strike / attack-crumb / attack-sync / attack-shade） */
function attackFxClass(fx: AttackFx): string {
  switch (fx.kind) {
    case "slash":
      return cn(
        "attack-slash pointer-events-none absolute left-[6%] right-[6%] top-1/2 z-10 h-0.5 origin-left bg-primary",
        fx.big && "h-1 shadow-glow-cyan",
      )
    case "tracer":
      return cn(
        "attack-tracer pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px bg-primary/80",
        fx.big && "h-0.5 shadow-glow-cyan",
      )
    case "strike":
      return cn(
        "attack-strike pointer-events-none absolute inset-y-[6%] left-1/2 z-10 w-[3px] -translate-x-1/2 origin-top bg-sys-script",
        fx.big && "w-[5px] shadow-glow-gold",
      )
    case "crumb":
      return cn(
        "attack-crumb pointer-events-none absolute inset-x-3 top-1/2 z-10 h-1 rounded-full bg-sys-cache",
        fx.big && "shadow-glow-purple",
      )
    case "sync":
      return cn(
        "attack-sync pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2 border-sys-cache",
        fx.big && "shadow-glow-purple",
      )
    case "shade":
      return cn(
        "attack-shade pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-foreground/70",
        fx.big && "bg-foreground/80",
      )
    default:
      return "hidden"
  }
}

function EnemyTab({
  enemy,
  locked,
  now,
  hitFlashMs,
  lowSpec,
  dragCloseUsed,
  darkTheme,
  closureEcho,
  executeMarkRatio,
  dimmed,
  onLock,
  onDragClose,
  onDismissPopup,
  onEnemyDragging,
  onExecute,
  onDetonateVirus,
  fx,
}: {
  enemy: EnemyInstance
  locked: boolean
  now: number
  hitFlashMs: number
  lowSpec: boolean
  dragCloseUsed: boolean
  darkTheme: boolean
  closureEcho: boolean
  executeMarkRatio: number | null
  /** 一屏一焦点（ui-pack.md v2 一）：存在锁定目标时非锁定卡整体压暗 */
  dimmed: boolean
  onLock: (uid: string) => void
  onDragClose: (uid: string) => void
  onDismissPopup: (uid: string) => void
  onEnemyDragging: (active: boolean) => void
  onExecute: (uid: string) => void
  onDetonateVirus: (uid: string) => void
  /** 攻击轨迹特效（glitch-feel-pack.md 二）：只喂挂在本卡 uid 上的短命记录 */
  fx: AttackFx[]
}) {
  const ratio = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0
  const flashing = enemy.hitAt > 0 && now - enemy.hitAt < hitFlashMs
  const isBoss = enemy.kind === "boss"
  const isBigBoss = enemy.kind === "bigboss"
  const big = isBoss || isBigBoss
  const hidden = enemy.hiddenUntil > now
  const telegraphing = !enemy.closing && enemy.telegraphUntil > now
  const broken = enemy.brokenUntil > now
  const healing = enemy.regenFlashUntil > now
  const paused = enemy.pausedUntil > now
  const phase = phaseLabel(enemy)

  /* 拖拽关闭标：血量 <30% 的普通敌人（非 Boss / 非召唤物），本层未用尽 */
  const canDragClose =
    !enemy.closing &&
    !hidden &&
    enemy.kind === "normal" &&
    !enemy.minion &&
    enemy.maxHp > 0 &&
    enemy.hp / enemy.maxHp < DRAG_CLOSE_HP_RATIO &&
    !dragCloseUsed
  /* 弹窗 ×：只在窗口期内出现 */
  const popupVisible = !enemy.closing && enemy.popupXUntil > now
  const popupFrac = popupVisible
    ? Math.max(0, Math.min(1, (enemy.popupXUntil - now) / POPUP_X_WINDOW_MS))
    : 0
  /* 可斩标记（ui-pack.md 二）：与引擎秒杀 / 暗黑斩杀判定同条件——普通敌人（非管理员）血量落进斩杀线 */
  const canExecute =
    executeMarkRatio != null &&
    enemy.kind === "normal" &&
    !enemy.admin &&
    !enemy.closing &&
    enemy.maxHp > 0 &&
    enemy.hp <= enemy.maxHp * executeMarkRatio
  /* 弹射轨迹感（ui-pack.md 二）：被弹射链命中 0.5 秒内紫描边（.bounce-flash 定义在 index.css） */
  const bounceFlash = Boolean(enemy.bounceFlashUntil && enemy.bounceFlashUntil > now)
  /* 表现包：命中瞬间青色光束从左下角扫过卡片（.beam-trace 定义在 index.css，低配隐藏） */
  const beamTrace = !lowSpec && enemy.hitAt > 0 && now - enemy.hitAt < 320 && !enemy.closing
  /* 表现包：暴击金色粒子炸开 0.6 秒窗（.crit-burst 定义在 index.css） */
  const critBurst =
    !lowSpec && Boolean(enemy.critFlashUntil && enemy.critFlashUntil > now)
  /* 表现包：血量 ≤20% 的普通敌人挂红骷髅，点击花 3 内存当场关闭（引擎同口径二次校验） */
  const canSkull =
    !enemy.closing &&
    !hidden &&
    enemy.kind === "normal" &&
    !enemy.admin &&
    enemy.maxHp > 0 &&
    ratio <= 0.2
  /* 台词气泡（fun-pack.md 一）：窗口期内浮在卡片上方，纯装饰不挡点击，随 tick 自然过期 */
  const showLine =
    Boolean(enemy.lineText) &&
    Boolean(enemy.lineUntil && enemy.lineUntil > now) &&
    !enemy.closing
  /* 假投降角标（fun-pack.md 一·骗局 A）：🏳️ + 倒计时，到期引擎侧自爆 */
  const showSurrender =
    Boolean(enemy.surrenderUntil && enemy.surrenderUntil > now) && !enemy.closing

  const gesture = useRef({
    x: 0,
    y: 0,
    dragging: false,
    fired: false,
    lockable: false,
  })

  const onPointerDown = (ev: ReactPointerEvent<HTMLElement>) => {
    if (hidden || enemy.closing) return
    gesture.current = {
      x: ev.clientX,
      y: ev.clientY,
      dragging: canDragClose,
      fired: false,
      lockable: true,
    }
    if (canDragClose) {
      ev.currentTarget.setPointerCapture(ev.pointerId)
      onEnemyDragging(true)
    }
  }

  const onPointerMove = (ev: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (!g.dragging || g.fired) return
    const dx = ev.clientX - g.x
    const dy = ev.clientY - g.y
    /* 向上或向左拖出阈值 = 关闭；方向判定优先于点击补刀 */
    if (dy <= -DRAG_CLOSE_THRESHOLD_PX || dx <= -DRAG_CLOSE_THRESHOLD_PX) {
      g.fired = true
      g.lockable = false
      onEnemyDragging(false)
      onDragClose(enemy.uid)
    } else if (Math.hypot(dx, dy) > DRAG_CLOSE_THRESHOLD_PX) {
      /* 大幅移动但方向不对：既不算关闭，也不当成点击补刀 */
      g.lockable = false
    }
  }

  const onPointerUp = () => {
    const g = gesture.current
    if (g.dragging) onEnemyDragging(false)
    if (g.lockable && !g.fired) onLock(enemy.uid)
    gesture.current = { x: 0, y: 0, dragging: false, fired: false, lockable: false }
  }

  const onKeyDown = (ev: ReactKeyboardEvent<HTMLElement>) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault()
      if (!hidden && !enemy.closing) onLock(enemy.uid)
    }
  }

  return (
    <div
      data-enemy-uid={enemy.uid}
      className={cn(
        "relative flex w-44 shrink-0 flex-col gap-1.5 rounded-md border p-2",
        lowSpec ? "" : "transition duration-200",
        big && "w-60",
        enemy.closing
          ? lowSpec
            ? "opacity-0"
            : "scale-90 opacity-0"
          : telegraphing
            ? "border-destructive bg-destructive/10"
            : healing
              ? "border-primary bg-primary/10"
              : locked
                ? "border-primary bg-card shadow-md ring-2 ring-primary shadow-glow-cyan"
                : "border-border bg-card/40",
        !lowSpec && flashing && !enemy.closing && "animate-bounce",
        hidden && "opacity-50",
        // 弹射链命中 0.5 秒：电光紫描边（ui-pack.md 二）
        bounceFlash && "bounce-flash",
        // 一屏一焦点（ui-pack.md v2 一）：非锁定卡压暗，让锁定目标成为唯一焦点（静态、非动效）
        dimmed && "opacity-70",
        // 规范·精英敌人：金色边框 + 金色微光（四系色 gold 系 token）
        enemy.elite &&
          !enemy.closing &&
          !telegraphing &&
          "border-sys-network shadow-glow-gold",
        // 可拖拽关闭的敌人禁掉原生横滑，让手势归我们
        canDragClose && "touch-none",
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* 前摇红圈：留出反应时间 */}
      {telegraphing ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full border-2 border-destructive",
            !lowSpec && "animate-ping",
          )}
        />
      ) : null}

      {/* 表现包：攻击光束轨迹（左下扫入）与暴击金色粒子（纯装饰不挡点击） */}
      {beamTrace ? (
        <span
          aria-hidden
          className="beam-trace pointer-events-none absolute inset-x-0 bottom-1 z-10 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
        />
      ) : null}
      {critBurst ? (
        <span
          aria-hidden
          className="crit-burst pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
        />
      ) : null}

      {/* 攻击轨迹（glitch-feel-pack.md 二）：角色专属命中特效，低配不渲染 */}
      {!lowSpec
        ? fx.map((item) => (
            <span key={item.id} aria-hidden className={attackFxClass(item)} />
          ))
        : null}

      {/* 表现包：≤20% 血的红骷髅斩杀钮（左上角，避开弹窗 × 的右上角），点击 3 内存当场关闭 */}
      {canSkull ? (
        <button
          type="button"
          aria-label="斩杀"
          title="斩杀：花 3 内存当场关闭"
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => {
            ev.stopPropagation()
            onExecute(enemy.uid)
          }}
          className={cn(
            "absolute -top-2 -left-2 z-20 grid h-6 w-6 place-items-center touch-manipulation rounded-full border border-destructive bg-background text-destructive shadow-glow-red transition active:scale-90 focus-visible:outline-none focus-visible:shadow-focus",
            !lowSpec && "animate-pulse-soft",
          )}
        >
          <Skull className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {/* 弹窗 ×：窗口期内右上角出现，点击直接关掉弹窗本体 */}
      {popupVisible ? (
        <button
          type="button"
          aria-label="关闭弹窗"
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => {
            ev.stopPropagation()
            onDismissPopup(enemy.uid)
          }}
          className={cn(
            "absolute -top-2 -right-2 z-10 grid h-7 w-7 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition hover:text-destructive focus-visible:outline-none focus-visible:shadow-focus",
          )}
        >
          <X className="h-4 w-4" />
          {/* 倒计时微动效：条越短越接近消失；低配下静止不缩放 */}
          <span
            aria-hidden
            className="absolute bottom-0.5 left-1 h-0.5 rounded-full bg-destructive"
            style={{ width: `${Math.round(popupFrac * 16)}px` }}
          />
        </button>
      ) : null}

      {/* 台词气泡（fun-pack.md 一）：taunt=警报红描边，whine=弱化灰；浮在卡片上缘的 padding 里（同拖拽关闭标用法） */}
      {showLine && enemy.lineText ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-6 left-1 z-20 max-w-full truncate rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold shadow-md",
            enemy.lineKind === "whine"
              ? "border-border bg-muted text-muted-foreground"
              : "border-destructive/70 bg-background/95 text-destructive",
          )}
        >
          {enemy.lineText}
        </span>
      ) : null}

      {/* 假投降角标（fun-pack.md 一·骗局 A）：🏳️ + 剩余秒数，到期未杀引擎自爆 */}
      {showSurrender && enemy.surrenderUntil ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-3 left-1 z-20 inline-flex items-center gap-1 rounded-sm border border-border bg-background/95 px-1.5 py-0.5 font-mono text-xs font-bold text-muted-foreground tabular-nums shadow-md"
        >
          🏳️ {Math.ceil((enemy.surrenderUntil - now) / 1000)}s
        </span>
      ) : null}

      {/* S3 闭包残像：主动技后 1.5 秒内在目标卡挂延时残像框（低配静止不闪） */}
      {closureEcho && !enemy.closing ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-md border-2 border-dashed border-sys-style",
            !lowSpec && "animate-pulse-soft",
          )}
        >
          <span className="absolute -top-2.5 left-2 rounded-sm bg-background px-1 font-mono text-xs font-bold text-sys-style">
            闭包回响
          </span>
        </span>
      ) : null}

      {/* C7 暗黑模式剪影：非锁定目标的正文（名字 / 血条 / 数值）大幅压暗成剪影；
          弹窗 ×、拖拽关闭标、验证码交互都在容器外，不受剪影影响仍可点 */}
      <div className={cn("flex flex-col gap-1.5", darkTheme && !locked && !enemy.closing && "opacity-15")}>
      <div
        role="button"
        tabIndex={hidden || enemy.closing ? -1 : 0}
        aria-pressed={locked}
        onKeyDown={onKeyDown}
        className="flex flex-col gap-1.5 text-left focus-visible:outline-none focus-visible:shadow-focus"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 font-mono text-xs",
              big
                ? "bg-destructive/15 text-destructive"
                : locked
                  ? "bg-primary/15 text-primary"
                  : "bg-foreground/10 text-muted-foreground",
            )}
          >
            {enemy.minion
              ? "召唤物"
              : isBigBoss
                ? "大 Boss"
                : isBoss
                  ? "小 Boss"
                  : "标签"}
          </span>
          {enemy.elite ? (
            <span className="rounded-sm border border-sys-network/60 bg-sys-network/10 px-1.5 py-0.5 font-mono text-xs font-bold text-sys-network">
              精英
            </span>
          ) : null}
          {enemy.twinRaged ? (
            <span
              title="双面广告的另一半已经倒下 · 它继承了怨气，攻击 +50%"
              className="rounded-sm border border-destructive/60 bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-bold text-destructive"
            >
              狂
            </span>
          ) : null}
          {enemy.shield > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-foreground/10 px-1.5 py-0.5 font-mono text-xs text-foreground">
              <Shield className="h-3 w-3" />
              {enemy.shield}
            </span>
          ) : null}
          {broken ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary">
              <Sparkles className="h-3 w-3" />
              破防
            </span>
          ) : null}
          {healing ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary">
              <HeartPulse className="h-3 w-3" />
              回血中
            </span>
          ) : null}
          {hidden ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              <EyeOff className="h-3 w-3" />
              隐身
            </span>
          ) : null}
          {canExecute ? (
            <span
              title="血量已进入斩杀线，下一次命中直接带走"
              className={cn(
                "inline-flex items-center gap-1 rounded-sm border border-destructive/60 bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-bold text-destructive",
                !lowSpec && "motion-safe:animate-pulse-soft",
              )}
            >
              ⚔ 可斩
            </span>
          ) : null}
          <X
            aria-hidden
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0",
              enemy.closing ? "text-destructive" : "text-muted-foreground",
            )}
          />
        </span>

        <span className="min-w-0">
          {/* 趣味包 v4：影子/管理员徽标紧贴名字，chip 风格对齐同文件精英徽标 */}
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate font-display text-sm font-bold">
              {enemy.displayName}
            </span>
            {enemy.shadow ? (
              <span
                title="这是你（或挑战者）上一局的化身，带着原来的打法来的"
                className="shrink-0 rounded-sm border border-sys-style/60 bg-sys-style/10 px-1 py-0.5 font-mono text-xs font-bold text-sys-style"
              >
                影子
              </span>
            ) : null}
            {enemy.admin ? (
              <span
                title="隐藏 Boss：挨到一下就会致命"
                className="shrink-0 rounded-sm border border-destructive/60 bg-destructive/10 px-1 py-0.5 font-mono text-xs font-bold text-destructive"
              >
                管理员
              </span>
            ) : null}
          </span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {phase ?? enemy.trait}
          </span>
          {enemy.tags.length > 0 && enemy.kind !== "boss" ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {(() => {
                /* 深化包：病毒与变异芯片优先占位（可点与反噬状态不许被裁掉） */
                const shown = enemy.tags.slice(0, 3)
                const prioritized = enemy.tags.filter(
                  (tag) => tag === "virus" || (enemy.mutatedTagIds ?? []).includes(tag),
                )
                for (const tag of prioritized) {
                  if (shown.includes(tag)) continue
                  const victim = shown.findIndex(
                    (item) =>
                      item !== "virus" &&
                      !(enemy.mutatedTagIds ?? []).includes(item),
                  )
                  if (victim >= 0) shown.splice(victim, 1, tag)
                }
                return shown.map((tag) => {
                const name = ENEMY_TAG_DEFS[tag as EnemyTagId]?.name ?? tag
                /* 深化包·病毒芯片：唯一可点的标签芯片（primary 描边） */
                if (tag === "virus") {
                  return (
                    <button
                      key={tag}
                      type="button"
                      title="引爆：消耗 2 内存 · 携带者吃 40 点伤害，邻居的标签会反噬它自己"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDetonateVirus(enemy.uid)
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      className={cn(
                        "touch-manipulation rounded-sm border border-primary bg-primary/10 px-1 py-0.5 font-mono text-[10px] font-bold text-primary transition active:scale-95 focus-visible:outline-none focus-visible:shadow-focus",
                        !lowSpec && "motion-safe:animate-pulse-soft",
                      )}
                    >
                      🦠{name}
                    </button>
                  )
                }
                /* 深化包·变异芯片：绿描边 +「变」角标，title 写明反转效果 */
                if ((enemy.mutatedTagIds ?? []).includes(tag)) {
                  return (
                    <span
                      key={tag}
                      title={
                        TAG_MUTATION_HINTS[tag as EnemyTagId] ?? "标签已被病毒变异"
                      }
                      className="rounded-sm border border-sys-cache/70 bg-sys-cache/10 px-1 py-0.5 font-mono text-[10px] text-sys-cache"
                    >
                      {name}
                      <i className="ml-0.5 font-bold not-italic">变</i>
                    </span>
                  )
                }
                return (
                  <span
                    key={tag}
                    className="rounded-sm border border-border bg-foreground/5 px-1 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {name}
                  </span>
                )
                })
              })()}
            </span>
          ) : null}
        </span>

        <span className="block h-1.5 overflow-hidden rounded-full bg-border">
          <span
            className={cn(
              // 规范·敌人血条：填充统一警报红
              "block h-full rounded-full bg-destructive transition-[width] duration-150",
            )}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </span>

        <span className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>
            {enemy.hp} / {enemy.maxHp}
          </span>
          {(enemy.stolenMem ?? 0) > 0 ? (
            <span
              title="这只泄漏从你身上偷走的内存点数 · 每偷 1 点攻击 +5%，偷满 6 点攻击翻倍"
              className="font-bold text-sys-network tabular-nums"
            >
              偷 {enemy.stolenMem}
            </span>
          ) : null}
          <span>攻 {enemy.attack}</span>
        </span>
      </div>

      {/* 行为状态：补盾 / 停手 / 免疫普攻 */}
      <span className="flex flex-wrap items-center gap-1">
        {enemy.twin === "back" &&
        enemy.twinBurstNextAt != null &&
        enemy.twinBurstNextAt > now &&
        !enemy.closing ? (
          <span
            title={
              enemy.twinHitThisCycle
                ? "背面正在读条 · 这周期你打过它，到点会被打断"
                : "背面读条中 · 到点隔着标签页砸你血条，去那页打它一下可打断"
            }
            className={cn(
              "rounded-sm border border-destructive/60 bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-bold text-destructive tabular-nums",
              !lowSpec && enemy.twinBurstNextAt - now < 3000 && "animate-pulse-soft",
            )}
          >
            🪟 {Math.ceil((enemy.twinBurstNextAt - now) / 1000)}s
          </span>
        ) : null}
        {enemy.riftDeadline > now && !enemy.closing ? (
          <span
            className={cn(
              "rounded-sm border border-destructive/60 bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-bold text-destructive tabular-nums",
              !lowSpec && enemy.riftDeadline - now < 5000 && "animate-pulse-soft",
            )}
          >
            ⏳ {Math.ceil((enemy.riftDeadline - now) / 1000)}s
          </span>
        ) : null}
        {paused ? (
          <span className="rounded-sm border border-dashed border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            停手补状态
          </span>
        ) : null}
        {enemy.shieldRegenEveryMs > 0 && !enemy.closing ? (
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            每 {(enemy.shieldRegenEveryMs / 1000).toFixed(0)}s +{enemy.shieldRegenAmount} 盾
          </span>
        ) : null}
        {enemy.guarded && !broken && !enemy.closing ? (
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            未破防只吃 20%
          </span>
        ) : null}
        {enemy.telegraphMs > 0 && !enemy.closing ? (
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            前摇 {(enemy.telegraphMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </span>
      </div>

      {/* 拖拽关闭标：残血普通敌人提示可向上 / 向左拖出（暗黑模式下仍可见可拖） */}
      {canDragClose ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-primary/60 bg-background/90 px-1.5 py-0.5 font-mono text-xs font-bold text-primary",
            !lowSpec && "animate-pulse-soft",
          )}
        >
          ↑ 拖拽关闭
        </span>
      ) : null}

      {/* 锁定目标头顶大血量（ui-pack.md v2 一）：大号读数 + 迷你血条，右浮避开左侧台词气泡 */}
      {locked && !enemy.closing ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-8 right-1 z-30 flex items-center gap-1.5 rounded-md border border-primary/60 bg-background/95 px-2 py-0.5 shadow-glow-cyan"
        >
          <span className="font-mono text-lg font-bold tabular-nums text-primary">
            {enemy.hp}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            / {enemy.maxHp}
          </span>
          <span className="block h-1 w-10 overflow-hidden rounded-full bg-border">
            <span
              className="block h-full rounded-full bg-destructive"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </span>
        </span>
      ) : null}

      {locked && !enemy.closing ? (
        <span
          aria-hidden
          className="absolute -bottom-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-primary"
        />
      ) : null}
    </div>
  )
}

export function TabEnemyStrip({
  enemies,
  lockedUid,
  now,
  hitFlashMs,
  pops,
  shardDots,
  dragCloseUsed,
  lowSpec = false,
  darkTheme = false,
  miniShields = [],
  closureEchoUid = null,
  adaptions = { bounce: false, crit: false, skill: false },
  executeMarkRatio = null,
  attackFx = [],
  onLock,
  onDragClose,
  onDismissPopup,
  onPickShard,
  onEnemyDragging,
  onExecute,
  onDetonateVirus,
}: TabEnemyStripProps) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-1 -top-1 bottom-0 rounded-lg bg-gradient-to-b from-primary/5 to-transparent"
      />

      {/* 敌人适应（fun-pack v2）：敌人集体适应，徽标挂在整条共用的头部行，
          不与单卡的台词气泡 / 🏳️ 角标共用绝对定位区 */}
      {adaptions.bounce || adaptions.crit || adaptions.skill ? (
        <div className="relative flex flex-wrap items-center gap-1.5 pb-1">
          <span className="font-mono text-xs text-muted-foreground">
            敌人适应了：
          </span>
          {ADAPTION_LABELS.filter((item) => adaptions[item.key]).map((item) => (
            <span
              key={item.key}
              title={item.hint}
              className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {item.name}
            </span>
          ))}
        </div>
      ) : null}

      {/* pt-8 与底部 pb-8 同理：给卡片上缘的台词气泡 / 投降角标留出 padding，不被横向滚动层裁切 */}
      <div className="relative flex items-start gap-2 overflow-x-auto pb-8 pt-8">
        {enemies.map((enemy) => (
          <EnemyTab
            key={enemy.uid}
            enemy={enemy}
            locked={enemy.uid === lockedUid}
            now={now}
            hitFlashMs={hitFlashMs}
            lowSpec={lowSpec}
            dragCloseUsed={dragCloseUsed}
            darkTheme={darkTheme}
            closureEcho={enemy.uid === closureEchoUid}
            executeMarkRatio={executeMarkRatio}
            dimmed={lockedUid !== null && enemy.uid !== lockedUid}
            fx={attackFx.filter((item) => item.uid === enemy.uid)}
            onLock={onLock}
            onDragClose={onDragClose}
            onDismissPopup={onDismissPopup}
            onEnemyDragging={onEnemyDragging}
            onExecute={onExecute}
            onDetonateVirus={onDetonateVirus}
          />
        ))}
        {enemies.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 font-mono text-xs text-muted-foreground">
            标签条空了
          </p>
        ) : null}
      </div>

      {/* C5 分裂小护盾：青色光点从下缘飞向目标标签（按目标在标签条中的位置插值）。
          低配模式下引擎 300ms 直接结算，列表几乎瞬空，这里也省掉动画层 */}
      {!lowSpec && miniShields.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {miniShields.map((mini) => {
            const index = enemies.findIndex((enemy) => enemy.uid === mini.targetUid)
            const x =
              index >= 0 && enemies.length > 0
                ? ((index + 0.5) / enemies.length) * 100
                : 50
            const y = 90 - mini.progress * 70
            return (
              <span
                key={mini.id}
                aria-hidden
                className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-sys-script shadow-glow-cyan"
                style={{ left: `${x}%`, top: `${y}%` }}
              />
            )
          })}
        </div>
      ) : null}

      {/* 碎片点：金色小圆点，点击全额入账（脱离滚动层，单独一层避免被裁切） */}
      {shardDots.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-2 h-8"
        >
          {shardDots.map((dot) => (
            <button
              key={dot.id}
              type="button"
              aria-label={`拾取 ${dot.amount} 碎片`}
              onClick={() => onPickShard(dot.id)}
              className={cn(
                "pointer-events-auto absolute bottom-0 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border-2 border-sys-network bg-sys-network/20 font-mono text-[10px] font-bold text-sys-network shadow-glow-gold transition hover:scale-110 focus-visible:outline-none focus-visible:shadow-focus",
                // 假碎片（骗局 B）：同款外观，只把脉冲换成更弱的透明度闪烁（低配下引擎不生成假点）
                dot.fake ? "fake-shard" : !lowSpec && "animate-pulse-soft",
              )}
              style={{ left: `${dot.x}%` }}
            >
              {dot.amount}
            </button>
          ))}
        </div>
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {lowSpec
          ? null
          : pops.map((pop) => (
              <span
                key={pop.id}
                className={cn(
                  "absolute top-6 animate-in fade-in font-mono text-xl font-bold duration-500",
                  popMotion(pop.kind),
                  popTone(pop),
                )}
                style={{ left: `${pop.x}%` }}
              >
                {popText(pop)}
              </span>
            ))}
      </div>
    </div>
  )
}
