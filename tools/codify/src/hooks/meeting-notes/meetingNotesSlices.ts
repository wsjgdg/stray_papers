// 分片订阅层的 context 定义与订阅 hook（纯类型 + context，无组件——与 Provider 分文件，
// 满足 react-refresh 对「组件文件只导出组件」的要求）。
// 分片按「变化频率」切分：组件只订阅自己需要的分片，高频瞬态（问答流式块 / 搜索击键 /
// 语义索引进度）不再触发整页树重渲染。原始值分片（booting / hasSelection / meetingCount）
// 借助 React 对 context 值的 Object.is 比较天然免重渲染。

import { createContext, useContext, type Dispatch, type SetStateAction } from "react"
import type { MeetingNotesLogic, TabKey } from "@/hooks/useMeetingNotes"
import type { SourceAnchor } from "@/lib/store"

// 页签顺序（数字键 1-8 直达用）：与 Workbench.tsx 的 TABS 数组顺序保持一致，
// 改 TABS 顺序时同步改这里
export const TAB_ORDER: TabKey[] = [
  "transcript",
  "summary",
  "actions",
  "decisions",
  "due",
  "timeline",
  "graph",
  "qa",
]

// ── 分片类型：全部从 facade 返回类型上 Pick，字段名与类型永远和 hook 对齐 ──

type SelectionSlice = Pick<MeetingNotesLogic, "meetings" | "selected" | "selectedId" | "openActionCount" | "pendingCount">
type ListSlice = Pick<
  MeetingNotesLogic,
  | "filteredMeetings" | "searchText" | "searchHasFuzzy" | "tagFilter" | "showArchived" | "archivedCount" | "archiveCandidates"
  | "listSort" | "setListSort"
>
type TagsSlice = Pick<MeetingNotesLogic, "allTags">
type FindSlice = Pick<MeetingNotesLogic, "finding" | "findError" | "findResults" | "findQuery">
type GenSlice = Pick<MeetingNotesLogic, "genBusy" | "generating" | "genError" | "genNotice">
type TranscriptSlice = Pick<
  MeetingNotesLogic,
  | "polishing" | "polishNotice" | "polishFidelity" | "speakerSuggestions" | "suggestBusy" | "duplicateWarning"
  | "translating" | "translateProgress" | "translateNotice"
>
type QaSlice = Pick<MeetingNotesLogic, "asking" | "askError" | "streamingBlocks" | "qaHistory" | "staleQaIds">
type ReviewSlice = Pick<
  MeetingNotesLogic,
  | "reviewReport" | "reviewBusy" | "reviewError"
  | "supportBusy" | "supportError" | "supportSummary"
  | "digestReport" | "digestBusy" | "digestError" | "pastOpenCount"
>
type InsightsSlice = Pick<
  MeetingNotesLogic,
  "themeReport" | "themesBusy" | "themesError" | "evolutionCache" | "evolutionBusy" | "evolutionError" | "entitiesBusy"
>
type EvalSlice = Pick<MeetingNotesLogic, "evalBusy" | "evalProgress" | "evalError" | "evalRuns" | "goldenCount">
type FollowSlice = Pick<MeetingNotesLogic, "dueGroups" | "dueCounts" | "workload">
type HintsSlice = Pick<MeetingNotesLogic, "relatedMeetings" | "pastDecisions" | "preBriefing" | "blockedNotifications">
type ArchiveSlice = Pick<MeetingNotesLogic, "settings" | "agents" | "templates" | "activity" | "modelOptions">
type StorageSlice = Pick<
  MeetingNotesLogic,
  | "storageError"
  | "storageSizeKb"
  | "storageQuotaKb"
  | "storageBackend"
  | "storagePersisted"
  | "recoveryNotice"
  | "dismissRecovery"
>
type SemanticSlice = Pick<MeetingNotesLogic, "semanticStatus" | "semanticProgress">
type UiSlice = Pick<MeetingNotesLogic, "activeTab" | "setActiveTab">
type CostSlice = Pick<MeetingNotesLogic, "costConfirm">

// 动作分片：全部回调。多数依赖 meetings，数据变更时一起换引用；
// 但高频瞬态（流式块 / 搜索击键 / 索引进度）不动 meetings，动作分片保持稳定
export type ActionsSlice = Pick<
  MeetingNotesLogic,
  | "selectMeeting" | "addMeeting" | "addSampleMeeting" | "removeMeeting"
  | "setSearchText" | "setTagFilter" | "setShowArchived" | "toggleArchive"
  | "markDecisionSuperseded" | "clearDecisionSuperseded"
  | "setTitle" | "setDate" | "setTranscript" | "setTags" | "setMeetingKind" | "setRecStartedAt"
  | "addNote" | "removeNote"
  | "generateFor" | "generateSummaryFor" | "generateActionsFor"
  | "dismissPolishFidelity" | "polishTranscriptFor" | "undoPolish" | "getHotwords"
  | "translateTranscriptFor" | "clearTranslation"
  | "reviewSummaryFor" | "applyReview" | "clearReview"
  | "checkSupportFor" | "clearSupportSummary"
  | "toggleGolden" | "evalBenchFor" | "saveEvalScores" | "setEvalRunLabel" | "deleteEvalRun"
  | "suggestSpeakersFor" | "applySpeakerSuggestions" | "cancelSpeakerSuggest"
  | "editBrief" | "editOutline"
  | "toggleAction" | "updateAction" | "removeAction" | "addActionManually"
  | "updateDecision" | "removeDecision"
  | "ask" | "findMeetings" | "clearFindResults" | "clearQaHistory" | "removeQaRecord"
  | "setSemanticEnabled" | "rebuildSemantic"
  | "analyzeThemes" | "digestFor" | "applyDigest" | "clearDigest"
  | "evolutionFor" | "extractEntitiesFor" | "jumpToMeetingActions"
  | "exportIssueDrafts" | "exportDecisionLog"
  | "setModel" | "setMinConfidence" | "setSummaryPersona" | "setFrameSummary"
  | "updateAgent" | "resetAgent"
  | "resolvePending" | "approveAllPending"
  | "updateTemplate" | "resetTemplate" | "deleteTemplate" | "extractTemplateFromMeeting"
  | "exportAll" | "exportAllMarkdownBundle" | "previewImport" | "confirmImport" | "cancelImport"
  // 存储域底层动作：会议历史对话框的回滚需要（应用补丁 + 记活动 + 立即落盘）
  | "patchMeeting" | "pushActivity" | "flushPersist"
>

// ── context 定义 ──

export const BootingCtx = createContext<boolean | null>(null)
export const HasSelectionCtx = createContext<boolean | null>(null)
export const MeetingCountCtx = createContext<number | null>(null)
export const UiCtx = createContext<UiSlice | null>(null)
export const SelectionCtx = createContext<SelectionSlice | null>(null)
export const ListCtx = createContext<ListSlice | null>(null)
export const TagsCtx = createContext<TagsSlice | null>(null)
export const FindCtx = createContext<FindSlice | null>(null)
export const GenCtx = createContext<GenSlice | null>(null)
export const TranscriptCtx = createContext<TranscriptSlice | null>(null)
export const QaCtx = createContext<QaSlice | null>(null)
export const ReviewCtx = createContext<ReviewSlice | null>(null)
export const InsightsCtx = createContext<InsightsSlice | null>(null)
export const EvalCtx = createContext<EvalSlice | null>(null)
export const FollowCtx = createContext<FollowSlice | null>(null)
export const HintsCtx = createContext<HintsSlice | null>(null)
export const ArchiveCtx = createContext<ArchiveSlice | null>(null)
export const StorageCtx = createContext<StorageSlice | null>(null)
export const SemanticCtx = createContext<SemanticSlice | null>(null)
export const ActionsCtx = createContext<ActionsSlice | null>(null)
export const CostCtx = createContext<CostSlice | null>(null)

function useSlice<T>(ctx: React.Context<T | null>, name: string): T {
  const v = useContext(ctx)
  if (v === null) throw new Error(`${name} 分片必须在 MeetingNotesProvider 内使用`)
  return v
}

export const useMnBooting = () => useSlice(BootingCtx, "booting")
export const useMnHasSelection = () => useSlice(HasSelectionCtx, "hasSelection")
export const useMnMeetingCount = () => useSlice(MeetingCountCtx, "meetingCount")
export const useMnUi = () => useSlice(UiCtx, "ui")
export const useMnSelection = () => useSlice(SelectionCtx, "selection")
export const useMnList = () => useSlice(ListCtx, "list")
export const useMnTags = () => useSlice(TagsCtx, "tags")
export const useMnFind = () => useSlice(FindCtx, "find")
export const useMnGen = () => useSlice(GenCtx, "gen")
export const useMnTranscript = () => useSlice(TranscriptCtx, "transcript")
export const useMnQa = () => useSlice(QaCtx, "qa")
export const useMnReview = () => useSlice(ReviewCtx, "review")
export const useMnInsights = () => useSlice(InsightsCtx, "insights")
export const useMnEval = () => useSlice(EvalCtx, "eval")
export const useMnFollow = () => useSlice(FollowCtx, "follow")
export const useMnHints = () => useSlice(HintsCtx, "hints")
export const useMnArchive = () => useSlice(ArchiveCtx, "archive")
export const useMnStorage = () => useSlice(StorageCtx, "storage")
export const useMnSemantic = () => useSlice(SemanticCtx, "semantic")
export const useMnActions = () => useSlice(ActionsCtx, "actions")
export const useMnCost = () => useSlice(CostCtx, "cost")


// ── 布局壳状态：三栏收展 / 双模式 / 弹层开关 / 出处定位目标 ──
// 独立于数据分片——这些都是低频的用户交互态，放在自己的 provider 里，
// 切换时只重渲染消费壳状态的分片，不触碰数据层

export type ViewMode = "read" | "compare"

export interface WorkbenchShell {
  leftCollapsed: boolean
  rightCollapsed: boolean
  mobileNav: boolean
  viewMode: ViewMode
  paletteOpen: boolean
  settingsOpen: boolean
  evalOpen: boolean
  helpOpen: boolean
  historyOpen: boolean
  locateTarget: SourceAnchor | null
  setLeftCollapsed: Dispatch<SetStateAction<boolean>>
  setRightCollapsed: Dispatch<SetStateAction<boolean>>
  setMobileNav: Dispatch<SetStateAction<boolean>>
  setViewMode: Dispatch<SetStateAction<ViewMode>>
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  setEvalOpen: Dispatch<SetStateAction<boolean>>
  setHelpOpen: Dispatch<SetStateAction<boolean>>
  setHistoryOpen: Dispatch<SetStateAction<boolean>>
  setLocateTarget: Dispatch<SetStateAction<SourceAnchor | null>>
}

export const ShellCtx = createContext<WorkbenchShell | null>(null)

export const useMnShell = () => useSlice(ShellCtx, "shell")

