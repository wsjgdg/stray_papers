// 领域 hook · 设置与事件日志：从 useMeetingNotes 整段迁出，行为不变。
// 管四类 localStorage 小数据（小、同步读、启动即用）：应用设置、多 Agent 编排、会议模板、事件日志。
// - 多 Agent 编排：每个调用点按认知模式路由到对应 Agent，取该 Agent 的模型与附加指令；
//   用户不感知路由，只在设置页调每个 Agent 的行为，未单独指定模型时回退全局首选
// - 事件日志：append-only，硬上限 100 条（读写两侧都截断）
// - 模型清单：启动时拉一次可用模型（失败不影响，设置面板回退内置候选）

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  DEFAULT_MODEL,
  MODEL_FALLBACK_CHAIN,
  loadActivity,
  loadSettings,
  loadTemplates,
  makeActivity,
  saveActivity,
  saveSettings,
  saveTemplates,
  DEFAULT_MEETING_TEMPLATES,
  type ActivityEvent,
  type AppSettings,
  type MeetingTemplate,
  type SummaryPersona,
} from "@/lib/store"
import {
  DEFAULT_AGENT_CONFIGS,
  loadAgentsConfig,
  resolveAgentModel,
  saveAgentsConfig,
  type AgentConfig,
  type AgentRole,
  type AgentsConfig,
} from "@/lib/agents"
import { listLlmModels } from "@/lib/ai"

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  // 多 Agent 编排配置：每个 Agent 的模型 / 附加指令 / 不确定性门槛（设置页可调，用户无需感知路由细节）
  const [agents, setAgents] = useState<AgentsConfig>(loadAgentsConfig)
  const [templates, setTemplates] = useState<MeetingTemplate[]>(loadTemplates)
  const [activity, setActivity] = useState<ActivityEvent[]>(loadActivity)
  const [serverModels, setServerModels] = useState<string[]>([])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    saveAgentsConfig(agents)
  }, [agents])

  useEffect(() => {
    saveTemplates(templates)
  }, [templates])

  useEffect(() => {
    saveActivity(activity)
  }, [activity])

  // 启动时拉一次可用模型清单（失败不影响：设置面板会回退到内置候选）
  useEffect(() => {
    void listLlmModels()
      .then((list) => {
        if (list.length > 0) setServerModels(list.map((m) => m.model))
      })
      .catch(() => {})
  }, [])

  const modelOptions = useMemo(
    () => [...new Set([...serverModels, DEFAULT_MODEL, ...MODEL_FALLBACK_CHAIN])],
    [serverModels],
  )

  // ── 多 Agent 编排：每个调用点按认知模式路由到对应 Agent，取该 Agent 的模型与附加指令 ──
  const agentModel = useCallback(
    (role: AgentRole) => resolveAgentModel(agents, role, settings.model),
    [agents, settings.model],
  )
  const agentPrompt = useCallback(
    (role: AgentRole) => agents[role].extraPrompt.trim() || undefined,
    [agents],
  )
  const agentReviewThreshold = useCallback(
    (role: AgentRole) => agents[role].reviewThreshold,
    [agents],
  )

  const updateAgent = useCallback((role: AgentRole, patch: Partial<AgentConfig>) => {
    setAgents((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }))
  }, [])

  const resetAgent = useCallback((role: AgentRole) => {
    setAgents((prev) => ({ ...prev, [role]: { ...DEFAULT_AGENT_CONFIGS[role] } }))
  }, [])

  const pushActivity = useCallback((kind: string, meetingTitle: string, detail: string) => {
    setActivity((prev) => [makeActivity(kind, meetingTitle, detail), ...prev].slice(0, 100))
  }, [])

  // ── 设置 ──
  const setModel = useCallback(
    (model: string) => setSettings((s) => ({ ...s, model })),
    [],
  )

  const setMinConfidence = useCallback(
    (minConfidence: number) => setSettings((s) => ({ ...s, minConfidence })),
    [],
  )

  const setSummaryPersona = useCallback(
    (summaryPersona: SummaryPersona) => setSettings((s) => ({ ...s, summaryPersona })),
    [],
  )

  const setFrameSummary = useCallback(
    (frameSummary: boolean) => setSettings((s) => ({ ...s, frameSummary })),
    [],
  )

  // ── 会议模板：用户可改可加可从一场满意的会提取；内置模板可恢复默认 ──
  const updateTemplate = useCallback((templateId: string, patch: { label?: string; guidance?: string }) => {
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === templateId
          ? {
              ...t,
              ...(patch.label !== undefined ? { label: patch.label.slice(0, 20) || t.label } : {}),
              ...(patch.guidance !== undefined ? { guidance: patch.guidance } : {}),
            }
          : t,
      ),
    )
  }, [])

  const resetTemplate = useCallback((templateId: string) => {
    const def = DEFAULT_MEETING_TEMPLATES.find((t) => t.id === templateId)
    if (!def) return
    setTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...def } : t)))
  }, [])

  const deleteTemplate = useCallback((templateId: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== templateId || t.builtin))
  }, [])

  return {
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
  }
}
