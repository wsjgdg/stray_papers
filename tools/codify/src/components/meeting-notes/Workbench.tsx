// 工作台壳层：静态布局 + 一组「分片宿主」组件。
// 每个宿主都是 memo 的无 props 组件，数据全部经 context 分片订阅——
// 父级重渲染不波及它们，只有订阅的分片变化才重渲染对应宿主。
// 高频瞬态被隔离在最小范围：问答流式块只刷 QaHost、搜索击键只刷 LeftRailHost、
// 语义索引进度只刷设置对话框宿主。

import { Fragment, Suspense, lazy, memo, useEffect, useMemo, type ReactNode } from "react"
import {
  BookOpen,
  Columns2,
  GitBranch,
  CalendarClock,
  ListTodo,
  MessageCircleQuestion,
  Network,
  NotebookText,
  PanelLeftOpen,
  PanelRight,
  Plus,
  Scale,
  ScrollText,
  Search,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { CostConfirmDialog } from "@/components/rh/CostConfirmDialog"
import { TopBar } from "@/components/meeting-notes/TopBar"
import { MeetingList } from "@/components/meeting-notes/MeetingList"
import { RightPanel } from "@/components/meeting-notes/RightPanel"
import { CommandPalette } from "@/components/meeting-notes/CommandPalette"
import { TranscriptTab } from "@/components/meeting-notes/TranscriptTab"
import { SummaryTab } from "@/components/meeting-notes/SummaryTab"
import { ActionsTab } from "@/components/meeting-notes/ActionsTab"
import { DueTab } from "@/components/meeting-notes/DueTab"
import { TimelineTab } from "@/components/meeting-notes/TimelineTab"
import { GraphTab } from "@/components/meeting-notes/GraphTab"
import { DecisionsTab } from "@/components/meeting-notes/DecisionsTab"
import { QATab } from "@/components/meeting-notes/QATab"
import { SettingsDialog } from "@/components/meeting-notes/SettingsDialog"
// 低频对话框走路由外代码分割（lazy）：评估台与会议历史只有打开时才拉取 chunk，
// 首屏主包不带它们的代码（宿主在关闭态渲染 null，lazy 组件根本不会挂载）
const EvalBenchDialog = lazy(() =>
  import("@/components/meeting-notes/EvalBenchDialog").then((m) => ({ default: m.EvalBenchDialog })),
)
const MeetingHistoryDialog = lazy(() =>
  import("@/components/meeting-notes/MeetingHistoryDialog").then((m) => ({ default: m.MeetingHistoryDialog })),
)
import { WorkbenchUiProvider } from "@/hooks/meeting-notes/MeetingNotesContext"
import {
  useMnActions,
  useMnArchive,
  useMnBooting,
  useMnCost,
  useMnEval,
  useMnFind,
  useMnFollow,
  useMnGen,
  useMnHasSelection,
  useMnHints,
  useMnInsights,
  useMnList,
  useMnMeetingCount,
  useMnQa,
  useMnReview,
  useMnSelection,
  useMnSemantic,
  useMnShell,
  useMnStorage,
  useMnTags,
  useMnTranscript,
  useMnUi,
} from "@/hooks/meeting-notes/meetingNotesSlices"
import type { TabKey } from "@/hooks/useMeetingNotes"
import { useTheme } from "@/hooks/useTheme"
import { isOpenStatus, downloadMarkdown, todayStr } from "@/lib/store"
import { pushActionsToTarget } from "@/lib/integrations"
import { cn } from "@/lib/utils"

// 页签分两个维度：前四个是「会议级视图」（内容属于当前选中会议），
// 后四个是「全局视图」（跨所有会议）——用分隔线在视觉上区分，避免心智混乱
const TABS: { key: TabKey; label: string; icon: typeof ScrollText; scope: "meeting" | "global" }[] = [
  { key: "transcript", label: "转写文本", icon: ScrollText, scope: "meeting" },
  { key: "summary", label: "纪要", icon: NotebookText, scope: "meeting" },
  { key: "actions", label: "行动项", icon: ListTodo, scope: "meeting" },
  { key: "decisions", label: "决议", icon: Scale, scope: "meeting" },
  { key: "due", label: "跟进中心", icon: CalendarClock, scope: "global" },
  { key: "timeline", label: "时间线", icon: GitBranch, scope: "global" },
  { key: "graph", label: "图谱", icon: Network, scope: "global" },
  { key: "qa", label: "问答", icon: MessageCircleQuestion, scope: "global" },
]

// ── 顶栏 ──

const TopBarHost = memo(function TopBarHost() {
  const { selected } = useMnSelection()
  const { templates } = useMnArchive()
  const { goldenCount } = useMnEval()
  const { setTitle, setDate, setMeetingKind, setTags, toggleGolden } = useMnActions()
  const { rightCollapsed, setRightCollapsed, setSettingsOpen, setEvalOpen, setPaletteOpen, setMobileNav, setHistoryOpen } = useMnShell()
  const { mode: themeMode, cycle: cycleTheme } = useTheme()
  return (
    <TopBar
      meeting={selected}
      themeMode={themeMode}
      templates={templates}
      goldenCount={goldenCount}
      onTitleChange={(t) => selected && setTitle(selected.id, t)}
      onDateChange={(d) => selected && setDate(selected.id, d)}
      onKindChange={(k) => selected && setMeetingKind(selected.id, k)}
      onTagsChange={(tags) => selected && setTags(selected.id, tags)}
      onExport={() => selected && downloadMarkdown(selected)}
      onCycleTheme={cycleTheme}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenHistory={() => setHistoryOpen(true)}
      onToggleGolden={() => selected && toggleGolden(selected.id)}
      onOpenEval={() => setEvalOpen(true)}
      onOpenPalette={() => setPaletteOpen(true)}
      onToggleMobileNav={() => setMobileNav((v) => !v)}
      onToggleRightPanel={() => setRightCollapsed((v) => !v)}
      rightPanelOpen={!rightCollapsed}
    />
  )
})

// ── 存储故障横幅 + 崩溃恢复提示 ──

const StorageBannerHost = memo(function StorageBannerHost() {
  const { storageError, recoveryNotice, dismissRecovery } = useMnStorage()
  if (!storageError && !recoveryNotice) return null
  return (
    <>
      {storageError && (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-5 py-2 text-xs text-destructive">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {storageError}
        </div>
      )}
      {!storageError && recoveryNotice && (
        // 上次会话有关键操作在落盘确认前被打断：琥珀色提示（数据主体无恙，与红色故障横幅分级）
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-5 py-2 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{recoveryNotice}</span>
          <button
            type="button"
            onClick={dismissRecovery}
            className="shrink-0 rounded-md border border-amber-500/40 px-2 py-0.5 text-[11px] font-medium hover:bg-amber-500/10"
          >
            知道了
          </button>
        </div>
      )}
    </>
  )
})

// ── 左栏：会议列表 / 收起窄条 / 移动端抽屉 ──

const LeftRailHost = memo(function LeftRailHost() {
  const { leftCollapsed, setLeftCollapsed, mobileNav, setMobileNav, setPaletteOpen } = useMnShell()
  const {
    filteredMeetings, searchText, searchHasFuzzy, tagFilter, showArchived, archivedCount, archiveCandidates,
    listSort, setListSort,
  } = useMnList()
  const { selectedId } = useMnSelection()
  const { allTags } = useMnTags()
  const meetingCount = useMnMeetingCount()
  const { finding, findResults, findQuery } = useMnFind()
  const {
    setShowArchived, toggleArchive, findMeetings, clearFindResults,
    setTagFilter, setSearchText, selectMeeting, addMeeting, removeMeeting,
  } = useMnActions()

  const meetingList = (
    <MeetingList
      meetings={filteredMeetings}
      totalCount={meetingCount}
      selectedId={selectedId}
      searchText={searchText}
      searchHasFuzzy={searchHasFuzzy}
      allTags={allTags}
      tagFilter={tagFilter}
      showArchived={showArchived}
      archivedCount={archivedCount}
      archiveCandidateCount={archiveCandidates.length}
      listSort={listSort}
      onListSortChange={setListSort}
      onToggleShowArchived={setShowArchived}
      onToggleArchive={toggleArchive}
      findBusy={finding}
      findResults={findResults}
      findQuery={findQuery}
      onSemanticFind={() => findMeetings(searchText)}
      onClearFind={clearFindResults}
      onTagFilterChange={setTagFilter}
      onSearchChange={setSearchText}
      onSelect={(id) => {
        selectMeeting(id)
        setMobileNav(false)
      }}
      onCreate={addMeeting}
      onRemove={removeMeeting}
    />
  )

  return (
    <>
      {leftCollapsed ? (
        <div className="hidden w-11 shrink-0 flex-col items-center gap-2 border-r border-border bg-card py-3 md:flex">
          <button
            onClick={() => setLeftCollapsed(false)}
            aria-label="展开会议列表"
            title="展开会议列表（[）"
            className="rounded-[var(--radius-sm)] p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPaletteOpen(true)}
            aria-label="搜索与跳转"
            title="搜索与跳转（⌘K）"
            className="rounded-[var(--radius-sm)] p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
          <span
            className="mt-1 select-none text-[10px] text-muted-foreground/70 cjk-latin tabular-nums"
            style={{ writingMode: "vertical-rl" }}
          >
            {meetingCount} 场会议
          </span>
        </div>
      ) : (
        <div className="relative hidden shrink-0 md:block">
          <button
            onClick={() => setLeftCollapsed(true)}
            aria-label="收起会议列表"
            title="收起会议列表（[）——阅读长文时把屏幕留给内容"
            className="absolute -right-3 top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground md:flex"
          >
            <X className="h-3 w-3" />
          </button>
          {meetingList}
        </div>
      )}

      {/* 移动端抽屉：小屏下左栏默认收起，顶栏菜单唤出 */}
      {mobileNav ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="会议列表">
          <div className="absolute inset-0 bg-foreground/30" onClick={() => setMobileNav(false)} />
          <div className="absolute inset-y-0 left-0 flex max-w-[85vw]">{meetingList}</div>
        </div>
      ) : null}
    </>
  )
})

// ── 中栏：页签条 + 双模式 + 八个页签宿主 ──

const TabStripHost = memo(function TabStripHost() {
  const { activeTab, setActiveTab } = useMnUi()
  const { selected } = useMnSelection()
  const { dueCounts } = useMnFollow()
  const meetingCount = useMnMeetingCount()
  const { rightCollapsed, setRightCollapsed, viewMode, setViewMode } = useMnShell()
  if (!selected) return null
  const compareActive = viewMode === "compare" && (activeTab === "summary" || activeTab === "transcript")
  return (
    <div className="flex shrink-0 items-end gap-2 border-b border-border px-3 pt-2.5 pr-3">
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="会议视图">
        {TABS.map(({ key, label, icon: Icon, scope }, i) => {
          const active = key === activeTab
          // 会议级视图与全局视图之间的分隔线：提示两类页签的心智不同
          const divider = scope === "global" && TABS[i - 1]?.scope === "meeting"
          const badge =
            key === "actions"
              ? selected.actions.filter((a) => isOpenStatus(a.status)).length +
                (selected.pendingActions?.length ?? 0)
              : key === "due"
                ? dueCounts.overdue + dueCounts.today
                : key === "decisions"
                  ? selected.decisions.length
                  : 0
          const urgent = key === "due" && dueCounts.overdue > 0
          return (
            <Fragment key={key}>
              {divider ? (
                <span
                  aria-hidden
                  className="-mb-px mx-1 h-4 w-px shrink-0 self-center bg-border"
                  title="右侧为跨会议的全局视图"
                />
              ) : null}
              <button
                onClick={() => setActiveTab(key)}
                title={scope === "meeting" ? `会议级视图：只看当前这场会议` : `全局视图：跨全部 ${meetingCount} 场会议`}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2 text-[13px] transition-colors",
                  active
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "")} />
                {label}
                {badge > 0 ? (
                  <span
                    className={cn(
                      "rounded-[var(--radius-pill)] px-1.5 text-[10px] font-semibold cjk-latin tabular-nums",
                      urgent ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            </Fragment>
          )
        })}
      </nav>

      {/* 阅读 / 对照双模式：一键瞬时切换（快捷键 R / C），不用为「看原文还是看摘要」翻页签 */}
      {activeTab === "summary" || activeTab === "transcript" ? (
        <div
          className="mb-1.5 hidden shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] border border-border bg-background p-0.5 lg:flex"
          role="group"
          aria-label="阅读模式切换"
        >
          <button
            onClick={() => {
              setViewMode("read")
              setActiveTab("summary")
            }}
            title="阅读模式（R）：摘要在上、议题居中、原文折叠"
            className={cn(
              "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] transition-colors",
              !compareActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <BookOpen className="h-3 w-3" />
            阅读
            <kbd className="ml-0.5 text-[9px] opacity-60 cjk-latin">R</kbd>
          </button>
          <button
            onClick={() => {
              setViewMode("compare")
              setActiveTab("summary")
            }}
            title="对照模式（C）：转写与摘要并排，点击出处引用两侧联动定位"
            className={cn(
              "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] transition-colors",
              compareActive
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Columns2 className="h-3 w-3" />
            对照
            <kbd className="ml-0.5 text-[9px] opacity-60 cjk-latin">C</kbd>
          </button>
        </div>
      ) : null}

      <button
        onClick={() => setRightCollapsed((v) => !v)}
        aria-label={rightCollapsed ? "展开上下文面板" : "收起上下文面板"}
        title={rightCollapsed ? "展开上下文面板（]）" : "收起上下文面板（]）"}
        className={cn(
          "mb-1.5 hidden shrink-0 rounded-[var(--radius-sm)] p-1.5 transition-colors max-lg:hidden",
          rightCollapsed
            ? "text-muted-foreground hover:bg-muted hover:text-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        <PanelRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
})

const TranscriptHost = memo(function TranscriptHost() {
  const { selected } = useMnSelection()
  const { genBusy, genError } = useMnGen()
  const { polishing, polishNotice, polishFidelity, speakerSuggestions, suggestBusy, duplicateWarning, translating, translateProgress, translateNotice } = useMnTranscript()
  const { agents } = useMnArchive()
  const { pastDecisions, preBriefing } = useMnHints()
  const { locateTarget, setLocateTarget } = useMnShell()
  const {
    dismissPolishFidelity, selectMeeting, getHotwords, setTranscript, setRecStartedAt,
    polishTranscriptFor, undoPolish, suggestSpeakersFor, applySpeakerSuggestions,
    cancelSpeakerSuggest, addNote, removeNote, generateFor,
    translateTranscriptFor, clearTranslation,
  } = useMnActions()
  if (!selected) return null
  return (
    <TranscriptTab
      meeting={selected}
      summaryBusy={Boolean(genBusy.summary)}
      extractBusy={Boolean(genBusy.extract)}
      genError={genError}
      polishing={polishing}
      polishNotice={polishNotice}
      translating={translating}
      translateProgress={translateProgress}
      translateNotice={translateNotice}
      fidelity={polishFidelity && polishFidelity.meetingId === selected.id ? polishFidelity : null}
      onDismissFidelity={dismissPolishFidelity}
      speakerSuggestions={speakerSuggestions}
      suggestBusy={suggestBusy}
      annotateReviewThreshold={agents.annotate.reviewThreshold}
      pastDecisions={pastDecisions}
      locateTarget={locateTarget}
      onLocateClose={() => setLocateTarget(null)}
      duplicateWarning={duplicateWarning}
      onJumpToDuplicate={(id) => selectMeeting(id)}
      preBriefing={preBriefing}
      onJumpMeeting={(id) => selectMeeting(id)}
      getHotwords={getHotwords}
      onTranscriptChange={(t) => setTranscript(selected.id, t)}
      onRecordingStart={(at) => setRecStartedAt(selected.id, at)}
      onPolishTranscript={() => polishTranscriptFor(selected.id)}
      onUndoPolish={() => undoPolish(selected.id)}
      onTranslate={(lang) => translateTranscriptFor(selected.id, lang)}
      onClearTranslation={() => clearTranslation(selected.id)}
      onSuggestSpeakers={() => suggestSpeakersFor(selected.id)}
      onApplySpeakers={(accepted) => applySpeakerSuggestions(selected.id, accepted)}
      onCancelSuggest={cancelSpeakerSuggest}
      onAddNote={(text, label) => addNote(selected.id, text, label)}
      onRemoveNote={(noteId) => removeNote(selected.id, noteId)}
      onGenerate={() => generateFor(selected.id)}
    />
  )
})

// mode="compare"：对照模式的摘要侧（不显示「去行动项」入口，与并排布局一致）
const SummaryHost = memo(function SummaryHost({ mode }: { mode: "single" | "compare" }) {
  const { selected } = useMnSelection()
  const { genBusy, genNotice } = useMnGen()
  const { relatedMeetings } = useMnHints()
  const {
    reviewReport, reviewBusy, reviewError,
    digestReport, digestBusy, digestError, pastOpenCount,
  } = useMnReview()
  const { setActiveTab } = useMnUi()
  const {
    reviewSummaryFor, applyReview, clearReview, editBrief, editOutline,
    generateSummaryFor, selectMeeting, digestFor, applyDigest, clearDigest,
    extractTemplateFromMeeting,
  } = useMnActions()
  if (!selected) return null
  return (
    <SummaryTab
      meeting={selected}
      genNotice={genNotice}
      summaryBusy={Boolean(genBusy.summary)}
      relatedMeetings={relatedMeetings}
      pastOpenCount={pastOpenCount}
      digestReport={digestReport}
      digestBusy={digestBusy}
      digestError={digestError}
      reviewReport={reviewReport}
      reviewBusy={reviewBusy}
      reviewError={reviewError}
      onReviewSummary={() => reviewSummaryFor(selected.id)}
      onApplyReview={() => applyReview(selected.id)}
      onClearReview={clearReview}
      onEditBrief={(c) => editBrief(selected.id, c)}
      onEditOutline={(t) => editOutline(selected.id, t)}
      onGoTranscript={() => setActiveTab("transcript")}
      onRegenerate={() => generateSummaryFor(selected.id)}
      onJumpMeeting={(id) => selectMeeting(id)}
      onDigest={() => digestFor(selected.id)}
      onApplyDigest={applyDigest}
      onClearDigest={clearDigest}
      onExtractTemplate={(label) => extractTemplateFromMeeting(selected.id, label)}
      {...(mode === "single" ? { onGoActions: () => setActiveTab("actions") } : {})}
    />
  )
})

const ActionsHost = memo(function ActionsHost() {
  const { selected, meetings } = useMnSelection()
  const { genBusy } = useMnGen()
  const { supportBusy, supportError, supportSummary } = useMnReview()
  const { setActiveTab } = useMnUi()
  const { setLocateTarget } = useMnShell()
  const {
    checkSupportFor, clearSupportSummary, toggleAction, updateAction, removeAction,
    addActionManually, updateDecision, removeDecision, resolvePending, approveAllPending,
    generateActionsFor,
  } = useMnActions()
  // 全库历史负责人（去重）：行动项行内改派时的快速切换候选
  const assigneeOptions = useMemo(() => {
    const set = new Set<string>()
    for (const m of meetings) {
      for (const a of m.actions) if (a.assignee.trim()) set.add(a.assignee.trim())
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"))
  }, [meetings])
  if (!selected) return null
  return (
    <ActionsTab
      meeting={selected}
      extractBusy={Boolean(genBusy.extract)}
      supportBusy={supportBusy}
      supportError={supportError}
      supportSummary={supportSummary}
      assigneeOptions={assigneeOptions}
      onCheckSupport={() => checkSupportFor(selected.id)}
      onDismissSupport={clearSupportSummary}
      onToggle={(aid) => toggleAction(selected.id, aid)}
      onUpdateAction={(aid, patch) => updateAction(selected.id, aid, patch)}
      onRemoveAction={(aid) => removeAction(selected.id, aid)}
      onAddAction={() => addActionManually(selected.id)}
      onUpdateDecision={(did, patch) => updateDecision(selected.id, did, patch)}
      onRemoveDecision={(did) => removeDecision(selected.id, did)}
      onResolvePending={(aid, accept) => resolvePending(selected.id, aid, accept)}
      onApproveAllPending={() => approveAllPending(selected.id)}
      onGoTranscript={() => setActiveTab("transcript")}
      onRegenerate={() => generateActionsFor(selected.id)}
      onQuoteJump={(anchor) => {
        // 行动项页签下不可能处于对照布局（对照只覆盖转写/摘要页签），直接切页定位
        setLocateTarget(anchor)
        setActiveTab("transcript")
      }}
    />
  )
})

const DecisionsHost = memo(function DecisionsHost() {
  const { meetings } = useMnSelection()
  const { setLocateTarget } = useMnShell()
  const { setActiveTab } = useMnUi()
  const { selectMeeting, markDecisionSuperseded, clearDecisionSuperseded } = useMnActions()
  return (
    <DecisionsTab
      meetings={meetings}
      onOpenSource={(mid, anchor) => {
        selectMeeting(mid)
        setLocateTarget(anchor ?? null)
        setActiveTab("transcript")
      }}
      onMarkSuperseded={markDecisionSuperseded}
      onClearSuperseded={clearDecisionSuperseded}
    />
  )
})

const DueHost = memo(function DueHost() {
  const { dueGroups, dueCounts, workload } = useMnFollow()
  const { meetings } = useMnSelection()
  const { themeReport, themesBusy, themesError } = useMnInsights()
  const { analyzeThemes, toggleAction, jumpToMeetingActions, exportIssueDrafts, exportDecisionLog } = useMnActions()
  return (
    <DueTab
      groups={dueGroups}
      counts={dueCounts}
      workload={workload}
      meetings={meetings}
      themeReport={themeReport}
      themesBusy={themesBusy}
      themesError={themesError}
      onAnalyzeThemes={analyzeThemes}
      onToggle={(mid, aid) => toggleAction(mid, aid)}
      onJump={jumpToMeetingActions}
      onExportActions={() => void pushActionsToTarget(meetings)}
      onExportIssueDrafts={exportIssueDrafts}
      onExportDecisionLog={exportDecisionLog}
    />
  )
})

const TimelineHost = memo(function TimelineHost() {
  const { meetings, selectedId } = useMnSelection()
  const { evolutionCache, evolutionBusy, evolutionError } = useMnInsights()
  const { setActiveTab } = useMnUi()
  const { evolutionFor, selectMeeting } = useMnActions()
  return (
    <TimelineTab
      meetings={meetings}
      selectedId={selectedId}
      evolutionCache={evolutionCache}
      evolutionBusy={evolutionBusy}
      evolutionError={evolutionError}
      onGenerateEvolution={evolutionFor}
      onJump={(id) => {
        selectMeeting(id)
        setActiveTab("summary")
      }}
    />
  )
})

const GraphHost = memo(function GraphHost() {
  const { meetings } = useMnSelection()
  const { entitiesBusy } = useMnInsights()
  const { setActiveTab } = useMnUi()
  const { extractEntitiesFor, selectMeeting } = useMnActions()
  return (
    <GraphTab
      meetings={meetings}
      entitiesBusy={entitiesBusy}
      onJumpMeeting={(id) => {
        selectMeeting(id)
        setActiveTab("summary")
      }}
      onExtractEntities={extractEntitiesFor}
    />
  )
})

const QaHost = memo(function QaHost() {
  const { asking, askError, streamingBlocks, qaHistory, staleQaIds } = useMnQa()
  const { finding, findError, findResults, findQuery } = useMnFind()
  const { allTags } = useMnTags()
  const meetingCount = useMnMeetingCount()
  const { setActiveTab } = useMnUi()
  const { ask, findMeetings, clearFindResults, removeQaRecord, clearQaHistory, selectMeeting } = useMnActions()
  return (
    <QATab
      meetingCount={meetingCount}
      allTags={allTags}
      asking={asking}
      askError={askError}
      streamingBlocks={streamingBlocks}
      qaHistory={qaHistory}
      finding={finding}
      findError={findError}
      findResults={findResults}
      findQuery={findQuery}
      staleIds={staleQaIds}
      onAsk={ask}
      onFind={findMeetings}
      onClearFind={clearFindResults}
      onRemoveRecord={removeQaRecord}
      onJumpMeeting={(id) => {
        selectMeeting(id)
        setActiveTab("summary")
      }}
      onClearHistory={clearQaHistory}
    />
  )
})

const EmptyStateHost = memo(function EmptyStateHost() {
  const { addMeeting, addSampleMeeting } = useMnActions()
  const { setSettingsOpen } = useMnShell()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-primary/10 text-primary">
        <NotebookText className="h-6 w-6" />
      </div>
      <div>
        <p className="font-[var(--font-display)] text-lg font-semibold tracking-tight text-foreground text-balance">
          你的私人会议档案
        </p>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground text-pretty">
          粘贴转写文本，自动生成一句话摘要、分议题纪要、带原文引用的行动项与决议；所有数据只存在你的浏览器里
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          onClick={() => addMeeting("", todayStr())}
          className="gap-1.5 rounded-[var(--radius-md)] bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--elev-ring)] hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          新建会议
        </Button>
        <Button
          variant="outline"
          onClick={addSampleMeeting}
          title="载入一场虚构的产品周会：转写稿、摘要、议题、行动项、决议一应俱全，先看看完整形态再上手"
          className="gap-1.5 rounded-[var(--radius-md)] text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Sparkles className="h-4 w-4" />
          载入示例会议
        </Button>
        <Button
          variant="outline"
          onClick={() => setSettingsOpen(true)}
          className="gap-1.5 rounded-[var(--radius-md)] text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Upload className="h-4 w-4" />
          导入备份
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        快捷键：<kbd className="rounded-[var(--radius-sm)] border border-border px-1 cjk-latin">⌘K</kbd> 搜索 ·{" "}
        <kbd className="rounded-[var(--radius-sm)] border border-border px-1 cjk-latin">↑↓</kbd> 导航列表 ·{" "}
        <kbd className="rounded-[var(--radius-sm)] border border-border px-1 cjk-latin">R</kbd> 阅读 ·{" "}
        <kbd className="rounded-[var(--radius-sm)] border border-border px-1 cjk-latin">C</kbd> 对照 ·{" "}
        <kbd className="rounded-[var(--radius-sm)] border border-border px-1 cjk-latin">?</kbd> 全部快捷键
      </p>
    </div>
  )
})

// 中栏容器：只订阅页签与视图模式，切页签不重渲染数据宿主（memo 兜住）
const CenterHost = memo(function CenterHost() {
  const { activeTab } = useMnUi()
  const hasSelection = useMnHasSelection()
  const { viewMode } = useMnShell()
  const compareActive = viewMode === "compare" && hasSelection && (activeTab === "summary" || activeTab === "transcript")

  if (!hasSelection) {
    return (
      <main className="flex min-w-0 flex-1 flex-col">
        <EmptyStateHost />
      </main>
    )
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <TabStripHost />
      {compareActive ? (
        // 对照模式：转写（左）与摘要（右）并排，出处引用点击即在左侧精确选中定位
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <section className="flex min-h-0 flex-col md:border-r md:border-border" aria-label="转写原文">
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/60 bg-card/50 px-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ScrollText className="h-3 w-3" />
              转写原文
              <span className="ml-auto hidden font-normal normal-case tracking-normal text-muted-foreground/70 md:block">
                点击摘要或行动项里的出处引用，这里会精确选中对应片段
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <TranscriptHost />
            </div>
          </section>
          <section className="hidden min-h-0 flex-col md:flex" aria-label="摘要对照">
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/60 bg-card/50 px-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <NotebookText className="h-3 w-3" />
              摘要对照
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <SummaryHost mode="compare" />
            </div>
          </section>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {activeTab === "transcript" ? <TranscriptHost /> : null}
          {activeTab === "summary" ? <SummaryHost mode="single" /> : null}
          {activeTab === "actions" ? <ActionsHost /> : null}
          {activeTab === "decisions" ? <DecisionsHost /> : null}
          {activeTab === "due" ? <DueHost /> : null}
          {activeTab === "timeline" ? <TimelineHost /> : null}
          {activeTab === "graph" ? <GraphHost /> : null}
          {activeTab === "qa" ? <QaHost /> : null}
        </div>
      )}
    </main>
  )
})

// ── 右栏：上下文面板 ──

const RightHost = memo(function RightHost() {
  const { rightCollapsed, setRightCollapsed } = useMnShell()
  const { selected } = useMnSelection()
  const { activeTab } = useMnUi()
  const { relatedMeetings } = useMnHints()
  const { workload, dueCounts } = useMnFollow()
  const { activity } = useMnArchive()
  const { allTags } = useMnTags()
  const meetingCount = useMnMeetingCount()
  const { selectMeeting } = useMnActions()
  if (rightCollapsed) return null
  return (
    <RightPanel
      meeting={selected}
      activeTab={activeTab}
      relatedMeetings={relatedMeetings}
      workload={workload}
      activity={activity}
      dueCounts={dueCounts}
      meetingCount={meetingCount}
      allTags={allTags}
      onJumpMeeting={(id) => selectMeeting(id)}
      onCollapse={() => setRightCollapsed(true)}
    />
  )
})

// ── 弹层：命令面板 / 设置 / 评估台 / 成本确认 ──

const PaletteHost = memo(function PaletteHost() {
  const { paletteOpen, setPaletteOpen, setLocateTarget } = useMnShell()
  const { meetings } = useMnSelection()
  const { allTags } = useMnTags()
  const { setActiveTab } = useMnUi()
  const { selectMeeting, setTagFilter, setSearchText } = useMnActions()
  if (!paletteOpen) return null
  return (
    <CommandPalette
      open
      onClose={() => setPaletteOpen(false)}
      meetings={meetings}
      allTags={allTags}
      onJump={(id, tab, anchor) => {
        selectMeeting(id)
        setLocateTarget(anchor ?? null)
        setActiveTab(tab)
      }}
      onFilterTag={(tag) => {
        setTagFilter(tag)
        setSearchText("")
      }}
      onOpenQa={() => setActiveTab("qa")}
    />
  )
})

const SettingsDialogHost = memo(function SettingsDialogHost() {
  const { settingsOpen, setSettingsOpen } = useMnShell()
  const { settings, agents, templates, activity, modelOptions } = useMnArchive()
  const { storagePersisted, storageSizeKb, storageQuotaKb } = useMnStorage()
  const { semanticStatus, semanticProgress } = useMnSemantic()
  const { meetings } = useMnSelection()
  const meetingCount = useMnMeetingCount()
  const {
    updateAgent, resetAgent, updateTemplate, resetTemplate, deleteTemplate,
    setModel, setMinConfidence, setFrameSummary, setSummaryPersona,
    exportAll, exportAllMarkdownBundle, previewImport, confirmImport, cancelImport,
    setSemanticEnabled, rebuildSemantic,
  } = useMnActions()
  return (
    <SettingsDialog
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      model={settings.model}
      minConfidence={settings.minConfidence}
      modelOptions={modelOptions}
      agents={agents}
      onAgentChange={updateAgent}
      onAgentReset={resetAgent}
      meetingCount={meetingCount}
      meetings={meetings}
      lastBackupAt={settings.lastBackupAt}
      storagePersisted={storagePersisted}
      storageSizeKb={storageSizeKb}
      storageQuotaKb={storageQuotaKb}
      templates={templates}
      onUpdateTemplate={updateTemplate}
      onResetTemplate={resetTemplate}
      onDeleteTemplate={deleteTemplate}
      onModelChange={setModel}
      onThresholdChange={setMinConfidence}
      frameSummary={settings.frameSummary !== false}
      summaryPersona={settings.summaryPersona ?? "neutral"}
      onFrameChange={setFrameSummary}
      onPersonaChange={setSummaryPersona}
      onExportAll={exportAll}
      onExportAllMarkdown={exportAllMarkdownBundle}
      onPreviewImport={previewImport}
      onConfirmImport={confirmImport}
      onCancelImport={cancelImport}
      activity={activity}
      semanticEnabled={settings.semanticEnabled === true}
      semanticStatus={semanticStatus}
      semanticProgress={semanticProgress}
      onToggleSemantic={setSemanticEnabled}
      onRebuildSemantic={rebuildSemantic}
    />
  )
})

const EvalDialogHost = memo(function EvalDialogHost() {
  const { evalOpen, setEvalOpen } = useMnShell()
  const { evalBusy, evalProgress, evalError, evalRuns } = useMnEval()
  const { meetings } = useMnSelection()
  const { toggleGolden, evalBenchFor, saveEvalScores, setEvalRunLabel, deleteEvalRun } = useMnActions()
  if (!evalOpen) return null // 关闭态不挂载 lazy 组件——chunk 不拉取
  return (
    <Suspense fallback={null}>
      <EvalBenchDialog
        open={evalOpen}
        onClose={() => setEvalOpen(false)}
        meetings={meetings}
        evalBusy={evalBusy}
        evalProgress={evalProgress}
        evalError={evalError}
        evalRuns={evalRuns}
        onToggleGolden={toggleGolden}
        onRun={evalBenchFor}
        onSaveScores={saveEvalScores}
        onSetLabel={setEvalRunLabel}
        onDeleteRun={deleteEvalRun}
      />
    </Suspense>
  )
})

const CostConfirmHost = memo(function CostConfirmHost() {
  const { costConfirm } = useMnCost()
  return <CostConfirmDialog {...costConfirm} />
})

// ── 会议历史对话框：事件时间线 / 条目履历 / 时间点回滚（lib/eventJournal.ts）──

const HistoryDialogHost = memo(function HistoryDialogHost() {
  const { historyOpen, setHistoryOpen } = useMnShell()
  const { selected } = useMnSelection()
  const { patchMeeting, pushActivity, flushPersist } = useMnActions()
  if (!historyOpen) return null // 关闭态不挂载 lazy 组件——chunk 不拉取
  return (
    <Suspense fallback={null}>
      <MeetingHistoryDialog
        meeting={selected}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRevert={(patch, label) => {
          if (!selected) return
          // 回滚 = 一次普通的字段补丁写入：自动进事件日志（回滚本身也可追溯）、
          // 记活动、立即落盘（不等防抖窗口）
          patchMeeting(selected.id, patch)
          pushActivity("历史回滚", selected.title, label)
          void flushPersist()
        }}
      />
    </Suspense>
  )
})

// ── 键盘导航宿主（数据域按键）：↑↓ / J K 在会议列表里移动选中，Enter 打开纪要阅读 ──
// 壳 Provider 只管布局键（⌘K / R C / [ ] / 1-8 / / E ?），列表导航需要订阅数据分片，
// 单独一个 memo 宿主承载——渲染 null，只挂全局监听。
// 让位规则：行动项页签的 ↑↓ 归 ActionsTab 的行内光标（那里 D=完成、E=编辑条目）；
// 输入框聚焦 / 输入法组合 / 弹层打开时一律不触发（与壳 Provider 同一套守卫口径）。

const KeyboardNavHost = memo(function KeyboardNavHost() {
  const { filteredMeetings } = useMnList()
  const { selectedId } = useMnSelection()
  const { activeTab, setActiveTab } = useMnUi()
  const { selectMeeting } = useMnActions()
  const { paletteOpen, settingsOpen, evalOpen, helpOpen, historyOpen, setViewMode } = useMnShell()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.isComposing || e.keyCode === 229) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      )
        return
      if (paletteOpen || settingsOpen || evalOpen || helpOpen || historyOpen) return
      if (filteredMeetings.length === 0) return
      const idx = filteredMeetings.findIndex((m) => m.id === selectedId)
      const down = e.key === "ArrowDown" || e.key === "j"
      const up = e.key === "ArrowUp" || e.key === "k"
      if (activeTab !== "actions" && (down || up)) {
        // 行动项页签让位给行内光标；其余页签 ↑↓ 都是会议列表导航
        e.preventDefault()
        const next = down
          ? Math.min(idx + 1, filteredMeetings.length - 1)
          : idx <= 0
            ? 0
            : idx - 1
        const target = filteredMeetings[next < 0 ? 0 : next]
        if (target && target.id !== selectedId) {
          selectMeeting(target.id)
          // 非虚拟段也要保证选中行在视口内（虚拟列表由 MeetingList 自己的滚动同步兜底）
          requestAnimationFrame(() => {
            document
              .querySelector(`[data-meeting-row="${target.id}"]`)
              ?.scrollIntoView({ block: "nearest" })
          })
        }
        return
      }
      if (e.key === "Enter" && idx >= 0) {
        // Enter = 打开：进入当前会议的纪要阅读视图
        e.preventDefault()
        setViewMode("read")
        setActiveTab("summary")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [filteredMeetings, selectedId, activeTab, paletteOpen, settingsOpen, evalOpen, helpOpen, historyOpen, selectMeeting, setActiveTab, setViewMode])
  return null
})

// ── 快捷键帮助（? 唤出）：全部按键一屏可查，Esc / 点背景关闭 ──

const HELP_ROWS: [string, string][] = [
  ["⌘K / Ctrl+K", "命令面板：搜索会议、行动项、决议、标签并直达"],
  ["?", "打开 / 关闭本帮助"],
  ["/", "聚焦左栏搜索框（左栏收起时自动展开）"],
  ["↑ ↓ 或 J K", "会议列表上下移动选中（行动项页签内为移动条目光标）"],
  ["Enter", "打开选中会议的纪要阅读视图"],
  ["1 - 8", "切换页签：转写 / 纪要 / 行动项 / 决议 / 跟进 / 时间线 / 图谱 / 问答"],
  ["E", "跳到转写页签并聚焦编辑框（行动项页签内为编辑光标条目内容）"],
  ["D", "行动项页签内：完成 / 取消完成光标所在条目"],
  ["R", "阅读模式"],
  ["C", "对照模式（转写与摘要并排）"],
  ["[  /  ]", "收起 / 展开左栏、右栏"],
  ["Esc", "关闭弹层；清空搜索；退出光标选择"],
]

const HelpHost = memo(function HelpHost() {
  const { helpOpen, setHelpOpen } = useMnShell()
  if (!helpOpen) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setHelpOpen(false)}
      role="dialog"
      aria-label="键盘快捷键帮助"
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-[var(--elev-ring)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-[var(--font-display)] text-sm font-semibold tracking-tight text-foreground">
            键盘快捷键
          </h2>
          <button
            onClick={() => setHelpOpen(false)}
            aria-label="关闭帮助"
            className="rounded-[var(--radius-sm)] p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          熟练后全程可以不碰鼠标；输入框聚焦或中文输入法组词时快捷键自动让位
        </p>
        <dl className="mt-3 space-y-1.5">
          {HELP_ROWS.map(([key, desc]) => (
            <div key={key} className="flex items-baseline gap-3">
              <dt className="w-28 shrink-0 text-right">
                <kbd className="rounded-[var(--radius-sm)] border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground cjk-latin">
                  {key}
                </kbd>
              </dt>
              <dd className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
})

// ── 装载闸门：数据从 IndexedDB 分片解压异步拼装，装载完成前显示载入态 ──

function BootGate({ children }: { children: ReactNode }) {
  const booting = useMnBooting()
  if (booting) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <NotebookText className="h-6 w-6 animate-pulse" />
        <p className="text-sm">正在载入会议档案…</p>
      </div>
    )
  }
  return <>{children}</>
}

// ── 静态壳：本组件不订阅任何高频分片，渲染一次后不再更新 ──

function WorkbenchShell() {
  return (
    <BootGate>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TopBarHost />
        <StorageBannerHost />
        <div className="flex min-h-0 flex-1">
          <LeftRailHost />
          <CenterHost />
          <RightHost />
        </div>
        <KeyboardNavHost />
        <PaletteHost />
        <HelpHost />
        <SettingsDialogHost />
        <EvalDialogHost />
        <HistoryDialogHost />
        <CostConfirmHost />
      </div>
    </BootGate>
  )
}

export function Workbench() {
  return (
    <WorkbenchUiProvider>
      <WorkbenchShell />
    </WorkbenchUiProvider>
  )
}
