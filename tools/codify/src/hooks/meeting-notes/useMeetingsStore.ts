// 领域 hook · 存储：从 useMeetingNotes 整段迁出。核心域——其余领域都注入这里的 setMeetings。
// 职责：会议数据与选中态、问答历史（同库持久化）、两阶段启动装载、防抖+空闲调度增量落盘、全库备份导入导出。
// 立场：写入失败绝不静默（置 storageError 让页面挂横幅提醒立即备份）；
// 装载完成前不落盘（防止空状态覆盖库）；大文本回填完成前也不落盘（占位空串会被误判为「用户清空」）；
// 导入先干跑预览、用户选定冲突策略后才真正写入。

import { useCallback, useEffect, useRef, useState } from "react"
import {
  backupVersionIssueOf,
  buildBackupPayload,
  downloadTextFile,
  exportAllMarkdown,
  mergeMeetings,
  newId,
  requestPersistentStorage,
  todayStr,
  validateBackupObject,
  type AppSettings,
  type BackupPayload,
  type ImportConflictStrategy,
  type Meeting,
  type QaRecord,
} from "@/lib/store"
import {
  estimateStorage,
  hydrateMeetingFields,
  loadStoreData,
  saveStoreData,
  type StorageBackend,
  type TextField,
} from "@/lib/idbStore"
import { takeStaleOps, type OpEntry } from "@/lib/oplog"
import { journalPatch } from "@/lib/eventJournal"
import { sampleStorageTrend } from "@/lib/healthLog"
import { loadPersistedIndex } from "@/lib/searchIndex"
import { saveProvidersConfig } from "@/lib/providers"
import { sanitizeAgentsConfig, type AgentsConfig } from "@/lib/agents"
import { jsonParseTask, jsonStringifyTask } from "@/lib/textWorkerClient"

// 导入干跑结果：先报告「会写入什么」（含与本地冲突的场数），确认后才真正写入
export type ImportPreview =
  | { ok: true; added: number; conflicts: number; qaAdded: number }
  | { ok: false; error: string }

// 空闲调度：落盘的重活（序列化/压缩已在存储层挪去 Worker，这里让出的是写盘时机）
// 在主线程空闲时执行——流式输出 / 连续打字期间不与交互抢帧；
// 5 秒超时兜底，持续高负载下最迟约 5.4 秒（400ms 防抖 + 5s）也一定落盘。
function scheduleIdleFlush(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }
  if (typeof w.requestIdleCallback === "function") {
    const handle = w.requestIdleCallback(fn, { timeout: 5000 })
    return () => w.cancelIdleCallback?.(handle)
  }
  // 无 requestIdleCallback 的环境：固定短延迟近似
  const t = setTimeout(fn, 200)
  return () => clearTimeout(t)
}

// 启动扫描只做一次（模块级缓存）：takeStaleOps 是「读出即清空」，
// StrictMode 下 effect 会双跑，第二次必须拿到同一份结果而不是空数组
let staleOpsCache: OpEntry[] | null = null
function readStaleOpsOnce(): OpEntry[] {
  if (staleOpsCache === null) staleOpsCache = takeStaleOps()
  return staleOpsCache
}

export interface UseMeetingsStoreDeps {
  pushActivity: (kind: string, meetingTitle: string, detail: string) => void
  // 备份时间戳写进设置；导入的 Agent 配置恢复进编排状态（都归设置域，注入 setter）
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  setAgents: React.Dispatch<React.SetStateAction<AgentsConfig>>
  // 落盘成功后的索引同步桥：存储域初始化时检索域尚未就绪，用 ref 间接调用
  // （facade 在检索域 hook 就绪后回填；持久化有 400ms 防抖 + 装载完成闸门，不存在竞态）
  indexSyncRef: React.MutableRefObject<((saved: Meeting[]) => void) | null>
}

export function useMeetingsStore(deps: UseMeetingsStoreDeps) {
  const { pushActivity, setSettings, setAgents, indexSyncRef } = deps

  // 数据从 IndexedDB 两阶段异步装载：
  // 阶段 A（booting）：meta + 小文本 + 问答历史——列表与结构化字段立即可交互；
  // 阶段 B（hydrated）：外置大文本（转写稿等）后台逐会解压回填，选中会议优先。
  // 两道闸门都关着才允许落盘：阶段 A 防「空状态覆盖库」，阶段 B 防「占位空串被当成清空」。
  const [booting, setBooting] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  // hydrated 的 ref 镜像：persistOnce 在事件回调/微任务里取闸门状态，不吃渲染闭包
  const hydratedRef = useRef(false)
  // 导出备份也要等回填完成（并取最新快照），否则备份会缺大文本
  const hydrationDoneRef = useRef<Promise<void>>(Promise.resolve())
  const [storageBackend, setStorageBackend] = useState<StorageBackend>("indexeddb")
  const bootDoneRef = useRef(false)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  // 问答历史同库持久化（kv store）：启动装载 / 备份导入导出都在这里，问答域 hook 注入读写
  const [qaHistory, setQaHistory] = useState<QaRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  // 最新快照 ref：导出等异步流程在 await 回填完成后取数，不能用发起时的旧闭包
  const meetingsNowRef = useRef(meetings)
  const qaNowRef = useRef(qaHistory)
  useEffect(() => {
    meetingsNowRef.current = meetings
    qaNowRef.current = qaHistory
  }, [meetings, qaHistory])

  // 是否已获浏览器「持久化存储」授权（降低存储压力下数据被自动清理的概率）
  const [storagePersisted, setStoragePersisted] = useState(false)

  useEffect(() => {
    void requestPersistentStorage().then(setStoragePersisted)
  }, [])

  const [storageError, setStorageError] = useState("")
  const [storageSizeKb, setStorageSizeKb] = useState(0)
  const [storageQuotaKb, setStorageQuotaKb] = useState(0) // 0 = 环境不提供配额信息
  const lastEstimateRef = useRef(0)

  // 崩溃恢复提示：上次会话有关键操作（AI 生成等）在落盘确认前被打断时，
  // 启动扫描 localStorage 意图日志（lib/oplog.ts）生成提示，用户知晓后关闭
  const [recoveryNotice, setRecoveryNotice] = useState("")
  const dismissRecovery = useCallback(() => setRecoveryNotice(""), [])

  useEffect(() => {
    const stale = readStaleOpsOnce()
    if (stale.length === 0) return
    const kinds = [...new Set(stale.map((o) => o.kind).filter(Boolean))].join("、") || "关键操作"
    const titles = [...new Set(stale.map((o) => o.meetingTitle).filter(Boolean))].slice(0, 2)
    const notice = `上次会话在「${kinds}」完成前被中断，${
      titles.length > 0 ? `「${titles.join("」「")}」的` : ""
    }结果可能没来得及保存。请检查相关内容，必要时重跑；其余已保存的数据不受影响。`
    // 延迟一拍再挂提示：不阻塞首帧渲染（横幅属于事后告知，不参与首屏布局竞争）
    const t = setTimeout(() => setRecoveryNotice(notice), 0)
    return () => clearTimeout(t)
  }, [])

  // 启动装载：阶段 A 只拉 meta + kv（同事务请求先发后等）；空库时内部自动从旧 localStorage 数据迁移
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await loadStoreData()
      if (cancelled) return
      setStorageBackend(result.backend)
      setMeetings(result.data.meetings)
      setQaHistory(result.data.qaHistory)
      if (result.data.meetings.length > 0) setSelectedId(result.data.meetings[0].id)
      bootDoneRef.current = true
      setBooting(false)
      // 持久化检索索引回填（非阻塞）+ 首次占用/配额估算
      void loadPersistedIndex()
      void estimateStorage().then(({ usageKb, quotaKb }) => {
        lastEstimateRef.current = Date.now()
        setStorageSizeKb(usageKb)
        setStorageQuotaKb(quotaKb)
      })

      // ── 阶段 B：外置大文本后台逐会回填，选中会议排最前（用户此刻最可能正看着它）──
      if (result.pending.length === 0) {
        hydratedRef.current = true
        setHydrated(true)
        return
      }
      const byMeeting = new Map<string, TextField[]>()
      for (const p of result.pending) {
        const list = byMeeting.get(p.meetingId)
        if (list) list.push(p.field)
        else byMeeting.set(p.meetingId, [p.field])
      }
      const firstId = result.data.meetings[0]?.id ?? ""
      const order = [...byMeeting.keys()].sort(
        (a, b) => (a === firstId ? -1 : 0) - (b === firstId ? -1 : 0),
      )
      hydrationDoneRef.current = (async () => {
        for (const id of order) {
          if (cancelled) return
          const fields = await hydrateMeetingFields(id, byMeeting.get(id) ?? [])
          if (cancelled) return
          setMeetings((prev) =>
            prev.map((m) => {
              if (m.id !== id) return m
              const next = { ...m } as unknown as Record<string, unknown>
              for (const [f, text] of Object.entries(fields)) {
                // 只填仍是占位空串的字段：回填窗口内用户已输入的内容不被覆盖
                if (!next[f]) next[f] = text
              }
              return next as unknown as Meeting
            }),
          )
        }
      })()
      await hydrationDoneRef.current
      if (!cancelled) {
        hydratedRef.current = true
        setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── 落盘管线：单一入口 persistOnce，两条触发路径共用 ──
  // 路径一（常规编辑）：400ms 防抖攒一手，再等主线程空闲（requestIdleCallback，5s 超时兜底）；
  // 路径二（关键 AI 产出）：flushPersist 立即入队——付费结果不等防抖窗口，缩小崩溃丢失窗口。
  // 两条路径都经 saveChainRef 串行化：任何时刻最多一个 saveStoreData 在跑，先后顺序即入队顺序。
  // 写入失败（配额满 / 读回校验不过）绝不静默——置 storageError 让页面挂横幅提醒立即备份。
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  const persistOnce = useCallback(async (): Promise<void> => {
    // 两道闸门：装载完成前不落盘（防空状态覆盖库）；大文本回填完成前不落盘
    //（占位空串会被增量写入误判为「字段被清空」而删掉库内分片）
    if (!bootDoneRef.current || !hydratedRef.current) return
    // 取 ref 最新快照而非发起时闭包：flushPersist 的调用方刚 setState 完，闭包是旧的
    const snapshot = { meetings: meetingsNowRef.current, qaHistory: qaNowRef.current }
    const ok = await saveStoreData(snapshot)
    if (!ok) {
      setStorageError(
        "浏览器存储写入失败或读回校验未通过：空间可能已满，最近的改动没能可靠保存。请立即导出全库备份，并删除不再需要的旧会议",
      )
      return
    }
    setStorageError("")
    // 落盘成功后由检索域接管索引同步：倒排索引刷持久化 + 语义向量增量同步
    indexSyncRef.current?.(snapshot.meetings)
    // 占用/配额估算 10 秒节流：estimate() 是异步系统调用，不值得每次保存都打一发
    if (Date.now() - lastEstimateRef.current > 10_000) {
      lastEstimateRef.current = Date.now()
      void estimateStorage().then(({ usageKb, quotaKb }) => {
        setStorageSizeKb(usageKb)
        setStorageQuotaKb(quotaKb)
        // 健康面板的存储用量趋势：日粒度采样（当天重复采样覆盖为最新值）
        sampleStorageTrend(usageKb)
      })
    }
  }, [indexSyncRef])

  const enqueueSave = useCallback(() => {
    // 串行链：前一次落盘完成（无论成败）才开始下一次，失败不断链
    saveChainRef.current = saveChainRef.current.then(persistOnce, persistOnce)
  }, [persistOnce])

  // 关键操作（AI 生成 / 整理转写 / 导入）完成后的立即落盘：
  // 先等一拍让 React 把结果 setState 提交进 ref，再入队并等待本次写入真正完成——
  // 调用方 await 它返回即代表「结果已确认进 IndexedDB」，可以清除意图标记（lib/oplog.ts）
  const flushPersist = useCallback(
    () =>
      new Promise<void>((r) => setTimeout(r, 0))
        .then(() => {
          enqueueSave()
          return saveChainRef.current
        })
        .then(() => undefined),
    [enqueueSave],
  )

  useEffect(() => {
    if (!bootDoneRef.current || !hydrated) return
    let cancelIdle: (() => void) | null = null
    const timer = setTimeout(() => {
      cancelIdle = scheduleIdleFlush(enqueueSave)
    }, 400)
    return () => {
      clearTimeout(timer)
      cancelIdle?.()
    }
  }, [meetings, qaHistory, hydrated, enqueueSave])

  const patchMeeting = useCallback((id: string, patch: Partial<Meeting>) => {
    // 事件日志：先取变更前快照记一条字段级差异（lib/eventJournal.ts，尽力而为不阻塞），
    // 供「会议历史」时间线 / 条目履历 / 时间点回滚使用
    journalPatch(id, meetingsNowRef.current.find((m) => m.id === id), patch)
    setMeetings((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m
        // 漂移感知：转写稿实质变更时盖源头时间戳——所有派生结论据此判断「可能过时」
        const transcriptChanged =
          patch.transcript !== undefined && patch.transcript !== m.transcript
        return {
          ...m,
          ...patch,
          ...(transcriptChanged ? { transcriptUpdatedAt: Date.now() } : {}),
          updatedAt: Date.now(),
        }
      }),
    )
  }, [])

  // ── 全库备份 ──
  // 每次导出都记下时刻，设置页据此提醒「太久没备份」；
  // includeSecrets 由导出界面的显式勾选决定（默认 false = 密钥类字段剔除后才落盘）
  const stampBackup = useCallback(() => {
    setSettings((s) => ({ ...s, lastBackupAt: Date.now() }))
  }, [setSettings])

  const exportAll = useCallback(
    (includeSecrets: boolean) => {
      void (async () => {
        // 等大文本回填完成后取最新快照：备份绝不能缺转写稿
        await hydrationDoneRef.current
        // 再等一拍：回填的最后一次 setState 提交并同步到 ref 之后才取数
        await new Promise((r) => setTimeout(r, 0))
        const currentMeetings = meetingsNowRef.current
        const currentQa = qaNowRef.current
        const payload = buildBackupPayload(
          { meetings: currentMeetings, qaHistory: currentQa },
          { includeSecrets },
        )
        // 大 JSON 序列化走 Worker（>100KB 口径）：全库备份可达数十 MB，主线程不冻结
        const roughChars = currentMeetings.reduce(
          (n, m) => n + m.transcript.length + (m.cleaned?.length ?? 0),
          0,
        )
        const text = await jsonStringifyTask(payload, roughChars, 2)
        downloadTextFile(`meeting-notes-backup-${todayStr()}.json`, text, "application/json")
      })()
      stampBackup()
      pushActivity(
        "导出备份",
        "",
        `全库 ${meetings.length} 场会议已导出为 JSON 文件（${includeSecrets ? "含 Provider 密钥配置" : "不含密钥"}）`,
      )
    },
    [meetings.length, pushActivity, stampBackup],
  )

  const exportAllMarkdownBundle = useCallback(() => {
    // 同样等大文本回填完成（+一拍提交），取最新快照
    void hydrationDoneRef.current.then(() => new Promise((r) => setTimeout(r, 0))).then(() => {
      exportAllMarkdown({ meetings: meetingsNowRef.current, qaHistory: qaNowRef.current })
    })
    stampBackup()
    pushActivity("导出备份", "", `全库 ${meetings.length} 场会议已导出为 Markdown 合集`)
  }, [meetings.length, pushActivity, stampBackup])

  // 导入干跑：先报告「会写入什么」（新增几场、与本地冲突几场），用户选好冲突策略并确认后才真正写入。
  // 冲突判定：同 id（同一份备份再次导入）或标题+日期相同（同一场会议的修订版）。
  const [importPending, setImportPending] = useState<{
    parsed: BackupPayload
    matches: (string | null)[] // 每条导入会议对应的本地会议 id，null = 全新
  } | null>(null)

  const previewImport = useCallback(
    async (file: File): Promise<ImportPreview> => {
      let text: string
      try {
        text = await file.text()
      } catch {
        return { ok: false, error: "读取文件失败，请重试" }
      }
      // 大 JSON 解析走 Worker（>100KB 口径）：解析一次、版本闸门与校验共用同一对象，
      // 不再像旧版那样对同一份大文本 JSON.parse 两遍
      const raw = await jsonParseTask(text)
      const versionIssue = backupVersionIssueOf(raw)
      if (versionIssue) return { ok: false, error: versionIssue }
      const parsed = validateBackupObject(raw)
      if (!parsed) return { ok: false, error: "文件格式不对，请选择本工具导出的 JSON 备份" }
      const byId = new Map(meetings.map((m) => [m.id, m]))
      const byTitleDate = new Map(meetings.map((m) => [`${m.title.trim()}|${m.date}`, m]))
      const matches = parsed.meetings.map((inc) => {
        const sameId = byId.get(inc.id)
        if (sameId) return sameId.id
        const sameMeeting = byTitleDate.get(`${inc.title.trim()}|${inc.date}`)
        return sameMeeting ? sameMeeting.id : null
      })
      const conflicts = matches.filter(Boolean).length
      const added = matches.length - conflicts
      const existingQa = new Set(qaHistory.map((r) => r.id))
      const qaAdded = parsed.qaHistory.filter((r) => !existingQa.has(r.id)).length
      setImportPending({ parsed, matches })
      return { ok: true, added, conflicts, qaAdded }
    },
    [meetings, qaHistory],
  )

  // 确认导入：全新条目直接写入；冲突条目按用户选的策略处理（合并 / 替换 / 新增为副本）。
  const confirmImport = useCallback(
    (strategy: ImportConflictStrategy): string => {
      if (!importPending) return "没有待确认的导入"
      const { parsed, matches } = importPending
      const byId = new Map(meetings.map((m) => [m.id, m]))
      let next = meetings
      const fresh: Meeting[] = []
      let added = 0
      let merged = 0
      let replaced = 0
      let copied = 0
      parsed.meetings.forEach((inc, i) => {
        const existingId = matches[i]
        const existing = existingId ? byId.get(existingId) : undefined
        if (!existing) {
          fresh.push(byId.has(inc.id) ? { ...inc, id: newId() } : inc)
          added++
          return
        }
        if (strategy === "copy") {
          fresh.push({ ...inc, id: newId() })
          copied++
        } else if (strategy === "replace") {
          next = next.map((m) => (m.id === existing.id ? { ...inc, id: existing.id } : m))
          replaced++
        } else {
          next = next.map((m) => (m.id === existing.id ? mergeMeetings(m, inc) : m))
          merged++
        }
      })
      if (fresh.length > 0) next = [...fresh, ...next]
      setMeetings(next)
      // 备份里带服务商配置则一并恢复（换设备导入后 Provider 设置完整还原）
      if (parsed.providers) saveProvidersConfig(parsed.providers)
      // 备份里带 Agent 编排配置也一并恢复（逐字段校验，坏字段回默认）
      if (parsed.agents) setAgents(sanitizeAgentsConfig(parsed.agents))
      setQaHistory((prev) => {
        const existingIds = new Set(prev.map((r) => r.id))
        const freshQa = parsed.qaHistory.filter((r) => !existingIds.has(r.id))
        return [...prev, ...freshQa].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
      })
      setImportPending(null)
      // 导入是批量关键写入：立即落盘，不等防抖窗口
      void flushPersist()
      const detail = [
        `新增 ${added} 场`,
        merged > 0 ? `合并 ${merged} 场` : "",
        replaced > 0 ? `替换 ${replaced} 场` : "",
        copied > 0 ? `副本 ${copied} 场` : "",
      ]
        .filter(Boolean)
        .join("、")
      pushActivity("导入备份", "", detail)
      return `导入完成：${detail}`
    },
    [importPending, meetings, pushActivity, setAgents, setQaHistory, flushPersist],
  )

  const cancelImport = useCallback(() => setImportPending(null), [])

  return {
    // 核心数据（facade 分发给其余领域）
    meetings,
    setMeetings,
    selectedId,
    setSelectedId,
    qaHistory,
    setQaHistory,
    // 存储状态
    booting,
    hydrated,
    storageBackend,
    storageError,
    storageSizeKb,
    storageQuotaKb,
    storagePersisted,
    // 崩溃恢复（意图日志扫描结果）
    recoveryNotice,
    dismissRecovery,
    // 写入
    patchMeeting,
    flushPersist,
    // 备份导入导出
    exportAll,
    exportAllMarkdownBundle,
    previewImport,
    confirmImport,
    cancelImport,
  }
}
