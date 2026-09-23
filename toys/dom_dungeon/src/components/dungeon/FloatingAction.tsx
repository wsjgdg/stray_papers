import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  ArrowLeftRight,
  Bookmark,
  Cable,
  Database,
  Eye,
  MousePointerClick,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { ScreenJamWindow } from "@/components/dungeon/ScreenJamWindow"
import type { SkinStyle } from "@/lib/dungeonData"
import {
  anchorAtPoint,
  anchorRenderBox,
  HUD_ALL_ANCHORS,
  type Anchor,
  type DockConfig,
  type DockModule,
  type HudPerkId,
  type ScreenJam,
} from "@/pages/Dungeon/useDungeon"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ *
 * HUD 构筑包（hud-forge-pack.md）：圆形按钮移出 SkillBar，升级为页面级
 * 可拖拽构筑资产。蓄力 / 冷却扇形 / 就绪脉冲逻辑从 SkillBar 完整迁移，
 * 键盘空格 / 箭头等价路径不经此处、保持不动。
 * ------------------------------------------------------------------ */

/** 拖拽守卫：位移 >12px 才转拖拽（轻按 / 长按蓄力零变化） */
export const DOCK_GUARD_PX = 12

/** 长按蓄力：外圈进度环（与冷却遮罩同类 conic，反色用主色实填，跟随 ds token） */
function chargeRing(ratio: number): string {
  const deg = Math.round(Math.max(0, Math.min(1, ratio)) * 360)
  return `conic-gradient(from -90deg, hsl(var(--primary) / 0.9) ${deg}deg, transparent 0deg)`
}

/** 规范·技能按钮：72×72 圆形，冷却为半透明黑扇形遮罩 */
function cooldownMask(ratio: number): string {
  const deg = Math.round(Math.max(0, Math.min(1, ratio)) * 360)
  return `conic-gradient(from -90deg, rgba(10,14,20,0.72) ${deg}deg, transparent 0deg)`
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1)
}

export const PERK_BADGE: Record<HudPerkId, { icon: LucideIcon; label: string }> =
  {
    power: { icon: Zap, label: "供电短路 · 主动技内存费 -20%" },
    regen: { icon: Database, label: "缓存复用 · 每 6 秒 +1 内存" },
    stealth: { icon: Eye, label: "隐蔽 · 敌人前摇 ×1.15" },
    coord: { icon: ArrowLeftRight, label: "镜像联动 · 闪避冷却 -10%" },
    wire: { icon: Cable, label: "有线驱动 · 主动技伤害 +8%" },
  }

/** 每个模块可能挂出的收益角徽标 */
export const MODULE_PERKS: Record<DockModule, HudPerkId[]> = {
  skill: ["power", "wire"],
  dodge: ["coord"],
  relic: ["regen", "stealth"],
}

const MODULE_ICON: Record<DockModule, LucideIcon> = {
  skill: MousePointerClick,
  dodge: Wind,
  relic: Bookmark,
}

/** 模块激活收益徽标（primary 描边小圆章） */
export function PerkBadges({
  module,
  perkIds,
}: {
  module: DockModule
  perkIds: HudPerkId[]
}) {
  const shown = MODULE_PERKS[module].filter((id) => perkIds.includes(id))
  if (shown.length === 0) return null
  return (
    <span className="pointer-events-none absolute -top-2.5 -right-2.5 z-10 flex flex-col gap-1">
      {shown.map((id) => {
        const badge = PERK_BADGE[id]
        const Icon = badge.icon
        return (
          <span
            key={id}
            title={badge.label}
            className="grid h-5 w-5 place-items-center rounded-full border border-primary bg-card text-primary shadow-glow-cyan"
          >
            <Icon aria-hidden className="h-3 w-3" />
          </span>
        )
      })}
    </span>
  )
}

/** 拖拽中：六锚点画 primary token 空心环，占位锚点显示占用者模块图标 */
export function DockRings({
  dock,
  dragging,
  pointer,
}: {
  dock: DockConfig
  dragging: boolean
  pointer: { x: number; y: number } | null
}) {
  if (!dragging) return null
  const snap = pointer ? anchorAtPoint(pointer.x, pointer.y) : null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0" style={{ zIndex: 44 }}>
      {HUD_ALL_ANCHORS.map((a) => {
        const box = anchorRenderBox(a)
        const occupant = (
          Object.keys(dock) as DockModule[]
        ).find((module) => dock[module] === a)
        const Icon = occupant ? MODULE_ICON[occupant] : null
        return (
          <span
            key={a}
            className={cn(
              "absolute grid size-[72px] place-items-center rounded-full border-2 border-dashed",
              snap === a ? "border-primary bg-primary/10" : "border-primary/40",
            )}
            style={{ left: box.left, top: box.top }}
          >
            {Icon ? (
              <span className="grid h-6 w-6 place-items-center rounded-full border border-border bg-card text-muted-foreground">
                <Icon aria-hidden className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

/** 闪避钮 / 词条栏浮卡共用的锚点拖拽手势：>12px 守卫、pointer capture、
 *  全事件 stopPropagation（糊屏窗同款守卫，防误触滑动闪避）、松手 36px 吸附 */
export function useAnchorDrag(onDock: (anchor: Anchor | null) => void) {
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  /* 拖过就吞掉松手后的 click（闪避钮不能被拖拽误触成一次闪避） */
  const draggedRef = useRef(false)
  const onDockRef = useRef(onDock)
  onDockRef.current = onDock

  return {
    dragPos,
    draggedRef,
    handlers: {
      onPointerDown: (ev: ReactPointerEvent) => {
        draggedRef.current = false
        startRef.current = { x: ev.clientX, y: ev.clientY }
      },
      onPointerMove: (ev: ReactPointerEvent) => {
        if (!startRef.current) return
        ev.stopPropagation()
        if (dragPos) {
          setDragPos({ x: ev.clientX, y: ev.clientY })
          return
        }
        if (
          Math.hypot(ev.clientX - startRef.current.x, ev.clientY - startRef.current.y) >
          DOCK_GUARD_PX
        ) {
          draggedRef.current = true
          ev.currentTarget.setPointerCapture?.(ev.pointerId)
          setDragPos({ x: ev.clientX, y: ev.clientY })
        }
      },
      onPointerUp: (ev: ReactPointerEvent) => {
        if (startRef.current && dragPos) {
          ev.stopPropagation()
          setDragPos(null)
          startRef.current = null
          onDockRef.current(anchorAtPoint(ev.clientX, ev.clientY))
          return
        }
        startRef.current = null
      },
      onPointerCancel: () => {
        startRef.current = null
        setDragPos(null)
      },
    },
  }
}

/** default 槽位的实测占位（SkillBar 里的等尺寸锚点），实测不到时按拇指区兜底 */
function useHomeBox(module: DockModule): { left: number; top: number } | null {
  const [homeBox, setHomeBox] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    const sel =
      module === "skill" ? "[data-skill-home]" : "[data-dodge-home]"
    const measure = () => {
      const el = document.querySelector(sel)
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width > 0) setHomeBox({ left: rect.left, top: rect.top })
    }
    measure()
    const raf = window.requestAnimationFrame(measure)
    window.addEventListener("resize", measure)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener("resize", measure)
    }
  }, [module])
  return homeBox
}

export type FloatingActionProps = {
  /** 本组件渲染的模块（圆形钮只有技 / 闪两种；relic 浮卡走 RelicDockCard） */
  module: Extract<DockModule, "skill" | "dodge">
  dock: DockConfig
  lowSpec: boolean
  /** drift 故障：钮体 ±14px 慢漂移（原 SkillBar 列级视觉跟迁到钮上） */
  drift?: boolean
  /** 当前激活的构筑收益（模块角徽标） */
  perkIds: HudPerkId[]
  onDock: (module: DockModule, anchor: Anchor) => void
  skinStyle: SkinStyle
  /* ---- 主动技钮（module="skill"）---- */
  activeName?: string
  blockedByCurse?: boolean
  activeReady: boolean
  activeCooldownLeft: number
  activeCooldownRatio: number
  skillCharging: boolean
  chargeRatio: number
  chargeFull: boolean
  /** 按住划出 >12px 后的拖拽位（引擎 chargeMove 维护，落敌人卡 = 故障打击） */
  skillDragPos?: { x: number; y: number } | null
  onActiveStart?: (x: number, y: number) => void
  onActiveMove?: (x: number, y: number) => void
  onActiveEnd?: (x?: number, y?: number) => void
  /* ---- 闪避钮（module="dodge"）---- */
  dodgeReady?: boolean
  dodgeCooldownLeft?: number
  dodgeCooldownRatio?: number
  onDodge?: () => void
  /* ---- 糊屏弹窗（由主动技钮承接「实测 rect 盖钮」逻辑）---- */
  screenJam?: ScreenJam | null
  screenJamRatio?: number
  onJamFling?: (uid: string | null) => void
  onJamTapX?: () => void
  onJamClaim?: () => void
}

export function FloatingAction({
  module,
  dock,
  lowSpec,
  drift = false,
  perkIds,
  onDock,
  skinStyle,
  activeName = "",
  blockedByCurse = false,
  activeReady,
  activeCooldownLeft,
  activeCooldownRatio,
  skillCharging,
  chargeRatio,
  chargeFull,
  skillDragPos = null,
  onActiveStart,
  onActiveMove,
  onActiveEnd,
  dodgeReady = false,
  dodgeCooldownLeft = 0,
  dodgeCooldownRatio = 0,
  onDodge,
  screenJam = null,
  screenJamRatio = 1,
  onJamFling,
  onJamTapX,
  onJamClaim,
}: FloatingActionProps) {
  const isSkill = module === "skill"
  const slot = dock[module]
  const homeBox = useHomeBox(module)
  const skillUsable = activeReady && !blockedByCurse

  /* 闪避钮走本地守卫手势；主动技钮的拖拽由引擎 chargeRef 统一维护 */
  const anchorDrag = useAnchorDrag((anchor) => {
    if (anchor) onDock(module, anchor)
  })
  const dragPos = isSkill ? skillDragPos : anchorDrag.dragPos
  const dragging = dragPos !== null

  const anchorBox = slot !== "default" ? anchorRenderBox(slot) : null
  const fallback = {
    left: isSkill
      ? window.innerWidth - 88
      : 12,
    top: window.innerHeight - 152,
  }
  const baseBox = anchorBox ?? homeBox ?? fallback

  const rootStyle: CSSProperties = {
    left: dragging ? dragPos.x : baseBox.left,
    top: dragging ? dragPos.y : baseBox.top,
    zIndex: 45,
  }

  /* 糊屏弹窗（popup-jam-pack.md 二）：实测本钮 rect，换算 fixed 右下锚点盖住它。
     停靠位 / default 实测位 / 窗体出现时刻任一变化都重测（原 SkillBar 逻辑跟迁） */
  const activeBtnRef = useRef<HTMLButtonElement>(null)
  const [jamAnchor, setJamAnchor] = useState<{
    right: number
    bottom: number
  } | null>(null)
  useLayoutEffect(() => {
    if (!isSkill || !screenJam) {
      setJamAnchor(null)
      return
    }
    const rect = activeBtnRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setJamAnchor({
      right: window.innerWidth - rect.right + 12,
      bottom: window.innerHeight - rect.bottom + 14,
    })
  }, [isSkill, screenJam?.id, baseBox.left, baseBox.top])

  return (
    <div
      className={cn(
        "fixed touch-none",
        /* 停靠移动 / 回弹 280ms；拖拽中跟手不补间；低配与减弱动态直接跳变 */
        !dragging &&
          !lowSpec &&
          "motion-safe:transition-[left,top] motion-safe:duration-[280ms]",
        dragging && "-translate-x-1/2 -translate-y-1/2",
        drift && !dragging && !lowSpec && "skill-drift",
      )}
      style={rootStyle}
      {...(isSkill ? {} : anchorDrag.handlers)}
    >
      <DockRings dock={dock} dragging={dragging} pointer={dragPos} />
      <PerkBadges module={module} perkIds={perkIds} />

      {isSkill ? (
        <button
          type="button"
          ref={activeBtnRef}
          data-skill-button
          disabled={!skillUsable}
          aria-label={`主动技 ${activeName} ${blockedByCurse ? "断网中不可用" : skillUsable ? "就绪，可长按蓄力或拖拽构筑" : `冷却 ${seconds(activeCooldownLeft)} 秒`}`}
          onPointerDown={(ev) => {
            if (!skillUsable) return
            ev.stopPropagation()
            ev.currentTarget.setPointerCapture?.(ev.pointerId)
            onActiveStart?.(ev.clientX, ev.clientY)
          }}
          onPointerMove={(ev) => {
            /* 按住 / 蓄力 / 已在拖，一律转发：达 12px 阈值由引擎转构筑拖拽 */
            if (dragging) ev.stopPropagation()
            onActiveMove?.(ev.clientX, ev.clientY)
          }}
          onPointerUp={(ev) => {
            if (dragging) ev.stopPropagation()
            onActiveEnd?.(ev.clientX, ev.clientY)
          }}
          onPointerCancel={() => onActiveEnd?.()}
          className={cn(
            "relative grid size-[72px] shrink-0 touch-none place-items-center overflow-hidden rounded-full border-2 transition active:scale-90 focus-visible:outline-none focus-visible:shadow-focus",
            skillUsable
              ? "border-sys-script bg-card text-sys-script shadow-glow-cyan hover:brightness-110"
              : "border-textDisabled bg-card text-textDisabled",
            skillCharging && "motion-safe:animate-pulse-soft",
          )}
        >
          <span className="flex flex-col items-center gap-0.5">
            <MousePointerClick className="h-5 w-5" />
            <span className="font-mono text-xs">
              {blockedByCurse
                ? "断网"
                : skillCharging
                  ? `${Math.round(chargeRatio * 200)}%`
                  : skillUsable
                    ? "就绪"
                    : `${seconds(activeCooldownLeft)}s`}
            </span>
          </span>

          {/* 蓄力进度环（松手前实时填充主色 conic） */}
          {skillCharging ? (
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-1 rounded-full"
              style={{ background: chargeRing(chargeRatio) }}
            />
          ) : null}

          {/* 蓄满提示 */}
          {skillCharging && chargeFull ? (
            <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-primary px-1.5 py-0.5 font-mono text-xs font-bold text-primary-foreground">
              蓄力完成！
            </span>
          ) : null}

          {/* 就绪：外发光脉冲 */}
          {skillUsable && !skillCharging ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full shadow-glow-cyan motion-safe:animate-pulse-soft"
            />
          ) : null}

          {/* 冷却：黑扇形遮罩 */}
          {!activeReady ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: cooldownMask(activeCooldownRatio) }}
            />
          ) : null}
        </button>
      ) : (
        <button
          type="button"
          data-dodge-button
          onClick={() => {
            /* 拖拽后吞掉 click：拖拽 ≠ 闪避 */
            if (anchorDrag.draggedRef.current) {
              anchorDrag.draggedRef.current = false
              return
            }
            onDodge?.()
          }}
          disabled={!dodgeReady}
          aria-label={`闪避 ${dodgeReady ? "就绪" : `冷却 ${seconds(dodgeCooldownLeft)} 秒`} · 长按可拖拽构筑`}
          className={cn(
            "relative grid size-[72px] shrink-0 touch-none place-items-center overflow-hidden rounded-full border transition active:scale-90 focus-visible:outline-none focus-visible:shadow-focus",
            dodgeReady
              ? "border-border bg-transparent hover:border-primary/60"
              : "border-border bg-foreground/5 text-muted-foreground",
          )}
        >
          <span className="flex flex-col items-center gap-0.5">
            <Wind className={cn("h-5 w-5", dodgeReady ? skinStyle.accentText : "")} />
            <span className="font-mono text-xs">
              {dodgeReady ? "闪避" : `${seconds(dodgeCooldownLeft)}s`}
            </span>
          </span>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: dodgeReady ? "none" : cooldownMask(dodgeCooldownRatio),
            }}
          />
        </button>
      )}

      {/* 糊屏弹窗（由本钮承接「盖住主动技按钮」）：拖甩 / 点 × / 8 秒爆炸 */}
      {isSkill && screenJam && jamAnchor && onJamFling && onJamTapX ? (
        <ScreenJamWindow
          key={screenJam.id}
          jam={screenJam}
          ratio={screenJamRatio}
          anchor={jamAnchor}
          lowSpec={lowSpec}
          onFling={onJamFling}
          onTapX={onJamTapX}
          onClaim={onJamClaim}
        />
      ) : null}
    </div>
  )
}
