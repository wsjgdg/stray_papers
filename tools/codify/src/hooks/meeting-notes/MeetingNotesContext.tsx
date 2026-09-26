// 分片订阅层的 Provider：MeetingNotesProvider 调用一次 useMeetingNotes（唯一状态源不变），
// 把返回对象装进各分片 context；WorkbenchUiProvider 持有布局壳状态（三栏收展 / 双模式 /
// 弹层开关 / 出处定位）与全局快捷键。两个 Provider 都只渲染 {children}——自身重渲染
// 不会波及界面树，订阅者只在所属分片变化时更新。

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useMeetingNotes } from "@/hooks/useMeetingNotes"
import type { SourceAnchor } from "@/lib/store"
import {
  ActionsCtx,
  ArchiveCtx,
  BootingCtx,
  CostCtx,
  EvalCtx,
  FindCtx,
  FollowCtx,
  GenCtx,
  HasSelectionCtx,
  HintsCtx,
  InsightsCtx,
  ListCtx,
  MeetingCountCtx,
  QaCtx,
  ReviewCtx,
  SelectionCtx,
  SemanticCtx,
  ShellCtx,
  StorageCtx,
  TAB_ORDER,
  TagsCtx,
  TranscriptCtx,
  UiCtx,
  useMnHasSelection,
  useMnUi,
  type ActionsSlice,
  type ViewMode,
  type WorkbenchShell,
} from "@/hooks/meeting-notes/meetingNotesSlices"

export function MeetingNotesProvider({ children }: { children: ReactNode }) {
  const logic = useMeetingNotes()

  const booting = logic.booting
  const hasSelection = Boolean(logic.selected)
  const meetingCount = logic.meetings.length

  const ui = useMemo(() => ({ activeTab: logic.activeTab, setActiveTab: logic.setActiveTab }), [logic.activeTab, logic.setActiveTab])
  const selection = useMemo(
    () => ({
      meetings: logic.meetings,
      selected: logic.selected,
      selectedId: logic.selectedId,
      openActionCount: logic.openActionCount,
      pendingCount: logic.pendingCount,
    }),
    [logic.meetings, logic.selected, logic.selectedId, logic.openActionCount, logic.pendingCount],
  )
  const list = useMemo(
    () => ({
      filteredMeetings: logic.filteredMeetings,
      searchText: logic.searchText,
      searchHasFuzzy: logic.searchHasFuzzy,
      tagFilter: logic.tagFilter,
      showArchived: logic.showArchived,
      archivedCount: logic.archivedCount,
      archiveCandidates: logic.archiveCandidates,
      listSort: logic.listSort,
      setListSort: logic.setListSort,
    }),
    [
      logic.filteredMeetings, logic.searchText, logic.searchHasFuzzy, logic.tagFilter,
      logic.showArchived, logic.archivedCount, logic.archiveCandidates,
      logic.listSort, logic.setListSort,
    ],
  )
  const tags = useMemo(() => ({ allTags: logic.allTags }), [logic.allTags])
  const find = useMemo(
    () => ({ finding: logic.finding, findError: logic.findError, findResults: logic.findResults, findQuery: logic.findQuery }),
    [logic.finding, logic.findError, logic.findResults, logic.findQuery],
  )
  const gen = useMemo(
    () => ({ genBusy: logic.genBusy, generating: logic.generating, genError: logic.genError, genNotice: logic.genNotice }),
    [logic.genBusy, logic.generating, logic.genError, logic.genNotice],
  )
  const transcript = useMemo(
    () => ({
      polishing: logic.polishing,
      polishNotice: logic.polishNotice,
      polishFidelity: logic.polishFidelity,
      speakerSuggestions: logic.speakerSuggestions,
      suggestBusy: logic.suggestBusy,
      duplicateWarning: logic.duplicateWarning,
      translating: logic.translating,
      translateProgress: logic.translateProgress,
      translateNotice: logic.translateNotice,
    }),
    [
      logic.polishing, logic.polishNotice, logic.polishFidelity, logic.speakerSuggestions,
      logic.suggestBusy, logic.duplicateWarning,
      logic.translating, logic.translateProgress, logic.translateNotice,
    ],
  )
  const qa = useMemo(
    () => ({
      asking: logic.asking,
      askError: logic.askError,
      streamingBlocks: logic.streamingBlocks,
      qaHistory: logic.qaHistory,
      staleQaIds: logic.staleQaIds,
    }),
    [logic.asking, logic.askError, logic.streamingBlocks, logic.qaHistory, logic.staleQaIds],
  )
  const review = useMemo(
    () => ({
      reviewReport: logic.reviewReport,
      reviewBusy: logic.reviewBusy,
      reviewError: logic.reviewError,
      supportBusy: logic.supportBusy,
      supportError: logic.supportError,
      supportSummary: logic.supportSummary,
      digestReport: logic.digestReport,
      digestBusy: logic.digestBusy,
      digestError: logic.digestError,
      pastOpenCount: logic.pastOpenCount,
    }),
    [
      logic.reviewReport, logic.reviewBusy, logic.reviewError,
      logic.supportBusy, logic.supportError, logic.supportSummary,
      logic.digestReport, logic.digestBusy, logic.digestError, logic.pastOpenCount,
    ],
  )
  const insights = useMemo(
    () => ({
      themeReport: logic.themeReport,
      themesBusy: logic.themesBusy,
      themesError: logic.themesError,
      evolutionCache: logic.evolutionCache,
      evolutionBusy: logic.evolutionBusy,
      evolutionError: logic.evolutionError,
      entitiesBusy: logic.entitiesBusy,
    }),
    [
      logic.themeReport, logic.themesBusy, logic.themesError,
      logic.evolutionCache, logic.evolutionBusy, logic.evolutionError, logic.entitiesBusy,
    ],
  )
  const evalSlice = useMemo(
    () => ({
      evalBusy: logic.evalBusy,
      evalProgress: logic.evalProgress,
      evalError: logic.evalError,
      evalRuns: logic.evalRuns,
      goldenCount: logic.goldenCount,
    }),
    [logic.evalBusy, logic.evalProgress, logic.evalError, logic.evalRuns, logic.goldenCount],
  )
  const follow = useMemo(
    () => ({ dueGroups: logic.dueGroups, dueCounts: logic.dueCounts, workload: logic.workload }),
    [logic.dueGroups, logic.dueCounts, logic.workload],
  )
  const hints = useMemo(
    () => ({
      relatedMeetings: logic.relatedMeetings,
      pastDecisions: logic.pastDecisions,
      preBriefing: logic.preBriefing,
      blockedNotifications: logic.blockedNotifications,
    }),
    [logic.relatedMeetings, logic.pastDecisions, logic.preBriefing, logic.blockedNotifications],
  )
  const archive = useMemo(
    () => ({
      settings: logic.settings,
      agents: logic.agents,
      templates: logic.templates,
      activity: logic.activity,
      modelOptions: logic.modelOptions,
    }),
    [logic.settings, logic.agents, logic.templates, logic.activity, logic.modelOptions],
  )
  const storage = useMemo(
    () => ({
      storageError: logic.storageError,
      storageSizeKb: logic.storageSizeKb,
      storageQuotaKb: logic.storageQuotaKb,
      storageBackend: logic.storageBackend,
      storagePersisted: logic.storagePersisted,
      recoveryNotice: logic.recoveryNotice,
      dismissRecovery: logic.dismissRecovery,
    }),
    [
      logic.storageError,
      logic.storageSizeKb,
      logic.storageQuotaKb,
      logic.storageBackend,
      logic.storagePersisted,
      logic.recoveryNotice,
      logic.dismissRecovery,
    ],
  )
  const semantic = useMemo(
    () => ({ semanticStatus: logic.semanticStatus, semanticProgress: logic.semanticProgress }),
    [logic.semanticStatus, logic.semanticProgress],
  )
  const cost = useMemo(() => ({ costConfirm: logic.costConfirm }), [logic.costConfirm])

  const {
    selectMeeting, addMeeting, addSampleMeeting, removeMeeting,
    setSearchText, setTagFilter, setShowArchived, toggleArchive,
    markDecisionSuperseded, clearDecisionSuperseded,
    setTitle, setDate, setTranscript, setTags, setMeetingKind, setRecStartedAt,
    addNote, removeNote,
    generateFor, generateSummaryFor, generateActionsFor,
    dismissPolishFidelity, polishTranscriptFor, undoPolish, getHotwords,
    translateTranscriptFor, clearTranslation,
    reviewSummaryFor, applyReview, clearReview,
    checkSupportFor, clearSupportSummary,
    toggleGolden, evalBenchFor, saveEvalScores, setEvalRunLabel, deleteEvalRun,
    suggestSpeakersFor, applySpeakerSuggestions, cancelSpeakerSuggest,
    editBrief, editOutline,
    toggleAction, updateAction, removeAction, addActionManually,
    updateDecision, removeDecision,
    ask, findMeetings, clearFindResults, clearQaHistory, removeQaRecord,
    setSemanticEnabled, rebuildSemantic,
    analyzeThemes, digestFor, applyDigest, clearDigest,
    evolutionFor, extractEntitiesFor, jumpToMeetingActions,
    exportIssueDrafts, exportDecisionLog,
    setModel, setMinConfidence, setSummaryPersona, setFrameSummary,
    updateAgent, resetAgent,
    resolvePending, approveAllPending,
    updateTemplate, resetTemplate, deleteTemplate, extractTemplateFromMeeting,
    exportAll, exportAllMarkdownBundle, previewImport, confirmImport, cancelImport,
    patchMeeting, pushActivity, flushPersist,
  } = logic
  const actions = useMemo<ActionsSlice>(
    () => ({
      selectMeeting, addMeeting, addSampleMeeting, removeMeeting,
      setSearchText, setTagFilter, setShowArchived, toggleArchive,
      markDecisionSuperseded, clearDecisionSuperseded,
      setTitle, setDate, setTranscript, setTags, setMeetingKind, setRecStartedAt,
      addNote, removeNote,
      generateFor, generateSummaryFor, generateActionsFor,
      dismissPolishFidelity, polishTranscriptFor, undoPolish, getHotwords,
      translateTranscriptFor, clearTranslation,
      reviewSummaryFor, applyReview, clearReview,
      checkSupportFor, clearSupportSummary,
      toggleGolden, evalBenchFor, saveEvalScores, setEvalRunLabel, deleteEvalRun,
      suggestSpeakersFor, applySpeakerSuggestions, cancelSpeakerSuggest,
      editBrief, editOutline,
      toggleAction, updateAction, removeAction, addActionManually,
      updateDecision, removeDecision,
      ask, findMeetings, clearFindResults, clearQaHistory, removeQaRecord,
      setSemanticEnabled, rebuildSemantic,
      analyzeThemes, digestFor, applyDigest, clearDigest,
      evolutionFor, extractEntitiesFor, jumpToMeetingActions,
      exportIssueDrafts, exportDecisionLog,
      setModel, setMinConfidence, setSummaryPersona, setFrameSummary,
      updateAgent, resetAgent,
      resolvePending, approveAllPending,
      updateTemplate, resetTemplate, deleteTemplate, extractTemplateFromMeeting,
      exportAll, exportAllMarkdownBundle, previewImport, confirmImport, cancelImport,
      patchMeeting, pushActivity, flushPersist,
    }),
    [
      selectMeeting, addMeeting, addSampleMeeting, removeMeeting,
      setSearchText, setTagFilter, setShowArchived, toggleArchive,
      markDecisionSuperseded, clearDecisionSuperseded,
      setTitle, setDate, setTranscript, setTags, setMeetingKind, setRecStartedAt,
      addNote, removeNote,
      generateFor, generateSummaryFor, generateActionsFor,
      dismissPolishFidelity, polishTranscriptFor, undoPolish, getHotwords,
      translateTranscriptFor, clearTranslation,
      reviewSummaryFor, applyReview, clearReview,
      checkSupportFor, clearSupportSummary,
      toggleGolden, evalBenchFor, saveEvalScores, setEvalRunLabel, deleteEvalRun,
      suggestSpeakersFor, applySpeakerSuggestions, cancelSpeakerSuggest,
      editBrief, editOutline,
      toggleAction, updateAction, removeAction, addActionManually,
      updateDecision, removeDecision,
      ask, findMeetings, clearFindResults, clearQaHistory, removeQaRecord,
      setSemanticEnabled, rebuildSemantic,
      analyzeThemes, digestFor, applyDigest, clearDigest,
      evolutionFor, extractEntitiesFor, jumpToMeetingActions,
      exportIssueDrafts, exportDecisionLog,
      setModel, setMinConfidence, setSummaryPersona, setFrameSummary,
      updateAgent, resetAgent,
      resolvePending, approveAllPending,
      updateTemplate, resetTemplate, deleteTemplate, extractTemplateFromMeeting,
      exportAll, exportAllMarkdownBundle, previewImport, confirmImport, cancelImport,
      patchMeeting, pushActivity, flushPersist,
    ],
  )

  return (
    <BootingCtx.Provider value={booting}>
      <HasSelectionCtx.Provider value={hasSelection}>
        <MeetingCountCtx.Provider value={meetingCount}>
          <UiCtx.Provider value={ui}>
            <SelectionCtx.Provider value={selection}>
              <ListCtx.Provider value={list}>
                <TagsCtx.Provider value={tags}>
                  <FindCtx.Provider value={find}>
                    <GenCtx.Provider value={gen}>
                      <TranscriptCtx.Provider value={transcript}>
                        <QaCtx.Provider value={qa}>
                          <ReviewCtx.Provider value={review}>
                            <InsightsCtx.Provider value={insights}>
                              <EvalCtx.Provider value={evalSlice}>
                                <FollowCtx.Provider value={follow}>
                                  <HintsCtx.Provider value={hints}>
                                    <ArchiveCtx.Provider value={archive}>
                                      <StorageCtx.Provider value={storage}>
                                        <SemanticCtx.Provider value={semantic}>
                                          <ActionsCtx.Provider value={actions}>
                                            <CostCtx.Provider value={cost}>
                                              {children}
                                            </CostCtx.Provider>
                                          </ActionsCtx.Provider>
                                        </SemanticCtx.Provider>
                                      </StorageCtx.Provider>
                                    </ArchiveCtx.Provider>
                                  </HintsCtx.Provider>
                                </FollowCtx.Provider>
                              </EvalCtx.Provider>
                            </InsightsCtx.Provider>
                          </ReviewCtx.Provider>
                        </QaCtx.Provider>
                      </TranscriptCtx.Provider>
                    </GenCtx.Provider>
                  </FindCtx.Provider>
                </TagsCtx.Provider>
              </ListCtx.Provider>
            </SelectionCtx.Provider>
          </UiCtx.Provider>
        </MeetingCountCtx.Provider>
      </HasSelectionCtx.Provider>
    </BootingCtx.Provider>
  )
}

export function WorkbenchUiProvider({ children }: { children: ReactNode }) {
  const { activeTab, setActiveTab } = useMnUi()
  const hasSelection = useMnHasSelection()

  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("read")
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [evalOpen, setEvalOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [locateTarget, setLocateTarget] = useState<SourceAnchor | null>(null)

  // ── 快捷键（键盘驱动全流程，Linear 式）──
  // ⌘K 命令面板 / ? 快捷键帮助 / R 阅读 C 对照 / [ ] 收起左右栏 / 1-8 切页签
  // / 聚焦搜索（左栏收起时先展开）/ E 跳到转写编辑并聚焦输入框
  // ↑↓ 导航列表、D 完成行动项属于数据域按键，在 Workbench 的 KeyboardNavHost 与
  // ActionsTab 行内光标里处理（它们需要订阅列表/行动项数据，壳 Provider 不碰数据分片）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // 输入法组合态（中文拼音输入中按 r/c 是在组词，不是快捷键）；keyCode 229 兼容旧浏览器
      if (e.isComposing || e.keyCode === 229) return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      )
        return
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault()
        setHelpOpen((v) => !v)
        return
      }
      if (e.key === "Escape" && helpOpen) {
        setHelpOpen(false)
        return
      }
      if (e.key === "[") {
        setLeftCollapsed((v) => !v)
        return
      }
      if (e.key === "]") {
        setRightCollapsed((v) => !v)
        return
      }
      if (paletteOpen || settingsOpen || evalOpen || helpOpen || historyOpen) return
      if (e.key === "/") {
        // 聚焦搜索：左栏收起 / 移动端抽屉没开时先展开，再广播聚焦事件（SearchBox 监听）
        e.preventDefault()
        setLeftCollapsed(false)
        setMobileNav(true)
        setTimeout(() => window.dispatchEvent(new CustomEvent("mn:focus-search")), 0)
        return
      }
      if (e.key >= "1" && e.key <= "8") {
        const tab = TAB_ORDER[Number(e.key) - 1]
        if (tab) setActiveTab(tab)
        return
      }
      if (!hasSelection) return
      if (e.key === "r" || e.key === "R") {
        setViewMode("read")
        setActiveTab("summary")
      } else if (e.key === "c" || e.key === "C") {
        setViewMode("compare")
        setActiveTab("summary")
      } else if ((e.key === "e" || e.key === "E") && activeTab !== "actions") {
        // 编辑：跳到转写页签并聚焦输入框（页签切换要等一拍挂载完成再广播）。
        // 行动项页签内 E 归 ActionsTab 的行内光标（编辑光标条目内容），这里让位
        setActiveTab("transcript")
        setTimeout(() => window.dispatchEvent(new CustomEvent("mn:focus-transcript")), 0)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [paletteOpen, settingsOpen, evalOpen, helpOpen, historyOpen, hasSelection, activeTab, setActiveTab])

  const value = useMemo<WorkbenchShell>(
    () => ({
      leftCollapsed, rightCollapsed, mobileNav, viewMode,
      paletteOpen, settingsOpen, evalOpen, helpOpen, historyOpen, locateTarget,
      setLeftCollapsed, setRightCollapsed, setMobileNav, setViewMode,
      setPaletteOpen, setSettingsOpen, setEvalOpen, setHelpOpen, setHistoryOpen, setLocateTarget,
    }),
    [leftCollapsed, rightCollapsed, mobileNav, viewMode, paletteOpen, settingsOpen, evalOpen, helpOpen, historyOpen, locateTarget],
  )

  return <ShellCtx.Provider value={value}>{children}</ShellCtx.Provider>
}
