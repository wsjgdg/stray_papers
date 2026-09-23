import { RELIC_RARITY_STYLE, RELIC_SCHOOL_STYLE } from "@/lib/dungeonData"
import type { useBossRush } from "@/pages/BossRush/useBossRush"

function cdText(ms: number): string {
  return ms <= 0 ? "" : `${(ms / 1000).toFixed(1)}s`
}

/** 战斗操作条：生命 / 护盾 / 主动技 / 闪避 / 已带词条 */
export function RushSkillBar(p: ReturnType<typeof useBossRush>) {
  const hpPct = Math.max(
    0,
    Math.min(100, Math.round((p.player.hp / Math.max(1, p.player.maxHp)) * 100)),
  )
  const activeReady = p.activeLeftMs <= 0 && p.phase === "fighting"
  const dodgeReady = p.dodgeLeftMs <= 0 && p.phase === "fighting"
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-md">
      {/* 生命条 */}
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">❤ 生命</span>
          <span className="tabular-nums text-muted-foreground">
            {Math.max(0, p.player.hp)} / {p.player.maxHp}
            {p.player.shield > 0 ? (
              <span className="ml-2 font-semibold text-primary">🛡 {p.player.shield}</span>
            ) : null}
          </span>
        </div>
        <div className="mt-1.5 h-3 overflow-hidden rounded-full border border-border bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-200 ${p.skin.style.bar}`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {/* 两个操作按钮 */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={p.useActiveSkill}
          disabled={!activeReady}
          className={`rounded-btn border px-3 py-2.5 text-left text-sm font-bold transition active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50 ${p.skin.style.action}`}
        >
          <span className="flex items-center justify-between gap-2">
            <span>✨ {p.character.activeName}</span>
            {!activeReady ? (
              <span className="tabular-nums text-xs font-medium opacity-80">
                {cdText(p.activeLeftMs)}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs font-medium opacity-75">
            {p.character.activeDesc}
          </span>
        </button>
        <button
          type="button"
          onClick={p.useDodgeSkill}
          disabled={!dodgeReady}
          className="rounded-btn border border-border bg-background px-3 py-2.5 text-left text-sm font-bold transition hover:border-primary/50 hover:text-primary active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex items-center justify-between gap-2">
            <span>💨 闪避</span>
            {!dodgeReady ? (
              <span className="tabular-nums text-xs font-medium text-muted-foreground">
                {cdText(p.dodgeLeftMs)}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
            前摇最后瞬间闪 = 完美闪避回血
          </span>
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        键盘：<span className="font-mono font-semibold">空格</span> 主动 ·{" "}
        <span className="font-mono font-semibold">Shift</span> 闪避 · 战斗区左右滑动 = 闪避
        {p.attackIntervalMs > 0 ? (
          <span className="ml-1 tabular-nums">· 当前攻速 {(p.attackIntervalMs / 1000).toFixed(1)}s/击</span>
        ) : null}
      </p>

      {/* 本局词条条 */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          本局词条 {p.relics.length}/{p.maxRelicSlots}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {p.relics.length === 0 ? (
            <span className="text-xs text-muted-foreground">还没有词条，每波打完三选一</span>
          ) : null}
          {p.relics.map((relic) => (
            <span
              key={relic.id}
              title={relic.desc}
              className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${RELIC_SCHOOL_STYLE[relic.school].chip} ${RELIC_RARITY_STYLE[relic.rarity]}`}
            >
              {relic.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
