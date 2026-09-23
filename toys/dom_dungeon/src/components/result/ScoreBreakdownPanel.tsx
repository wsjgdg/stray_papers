import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react"

import {
  scoreGradeTextClass,
  type RunScoreResult,
  type ScoreDiagnosis,
} from "@/lib/dailyScore"
import { playSfx } from "@/lib/sfx"

type ScoreBreakdownPanelProps = {
  score: RunScoreResult
  diagnosis: ScoreDiagnosis[] | null
  advice: string | null
  /** 低配模式：跳过逐条点亮 / 粒子，直接显示最终结果 */
  lowSpec: boolean
}

const ROWS: { key: keyof RunScoreResult["parts"]; label: string; hint: string }[] = [
  { key: "floor", label: "层数", hint: "打得更深，通关满分" },
  { key: "hp", label: "生命", hint: "血越满越高 · 无伤通关 +20" },
  { key: "memory", label: "内存", hint: "净产出 ÷ 总产出 · 从未耗尽 +15" },
  { key: "relic", label: "词条", hint: "满 6 件 60 分 + 稀有度加成" },
  { key: "bond", label: "羁绊", hint: "3 件流派 +15 · 4 件流派 +25 · 四系均衡 +20" },
  { key: "time", label: "用时", hint: "60 秒内满分 · 2 分钟内通关 +20" },
]

const REVEAL_STEP_MS = 220
const COUNT_UP_MS = 900

/** 粒子颜色分级（《Build 评分公式》六：SSS 彩虹 / SS 紫 / S 青 / A 绿 / B 黄 / C 灰） */
function sparkColorsOf(grade: RunScoreResult["grade"]): string[] {
  switch (grade) {
    case "SSS":
      return ["bg-sys-script", "bg-sys-style", "bg-sys-network"]
    case "SS":
      return ["bg-sys-style"]
    case "S":
      return ["bg-sys-script"]
    case "A":
      return ["bg-sys-cache"]
    case "B":
      return ["bg-sys-network"]
    default:
      return ["bg-muted-foreground/70"]
  }
}

/** 等级粒子：从面板底部上飘的对应色光点（SSS 三色循环近似彩虹） */
function GradeSparks({ colors }: { colors: string[] }) {
  const sparks = useMemo(
    () =>
      Array.from({ length: 14 }, (_, index) => ({
        left: (index * 7 + ((index * index) % 13) + 3) % 100,
        delay: (index % 7) * 220,
        color: colors[index % colors.length],
      })),
    [colors],
  )
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {sparks.map((spark) => (
        <span
          key={spark.left}
          className={[
            "absolute bottom-0 h-1.5 w-1.5 rounded-full opacity-0",
            "animate-[score-spark_1600ms_ease-out_infinite]",
            spark.color,
          ].join(" ")}
          style={{ left: `${spark.left}%`, animationDelay: `${spark.delay}ms` }}
        />
      ))}
    </div>
  )
}

/**
 * 综合评分 v3（《Build 评分公式》）：六维逐条点亮 → 总分滚动 → 评级弹出，
 * 高分（S 及以上）带粒子光效；面板底部附 Build 诊断与一句建议。
 */
export function ScoreBreakdownPanel({
  score,
  diagnosis,
  advice,
  lowSpec,
}: ScoreBreakdownPanelProps) {
  const [revealed, setRevealed] = useState(lowSpec ? ROWS.length : 0)
  const [counted, setCounted] = useState(lowSpec)
  const [earned, setEarned] = useState(lowSpec ? score.total : 0)
  const sfxFired = useRef(false)

  const allRevealed = revealed >= ROWS.length

  /* 逐条点亮（低配直接全亮） */
  useEffect(() => {
    if (lowSpec) {
      setRevealed(ROWS.length)
      return
    }
    let step = 0
    const timer = window.setInterval(() => {
      step += 1
      setRevealed(step)
      if (step >= ROWS.length) window.clearInterval(timer)
    }, REVEAL_STEP_MS)
    return () => window.clearInterval(timer)
  }, [lowSpec])

  /* 六条全亮后总分从 0 滚到最终值 */
  useEffect(() => {
    if (!allRevealed) return
    if (lowSpec) {
      setEarned(score.total)
      setCounted(true)
      return
    }
    let raf = 0
    const startedAt = performance.now()
    const step = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / COUNT_UP_MS)
      const eased = 1 - Math.pow(1 - progress, 3)
      setEarned(Math.round(eased * score.total * 10) / 10)
      if (progress < 1) {
        raf = window.requestAnimationFrame(step)
      } else {
        setCounted(true)
      }
    }
    raf = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(raf)
  }, [allRevealed, lowSpec, score.total])

  /* 音效分级：SSS/SS 胜利号角、S 清脆叮声、A/B 轻快音、C 低沉音、D 静 */
  useEffect(() => {
    if (!counted || sfxFired.current) return
    sfxFired.current = true
    switch (score.grade) {
      case "SSS":
      case "SS":
        playSfx("win")
        break
      case "S":
        playSfx("perfect")
        break
      case "A":
        playSfx("coin")
        break
      case "B":
        playSfx("pick")
        break
      case "C":
        playSfx("comboBreak")
        break
      default:
        break
    }
  }, [counted, score.grade])

  const allowFx = counted && !lowSpec && score.grade !== "D"
  const showSparks = allowFx
  const shakePanel = allowFx && (score.grade === "SSS" || score.grade === "SS")
  const flashScreen = allowFx && score.grade === "SSS"

  return (
    <section
      className={[
        "animate-in fade-in slide-in-from-bottom-4 relative rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-md duration-500 sm:p-5",
        shakePanel ? "animate-[grade-shake_400ms_ease-out_2]" : "",
      ].join(" ")}
    >
      {flashScreen ? (
        <div
          aria-hidden
          className="animate-[grade-flash_700ms_ease-out_1] pointer-events-none fixed inset-0 z-50 bg-background"
        />
      ) : null}
      {showSparks ? <GradeSparks colors={sparkColorsOf(score.grade)} /> : null}
      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <h2 className="font-display text-lg font-bold">综合评分</h2>
        </div>
        {counted ? (
          <div className="animate-in zoom-in-150 flex items-baseline gap-2 duration-300">
            <span
              className={`font-display text-3xl font-bold tabular-nums ${scoreGradeTextClass(
                score.grade,
              )}`}
            >
              {earned.toFixed(1)}
            </span>
            <span
              className={`rounded-full border border-border px-2 py-0.5 font-mono text-sm font-bold ${scoreGradeTextClass(
                score.grade,
              )}`}
            >
              {score.grade}
            </span>
          </div>
        ) : (
          <span className="font-display text-3xl font-bold tabular-nums text-muted-foreground">
            {earned.toFixed(1)}
          </span>
        )}
      </div>

      <ul className="relative mt-3 flex flex-col gap-2">
        {ROWS.map((row, index) => {
          const part = score.parts[row.key]
          const lit = index < revealed
          return (
            <li key={row.key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-x-3">
                <span className="font-mono text-sm text-card-foreground">
                  {row.label}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ×{Math.round(part.weight * 100)}%
                  </span>
                </span>
                <span
                  className={[
                    "font-mono text-sm font-semibold tabular-nums transition-colors duration-300",
                    lit ? "text-card-foreground" : "text-muted-foreground/40",
                  ].join(" ")}
                >
                  {lit ? part.raw.toFixed(1) : "--"}
                  {lit ? (
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      → +{part.weighted.toFixed(1)}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-background/60">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{ width: lit ? `${Math.max(0, Math.min(100, part.raw))}%` : "0%" }}
                />
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                {part.bonus !== 0 && part.bonusNote ? (
                  <span
                    className={
                      part.bonus > 0 ? "text-sys-cache" : "text-sys-network"
                    }
                  >
                    {part.bonusNote} · {row.hint}
                  </span>
                ) : (
                  row.hint
                )}
              </p>
            </li>
          )
        })}
      </ul>

      {diagnosis && diagnosis.length > 0 ? (
        <div className="relative mt-3 border-t border-border pt-3">
          <h3 className="font-mono text-xs font-bold text-muted-foreground">
            BUILD 诊断
          </h3>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {diagnosis.map((item) => (
              <li
                key={item.text}
                className="flex items-center gap-1.5 font-mono text-xs"
              >
                {item.level === "good" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sys-cache" aria-hidden />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-sys-network" aria-hidden />
                )}
                <span
                  className={
                    item.level === "good"
                      ? "text-card-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
          {advice ? (
            <p className="mt-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              {advice}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
