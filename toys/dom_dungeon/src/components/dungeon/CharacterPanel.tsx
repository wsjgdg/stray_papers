import { memo } from "react"
import { Eye, EyeOff, LifeBuoy, Shield, Skull, Zap } from "lucide-react"

import type { DungeonCharacter, SkinStyle } from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type CharacterPanelProps = {
  character: DungeonCharacter
  /** 该角色当前外观的配色（进局时读一次，跨页一致） */
  skinStyle: SkinStyle
  playerHp: number
  playerMaxHp: number
  hpRatio: number
  lowHp: boolean
  shield: number
  shieldMax: number
  combo: number
  /** 手动点击连击（独立于事件连击，每层 +5% 攻速） */
  clickCombo: number
  clickComboMax: number
  clickComboActive: boolean
  clickComboFull: boolean
  /** 最近一次滑动闪避方向（残影），0 = 非滑动 */
  dodgeDir: number
  /** 低配模式：关掉残影与脉冲，只留数值反馈 */
  lowSpec: boolean
  dodgeActive: boolean
  hasteActive: boolean
  /** C2 z-index 残影诱饵生效中：闪避方向继续画半透明残影（relic-redesign.md B·C2） */
  decoyActive: boolean
  /** 标签刺客被动：闪避后攻速 +25% 还挂着 */
  dodgeHaste: boolean
  /** 脚本战士主动技：双重打击还挂着 */
  doubleStrike: boolean
  /** 脚本战士被动：监听层数 */
  listenStacks: number
  listenStacksMax: number
  /** 工作僧侣被动「后台同步」：当前计数 */
  syncStacks: number
  syncStacksMax: number
  /** 工作僧侣主动技「多线程执行」还挂着 */
  multithreadActive: boolean
  /** 内核之影被动「根权限」正生效（低血攻速 +30%）：徽标高亮 */
  rootActive: boolean
  /** 内核之影主动技「任务管理器」冻结正生效 */
  freezeActive: boolean
  deathWards: number
  /** 祭坛的诅咒正压着这一层：敌人攻击 +30% */
  cursed: boolean
  /** 盲战（fun-pack v2）：开 = 本面板数字遮罩，攻击 +30%（引擎侧生效） */
  blindCombat: boolean
  /** 手动触发的无敌正生效（ui-pack.md 二）：面板外圈金色光环 */
  immuneActive: boolean
  /** 法师能量脉冲（glitch-feel-pack.md 二）：每次出手命中的重挂载键，null = 无 */
  pulseFxId?: number | null
  /** 脉冲是否暴击/斩杀的大号版 */
  pulseBig?: boolean
  onToggleBlind: () => void
}

/** perf-experience-pack.md C：props 全为原始值或稳定引用（character/skinStyle 只在进局
 *  与成长时换引用、onToggleBlind 是 [] 依赖的 useCallback）——hp/盾/连击只在事件时才变，
 *  memo 让无变化的战斗 tick 不再重渲染整块面板 */
export const CharacterPanel = memo(function CharacterPanel({
  character,
  skinStyle,
  playerHp,
  playerMaxHp,
  hpRatio,
  lowHp,
  shield,
  shieldMax,
  combo,
  clickCombo,
  clickComboMax,
  clickComboActive,
  clickComboFull,
  dodgeDir,
  lowSpec,
  dodgeActive,
  hasteActive,
  decoyActive,
  dodgeHaste,
  doubleStrike,
  listenStacks,
  listenStacksMax,
  syncStacks,
  syncStacksMax,
  multithreadActive,
  rootActive,
  freezeActive,
  deathWards,
  cursed,
  blindCombat,
  immuneActive,
  pulseFxId = null,
  pulseBig = false,
  onToggleBlind,
}: CharacterPanelProps) {
  const shieldRatio =
    shieldMax > 0 ? Math.min(100, Math.round((shield / shieldMax) * 100)) : 0
  const isMage = character.id === "cache-mage"
  const isWarrior = character.id === "script-warrior"
  const isCookie = character.id === "cookie-thief"
  const isMonk = character.id === "worker-monk"
  const isShade = character.id === "kernel-shade"

  return (
    <section
      className={cn(
        "flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-md sm:p-4",
        // 无敌光环（ui-pack.md 二）：金色 ring + 微光，低配不呼吸只留静态光环
        immuneActive &&
          cn(
            "border-sys-network/60 ring-2 ring-sys-network/70 shadow-glow-gold",
            !lowSpec && "motion-safe:animate-pulse-soft",
          ),
      )}
    >
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          {/* 滑动闪避残影：低配不显示，在滑动闪避的无敌窗口里出现；
              C2 诱饵生效期间（闪避成功后 2 秒）残影继续留在闪避方向上 */}
          {(dodgeActive || decoyActive) && dodgeDir !== 0 && !lowSpec ? (
            <span
              aria-hidden
              className={cn(
                "absolute top-0 grid h-10 w-10 place-items-center rounded-md border font-mono text-xs font-bold blur-[1px]",
                skinStyle.chip,
                decoyActive && !dodgeActive ? "opacity-20" : "opacity-40",
                dodgeDir > 0 ? "left-3" : "-left-3",
              )}
            >
              {character.roleLabel}
            </span>
          ) : null}
          <span
            aria-hidden
            className={cn(
              "relative grid h-10 w-10 place-items-center rounded-md border font-mono text-xs font-bold",
              lowHp
                ? "border-destructive/60 bg-destructive/15 text-destructive"
                : skinStyle.chip,
            )}
          >
            {character.roleLabel}
          </span>
          {/* 能量脉冲（glitch-feel-pack.md 二）：缓存法师每次出手从自身头像炸开一圈，低配不渲染 */}
          {pulseFxId != null && !lowSpec ? (
            <span
              key={pulseFxId}
              aria-hidden
              className={cn(
                "attack-pulse pointer-events-none absolute inset-0 z-10 rounded-md border-2 border-sys-cache",
                pulseBig && "shadow-glow-purple",
              )}
            />
          ) : null}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-display text-lg font-bold">
            {character.displayName}
            {dodgeActive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary">
                <Zap className="h-3 w-3" />
                无敌
              </span>
            ) : null}
            {hasteActive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-destructive/15 px-1.5 py-0.5 font-mono text-xs text-destructive">
                攻速翻倍
              </span>
            ) : null}
            {dodgeHaste ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-xs text-primary">
                无痕切换 · 攻速 +25%
              </span>
            ) : null}
            {doubleStrike ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                事件连击 · 双重打击
              </span>
            ) : null}
            {multithreadActive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                多线程执行 · 攻速 +60%
              </span>
            ) : null}
            {freezeActive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-sys-script/60 bg-sys-script/15 px-1.5 py-0.5 font-mono text-xs text-sys-script">
                任务管理器 · 全场冻结
              </span>
            ) : null}
            {cursed ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-destructive/60 bg-destructive/15 px-1.5 py-0.5 font-mono text-xs text-destructive">
                <Skull className="h-3 w-3" />
                诅咒
              </span>
            ) : null}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {character.roleLabel} · 自动攻击中
          </p>
        </div>
        {/* 盲战开关（fun-pack v2）：代价只换来数字遮罩，条形布局不动；?? 与数字同宽防抖动 */}
        <button
          type="button"
          onClick={onToggleBlind}
          aria-pressed={blindCombat}
          title="盲战：看不见血条，攻击 +30%"
          className={cn(
            "ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-sm border transition focus-visible:outline-none focus-visible:shadow-focus",
            blindCombat
              ? "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
          )}
        >
          {blindCombat ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="shrink-0 font-mono text-sm font-bold">
          {blindCombat ? (
            <span className="text-muted-foreground">?? / ??</span>
          ) : (
            <>
              <span className={lowHp ? "text-destructive" : "text-foreground"}>
                {playerHp}
              </span>
              <span className="text-muted-foreground"> / {playerMaxHp}</span>
            </>
          )}
        </span>
      </div>

      {/* 护盾条：6px，位于血条上方，填充霓虹青 */}
      {shield > 0 ? (
        <div
          aria-hidden
          className="h-1.5 -mb-1 overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-sys-script transition-[width] duration-300 ease-out"
            style={{ width: `${shieldRatio}%` }}
          />
        </div>
      ) : null}

      {/* 血条：8px，绿→青渐变；低血（<30%）红→金渐变 + 脉冲 */}
      <div
        className="relative h-2 overflow-hidden rounded-[4px] bg-border"
        role="progressbar"
        aria-label="生命"
        aria-valuenow={Math.round(Math.max(0, hpRatio) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-[4px] transition-[width] duration-300 ease-out",
            lowHp && "motion-safe:animate-pulse-soft",
          )}
          style={{
            width: `${Math.round(Math.max(0, hpRatio) * 100)}%`,
            background: lowHp
              ? "var(--hp-fill-low)"
              : "var(--hp-fill)",
          }}
        />
      </div>

      <p className="rounded-sm border border-dashed border-border px-2 py-1.5 font-mono text-xs text-muted-foreground">
        {character.passive}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <Shield
            className={cn(
              "h-4 w-4",
              shield > 0 ? "text-sys-script" : "text-muted-foreground",
            )}
          />
          <span className="font-mono text-xs text-muted-foreground">
            {isMage ? "缓存护盾" : "护盾"}
          </span>
          <span
            className={cn(
              "font-mono text-xs font-bold",
              shield > 0 ? "text-sys-script" : "text-muted-foreground",
            )}
          >
            {blindCombat ? (
              <span className="text-muted-foreground">?? / ??</span>
            ) : (
              `${shield} / ${shieldMax}`
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">追加</span>
          <span
            className={cn(
              "rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold",
              combo > 0
                ? skinStyle.chip
                : "border-transparent bg-foreground/10 text-muted-foreground",
            )}
          >
            x{combo}
          </span>
        </div>

        {/* 点击连击：×3 起显示「连击 ×N」，满层显示「连击 MAX」，独立于事件连击 */}
        {clickCombo > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">连击</span>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold",
                clickComboActive
                  ? cn(
                      "border-primary/60 bg-primary/15 text-primary",
                      !lowSpec && "motion-safe:animate-pulse-soft",
                    )
                  : skinStyle.chip,
              )}
            >
              {clickComboFull ? "MAX" : `x${clickCombo}`}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              +{Math.round(clickCombo * 5)}% 攻速 / {clickComboMax}
            </span>
          </div>
        ) : null}

        {isWarrior ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">监听</span>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold",
                listenStacks > 0
                  ? skinStyle.chip
                  : "border-transparent bg-foreground/10 text-muted-foreground",
              )}
            >
              {listenStacks} / {listenStacksMax}
            </span>
          </div>
        ) : null}

        {/* 工作僧侣被动「后台同步」：计数徽标，满 8 补一发固定伤害 */}
        {isMonk ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">同步</span>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold",
                syncStacks > 0
                  ? skinStyle.chip
                  : "border-transparent bg-foreground/10 text-muted-foreground",
              )}
            >
              {syncStacks} / {syncStacksMax}
            </span>
          </div>
        ) : null}

        {/* 饼干窃贼被动「饼罐子」：常驻说明型徽标 */}
        {isCookie ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">饼罐子</span>
            <span className="rounded-sm border border-transparent bg-foreground/10 px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              击杀汲取 +3
            </span>
          </div>
        ) : null}

        {/* 内核之影被动「根权限」：低血生效时高亮 */}
        {isShade ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">根权限</span>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold",
                rootActive
                  ? cn(skinStyle.chip, "motion-safe:animate-pulse-soft")
                  : "border-transparent bg-foreground/10 text-muted-foreground",
              )}
            >
              低血攻速 +30%
            </span>
          </div>
        ) : null}

        {deathWards > 0 ? (
          <div className="flex items-center gap-1.5">
            <LifeBuoy className={cn("h-4 w-4", skinStyle.accentText)} />
            <span className="font-mono text-xs text-muted-foreground">
              免死
            </span>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-xs font-bold",
                skinStyle.chip,
              )}
            >
              x{deathWards}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  )
})
