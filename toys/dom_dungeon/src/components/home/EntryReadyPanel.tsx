import { Check, Play, RotateCcw, Shuffle } from "lucide-react"

import {
  BOSS_PREVIEW,
  ENEMY_PREVIEW,
  type DungeonCharacter,
} from "@/lib/dungeonData"
import { cn } from "@/lib/utils"

type EntryReadyPanelProps = {
  character: DungeonCharacter
  seed: string
  daily: boolean
  /** 手输种子码的校验错误（null = 合法）；每日挑战种子只读，不会报错 */
  seedError?: string | null
  onSeedChange?: (text: string) => void
  /** 构筑码（build-code.md 二）：可选导入，带 preview 与校验错误 */
  buildCode?: string
  buildError?: string | null
  buildPreview?: string | null
  onBuildChange?: (text: string) => void
  onEnter: () => void
  onReroll: () => void
  onLeave: () => void
}

export function EntryReadyPanel({
  character,
  seed,
  daily,
  seedError = null,
  onSeedChange,
  buildCode = "",
  buildError = null,
  buildPreview = null,
  onBuildChange,
  onEnter,
  onReroll,
  onLeave,
}: EntryReadyPanelProps) {
  return (
    <section
      aria-live="polite"
      className="animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <div className="rounded-lg border border-primary/50 bg-card p-4 text-card-foreground shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/15 text-primary">
              <Check className="h-4 w-4" />
            </span>
            <div>
              <p className="font-display text-xl font-bold">
                地牢入口已就绪
              </p>
              <p className="text-sm text-muted-foreground">
                {character.displayName} · 主动技「{character.activeName}」·
                {character.cooldown}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEnter}
              disabled={Boolean(seedError) || Boolean(buildError)}
              className={cn(
                "inline-flex items-center gap-2 rounded-btn px-4 py-2 text-sm font-semibold transition active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus",
                seedError || buildError
                  ? "cursor-not-allowed border border-border bg-foreground/5 text-muted-foreground"
                  : "bg-primary text-primary-foreground shadow-glow-cyan hover:brightness-110",
              )}
            >
              <Play className="h-4 w-4" />
              进入地牢
            </button>
            <button
              type="button"
              onClick={onReroll}
              className="inline-flex items-center gap-2 rounded-btn bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-glow-cyan transition hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-focus"
            >
              <Shuffle className="h-4 w-4" />
              {daily ? "重开今日挑战" : "随机一个"}
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:shadow-focus"
            >
              <RotateCcw className="h-4 w-4" />
              换角色
            </button>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
          <div>
            <dt className="font-mono text-xs text-muted-foreground">起点</dt>
            <dd className="text-sm font-medium">第 1 层 · 标签层</dd>
          </div>
          <div>
            <dt className="font-mono text-xs text-muted-foreground">
              {daily ? "今日种子（全服统一）" : "本局种子（可手输好友分享的码）"}
            </dt>
            {daily ? (
              <dd className="font-mono text-sm font-semibold text-primary">
                {seed}
              </dd>
            ) : (
              <dd>
                <input
                  type="text"
                  value={seed}
                  onChange={(ev) => onSeedChange?.(ev.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={Boolean(seedError)}
                  placeholder="A7F2-3C9D"
                  className={cn(
                    "w-36 rounded-sm border bg-background px-2 py-1 font-mono text-sm font-semibold tracking-tight text-primary focus-visible:outline-none focus-visible:shadow-focus",
                    seedError ? "border-destructive" : "border-border",
                  )}
                />
                {seedError ? (
                  <p className="mt-1 font-mono text-xs text-destructive">
                    {seedError}
                  </p>
                ) : null}
              </dd>
            )}
          </div>
          <div>
            <dt className="font-mono text-xs text-muted-foreground">
              中途会遇上
            </dt>
            <dd className="text-sm font-medium">{ENEMY_PREVIEW.join(" / ")}</dd>
          </div>
          {daily ? null : (
            <div>
              <dt className="font-mono text-xs text-muted-foreground">
                构筑码（好友分享的码，可选）
              </dt>
              <dd>
                <input
                  type="text"
                  value={buildCode}
                  onChange={(ev) => onBuildChange?.(ev.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={Boolean(buildError)}
                  placeholder="B-C-S1K4P9"
                  className={cn(
                    "w-36 rounded-sm border bg-background px-2 py-1 font-mono text-sm font-semibold tracking-tight text-primary focus-visible:outline-none focus-visible:shadow-focus",
                    buildError ? "border-destructive" : "border-border",
                  )}
                />
                {buildError ? (
                  <p className="mt-1 font-mono text-xs text-destructive">
                    {buildError}
                  </p>
                ) : buildPreview ? (
                  <p className="mt-1 text-xs font-medium text-primary">
                    {buildPreview}
                  </p>
                ) : null}
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-3 rounded-md border border-dashed border-border p-3 font-mono text-xs text-muted-foreground">
          本局配置已存进本地存档。点「进入地牢」直接开打：角色自动攻击，你只管按空格放技能、按
          Shift 闪避；Boss 位分别是 {BOSS_PREVIEW.join(" 和 ")}。
        </p>
      </div>
    </section>
  )
}
