import { useState } from "react"
import { Calendar, Download, FlaskConical, History, Menu, Monitor, Moon, PanelRight, Plus, Search, Settings, Star, Sun, X } from "lucide-react"
import { Button } from "@/components/ui/button"
// 原 RunningHub 平台登录入口已随脱离平台而移除；本仓库无平台登录/计费墙。
import { cn } from "@/lib/utils"
import { THEME_LABELS, type ThemeMode } from "@/hooks/useTheme"
import type { Meeting, MeetingTemplate } from "@/lib/store"

interface TopBarProps {
  meeting: Meeting | null
  themeMode: ThemeMode
  templates: MeetingTemplate[]
  goldenCount: number
  onTitleChange: (title: string) => void
  onDateChange: (date: string) => void
  onKindChange: (templateId: string) => void
  onTagsChange: (tags: string[]) => void
  onExport: () => void
  onCycleTheme: () => void
  onOpenSettings: () => void
  onOpenHistory: () => void
  onToggleGolden: () => void
  onOpenEval: () => void
  onOpenPalette: () => void
  onToggleMobileNav: () => void
  onToggleRightPanel: () => void
  rightPanelOpen: boolean
}

const THEME_ICONS: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const TAG_CAP = 6

export function TopBar({
  meeting,
  themeMode,
  templates,
  goldenCount,
  onTitleChange,
  onDateChange,
  onKindChange,
  onTagsChange,
  onExport,
  onCycleTheme,
  onOpenSettings,
  onOpenHistory,
  onToggleGolden,
  onOpenEval,
  onOpenPalette,
  onToggleMobileNav,
  onToggleRightPanel,
  rightPanelOpen,
}: TopBarProps) {
  const ThemeIcon = THEME_ICONS[themeMode]
  const [addingTag, setAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState("")

  const commitTag = () => {
    const name = tagDraft.trim().slice(0, 8)
    if (meeting && name && !meeting.tags.includes(name) && meeting.tags.length < TAG_CAP) {
      onTagsChange([...meeting.tags, name])
    }
    setTagDraft("")
    setAddingTag(false)
  }
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] bg-primary text-primary-foreground">
          <FileTextMark />
        </div>
        <span className="font-[var(--font-display)] text-sm font-semibold tracking-tight text-foreground">
          会议纪要工作台
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleMobileNav}
        aria-label="打开会议列表"
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground md:hidden"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <button
        onClick={onOpenPalette}
        title="搜索会议、转写内容、行动项、决议、标签（⌘K / Ctrl+K）"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">搜索或跳转…</span>
        <kbd className="hidden rounded-[var(--radius-sm)] border border-border bg-background px-1 text-[9px] text-muted-foreground/80 sm:block cjk-latin">
          ⌘K
        </kbd>
      </button>

      {meeting ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="h-4 w-px bg-border" />
          <input
            value={meeting.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="会议标题"
            className="min-w-0 max-w-md flex-1 truncate rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1.5 py-1 text-[15px] font-semibold tracking-tight text-foreground outline-none transition-colors hover:border-border focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <input
              type="date"
              value={meeting.date}
              onChange={(e) => onDateChange(e.target.value)}
              className="rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground tabular-nums outline-none transition-colors hover:border-border focus-visible:border-primary"
            />
          </label>
          <select
            value={templates.some((t) => t.id === meeting.meetingKind) ? (meeting.meetingKind ?? "general") : "general"}
            onChange={(e) => onKindChange(e.target.value)}
            title="会议模板：决定 AI 摘要的组织视角，可在设置里修改模板文案、新增模板，或在纪要页从满意的摘要结构提取新模板"
            className="hidden shrink-0 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-1 py-0.5 text-xs text-muted-foreground outline-none transition-colors hover:border-border focus-visible:border-primary lg:block"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.builtin ? "" : "（自定义）"}
              </option>
            ))}
          </select>
          <div className="hidden shrink-0 items-center gap-1 md:flex">
            {meeting.tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-0.5 rounded-[var(--radius-pill)] bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {t}
                <button
                  onClick={() => onTagsChange(meeting.tags.filter((x) => x !== t))}
                  aria-label={`删除标签 ${t}`}
                  className="rounded-full p-px transition-colors hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {addingTag ? (
              <input
                autoFocus
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTag()
                  if (e.key === "Escape") {
                    setTagDraft("")
                    setAddingTag(false)
                  }
                }}
                onBlur={commitTag}
                placeholder="标签名"
                maxLength={8}
                className="h-5 w-16 rounded-[var(--radius-pill)] border border-primary bg-background px-2 text-[10px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            ) : meeting.tags.length < TAG_CAP ? (
              <button
                onClick={() => setAddingTag(true)}
                aria-label="添加标签"
                title="添加标签（用于搜索和导出归类，最多 6 个）"
                className="flex items-center rounded-[var(--radius-pill)] border border-dashed border-border p-0.5 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!meeting}
          onClick={onToggleGolden}
          aria-label={meeting?.golden ? "移出评估集" : "加入评估集"}
          title={
            meeting?.golden
              ? "已在评估集里：调提示词/换模型后可在「评估台」一键重跑并打分对比（点击移出）"
              : "加入评估集（golden set）：固定几场代表性会议当「考卷」，每次调提示词/换模型后重跑打分，质量变化可追踪"
          }
          className="h-8 w-8 rounded-[var(--radius-md)] p-0 text-muted-foreground hover:text-foreground"
        >
          <Star className={cn("h-4 w-4", meeting?.golden && "fill-amber-400 text-amber-500")} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenEval}
          title="评估台：用评估集重跑生成管线，人工四维打分（忠实度/覆盖率/可操作性/可读性），历史运行对比看质量趋势。桌面端功能，手机上不显示"
          className="hidden gap-1.5 rounded-[var(--radius-md)] text-muted-foreground hover:border-primary/40 hover:text-primary md:inline-flex"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          <span className="hidden md:inline">评估台{goldenCount > 0 ? `（${goldenCount}）` : ""}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!meeting}
          onClick={onOpenHistory}
          aria-label="会议历史"
          title="会议历史：这场会议的变更时间线（谁在什么时候改了什么）、行动项履历，以及回滚到任意时间点"
          className="h-8 w-8 rounded-[var(--radius-md)] p-0 text-muted-foreground hover:text-foreground"
        >
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!meeting}
          onClick={onExport}
          className="gap-1.5 rounded-[var(--radius-md)]"
        >
          <Download className="h-3.5 w-3.5" />
          导出 Markdown
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCycleTheme}
          aria-label={`主题：${THEME_LABELS[themeMode]}，点击切换`}
          title={`主题：${THEME_LABELS[themeMode]}（点击切换）`}
          className="h-8 w-8 rounded-[var(--radius-md)] p-0 text-muted-foreground hover:text-foreground"
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleRightPanel}
          aria-label={rightPanelOpen ? "收起上下文面板" : "展开上下文面板"}
          title={rightPanelOpen ? "收起上下文面板（]）" : "展开上下文面板（]）"}
          className={cn(
            "h-8 w-8 rounded-[var(--radius-md)] p-0 max-lg:hidden",
            rightPanelOpen ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenSettings}
          aria-label="设置"
          className="h-8 w-8 rounded-[var(--radius-md)] p-0 text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}

function FileTextMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  )
}
