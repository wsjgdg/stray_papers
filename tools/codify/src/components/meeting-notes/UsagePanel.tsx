// 「健康面板」（设置页内）：从日志到指标——把 AI 调用账本（usageLog）与健康趋势采样
// （healthLog：存储用量日采样 / 语义索引重建打点）聚合成一屏可读的运行状况：
//   AI 调用成功率 · 平均响应延迟 · 降级/失败频率与原因分布 · 存储用量趋势 · 索引重建频率
// 指标不实时刷新：面板随设置对话框挂载时计算一次（关闭再打开即重算），够用且零常驻开销。
// 诚实原则：token 是计费依据的参考，金额以 RunningHub 账单为准，这里不虚构价格；
// 平台未提供速率限制查询接口，失败 / 降级原因分布就是最接近的可观测信号。

import { useMemo, useState } from "react"
import { BarChart3, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  KIND_LABELS,
  clearUsageLog,
  loadUsageLog,
  summarizeUsage,
  type AiCallRecord,
} from "@/lib/usageLog"
import { loadHealthPanel } from "@/lib/healthLog"
import { AGENT_LABELS } from "@/lib/agents"

const RANGES = [
  { days: 7, label: "近 7 天" },
  { days: 30, label: "近 30 天" },
  { days: 0, label: "全部" },
]

const REASON_LABELS: Record<string, string> = {
  timeout: "超时",
  not_found: "服务未就绪",
  bad_json: "回复格式异常",
  rh_login_required: "需要登录",
  insufficient_balance: "余额不足",
  unknown: "未知错误",
}

function fmtTokens(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function fmtKb(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${Math.round(kb)} KB`
}

function reasonsText(reasons: Record<string, number>): string {
  return Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${REASON_LABELS[reason] ?? reason} ${n} 次`)
    .join("、")
}

export function UsagePanel() {
  const [records, setRecords] = useState<AiCallRecord[]>(() => loadUsageLog())
  const [days, setDays] = useState(7)
  const [confirmClear, setConfirmClear] = useState(false)
  // 趋势采样随面板挂载读一次（设置对话框关闭即卸载，重新打开就是重新计算）
  const [health] = useState(() => loadHealthPanel())

  const summary = useMemo(() => summarizeUsage(records, days), [records, days])
  const maxDaily = Math.max(1, ...summary.daily.map((d) => d.calls))
  const successRate = summary.calls > 0 ? Math.round((summary.okCalls / summary.calls) * 100) : null
  const failedCalls = summary.calls - summary.okCalls
  const trend = health.storageTrend
  const maxUsage = Math.max(1, ...trend.map((s) => s.usageKb))
  const lastRebuild = health.lastRebuild

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <BarChart3 className="h-3 w-3" />
          健康面板
        </h3>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                "rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] transition-colors",
                days === r.days
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── AI 调用指标（成功率 / 延迟 / 降级与失败）── */}
      {records.length === 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          还没有 AI 调用记录；生成纪要、问答、整理、找会、标注每次调用都会记在这里
          （模型、耗时、成败、是否降级），成功失败都进账本——只存本机
        </p>
      ) : summary.calls === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">该时间段内没有 AI 调用记录</p>
      ) : (
        <div className="mt-2 space-y-2.5">
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { label: "调用", value: `${summary.calls} 次` },
              { label: "成功率", value: successRate === null ? "—" : `${successRate}%` },
              {
                label: "Token",
                value: summary.tokensKnown ? fmtTokens(summary.tokens) : "未回传",
              },
              { label: "降级", value: `${summary.fallbacks} 次` },
              { label: "平均延迟", value: `${Math.max(1, Math.round(summary.avgDurationMs / 1000))}s` },
            ].map((s) => (
              <div key={s.label} className="rounded-[var(--radius-md)] border border-border bg-background px-2 py-1.5 text-center">
                <p className="text-[13px] font-semibold text-foreground cjk-latin tabular-nums">{s.value}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground">最近 14 天调用趋势</p>
            <div className="mt-1 flex h-10 items-end gap-px">
              {summary.daily.map((d) => (
                <div
                  key={d.day}
                  className="flex-1 rounded-t-[2px] bg-primary/40"
                  style={{ height: `${Math.max(4, (d.calls / maxDaily) * 100)}%`, opacity: d.calls > 0 ? 1 : 0.25 }}
                  title={`${d.day}：${d.calls} 次调用`}
                />
              ))}
            </div>
          </div>

          {summary.fallbacks > 0 ? (
            <div className="rounded-[var(--radius-md)] border border-destructive/25 bg-destructive/5 px-2.5 py-2">
              <p className="text-[11px] font-medium text-destructive cjk-latin">
                发生 {summary.fallbacks} 次降级
                {Object.keys(summary.fallbackReasons).length > 0
                  ? `（${reasonsText(summary.fallbackReasons)}）`
                  : ""}
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                降级频繁时建议检查网络，或在「AI 模型」里换一个更稳定的首选模型；重新生成会先从首选模型重试
              </p>
            </div>
          ) : null}

          {failedCalls > 0 ? (
            <div className="rounded-[var(--radius-md)] border border-destructive/25 bg-destructive/5 px-2.5 py-2">
              <p className="text-[11px] font-medium text-destructive cjk-latin">
                {failedCalls} 次调用整链失败
                {Object.keys(summary.failReasons).length > 0
                  ? `（${reasonsText(summary.failReasons)}）`
                  : ""}
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                整链失败 = 降级链上所有模型都没能返回可用结果；登录 / 余额类失败请先处理账号状态再重试
              </p>
            </div>
          ) : null}

          <div className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
            {summary.byModel.length > 0 ? (
              <p className="cjk-latin">
                按模型：
                {summary.byModel.map((m) => `${m.model} ${m.calls} 次${m.tokens ? `（${fmtTokens(m.tokens)} token）` : ""}`).join("、")}
              </p>
            ) : null}
            {summary.byKind.length > 0 ? (
              <p>
                按操作：
                {summary.byKind.map((k) => `${KIND_LABELS[k.kind] ?? k.kind} ${k.calls} 次`).join("、")}
              </p>
            ) : null}
            {summary.byAgent.length > 0 ? (
              <p>
                按 Agent：
                {summary.byAgent.map((a) => `${AGENT_LABELS[a.agent] ?? a.agent} ${a.calls} 次`).join("、")}
              </p>
            ) : null}
            {summary.topMeetings.length > 0 ? (
              <p>
                按会议（前 {summary.topMeetings.length}）：
                {summary.topMeetings.map((m) => `《${m.title}》${m.calls} 次`).join("、")}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* ── 存储用量趋势（日粒度采样，最多 30 天）── */}
      <div className="mt-3">
        <p className="text-[10px] text-muted-foreground">存储用量趋势（按天采样，最近 {trend.length || 0} 天有记录）</p>
        {trend.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            还没有采样——每次数据落盘时会记录当天的存储用量，用过几天后这里会画出趋势
          </p>
        ) : (
          <>
            <div className="mt-1 flex h-10 items-end gap-px">
              {trend.map((s) => (
                <div
                  key={s.day}
                  className="flex-1 rounded-t-[2px] bg-emerald-500/50"
                  style={{ height: `${Math.max(4, (s.usageKb / maxUsage) * 100)}%` }}
                  title={`${s.day}：${fmtKb(s.usageKb)}`}
                />
              ))}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground/80 cjk-latin tabular-nums">
              最新 {fmtKb(trend[trend.length - 1].usageKb)} · 30 天内峰值 {fmtKb(maxUsage)}
            </p>
          </>
        )}
      </div>

      {/* ── 语义索引重建频率 ── */}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground cjk-latin">
        语义索引手动重建：近 30 天 {health.rebuilds30} 次
        {lastRebuild
          ? `，最近一次 ${new Date(lastRebuild).getMonth() + 1}/${new Date(lastRebuild).getDate()}`
          : "（从未重建——增量为脏检查同步，通常无需手动重建）"}
      </p>

      {records.length > 0 ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[10px] leading-relaxed text-muted-foreground/80">
            token 数是计费依据的参考，金额以 RunningHub 账单为准；账本最多保留最近 500 条，只存本机。
            平台未提供速率限制查询，上方失败 / 降级原因分布是最接近的可观测信号
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirmClear) {
                clearUsageLog()
                setRecords([])
                setConfirmClear(false)
              } else {
                setConfirmClear(true)
                window.setTimeout(() => setConfirmClear(false), 3000)
              }
            }}
            className={cn(
              "h-6 shrink-0 gap-1 rounded-[var(--radius-sm)] px-2 text-[10px]",
              confirmClear ? "text-destructive" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Trash2 className="h-3 w-3" />
            {confirmClear ? "再点一次确认清空" : "清空账本"}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
