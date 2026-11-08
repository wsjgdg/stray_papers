import { RELIC_RARITY_STYLE, RELIC_SCHOOL_STYLE } from "@/lib/dungeonData"
import type { RushPop } from "@/pages/BossRush/useBossRush"
import type { useBossRush } from "@/pages/BossRush/useBossRush"

function PopStack({ pops, uid }: { pops: RushPop[]; uid: string }) {
  const mine = pops.filter((pop) => pop.uid === uid)
  if (mine.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap justify-center gap-1">
      {mine.map((pop) => (
        <span
          key={pop.id}
          className={`animate-in fade-in slide-in-from-bottom-2 text-sm font-black tabular-nums duration-500 ${
            pop.kind === "crit"
              ? "text-primary text-xl"
              : pop.kind === "heal"
                ? "text-sys-script"
                : pop.kind === "shield"
                  ? "text-primary"
                  : pop.kind === "dodge" || pop.kind === "miss"
                    ? "text-muted-foreground"
                    : "text-foreground"
          }`}
        >
          {pop.kind === "dodge"
            ? "闪!"
            : pop.kind === "miss"
              ? "miss"
              : `${pop.kind === "heal" ? "+" : "-"}${pop.amount}${pop.crit ? "!" : ""}`}
        </span>
      ))}
    </div>
  )
}

/** 战斗主区：Boss 卡 + 召唤小怪 + 台词横幅 + 顿帧/冻结覆盖层 */
export function BossArena(p: ReturnType<typeof useBossRush>) {
  const bossHpPct = Math.max(0, Math.round(p.hpRatio * 100))
  return (
    <section
      className="relative flex min-h-80 flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-md select-none"
      onPointerDown={(e) => p.battlePointerDown(e.clientX)}
      onPointerUp={(e) => p.battlePointerUp(e.clientX)}
    >
      {/* 顿帧：屏幕边缘压一道光；冻结：整体降一拍 */}
      {p.hitStopHeld ? (
        <div className="pointer-events-none absolute inset-0 z-30 rounded-lg border-2 border-primary/50 shadow-glow-cyan" aria-hidden />
      ) : null}
      {p.frozen ? (
        <span className="absolute right-3 top-3 z-30 rounded-md border border-sys-script/60 bg-sys-script/10 px-2 py-1 text-xs font-bold text-sys-script animate-in fade-in duration-300">
          ⏸ 全场冻结中
        </span>
      ) : null}

      {/* Boss 卡 */}
      <div
        className={`relative rounded-lg border p-4 transition ${
          p.bossTelegraphActive
            ? "border-destructive/70 bg-destructive/5 animate-pulse-soft"
            : `${p.skin.style.border} ${p.skin.style.surface}`
        }`}
      >
        <PopStack pops={p.pops} uid="boss" />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-2xl font-black tracking-wide">
              {p.boss.name}
              <span className="ml-2 text-sm font-semibold text-muted-foreground">
                阶段 {p.boss.phase}
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{p.boss.trait}</p>
          </div>
          <p className="text-sm font-bold tabular-nums">
            {Math.max(0, p.boss.hp)} / {p.boss.maxHp}
          </p>
        </div>
        <div className="mt-2 h-4 overflow-hidden rounded-full border border-border bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-200"
            style={{ width: `${bossHpPct}%` }}
          />
        </div>
        {p.boss.speedCut ? (
          <p className="mt-2 text-xs font-semibold text-destructive">
            ⚠ 崩溃阶段：你的攻速减半{p.boss.attackDouble ? "，Boss 攻击翻倍（可闪避）" : ""}
          </p>
        ) : null}

        {/* 蓄力中：技能预告 + 应对提示（强制观看时是跳过按钮） */}
        {p.pendingSkill ? (
          <div className="mt-3 rounded-md border border-destructive/60 bg-destructive/10 p-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <p className="text-sm font-bold">
              🔴 {p.pendingSkill.name} 蓄力中
              <span className="ml-2 font-mono text-xs font-medium text-muted-foreground">
                红圈落点 = 出手瞬间
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {p.pendingSkill.desc} · 应对：{p.pendingSkill.counter}
            </p>
            {p.pendingSkill.clickLabel ? (
              <button
                type="button"
                onClick={p.dismissBossClick}
                className="mt-2 rounded-btn bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus"
              >
                {p.pendingSkill.clickLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Boss 台词气泡 */}
        {p.bossLine ? (
          <p
            key={p.bossLine.seq}
            className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm italic text-foreground animate-in fade-in duration-500"
          >
            「{p.bossLine.text}」
          </p>
        ) : null}
      </div>

      {/* 事件横幅 */}
      {p.banner ? (
        <p
          key={p.banner.seq}
          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-center text-sm font-semibold text-primary animate-in fade-in slide-in-from-top-2 duration-500"
        >
          {p.banner.text}
        </p>
      ) : null}

      {/* 召唤小怪：点击切锁定 */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          召唤物（点击锁定目标{p.attackCutPct > 0 ? " · 在场时你的攻击下降" : ""}）
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {p.enemies.length === 0 ? (
            <span className="text-xs text-muted-foreground">没有杂兵，专心单挑</span>
          ) : null}
          {p.enemies.map((enemy) => (
            <button
              key={enemy.uid}
              type="button"
              onClick={() => p.lockEnemy(enemy.uid)}
              className={`relative min-w-32 rounded-md border px-3 py-2 text-left text-sm transition active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus ${
                p.player.lockedUid === enemy.uid
                  ? `${p.skin.style.border} ${p.skin.style.surface} shadow-md`
                  : "border-border bg-background hover:border-primary/40"
              } ${enemy.telegraphUntil > 0 ? "border-destructive/70 animate-pulse-soft" : ""} ${
                enemy.hitAt > 0 && p.now - enemy.hitAt < 160 ? "opacity-60" : ""
              }`}
            >
              <PopStack pops={p.pops} uid={enemy.uid} />
              <span className="flex items-center justify-between gap-2 font-semibold">
                {enemy.displayName}
                {p.player.lockedUid === enemy.uid ? (
                  <span className="text-xs text-primary">🎯</span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                {Math.max(0, enemy.hp)}/{enemy.maxHp}
                {enemy.telegraphUntil > 0 ? (
                  <span className="ml-1 font-bold text-destructive">⚡出手!</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 玩家状态小卡 */}
      <div
        className={`relative flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs self-start ${
          p.player.dodgeUntil > p.now || p.player.immuneUntil > p.now
            ? "border-sys-script/60 text-sys-script"
            : "text-muted-foreground"
        }`}
      >
        <PopStack pops={p.pops} uid="player" />
        <span className="font-semibold text-foreground">🧍 {p.character.displayName}</span>
        {p.player.dodgeUntil > p.now || p.player.immuneUntil > p.now ? <span>闪避中</span> : null}
        {p.relics.slice(-2).map((relic) => (
          <span
            key={relic.id}
            className={`rounded border px-1 py-0.5 font-semibold ${RELIC_SCHOOL_STYLE[relic.school].chip} ${RELIC_RARITY_STYLE[relic.rarity]}`}
          >
            {relic.name}
          </span>
        ))}
      </div>
    </section>
  )
}
