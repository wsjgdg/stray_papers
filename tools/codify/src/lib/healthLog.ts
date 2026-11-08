// 健康趋势日志：为设置页「健康面板」提供两类低频采样——
//   1. 存储用量趋势：每天最多一条（当天多次采样覆盖为最新值），保留 35 天；
//   2. 语义索引重建时刻：手动「重建索引」时打点，保留最近 200 次。
// AI 调用成功率 / 延迟 / 降级不在这——那在 usageLog（调用账本）里，面板打开时一并聚合。
// 纯 localStorage，写失败静默（趋势数据尽力而为，不值得打扰用户）。

const HEALTH_KEY = "meeting-notes-health-v1"
const TREND_CAP = 35
const REBUILD_CAP = 200

export interface StorageSample {
  day: string // yyyy-mm-dd（本地时区）
  usageKb: number
}

export interface HealthState {
  storageTrend: StorageSample[]
  indexRebuilds: number[] // 时刻戳，新 → 旧
}

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

export function loadHealth(): HealthState {
  try {
    const raw = localStorage.getItem(HEALTH_KEY)
    if (!raw) return { storageTrend: [], indexRebuilds: [] }
    const obj = JSON.parse(raw) as Partial<HealthState>
    return {
      storageTrend: Array.isArray(obj.storageTrend) ? obj.storageTrend.slice(-TREND_CAP) : [],
      indexRebuilds: Array.isArray(obj.indexRebuilds) ? obj.indexRebuilds.slice(0, REBUILD_CAP) : [],
    }
  } catch {
    return { storageTrend: [], indexRebuilds: [] }
  }
}

function saveHealth(state: HealthState): void {
  try {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

/** 存储用量采样：同一天覆盖为最新值（趋势看的是日粒度），由持久化管线的配额估算顺带调用 */
export function sampleStorageTrend(usageKb: number): void {
  if (!Number.isFinite(usageKb) || usageKb <= 0) return
  const state = loadHealth()
  const key = dayKey(new Date())
  const trend = state.storageTrend.filter((s) => s.day !== key)
  trend.push({ day: key, usageKb: Math.round(usageKb) })
  saveHealth({ ...state, storageTrend: trend.slice(-TREND_CAP) })
}

/** 语义索引手动重建打点 */
export function bumpIndexRebuild(): void {
  const state = loadHealth()
  saveHealth({ ...state, indexRebuilds: [Date.now(), ...state.indexRebuilds].slice(0, REBUILD_CAP) })
}

// ── 面板聚合（在库函数里取 Date.now()，组件渲染体保持纯净）──

export interface HealthPanelData {
  storageTrend: StorageSample[] // 最近 30 天
  rebuilds30: number // 近 30 天手动重建次数
  lastRebuild: number | null // 最近一次重建时刻
}

export function loadHealthPanel(): HealthPanelData {
  const state = loadHealth()
  const cutoff = Date.now() - 30 * 86_400_000
  return {
    storageTrend: state.storageTrend.slice(-30),
    rebuilds30: state.indexRebuilds.filter((ts) => ts >= cutoff).length,
    lastRebuild: state.indexRebuilds[0] ?? null,
  }
}
