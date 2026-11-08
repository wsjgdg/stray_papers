import type { EnemyInstance } from "@/pages/Dungeon/useDungeon"

type ReadyFloorOverlayProps = {
  floor: number
  floorTotal: number
  /** 路线名（有路线时形如「广告峡谷」，无则空串） */
  floorLabel: string
  enemies: EnemyInstance[]
  isBossFloor: boolean
  onStart: () => void
}

/** 同种敌人聚合成一行「弹窗 ×2」 */
function groupEnemies(enemies: EnemyInstance[]): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = []
  for (const enemy of enemies) {
    if (enemy.closing) continue
    const hit = out.find((item) => item.name === enemy.displayName)
    if (hit) hit.count += 1
    else out.push({ name: enemy.displayName, count: 1 })
  }
  return out
}

/**
 * 进层准备闸：战斗冻结在此页面上，玩家看清敌人构成后主动开战
 * （用户反馈「进入关卡不要立刻开始」）。空格键开战路径在引擎键盘层。
 */
export function ReadyFloorOverlay({
  floor,
  floorTotal,
  floorLabel,
  enemies,
  isBossFloor,
  onStart,
}: ReadyFloorOverlayProps) {
  const groups = groupEnemies(enemies)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md">
        <p className="font-mono text-xs text-muted-foreground">
          第 {floor} / {floorTotal} 层{isBossFloor ? " · Boss" : ""}
        </p>
        <h2 className="mt-1 font-display text-xl font-bold">
          {floorLabel ? `第 ${floor} 层 · ${floorLabel}` : `第 ${floor} 层`}
        </h2>
        {groups.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {groups.map((group) => (
              <li
                key={group.name}
                className={
                  isBossFloor
                    ? "rounded-sm border border-destructive/60 bg-destructive/10 px-2 py-1 font-mono text-xs text-destructive"
                    : "rounded-sm border border-border px-2 py-1 font-mono text-xs text-foreground/80"
                }
              >
                {group.name}
                {group.count > 1 ? ` ×${group.count}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          onClick={onStart}
          className="mt-5 w-full rounded-lg bg-primary px-4 py-3 font-display text-lg font-semibold text-primary-foreground shadow-glow-cyan transition hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus"
        >
          开始战斗
        </button>
        <p className="mt-2 text-center font-mono text-xs text-muted-foreground">
          空格也可开战 · 计时从这一刻起算
        </p>
      </div>
    </div>
  )
}
