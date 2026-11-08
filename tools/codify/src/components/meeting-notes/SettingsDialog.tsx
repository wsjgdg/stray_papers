import { useRef, useState, lazy, Suspense } from "react"
import { Download, FileText, History, Settings2, ShieldAlert, Sparkles, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ActivityEvent, ImportConflictStrategy, Meeting, MeetingTemplate, SummaryPersona } from "@/lib/store"
import type { SemanticStatus } from "@/lib/embeddingClient"
import type { ImportPreview } from "@/hooks/useMeetingNotes"
import { AGENT_SPECS, DEFAULT_AGENT_CONFIGS, type AgentConfig, type AgentRole, type AgentsConfig } from "@/lib/agents"
import { ProviderSettings } from "@/components/meeting-notes/ProviderSettings"
import { UsagePanel } from "@/components/meeting-notes/UsagePanel"
import { QualityPanel } from "@/components/meeting-notes/QualityPanel"
import { isVaultEnabled } from "@/lib/vault"

// 档案加密编排 + UI 只在设置页用到：懒加载分块，不进首屏主包
const VaultSection = lazy(() =>
  import("@/components/meeting-notes/VaultSection").then((m) => ({ default: m.VaultSection })),
)

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  model: string
  minConfidence: number
  modelOptions: string[]
  agents: AgentsConfig
  onAgentChange: (role: AgentRole, patch: Partial<AgentConfig>) => void
  onAgentReset: (role: AgentRole) => void
  meetingCount: number
  /** 全量会议（质量信号面板算转写修正率的分母用） */
  meetings: Meeting[]
  lastBackupAt?: number
  storagePersisted: boolean
  storageSizeKb: number
  /** 浏览器预估的存储配额上限（KB）；0 = 环境不提供配额信息，界面隐藏占比 */
  storageQuotaKb: number
  templates: MeetingTemplate[]
  onUpdateTemplate: (id: string, patch: { label?: string; guidance?: string }) => void
  onResetTemplate: (id: string) => void
  onDeleteTemplate: (id: string) => void
  onModelChange: (model: string) => void
  onThresholdChange: (v: number) => void
  // ── 摘要管线（FRAME 三段式 + SCOPE 读者视角）──
  frameSummary: boolean
  summaryPersona: SummaryPersona
  onFrameChange: (v: boolean) => void
  onPersonaChange: (v: SummaryPersona) => void
  onExportAll: (includeSecrets: boolean) => void
  onExportAllMarkdown: () => void
  onPreviewImport: (file: File) => Promise<ImportPreview>
  onConfirmImport: (strategy: ImportConflictStrategy) => string
  onCancelImport: () => void
  activity: ActivityEvent[]
  // ── 本地语义检索 ──
  semanticEnabled: boolean
  semanticStatus: SemanticStatus
  semanticProgress: { done: number; total: number } | null
  onToggleSemantic: (v: boolean) => void
  onRebuildSemantic: () => void
}

const THRESHOLDS = [
  { value: 0.2, label: "宽松", desc: "尽量多保留，可能混入不确定的条目" },
  { value: 0.4, label: "标准", desc: "推荐；把握不足的条目直接丢弃" },
  { value: 0.6, label: "严格", desc: "只保留高把握的行动项" },
]

// 抽取 Agent 确认门槛：置信度低于门槛（且高于丢弃线）的条目先进「待确认」队列，由人拍板
const EXTRACT_THRESHOLDS = [
  { value: 0, label: "不扣：直接入清单（低分项只标「请核对」）" },
  { value: 0.55, label: "宽松：低于 55% 的扣待确认" },
  { value: 0.7, label: "标准（推荐）：低于 70% 的扣待确认" },
  { value: 0.85, label: "严格：低于 85% 的扣待确认" },
]

// 标注 Agent 审阅线：低于此值的说话人建议在审阅面板默认不勾选
const ANNOTATE_THRESHOLDS = [
  { value: 0.5, label: "宽松：低于 50% 的建议默认不勾选" },
  { value: 0.6, label: "标准（推荐）：低于 60% 的建议默认不勾选" },
  { value: 0.75, label: "严格：低于 75% 的建议默认不勾选" },
]

// 摘要读者视角（SCOPE）：同一场会，写给不同人的摘要信息权重不同
const PERSONAS: { value: SummaryPersona; label: string; desc: string }[] = [
  { value: "neutral", label: "均衡记录（默认）", desc: "决定、分工、背景均衡呈现，适合归档与回看" },
  { value: "owner", label: "负责人视角", desc: "突出分配给我的任务、我的承诺、截止日与依赖——适合执行者自己看" },
  { value: "observer", label: "旁观者视角", desc: "突出决定了什么、为什么、结论与风险——适合转发给没参会的人" },
]

type SettingsTab = "model" | "provider" | "template" | "data" | "diagnostics"
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "model", label: "模型与生成" },
  { id: "data", label: "数据与安全" },
  { id: "provider", label: "服务商" },
  { id: "template", label: "模板" },
  { id: "diagnostics", label: "诊断" },
]

function fmtTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 超过 7 天没导出备份就提醒
const BACKUP_STALE_DAYS = 7

// 导入冲突（同一场会议再次导入）的三种处理策略
const CONFLICT_STRATEGIES: { value: ImportConflictStrategy; label: string; desc: string }[] = [
  { value: "merge", label: "合并", desc: "以本地为准，正文取更新时间较新的一版，行动项与决议取并集（本地手改过的保留）" },
  { value: "replace", label: "替换", desc: "导入版直接覆盖本地版，本地未备份的改动会丢失" },
  { value: "copy", label: "新增为副本", desc: "两边都保留，导入版作为一场新会议写入" },
]

export function SettingsDialog({
  open,
  onClose,
  model,
  minConfidence,
  modelOptions,
  agents,
  onAgentChange,
  onAgentReset,
  meetingCount,
  meetings,
  lastBackupAt,
  storagePersisted,
  storageSizeKb,
  storageQuotaKb,
  templates,
  onUpdateTemplate,
  onResetTemplate,
  onDeleteTemplate,
  onModelChange,
  onThresholdChange,
  frameSummary,
  summaryPersona,
  onFrameChange,
  onPersonaChange,
  onExportAll,
  onExportAllMarkdown,
  onPreviewImport,
  onConfirmImport,
  onCancelImport,
  activity,
  semanticEnabled,
  semanticStatus,
  semanticProgress,
  onToggleSemantic,
  onRebuildSemantic,
}: SettingsDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ added: number; conflicts: number; qaAdded: number } | null>(null)
  const [strategy, setStrategy] = useState<ImportConflictStrategy>("merge")
  const [importMsg, setImportMsg] = useState("")
  const [importErr, setImportErr] = useState("")
  const [importing, setImporting] = useState(false)
  // 事件日志：按会议筛选 + 导出（用于回看「这场会从粘贴到摘要的链路」或反馈问题）
  const [activityFilter, setActivityFilter] = useState("")
  // 备份是否携带 Provider 密钥类配置：默认不带（文件可安全分享），显式勾选才带
  const [includeSecrets, setIncludeSecrets] = useState(false)
  // 档案加密状态变化的刷新信号（VaultSection 开启/关闭后重渲染本对话框的警示行）
  const [, setVaultTick] = useState(0)
  const vaultEnabled = isVaultEnabled()
  const [tab, setTab] = useState<SettingsTab>("model")

  if (!open) return null

  const resetImportUi = () => {
    setPreview(null)
    setImportMsg("")
    setImportErr("")
  }

  // 干跑：只解析并报告「会写入什么」，不落盘
  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    setImportMsg("")
    setImportErr("")
    setPreview(null)
    try {
      const res = await onPreviewImport(file)
      if (res.ok) {
        setPreview({ added: res.added, conflicts: res.conflicts, qaAdded: res.qaAdded })
        setStrategy("merge")
      } else {
        setImportErr(res.error)
      }
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const handleConfirm = () => {
    const msg = onConfirmImport(strategy)
    resetImportUi()
    setImportMsg(msg)
  }

  const handleCancel = () => {
    onCancelImport()
    resetImportUi()
  }

  const activityTitles = [...new Set(activity.map((ev) => ev.meetingTitle).filter(Boolean))]
  const filteredActivity = activityFilter
    ? activity.filter((ev) => ev.meetingTitle === activityFilter)
    : activity

  const exportActivity = () => {
    const lines = filteredActivity.map(
      (ev) =>
        `${fmtTime(ev.at)} [${ev.kind}]${ev.meetingTitle ? ` 《${ev.meetingTitle}》` : ""} ${ev.detail}`,
    )
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    a.download = `meeting-notes-activity-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 dark:bg-background/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="设置"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-[var(--font-display)] text-base font-semibold tracking-tight text-foreground">
            <Settings2 className="h-4 w-4 text-primary" />
            设置
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭设置"
            className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {tab === "model" && (
          <>
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground">AI 模型</h3>
            <input
              list="settings-model-options"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder="如 agnes-2.5-flash（默认）、agnes-2.5-pro、agnes-2.0-flash"
              className="mt-2 w-full rounded-[var(--radius-md)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
            />
            <datalist id="settings-model-options">
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              填入 Agnes 支持的模型名（默认 agnes-2.5-flash，另可选 agnes-2.5-pro、agnes-2.0-flash 等）。生成失败时按上方降级链逐模型重试，并在纪要页告知实际使用的模型
            </p>
          </section>
          </>
          )}

          {tab === "provider" && (<ProviderSettings />)}

          {tab === "model" && (
          <>
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground">AI 分工团队</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              不同任务由不同 Agent 负责，各有各的职责与提示词。默认都跟随上方的全局模型，你可以在这里为某个 Agent 单独指定模型、补充指令，或调整它「拿不准就交人确认」的门槛。日常用不着感知它们的存在，需要微调时再来
            </p>
            <div className="mt-2 space-y-2">
              {AGENT_SPECS.map((spec) => {
                const cfg = agents[spec.role]
                const dirty =
                  cfg.model !== "" ||
                  cfg.extraPrompt !== "" ||
                  cfg.reviewThreshold !== DEFAULT_AGENT_CONFIGS[spec.role].reviewThreshold
                return (
                  <div key={spec.role} className="rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground">{spec.label}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{spec.duty}</p>
                      </div>
                      {dirty ? (
                        <button
                          onClick={() => onAgentReset(spec.role)}
                          className="shrink-0 text-[10px] text-muted-foreground transition-colors hover:text-primary"
                        >
                          恢复默认
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="shrink-0 text-[11px] text-muted-foreground">模型</span>
                      <select
                        value={cfg.model}
                        onChange={(e) => onAgentChange(spec.role, { model: e.target.value })}
                        className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-[11px] text-foreground outline-none focus-visible:border-primary"
                      >
                        <option value="">跟随全局（{model}）</option>
                        {modelOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    {spec.role === "extract" ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="shrink-0 text-[11px] text-muted-foreground">确认门槛</span>
                        <select
                          value={String(cfg.reviewThreshold)}
                          onChange={(e) => onAgentChange(spec.role, { reviewThreshold: Number(e.target.value) })}
                          className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-[11px] text-foreground outline-none focus-visible:border-primary"
                        >
                          {EXTRACT_THRESHOLDS.map((t) => (
                            <option key={t.value} value={String(t.value)}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {spec.role === "annotate" ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="shrink-0 text-[11px] text-muted-foreground">确认门槛</span>
                        <select
                          value={String(cfg.reviewThreshold)}
                          onChange={(e) => onAgentChange(spec.role, { reviewThreshold: Number(e.target.value) })}
                          className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-[11px] text-foreground outline-none focus-visible:border-primary"
                        >
                          {ANNOTATE_THRESHOLDS.map((t) => (
                            <option key={t.value} value={String(t.value)}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    <textarea
                      value={cfg.extraPrompt}
                      onChange={(e) =>
                        onAgentChange(spec.role, { extraPrompt: e.target.value.slice(0, 500) })
                      }
                      rows={2}
                      placeholder={spec.extraPlaceholder}
                      className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border bg-background p-2 text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
                    />
                  </div>
                )
              })}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              附加指令会注入该 Agent 的提示词，但不能突破「只依据原文、禁止编造」的铁律。抽取门槛越高，越多把握不足的条目会先进「待确认」队列由你拍板，而不是直接写进清单
            </p>
          </section>
          </>
          )}

          {tab === "template" && (
          <>
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground">会议模板</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              模板决定生成摘要时的「组织视角」，顶栏可为每场会议选择。内置模板可直接改文案、可恢复默认；在纪要页还能把一场满意会议的议题结构提取成新模板复用
            </p>
            <div className="mt-2 space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="rounded-[var(--radius-md)] border border-border bg-background px-2.5 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={t.label}
                      onChange={(e) => onUpdateTemplate(t.id, { label: e.target.value })}
                      maxLength={20}
                      className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-foreground outline-none transition-colors hover:border-border focus-visible:border-primary"
                      aria-label="模板名称"
                    />
                    <span className="shrink-0 rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                      {t.builtin ? "内置" : "自定义"}
                    </span>
                    {t.builtin ? (
                      <button
                        onClick={() => onResetTemplate(t.id)}
                        className="shrink-0 text-[10px] text-muted-foreground transition-colors hover:text-primary"
                      >
                        恢复默认
                      </button>
                    ) : (
                      <button
                        onClick={() => onDeleteTemplate(t.id)}
                        className="shrink-0 text-[10px] text-muted-foreground transition-colors hover:text-destructive"
                      >
                        删除
                      </button>
                    )}
                  </div>
                  <textarea
                    value={t.guidance}
                    onChange={(e) => onUpdateTemplate(t.id, { guidance: e.target.value })}
                    rows={3}
                    placeholder="留空 = 按会议实际讨论顺序组织议题（通用模板即如此）。示例：议题优先按「进展 / 阻塞 / 下周计划」组织…"
                    className="mt-1.5 w-full resize-none rounded-[var(--radius-sm)] border border-border bg-background p-2 text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
                  />
                </div>
              ))}
            </div>
          </section>
          </>
          )}

          {tab === "model" && (
          <>
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              摘要管线与读者视角
            </h3>
            <div className="mt-2 space-y-1.5">
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2 transition-colors",
                  frameSummary
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-primary/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={frameSummary}
                  onChange={(e) => onFrameChange(e.target.checked)}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <span>
                  <span className="block text-[13px] font-medium text-foreground">
                    事实级摘要（推荐）
                  </span>
                  <span className="block text-[11px] leading-relaxed text-muted-foreground">
                    先从转写提取「原子事实」并逐条核验原文支撑，再按事实聚类组织议题——幻觉与遗漏更少，长会议不串台；事实清单在纪要页可独立查阅。代价是摘要生成变为两次调用，费用约 1.5-2 倍；关闭则回到一次调用直接成稿
                  </span>
                </span>
              </label>
            </div>
            <div className="mt-2.5 space-y-1.5">
              {PERSONAS.map((p) => (
                <label
                  key={p.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2 transition-colors",
                    summaryPersona === p.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:border-primary/40",
                  )}
                >
                  <input
                    type="radio"
                    name="summaryPersona"
                    checked={summaryPersona === p.value}
                    onChange={() => onPersonaChange(p.value)}
                    className="mt-0.5 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">{p.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{p.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              读者视角决定摘要的信息权重（写给谁、突出什么），在下次生成摘要时生效；已生成的摘要不会自动重写
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground">
              行动项置信度阈值
            </h3>
            <div className="mt-2 space-y-1.5">
              {THRESHOLDS.map((t) => (
                <label
                  key={t.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border px-3 py-2 transition-colors",
                    Math.abs(minConfidence - t.value) < 0.01
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:border-primary/40",
                  )}
                >
                  <input
                    type="radio"
                    name="minConfidence"
                    checked={Math.abs(minConfidence - t.value) < 0.01}
                    onChange={() => onThresholdChange(t.value)}
                    className="mt-0.5 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">{t.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{t.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              AI 给出的每条行动项都带置信度，低于阈值的直接丢弃；保留下来的低分项会在列表里标注「请核对」。改完在下次生成时生效
            </p>
          </section>
          </>
          )}

          {tab === "data" && (
          <>
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <ShieldAlert className="h-3 w-3" />
              数据安全状况
            </h3>
            <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
              {(() => {
                // eslint-disable-next-line react-hooks/purity -- 仅用于显示「距上次备份多少天」，设置弹窗打开期间随真实时间变化属预期
                const days = lastBackupAt ? Math.floor((Date.now() - lastBackupAt) / 86_400_000) : null
                if (meetingCount === 0) {
                  return <p className="text-muted-foreground">本地还没有会议数据</p>
                }
                if (days === null) {
                  return (
                    <p className="font-medium text-destructive">
                      本地已有 {meetingCount} 场会议，但从未导出过备份——建议现在就导出一份
                    </p>
                  )
                }
                const stale = days >= BACKUP_STALE_DAYS
                return (
                  <p className={stale ? "font-medium text-destructive" : "text-muted-foreground"}>
                    上次备份距今 {days} 天（{fmtTime(lastBackupAt!)}）
                    {stale ? "，太久没备份了，建议现在导出" : ""}
                  </p>
                )
              })()}
              <p className="text-muted-foreground">
                浏览器持久化存储：
                {storagePersisted
                  ? "已获准，正常情况下浏览器不会自动清理本站数据"
                  : "未获准，浏览器存储紧张时本站数据可能被自动清理，请勤备份"}
              </p>
              <p className={cn("cjk-latin tabular-nums", storageSizeKb > 204800 ? "font-medium text-destructive" : "text-muted-foreground")}>
                本工具数据约 {storageSizeKb >= 1024 ? `${(storageSizeKb / 1024).toFixed(1)} MB` : `${storageSizeKb} KB`}
                {storageSizeKb > 204800
                  ? "——占用已较大，建议导出备份并归档不再需要的旧会议"
                  : "；大转写稿已分片压缩存储（活跃会议快速压缩、归档会议深度压缩），容量上限远高于旧版"}
              </p>
              {storageQuotaKb > 0 &&
                (() => {
                  // 静默配额监控：用量 / 预估上限 / 占比一目了然；接近上限提前琥珀色预警，
                  // 真写失败才升级为红色故障横幅（页面顶部）
                  const pct = Math.min(100, (storageSizeKb / storageQuotaKb) * 100)
                  const fmt = (kb: number) =>
                    kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} GB` : `${(kb / 1024).toFixed(0)} MB`
                  return (
                    <p
                      className={cn(
                        "cjk-latin tabular-nums",
                        pct >= 90 ? "font-medium text-destructive" : pct >= 70 ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                      )}
                    >
                      当前存储用量 {fmt(storageSizeKb)} / 浏览器预估上限 {fmt(storageQuotaKb)}（已用 {pct < 0.1 ? "<0.1" : pct.toFixed(1)}%）
                      {pct >= 70 ? "——接近上限，建议导出备份并清理不再需要的旧会议" : ""}
                    </p>
                  )
                })()}
              <p className="text-destructive/85">
                所有数据只存在当前浏览器里：清除浏览器数据 / 站点数据会清空全部会议；无痕模式退出窗口即全部丢失；换浏览器或换设备需用备份导入恢复
              </p>
            </div>
          </section>

          <Suspense fallback={null}>
            <VaultSection onChanged={() => setVaultTick((t) => t + 1)} />
          </Suspense>

          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              本地语义检索
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              在浏览器内运行中文向量模型（bge-small-zh，量化权重随应用本地分发），把纪要与转写节选向量化后存进本机。「语义找会」随即升级为免费的本地向量匹配，不再调用付费模型；推理全程在本机完成、数据不出设备、离线可用
            </p>
            <label className="mt-2 flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={semanticEnabled}
                onChange={(e) => onToggleSemantic(e.target.checked)}
                className="mt-0.5 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block text-[13px] font-medium text-foreground">启用本地语义检索</span>
                <span className="block text-[11px] text-muted-foreground">
                  首次启用会加载推理运行时与模型（约 38 MB，来自应用本地资源，无需联网），并为已有会议后台建立向量索引；有 WebGPU 的设备自动走 GPU 加速，否则 CPU 回退
                </span>
              </span>
            </label>
            {semanticEnabled ? (
              <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
                {semanticStatus.state === "loading" ? (
                  <p className="text-muted-foreground">正在加载推理运行时与模型…</p>
                ) : null}
                {semanticStatus.state === "ready" ? (
                  <p className="cjk-latin text-muted-foreground">
                    推理后端：
                    {semanticStatus.backend === "webgpu"
                      ? `WebGPU（GPU 加速 · ${semanticStatus.dtype ?? "q4f16"} 量化）`
                      : `WASM-SIMD（CPU · ${semanticStatus.dtype ?? "q8"} 量化）`}
                    {" · "}已索引 {semanticStatus.docs ?? 0}/{meetingCount} 场会议 · {semanticStatus.segments ?? 0} 个向量段
                  </p>
                ) : null}
                {semanticProgress ? (
                  <p className="cjk-latin text-muted-foreground">
                    正在建立索引：{semanticProgress.done}/{semanticProgress.total} 场（后台线程执行，应用可继续使用）
                  </p>
                ) : null}
                {semanticStatus.state === "error" ? (
                  <p className="font-medium text-destructive">
                    语义推理不可用：{semanticStatus.error}——关键词检索与付费语义找会不受影响
                  </p>
                ) : null}
                {semanticStatus.state === "ready" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={onRebuildSemantic}
                    disabled={semanticProgress !== null}
                  >
                    重建向量索引
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground">
              数据备份与迁移
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              全库（所有会议、纪要、行动项、问答记录）导出为一个 JSON 备份，或导出为一份 Markdown 合集（每场会议带元信息，笔记软件可直接读）。换设备时导入 JSON 即可恢复；导入前会先报告「会写入什么」，确认后才真正写入，且不覆盖本地已有的会议
            </p>
            {vaultEnabled ? (
              <p className="mt-1.5 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                档案加密已开启：导出的备份文件本身<strong>不加密</strong>（加密只保护本机落盘的数据），请像对待明文数据一样保管备份文件
              </p>
            ) : null}
            <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                checked={includeSecrets}
                onChange={(e) => setIncludeSecrets(e.target.checked)}
                className="mt-0.5 accent-[hsl(var(--primary))]"
              />
              <span>
                包含服务商配置中的密钥类字段
                <span className="block text-[10px] text-muted-foreground/80">
                  默认不包含（备份文件可安全分享，文件内也会标注 secrets: excluded）；勾选后导出的文件请勿发给任何人
                </span>
              </span>
            </label>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onExportAll(includeSecrets)}
                className="gap-1.5 rounded-[var(--radius-md)]"
              >
                <Download className="h-3.5 w-3.5" />
                导出全库 JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onExportAllMarkdown}
                className="gap-1.5 rounded-[var(--radius-md)]"
              >
                <FileText className="h-3.5 w-3.5" />
                导出 Markdown 合集
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
                className="gap-1.5 rounded-[var(--radius-md)]"
              >
                <Upload className="h-3.5 w-3.5" />
                {importing ? "解析中…" : "导入备份"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </div>
            {preview ? (
              <div className="mt-2 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2.5">
                <p className="text-xs text-foreground/85 cjk-latin">
                  将新增 {preview.added} 场会议{preview.qaAdded > 0 ? `、${preview.qaAdded} 条问答记录` : ""}
                  {preview.conflicts > 0
                    ? `；另有 ${preview.conflicts} 场与本地会议是同一场（同来源或标题+日期相同），请选择处理方式`
                    : ""}
                </p>
                {preview.conflicts > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {CONFLICT_STRATEGIES.map((s) => (
                      <label
                        key={s.value}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border bg-background px-2.5 py-1.5 transition-colors",
                          strategy === s.value
                            ? "border-primary"
                            : "border-border hover:border-primary/40",
                        )}
                      >
                        <input
                          type="radio"
                          name="importStrategy"
                          checked={strategy === s.value}
                          onChange={() => setStrategy(s.value)}
                          className="mt-0.5 accent-[hsl(var(--primary))]"
                        />
                        <span>
                          <span className="block text-xs font-medium text-foreground">{s.label}</span>
                          <span className="block text-[11px] leading-relaxed text-muted-foreground">{s.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleConfirm}
                    className="h-7 rounded-[var(--radius-sm)] bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90"
                  >
                    确认导入
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="h-7 rounded-[var(--radius-sm)] text-xs text-muted-foreground hover:text-foreground"
                  >
                    取消
                  </Button>
                </div>
              </div>
            ) : null}
            {importErr ? (
              <p className="mt-2 rounded-[var(--radius-md)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {importErr}
              </p>
            ) : null}
            {importMsg ? (
              <p className="mt-2 rounded-[var(--radius-md)] border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
                {importMsg}
              </p>
            ) : null}
          </section>
          </>
          )}

          {tab === "diagnostics" && (
          <>
          <section>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <History className="h-3 w-3" />
              事件日志
            </h3>
            {activity.length === 0 ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                还没有活动记录；生成、整理、问答、删除、备份导入导出都会记在这里
              </p>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={activityFilter}
                    onChange={(e) => setActivityFilter(e.target.value)}
                    className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-[11px] text-foreground outline-none focus-visible:border-primary"
                    aria-label="按会议筛选事件日志"
                  >
                    <option value="">全部会议与全局操作</option>
                    {activityTitles.map((t) => (
                      <option key={t} value={t}>
                        《{t}》
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportActivity}
                    className="h-7 shrink-0 gap-1 rounded-[var(--radius-sm)] text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-3 w-3" />
                    导出日志
                  </Button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {activityFilter
                    ? `《${activityFilter}》从粘贴到摘要、行动项、整理的完整链路都在这里，可导出用于反馈问题`
                    : "选一场会议可查看它从粘贴到摘要的完整链路"}
                </p>
                <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
                  {filteredActivity.slice(0, 50).map((ev) => (
                    <li key={ev.id} className="flex items-baseline gap-2 text-[11px] leading-relaxed">
                      <span className="shrink-0 text-muted-foreground/70 cjk-latin">{fmtTime(ev.at)}</span>
                      <span className="shrink-0 rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                        {ev.kind}
                      </span>
                      <span className="min-w-0 text-foreground/85">
                        {ev.meetingTitle ? `《${ev.meetingTitle}》` : ""}
                        {ev.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold text-muted-foreground">AI 用量说明</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
              <li>本应用不内置任何付费账号：AI 调用走你在「服务商」里填写的 OpenAI 兼容接口，费用由该接口对应的账号（自有 / 自建网关）承担</li>
              <li>每次生成 / 重新生成 / 补标点分段 / 问答都是一次独立调用，按接口实际计费口径执行</li>
              <li>首选模型失败自动降级时可能产生多次调用：成功那次产出结果，降级发生会在页面上明确告知</li>
              <li>实时转写、朗读纪要、文本清洗、搜索、批量重标说话人都是浏览器本机能力，永远免费</li>
            </ul>
          </section>

          <UsagePanel />

          <QualityPanel meetings={meetings} templates={templates} />
          </>
          )}
        </div>
      </div>
    </div>
  )
}
