// 页面逻辑层：会议 CRUD、AI 生成（分任务可独立重跑 + 计费确认 + 模型降级链）、
// 跨会议问答、设置、事件日志、全库备份导入导出。
// View 组件只消费本 hook 的返回值，不直接调 AI / localStorage。

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createMeeting,
  dueDayOffset,
  isOpenStatus,
  meetingInfoProfile,
  newId,
  textSimilarity,
  todayStr,
  type Meeting,
  type MeetingAction,
  type MeetingDecision,
  type MeetingTemplate,
  type OutlineTopic,
} from "@/lib/store"
import { buildSampleMeeting } from "@/lib/sample"
import { getActiveLlm } from "@/lib/providers"
import { setAiFailureRecorder, type ChainResult } from "@/lib/ai"
import { recordAiCall } from "@/lib/usageLog"
import { beginOp, endOp } from "@/lib/oplog"
import { journalInfo, journalPatch, journalPurge } from "@/lib/eventJournal"
import { secureDeleteMeetingRecords } from "@/lib/idbStore"
import { clipSnippet, recordEditEvent } from "@/lib/editLog"
import { useEvalBench } from "@/hooks/meeting-notes/useEvalBench"
import { useSpeakerSuggest } from "@/hooks/meeting-notes/useSpeakerSuggest"
import { useSummaryReview, useSupportCheck } from "@/hooks/meeting-notes/useQualityChecks"
import { useThemes, useDigest, useEvolution, useEntities } from "@/hooks/meeting-notes/useInsights"
import { useRetrieval } from "@/hooks/meeting-notes/useRetrieval"
import { useQa } from "@/hooks/meeting-notes/useQa"
import { useTranscriptOps } from "@/hooks/meeting-notes/useTranscriptOps"
import { useMeetingsStore } from "@/hooks/meeting-notes/useMeetingsStore"
import { useSettings } from "@/hooks/meeting-notes/useSettings"
import { useGeneration } from "@/hooks/meeting-notes/useGeneration"

// 消化面板行类型随领域 hook 迁移；从 facade re-export，消费方导入路径不变
export type { DigestRow } from "@/hooks/meeting-notes/useInsights"

// 支撑核验汇总类型随领域 hook 迁移；从 facade re-export，消费方导入路径不变
export type { SupportSummary } from "@/hooks/meeting-notes/useQualityChecks"

// 生成任务开关类型随生成域迁移；从 facade re-export，消费方导入路径不变
export type { GenParts } from "@/hooks/meeting-notes/useGeneration"
import {
  buildBlockNotifications,
  buildPreMeetingBriefing,
  dispatchWorkflowEvent,
  downloadDecisionLog,
  downloadIssueDrafts,
} from "@/lib/workflows"
import { collectHotwords } from "@/lib/hotwords"
import { useCostConfirm } from "@/hooks/useCostConfirm"

export type TabKey = "transcript" | "summary" | "actions" | "decisions" | "due" | "timeline" | "graph" | "qa"

// 失败调用也进账本（ok:false）：健康面板的「AI 调用成功率」由账本里 ok 占比算出，
// 只记成功就永远显示 100%。模块级安装一次（赋值幂等，StrictMode 双挂载无影响）；
// 失败时没有产出模型，model 记空串——「按模型」聚合会跳过空 model 的条目
setAiFailureRecorder(({ kind, preferred, failReasons, durationMs }) => {
  recordAiCall({
    at: Date.now(),
    kind,
    providerId: getActiveLlm().meta.id,
    model: "",
    ...(preferred ? { preferredModel: preferred } : {}),
    fellBack: false,
    failReasons,
    durationMs,
    ok: false,
  })
})


// 截止日提醒视图：跨会议汇总所有未完成行动项，按紧急程度分组
export interface DueItem {
  action: MeetingAction
  meeting: Meeting
}

export type DueGroupKey = "overdue" | "today" | "week" | "later" | "none"

export interface DueGroup {
  key: DueGroupKey
  label: string
  items: DueItem[]
}

// 自动关联提示条目：为什么相关必须可读（共同标签 / 内容相似 / 共同负责人）
export interface RelatedMeetingHint {
  id: string
  title: string
  date: string
  reasons: string[]
  score: number
}



// 按人聚合的工作量条目：全部会议里某位负责人的行动项统计与未完成明细
export interface WorkloadEntry {
  name: string
  total: number
  done: number
  cancelled: number
  open: number
  doing: number
  blocked: number
  overdue: number
  stalled: number // ≥14 天没结束的条数
  items: DueItem[] // 未完成的明细（含来源会议）
}

const DUE_GROUP_LABELS: { key: DueGroupKey; label: string }[] = [
  { key: "overdue", label: "已逾期" },
  { key: "today", label: "今天到期" },
  { key: "week", label: "7 天内" },
  { key: "later", label: "更晚" },
  { key: "none", label: "未设截止日" },
]

// 导入预览类型随存储域迁移；从 facade re-export，消费方导入路径不变
export type { ImportPreview } from "@/hooks/meeting-notes/useMeetingsStore"
// 列表排序模式（检索域）：同样从 facade re-export，消费方只认这一个导入路径
export type { ListSort } from "@/hooks/meeting-notes/useRetrieval"

export function useMeetingNotes() {
  const costConfirm = useCostConfirm()

  const [activeTab, setActiveTab] = useState<TabKey>("transcript")

  // 会议数据 ref：facade 持有（热词 / 评估台 / 检索域共用），检索域 hook 负责保持同步
  const meetingsRef = useRef<Meeting[]>([])
  // 检索类调用锁：问答（runAsk）与语义找会（runFind）共用，同一时刻只跑一个
  const askRunningRef = useRef(false)
  // 落盘后的索引同步桥：存储域持久化管线经 ref 间接调用（检索域就绪后回填，解 hook 声明顺序）
  const indexSyncRef = useRef<((saved: Meeting[]) => void) | null>(null)

  // ── 设置域：应用设置 / Agent 编排 / 模板 / 事件日志，已迁出为领域 hook ──
  const {
    settings,
    setSettings,
    agents,
    setAgents,
    templates,
    setTemplates,
    activity,
    pushActivity,
    modelOptions,
    agentModel,
    agentPrompt,
    agentReviewThreshold,
    updateAgent,
    resetAgent,
    setModel,
    setMinConfidence,
    setSummaryPersona,
    setFrameSummary,
    updateTemplate,
    resetTemplate,
    deleteTemplate,
  } = useSettings()

  // ── 存储域（核心）：会议数据 / 启动装载 / 分片持久化 / 备份导入导出，已迁出为领域 hook ──
  const {
    meetings,
    setMeetings,
    selectedId,
    setSelectedId,
    qaHistory,
    setQaHistory,
    booting,
    hydrated,
    storageBackend,
    storageError,
    storageSizeKb,
    storageQuotaKb,
    storagePersisted,
    recoveryNotice,
    dismissRecovery,
    patchMeeting,
    flushPersist,
    exportAll,
    exportAllMarkdownBundle,
    previewImport,
    confirmImport,
    cancelImport,
  } = useMeetingsStore({ pushActivity, setSettings, setAgents, indexSyncRef })

  // AI 调用账本：每次付费调用成功后记一条（模型/降级原因/耗时/token/归属会议），
  // 设置页「用量统计」按服务商、按会议、按时间聚合展示
  const logAiCall = useCallback(
    (
      kind: string,
      meeting: { id: string; title: string } | null,
      preferred: string,
      res: ChainResult<unknown>,
    ) => {
      recordAiCall({
        at: Date.now(),
        kind,
        ...(meeting ? { meetingId: meeting.id, meetingTitle: meeting.title } : {}),
        providerId: getActiveLlm().meta.id,
        model: res.usedModel,
        preferredModel: preferred,
        fellBack: res.fellBack,
        failReasons: res.attempts.map((a) => a.error),
        durationMs: res.durationMs,
        ...(res.tokens ? { tokens: res.tokens } : {}),
        ok: true,
      })
    },
    [],
  )

  // ── 生成主管线：清洗 → 摘要（FRAME 两步）与抽取两个独立任务，已迁出为领域 hook ──
  const {
    genBusy,
    genError,
    genNotice,
    setGenError,
    setGenNotice,
    generating,
    generateFor,
    generateSummaryFor,
    generateActionsFor,
  } = useGeneration({
    meetings,
    setMeetings,
    meetingsRef,
    settings,
    templates,
    setActiveTab,
    agentModel,
    agentPrompt,
    agentReviewThreshold,
    logAiCall,
    pushActivity,
    costConfirm,
    flushPersist,
  })

  const selected = useMemo(
    () => meetings.find((m) => m.id === selectedId) ?? null,
    [meetings, selectedId],
  )

  // ── 检索域：关键词搜索 / 标签筛选 / 语义找会 / 索引生命周期，已迁出为领域 hook ──
  const {
    searchText,
    setSearchText,
    tagFilter,
    setTagFilter,
    showArchived,
    setShowArchived,
    listSort,
    setListSort,
    allTags,
    filteredMeetings,
    searchHasFuzzy,
    semanticStatus,
    semanticProgress,
    setSemanticEnabled,
    rebuildSemantic,
    syncIndexesAfterSave,
    dropMeetingFromIndexes,
    finding,
    findError,
    findResults,
    findQuery,
    findMeetings,
    clearFindResults,
    scopeMeetings,
  } = useRetrieval({
    meetings,
    meetingsRef,
    askRunningRef,
    booting,
    hydrated,
    semanticEnabled: settings.semanticEnabled === true,
    setSettings,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
  })

  // ── 问答域：跨会议问答 / 流式输出 / 问答历史，已迁出为领域 hook ──
  const {
    asking,
    askError,
    streamingBlocks,
    ask,
    clearQaHistory,
    staleQaIds,
    removeQaRecord,
  } = useQa({
    meetings,
    qaHistory,
    setQaHistory,
    scopeMeetings,
    askRunningRef,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
  })

  // 检索域的索引同步函数回填给存储域的落盘管线（ref 间接，解 hook 声明顺序）
  useEffect(() => {
    indexSyncRef.current = syncIndexesAfterSave
  }, [syncIndexesAfterSave])

  // 归档统计 + 归档建议：低产出（无决议/行动项/议题结构）且有转写内容的会议
  const archivedCount = useMemo(() => meetings.filter((m) => m.archived).length, [meetings])
  const archiveCandidates = useMemo(
    () =>
      meetings.filter((m) => {
        if (m.archived) return false
        if ((m.transcript ?? "").trim().length < 20) return false
        return meetingInfoProfile(m).level === "low"
      }),
    [meetings],
  )

  const toggleArchive = useCallback(
    (id: string) => {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, archived: !m.archived, archivedAt: !m.archived ? Date.now() : undefined, updatedAt: Date.now() }
            : m,
        ),
      )
      const target = meetings.find((m) => m.id === id)
      if (target) {
        journalInfo(id, target.archived ? "取消归档" : "归档会议", target.title)
        pushActivity(target.archived ? "取消归档" : "归档会议", target.title, target.archived ? "恢复到活跃列表" : "移入归档区（数据保留，仍可检索问答）")
      }
    },
    [meetings, pushActivity, setMeetings],
  )

  // 决议被取代：标记 supersededBy 链（记忆「过时」阶段），可随时取消标记。
  // 补丁在 updater 外用实时快照算好，先记事件日志（条目级差异，可回滚）再应用
  const markDecisionSuperseded = useCallback(
    (meetingId: string, decisionId: string, successor: { meetingId: string; decisionId: string }) => {
      const live = meetingsRef.current.find((m) => m.id === meetingId)
      if (!live) return
      const decisions = live.decisions.map((d) =>
        d.id === decisionId ? { ...d, supersededBy: { ...successor, at: Date.now() } } : d,
      )
      journalPatch(meetingId, live, { decisions })
      setMeetings((prev) =>
        prev.map((m) => (m.id === meetingId ? { ...m, decisions, updatedAt: Date.now() } : m)),
      )
      pushActivity("决议标记过时", "", "旧决议已标记「已被取代」，仍可在决议档案中查看")
    },
    [pushActivity, setMeetings],
  )

  const clearDecisionSuperseded = useCallback((meetingId: string, decisionId: string) => {
    const live = meetingsRef.current.find((m) => m.id === meetingId)
    if (!live) return
    const decisions = live.decisions.map((d) =>
      d.id === decisionId ? { ...d, supersededBy: undefined } : d,
    )
    journalPatch(meetingId, live, { decisions })
    setMeetings((prev) =>
      prev.map((m) => (m.id === meetingId ? { ...m, decisions, updatedAt: Date.now() } : m)),
    )
  }, [setMeetings])

  // 热词：历史会议里的专有名词（转写整理注入提示词校正写法；实时转写用作语音识别热词）
  const getHotwords = useCallback(() => collectHotwords(meetingsRef.current), [])

  // ── 转写操作域：编辑会话 / 补标点整理 / 保真校验 / 随手记 / 重复检测，已迁出为领域 hook ──
  const {
    setTranscript,
    addNote,
    removeNote,
    setRecStartedAt,
    polishing,
    polishNotice,
    setPolishNotice,
    polishFidelity,
    setPolishFidelity,
    polishTranscriptFor,
    dismissPolishFidelity,
    undoPolish,
    translating,
    translateProgress,
    translateNotice,
    setTranslateNotice,
    translateTranscriptFor,
    clearTranslation,
    duplicateWarning,
  } = useTranscriptOps({
    meetings,
    selected,
    meetingsRef,
    setMeetings,
    patchMeeting,
    setGenError,
    getHotwords,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
    flushPersist,
  })

  const addMeeting = useCallback((title: string, date: string) => {
    const m = createMeeting(title, date || todayStr())
    journalInfo(m.id, "创建会议", m.title)
    setMeetings((prev) => [m, ...prev])
    setSelectedId(m.id)
    setActiveTab("transcript")
    setGenError("")
    setGenNotice("")
    setPolishNotice("")
    // 工作流触发点：新会议创建（在线目标注册后自动推送；本环境由「会前简报」本地消费）
    void dispatchWorkflowEvent({ kind: "meeting-created", meetingId: m.id })
    // 崩溃安全：新会议是关键写入——先写意图标记，立即落盘（不等防抖窗口），
    // 写入确认后清标记；中途崩溃则下次启动扫描到残留标记挂恢复提示
    const opId = beginOp("新建会议", m.id, m.title)
    void flushPersist().then(() => endOp(opId))
    return m.id
  }, [setPolishNotice, setMeetings, setSelectedId, setGenError, setGenNotice, flushPersist])

  // 空档案引导：一键载入内置示例会议（完整数据直接入库，可像普通会议一样编辑/删除）
  const addSampleMeeting = useCallback(() => {
    const m = buildSampleMeeting()
    journalInfo(m.id, "载入示例会议", m.title)
    setMeetings((prev) => [m, ...prev])
    setSelectedId(m.id)
    setActiveTab("summary")
    setGenError("")
    setGenNotice("")
    setPolishNotice("")
    pushActivity("载入示例", m.title, "内置示例会议已加入本地档案，可自由编辑或删除")
    return m.id
  }, [pushActivity, setPolishNotice, setMeetings, setSelectedId, setGenError, setGenNotice])

  const removeMeeting = useCallback(
    (id: string) => {
      // 事件日志：清掉该会议的全部历史，只留一条「删除会议」信息事件（控制日志体积）
      const doomed = meetingsRef.current.find((m) => m.id === id)
      journalPurge(id)
      if (doomed) journalInfo(id, "删除会议", doomed.title)
      // 安全删除：先用随机字节覆写这场会议在库里的分片/元数据/索引记录再删除（尽力而为，
      // 早于 400ms 防抖落盘的逻辑删除发生；覆写完成前记录不含原文）。详见 idbStore.secureDeleteMeetingRecords
      void secureDeleteMeetingRecords(id)
      setMeetings((prev) => {
        const target = prev.find((m) => m.id === id)
        if (target) pushActivity("删除会议", target.title, "已从本地档案移除")
        const next = prev.filter((m) => m.id !== id)
        if (id === selectedId) {
          setSelectedId(next.length > 0 ? next[0].id : "")
        }
        return next
      })
      // 检索索引同步失效：内存缓存 / 倒排索引 / 语义向量库三套一起清理（检索域 hook）
      dropMeetingFromIndexes([id])
    },
    [selectedId, pushActivity, dropMeetingFromIndexes, setMeetings, setSelectedId],
  )

  // ── 说话人智能标注：已迁出为领域 hook（meeting-notes/useSpeakerSuggest）──
  const {
    speakerSuggestions,
    suggestBusy,
    suggestSpeakersFor,
    applySpeakerSuggestions,
    cancelSpeakerSuggest,
  } = useSpeakerSuggest({
    meetings,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    setGenError,
    setPolishNotice,
    patchMeeting,
    costConfirm,
  })

  const selectMeeting = useCallback((id: string) => {
    setSelectedId(id)
    setGenError("")
    setGenNotice("")
    setPolishNotice("")
    setPolishFidelity(null)
    setTranslateNotice("")
    cancelSpeakerSuggest()
  }, [cancelSpeakerSuggest, setPolishNotice, setPolishFidelity, setTranslateNotice, setSelectedId, setGenError, setGenNotice])

  const setTags = useCallback(
    (id: string, tags: string[]) => patchMeeting(id, { tags }),
    [patchMeeting],
  )

  const setMeetingKind = useCallback(
    (id: string, templateId: string) => patchMeeting(id, { meetingKind: templateId }),
    [patchMeeting],
  )

  // 从一场会议的现有纪要结构提取模板：议题名变成「组织视角」提示，下次同类会直接复用
  const extractTemplateFromMeeting = useCallback(
    (id: string, label: string): string => {
      const m = meetings.find((x) => x.id === id)
      const name = label.trim().slice(0, 20)
      if (!m || !name) return "需要先有纪要结构和模板名称"
      const topics = (m.outline?.topics ?? []).map((t) => t.topic).filter(Boolean)
      if (topics.length === 0) return "这场会还没有议题纪要，先生成摘要再提取"
      const template: MeetingTemplate = {
        id: `tpl-${newId().slice(0, 8)}`,
        label: name,
        guidance: `这是「${name}」：议题优先按「${topics.join(" / ")}」的顺序组织，每一部分都要有具体要点`,
        builtin: false,
        createdAt: Date.now(),
      }
      setTemplates((prev) => [...prev, template])
      pushActivity("提取模板", m.title, `从议题结构生成模板「${name}」`)
      return ""
    },
    [meetings, pushActivity, setTemplates],
  )

  const setTitle = useCallback(
    (id: string, title: string) => patchMeeting(id, { title }),
    [patchMeeting],
  )

  const setDate = useCallback(
    (id: string, date: string) => patchMeeting(id, { date }),
    [patchMeeting],
  )

  // ── AI 产出的第二意见：交叉审查与支撑核验，已迁出为领域 hook（meeting-notes/useQualityChecks）──
  const { reviewReport, reviewBusy, reviewError, reviewSummaryFor, applyReview, clearReview } =
    useSummaryReview({
      meetings,
      agentModel,
      agentPrompt,
      logAiCall,
      pushActivity,
      costConfirm,
      patchMeeting,
      setPolishNotice,
    })
  const { supportBusy, supportError, supportSummary, checkSupportFor, clearSupportSummary } =
    useSupportCheck({
      meetings,
      setMeetings,
      agentModel,
      agentPrompt,
      logAiCall,
      pushActivity,
      costConfirm,
    })

  // ── 评估台（个人 golden set）：已迁出为领域 hook（meeting-notes/useEvalBench），
  // 状态与重跑管线都在那边；facade 只做组合，公开 API 不变 ──
  const {
    goldenCount,
    toggleGolden,
    evalBusy,
    evalProgress,
    evalError,
    evalRuns,
    evalBenchFor,
    saveEvalScores,
    setEvalRunLabel,
    deleteEvalRun,
  } = useEvalBench({
    meetings,
    meetingsRef,
    setMeetings,
    agentModel,
    agentPrompt,
    templates,
    settings,
    logAiCall,
    pushActivity,
    costConfirm,
  })


  // ── 摘要编辑（标记 editedByUser，之后重新生成不覆盖）──
  // 内容级编辑会话表：key = `${meetingId}:${actionId|decisionId}`，存会话起点快照
  const contentEditSessionsRef = useRef(
    new Map<string, { before: string; timer: ReturnType<typeof setTimeout> }>(),
  )

  // 内容级编辑的防抖记录：行动项/决议正文是逐键输入，静默 1.5s 后把「会话起点 → 最终文本」
  // 记成一条修正事件（每键都记会淹没日志，也失去「改了什么」的意义）
  const trackContentEdit = useCallback(
    (
      key: string,
      meetingId: string,
      before: string,
      after: string,
      target: "action-content" | "decision-content",
    ) => {
      if (!before.trim() || before === after) return // 空条目填字（手动新增）与无变化不记
      const sessions = contentEditSessionsRef.current
      const existing = sessions.get(key)
      if (existing) clearTimeout(existing.timer)
      const start = existing?.before ?? before
      const timer = setTimeout(() => {
        sessions.delete(key)
        const m = meetingsRef.current.find((x) => x.id === meetingId)
        if (!m || start === after) return
        recordEditEvent(m, { target, before: clipSnippet(start), after: clipSnippet(after) })
      }, 1500)
      sessions.set(key, { before: start, timer })
    },
    [],
  )

  const editBrief = useCallback(
    (id: string, content: string) => {
      // 质量信号：摘要被手改 = 一句话摘要生成不满意的直接证据
      const m = meetingsRef.current.find((x) => x.id === id)
      if (m && (m.brief?.content ?? "") !== content) {
        recordEditEvent(m, {
          target: "brief",
          before: clipSnippet(m.brief?.content ?? ""),
          after: clipSnippet(content),
        })
      }
      setMeetings((prev) =>
        prev.map((m2) =>
          m2.id === id
            ? {
                ...m2,
                brief: {
                  content,
                  model: m2.brief?.model ?? "手动输入",
                  editedByUser: true,
                  generatedAt: m2.brief?.generatedAt ?? Date.now(),
                },
                updatedAt: Date.now(),
              }
            : m2,
        ),
      )
    },
    [setMeetings],
  )

  const editOutline = useCallback(
    (id: string, topics: OutlineTopic[]) => {
      // 质量信号：记下被改动的议题名——同一议题反复被改 = 该类议题生成不稳定，
      // 是「给会议模板补组织指令」的直接依据
      const m = meetingsRef.current.find((x) => x.id === id)
      if (m) {
        const before = m.outline?.topics ?? []
        const changed: string[] = []
        topics.forEach((t, i) => {
          const b = before[i]
          if (!b || b.topic !== t.topic || b.points.join("\n") !== t.points.join("\n")) {
            changed.push(t.topic || b?.topic || "未命名议题")
          }
        })
        for (let i = topics.length; i < before.length; i++) {
          changed.push(before[i].topic || "未命名议题")
        }
        const names = [...new Set(changed)].slice(0, 3)
        if (names.length > 0) {
          recordEditEvent(m, { target: "outline", detail: names.join("、") })
        }
      }
      setMeetings((prev) =>
        prev.map((m2) =>
          m2.id === id
            ? {
                ...m2,
                outline: {
                  topics,
                  model: m2.outline?.model ?? "手动输入",
                  editedByUser: true,
                  generatedAt: m2.outline?.generatedAt ?? Date.now(),
                },
                updatedAt: Date.now(),
              }
            : m2,
        ),
      )
    },
    [setMeetings],
  )

  // ── 行动项 / 决议操作 ──
  // 勾选框只在「未完成 ↔ 完成」之间切换；进行中/阻塞等中间态走行内状态选择器
  const toggleAction = useCallback(
    (id: string, actionId: string) => {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                actions: m.actions.map((a) =>
                  a.id === actionId
                    ? { ...a, status: a.status === "done" || a.status === "cancelled" ? "open" : "done" }
                    : a,
                ),
                updatedAt: Date.now(),
              }
            : m,
        ),
      )
    },
    [setMeetings],
  )

  const updateAction = useCallback(
    (id: string, actionId: string, patch: Partial<Omit<MeetingAction, "id">>) => {
      // 工作流触发点：状态改为「阻塞」时发事件——在线通知目标注册后自动直推负责人，
      // 本环境由跟进中心「工作流」视图生成通知文案供复制
      if (patch.status === "blocked") {
        const owner = meetings.find((x) => x.id === id)
        const prev = owner?.actions.find((x) => x.id === actionId)
        if (owner && prev && prev.status !== "blocked") {
          const note = buildBlockNotifications([{ ...owner, actions: [prev] }])[0]
          if (note) void dispatchWorkflowEvent({ kind: "action-blocked", notification: note })
        }
      }
      // 质量信号：结论文本被改 = 抽取表述不准的证据（防抖记录，见 trackContentEdit）
      if (patch.content !== undefined) {
        const owner = meetingsRef.current.find((x) => x.id === id)
        const cur = owner?.actions.find((x) => x.id === actionId)
        if (owner && cur) {
          trackContentEdit(`${id}:${actionId}`, id, cur.content, patch.content, "action-content")
        }
      }
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                actions: m.actions.map((a) => {
                  if (a.id !== actionId) return a
                  const next: MeetingAction = { ...a, ...patch, editedByUser: true }
                  // 改了结论文本或出处引用 = 旧的支撑强度判定随之失效（判的是旧文本），
                  // 清掉徽标避免误导；需要时重新跑一次「支撑核验」即可
                  if (
                    (patch.content !== undefined && patch.content !== a.content) ||
                    (patch.sourceQuote !== undefined && patch.sourceQuote !== a.sourceQuote)
                  ) {
                    next.support = undefined
                  }
                  return next
                }),
                updatedAt: Date.now(),
              }
            : m,
        ),
      )
    },
    [meetings, trackContentEdit, setMeetings],
  )

  const removeAction = useCallback((id: string, actionId: string) => {
    // 质量信号：删除 = 抽取过激的直接证据（被删内容留档，修正模式面板列示例）
    const m = meetingsRef.current.find((x) => x.id === id)
    const a = m?.actions.find((x) => x.id === actionId)
    if (m && a && a.content.trim()) {
      recordEditEvent(m, { target: "action-delete", before: clipSnippet(a.content), detail: clipSnippet(a.content).slice(0, 120) })
    }
    setMeetings((prev) =>
      prev.map((mm) =>
        mm.id === id
          ? { ...mm, actions: mm.actions.filter((x) => x.id !== actionId), updatedAt: Date.now() }
          : mm,
      ),
    )
  }, [setMeetings])

  const updateDecision = useCallback(
    (id: string, decisionId: string, patch: Partial<Omit<MeetingDecision, "id">>) => {
      if (patch.content !== undefined) {
        const owner = meetingsRef.current.find((x) => x.id === id)
        const cur = owner?.decisions.find((x) => x.id === decisionId)
        if (owner && cur) {
          trackContentEdit(`${id}:${decisionId}`, id, cur.content, patch.content, "decision-content")
        }
      }
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                decisions: m.decisions.map((d) =>
                  d.id === decisionId ? { ...d, ...patch, editedByUser: true } : d,
                ),
                updatedAt: Date.now(),
              }
            : m,
        ),
      )
    },
    [trackContentEdit, setMeetings],
  )

  const removeDecision = useCallback((id: string, decisionId: string) => {
    const m = meetingsRef.current.find((x) => x.id === id)
    const d = m?.decisions.find((x) => x.id === decisionId)
    if (m && d && d.content.trim()) {
      recordEditEvent(m, { target: "decision-delete", before: clipSnippet(d.content) })
    }
    setMeetings((prev) =>
      prev.map((mm) =>
        mm.id === id
          ? { ...mm, decisions: mm.decisions.filter((x) => x.id !== decisionId), updatedAt: Date.now() }
          : mm,
      ),
    )
  }, [setMeetings])

  const addActionManually = useCallback((id: string) => {
    // 质量信号：手动补充 = 抽取漏掉的证据
    const m = meetingsRef.current.find((x) => x.id === id)
    if (m) recordEditEvent(m, { target: "action-add" })
    setMeetings((prev) =>
      prev.map((mm) =>
        mm.id === id
          ? {
              ...mm,
              actions: [
                ...mm.actions,
                {
                  id: newId(),
                  content: "",
                  assignee: "",
                  dueDate: "",
                  status: "open" as const,
                  sourceQuote: "",
                  editedByUser: true,
                  createdAt: Date.now(),
                },
              ],
              updatedAt: Date.now(),
            }
          : mm,
      ),
    )
  }, [setMeetings])

  // ── 待人工确认队列（Human-in-the-Loop 系统化）：抽取 Agent 把握不足的条目扣在这里，
  // 用户主动拍板才进正式清单——Agent 不确定时暂停请求确认，而不是幻觉硬写。
  // 采纳即打 editedByUser 标记（成为用户资产，重新抽取不覆盖）；放弃则直接移出队列。
  const resolvePending = useCallback(
    (id: string, actionId: string, accept: boolean) => {
      const m = meetingsRef.current.find((x) => x.id === id)
      const item = m?.pendingActions?.find((a) => a.id === actionId)
      // 质量信号：待确认队列的采纳/放弃是模型不确定性的「人工判卷」结果
      if (m && item) {
        recordEditEvent(m, {
          target: accept ? "pending-accept" : "pending-reject",
          detail: clipSnippet(item.content).slice(0, 120),
        })
      }
      setMeetings((prev) =>
        prev.map((mm) => {
          if (mm.id !== id) return mm
          const pending = mm.pendingActions ?? []
          const target = pending.find((a) => a.id === actionId)
          if (!target) return mm
          const rest = pending.filter((a) => a.id !== actionId)
          if (!accept) return { ...mm, pendingActions: rest, updatedAt: Date.now() }
          // 采纳：去重后并入正式行动项（同内容已存在则只从队列移除）
          const exists = mm.actions.some((a) => a.content === target.content)
          const accepted: MeetingAction = { ...target, editedByUser: true }
          return {
            ...mm,
            actions: exists ? mm.actions : [...mm.actions, accepted],
            pendingActions: rest,
            updatedAt: Date.now(),
          }
        }),
      )
    },
    [setMeetings],
  )

  const approveAllPending = useCallback((id: string) => {
    const m = meetingsRef.current.find((x) => x.id === id)
    if (m) {
      for (const item of m.pendingActions ?? []) {
        recordEditEvent(m, { target: "pending-accept", detail: clipSnippet(item.content).slice(0, 120) })
      }
    }
    setMeetings((prev) =>
      prev.map((mm) => {
        if (mm.id !== id) return mm
        const pending = mm.pendingActions ?? []
        if (pending.length === 0) return mm
        const have = new Set(mm.actions.map((a) => a.content))
        const add = pending
          .filter((a) => !have.has(a.content))
          .map((a) => ({ ...a, editedByUser: true }))
        return {
          ...mm,
          actions: [...mm.actions, ...add],
          pendingActions: [],
          updatedAt: Date.now(),
        }
      }),
    )
  }, [setMeetings])

  const pendingCount = selected?.pendingActions?.length ?? 0

  const openActionCount = useMemo(
    () => (selected ? selected.actions.filter((a) => isOpenStatus(a.status)).length : 0),
    [selected],
  )

  // ── 截止日提醒：全部会议的未完成行动项，按紧急程度分组 ──
  const { dueGroups, dueCounts } = useMemo(() => {
    const buckets: Record<DueGroupKey, DueItem[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      none: [],
    }
    for (const m of meetings) {
      for (const a of m.actions) {
        if (!isOpenStatus(a.status) || !a.content.trim()) continue
        const item: DueItem = { action: a, meeting: m }
        const off = dueDayOffset(a.dueDate)
        if (off === null) buckets.none.push(item)
        else if (off < 0) buckets.overdue.push(item)
        else if (off === 0) buckets.today.push(item)
        else if (off <= 7) buckets.week.push(item)
        else buckets.later.push(item)
      }
    }
    for (const key of ["overdue", "today", "week", "later"] as const) {
      buckets[key].sort((x, y) => x.action.dueDate.localeCompare(y.action.dueDate))
    }
    const groups = DUE_GROUP_LABELS.map(({ key, label }) => ({ key, label, items: buckets[key] })).filter(
      (g) => g.items.length > 0,
    )
    const total = Object.values(buckets).reduce((n, list) => n + list.length, 0)
    return {
      dueGroups: groups,
      dueCounts: { overdue: buckets.overdue.length, today: buckets.today.length, total },
    }
  }, [meetings])

  // 从提醒视图跳回对应会议的行动项页
  const jumpToMeetingActions = useCallback((meetingId: string) => {
    setSelectedId(meetingId)
    setActiveTab("actions")
    setGenError("")
    setGenNotice("")
  }, [setSelectedId, setGenError, setGenNotice])

  // ── 按人聚合的工作量视图：谁被分配了多少、完成多少、逾期多少、多少条卡住没动 ──
  const workload = useMemo<WorkloadEntry[]>(() => {
    const map = new Map<string, WorkloadEntry>()
    for (const m of meetings) {
      for (const a of m.actions) {
        if (!a.content.trim()) continue
        const name = a.assignee.trim() || "（未指定）"
        let e = map.get(name)
        if (!e) {
          e = {
            name,
            total: 0,
            done: 0,
            cancelled: 0,
            open: 0,
            doing: 0,
            blocked: 0,
            overdue: 0,
            stalled: 0,
            items: [],
          }
          map.set(name, e)
        }
        e.total++
        if (a.status === "done") {
          e.done++
          continue
        }
        if (a.status === "cancelled") {
          e.cancelled++
          continue
        }
        e.items.push({ action: a, meeting: m })
        if (a.status === "doing") e.doing++
        else if (a.status === "blocked") e.blocked++
        else e.open++
        const off = dueDayOffset(a.dueDate)
        if (off !== null && off < 0) e.overdue++
        const ageDays = Math.floor((Date.now() - (a.createdAt ?? m.createdAt)) / 86_400_000)
        if (ageDays >= 14) e.stalled++
      }
    }
    return [...map.values()].sort(
      (x, y) =>
        y.overdue - x.overdue ||
        y.items.length - x.items.length ||
        y.total - x.total ||
        x.name.localeCompare(y.name),
    )
  }, [meetings])

  // ── 洞察系列（流程洞察 / 跟进消化 / 演进脉络 / 实体抽取）：已迁出为领域 hook（meeting-notes/useInsights）──
  const { themeReport, themesBusy, themesError, analyzeThemes } = useThemes({
    meetings,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
  })
  const { digestReport, digestBusy, digestError, pastOpenCount, digestFor, applyDigest, clearDigest } =
    useDigest({
      meetings,
      selected,
      setMeetings,
      patchMeeting,
      setGenNotice,
      agentModel,
      agentPrompt,
      logAiCall,
      pushActivity,
      costConfirm,
    })
  const { evolutionCache, evolutionBusy, evolutionError, evolutionFor } = useEvolution({
    meetings,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
  })
  const { entitiesBusy, extractEntitiesFor } = useEntities({
    meetings,
    patchMeeting,
    setGenError,
    agentModel,
    agentPrompt,
    logAiCall,
    pushActivity,
    costConfirm,
  })

  // 历史决议清单（会中实时洞察的「决议呼应」信号源；纯本地规则消费，上限 120 条控内存）
  const pastDecisions = useMemo(() => {
    const out: { content: string; title: string; date: string }[] = []
    for (const m of meetings) {
      for (const d of m.decisions) {
        if (d.content.trim()) out.push({ content: d.content, title: m.title, date: m.date })
      }
    }
    return out.slice(0, 120)
  }, [meetings])

  // ── 自动关联（Reor 式，纯本地免费）：为当前会议找出「可能相关」的其他会议 ──
  // 信号：共同标签（强）、摘要+议题文本相似（中）、共同行动项负责人（中）；
  // 加权求和过阈值才展示，每条都给出可读理由——不做黑盒推荐。
  const relatedMeetings = useMemo<RelatedMeetingHint[]>(() => {
    if (!selected) return []
    const selText = `${selected.brief?.content ?? ""} ${(selected.outline?.topics ?? []).map((t) => t.topic).join(" ")}`.trim()
    const selAssignees = new Set(
      selected.actions.map((a) => a.assignee.trim()).filter(Boolean),
    )
    const out: RelatedMeetingHint[] = []
    for (const m of meetings) {
      if (m.id === selected.id) continue
      let score = 0
      const reasons: string[] = []
      const sharedTags = m.tags.filter((t) => selected.tags.includes(t))
      if (sharedTags.length > 0) {
        score += 2 * sharedTags.length
        reasons.push(`相同标签「${sharedTags[0]}」${sharedTags.length > 1 ? ` 等 ${sharedTags.length} 个` : ""}`)
      }
      if (selText) {
        const mText = `${m.brief?.content ?? ""} ${(m.outline?.topics ?? []).map((t) => t.topic).join(" ")}`.trim()
        if (mText) {
          const sim = textSimilarity(selText.slice(0, 4000), mText.slice(0, 4000))
          if (sim >= 0.2) {
            score += Math.round(sim * 6)
            reasons.push(`摘要与议题约 ${Math.round(sim * 100)}% 相似`)
          }
        }
      }
      const mAssignees = new Set(m.actions.map((a) => a.assignee.trim()).filter(Boolean))
      const sharedPeople = [...selAssignees].filter((a) => mAssignees.has(a))
      if (sharedPeople.length > 0) {
        score += sharedPeople.length
        reasons.push(`共同负责人 ${sharedPeople.slice(0, 2).join("、")}`)
      }
      if (score >= 3) out.push({ id: m.id, title: m.title, date: m.date, reasons, score })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3)
  }, [meetings, selected])

  // ── 工作流编排（知识库的自动消费方式，全部本地免费实时计算）──
  // 会前简报：当前会议一建立就从档案拉取同系列历史会议概况 / 未结行动项 / 最近决议 / 阻塞项，
  // 转写还是空的（会前场景）时在转写页顶部展示——上次会议的遗留问题开会前就摆在眼前
  const preBriefing = useMemo(
    () => (selected ? buildPreMeetingBriefing(selected, meetings) : null),
    [selected, meetings],
  )

  // 阻塞通知文案：全部会议里状态为「阻塞」的行动项自动生成给负责人的通知（含卡住天数与逾期），
  // 跟进中心「工作流」视图一键复制；webhook 直推走 RemoteWorkflowTarget 预留位（fork 注册即生效）
  const blockedNotifications = useMemo(() => buildBlockNotifications(meetings), [meetings])

  const exportIssueDrafts = useCallback(() => {
    const n = downloadIssueDrafts(meetings)
    if (n > 0) {
      pushActivity("导出 Issue 草稿", "", `${n} 条未完成行动项已生成草稿包（粘贴即可在 GitHub / Linear 等系统建 Issue）`)
    }
    return n
  }, [meetings, pushActivity])

  const exportDecisionLog = useCallback(() => {
    const n = downloadDecisionLog(meetings)
    pushActivity("导出决策日志", "", `${n} 条决议已汇编为按时间倒序的决策日志（含被取代标注与原文依据）`)
    return n
  }, [meetings, pushActivity])

  return {
    meetings,
    filteredMeetings,
    selected,
    selectedId,
    selectMeeting,
    addMeeting,
    addSampleMeeting,
    removeMeeting,
    searchText,
    searchHasFuzzy,
    setSearchText,
    allTags,
    tagFilter,
    setTagFilter,
    showArchived,
    setShowArchived,
    listSort,
    setListSort,
    archivedCount,
    archiveCandidates,
    toggleArchive,
    markDecisionSuperseded,
    clearDecisionSuperseded,
    activeTab,
    setActiveTab,
    setTitle,
    setDate,
    setTranscript,
    setTags,
    setMeetingKind,
    setRecStartedAt,
    addNote,
    removeNote,
    genBusy,
    generating,
    genError,
    genNotice,
    generateFor,
    generateSummaryFor,
    generateActionsFor,
    polishing,
    polishNotice,
    polishFidelity,
    dismissPolishFidelity,
    polishTranscriptFor,
    undoPolish,
    translating,
    translateProgress,
    translateNotice,
    translateTranscriptFor,
    clearTranslation,
    getHotwords,
    reviewReport,
    reviewBusy,
    reviewError,
    reviewSummaryFor,
    applyReview,
    clearReview,
    supportBusy,
    supportError,
    supportSummary,
    checkSupportFor,
    clearSupportSummary,
    goldenCount,
    toggleGolden,
    evalBusy,
    evalProgress,
    evalError,
    evalRuns,
    evalBenchFor,
    saveEvalScores,
    setEvalRunLabel,
    deleteEvalRun,
    speakerSuggestions,
    suggestBusy,
    suggestSpeakersFor,
    applySpeakerSuggestions,
    cancelSpeakerSuggest,
    editBrief,
    editOutline,
    toggleAction,
    updateAction,
    removeAction,
    addActionManually,
    updateDecision,
    removeDecision,
    asking,
    askError,
    streamingBlocks,
    ask,
    finding,
    findError,
    findResults,
    findQuery,
    findMeetings,
    clearFindResults,
    qaHistory,
    clearQaHistory,
    removeQaRecord,
    staleQaIds,
    storageError,
    storageSizeKb,
    storageQuotaKb,
    storageBackend,
    booting,
    semanticStatus,
    semanticProgress,
    setSemanticEnabled,
    rebuildSemantic,
    openActionCount,
    dueGroups,
    dueCounts,
    workload,
    relatedMeetings,
    pastDecisions,
    themeReport,
    themesBusy,
    themesError,
    analyzeThemes,
    pastOpenCount,
    digestReport,
    digestBusy,
    digestError,
    digestFor,
    applyDigest,
    clearDigest,
    evolutionCache,
    evolutionBusy,
    evolutionError,
    evolutionFor,
    entitiesBusy,
    extractEntitiesFor,
    jumpToMeetingActions,
    duplicateWarning,
    preBriefing,
    blockedNotifications,
    exportIssueDrafts,
    exportDecisionLog,
    settings,
    setModel,
    setMinConfidence,
    setSummaryPersona,
    setFrameSummary,
    modelOptions,
    agents,
    updateAgent,
    resetAgent,
    resolvePending,
    approveAllPending,
    pendingCount,
    storagePersisted,
    recoveryNotice,
    dismissRecovery,
    flushPersist,
    patchMeeting,
    pushActivity,
    templates,
    updateTemplate,
    resetTemplate,
    deleteTemplate,
    extractTemplateFromMeeting,
    activity,
    exportAll,
    exportAllMarkdownBundle,
    previewImport,
    confirmImport,
    cancelImport,
    costConfirm,
  }
}

export type MeetingNotesLogic = ReturnType<typeof useMeetingNotes>
