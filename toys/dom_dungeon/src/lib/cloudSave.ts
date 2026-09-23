/**
 * 《标签地牢》云存档（离线降级）。
 * 原设计是把本地进度备份到云端 / 从云端拉回覆盖本地；
 * 独立构建下不做任何网络请求，失败由调用方决定提示文案，这里不弹任何东西。
 */

import { getRhPlayerId } from "@/lib/dailyScore"
import {
  normalizeDungeonSave,
  writeDungeonSave,
  type DungeonSave,
} from "@/lib/dungeonSave"
// 离线降级：以下原平台能力在本地构建中降级为无操作（无服务端、不登录、不弹计费）。
function getApiBase(): string {
  return ""
}
function getAuthHeaders(): Record<string, string> {
  return {}
}

const COLLECTION_PATH = "/api/player_saves"

export type CloudSaveErrorKind = "auth" | "network" | "server"

/** 云存档失败：调用方按 kind 决定提示，别在这里弹窗 */
export class CloudSaveError extends Error {
  readonly kind: CloudSaveErrorKind

  constructor(kind: CloudSaveErrorKind, message: string) {
    super(message)
    this.name = "CloudSaveError"
    this.kind = kind
  }
}

/** 云端一条进度记录：字段名与后端 100% 一致（snake_case），不做 camelCase 转换 */
export type CloudSaveRow = {
  id: string
  player_id: string
  payload: DungeonSave
  fragments: number
  best_floor: number
  updated_ms: number
}

/** 哪份更新：先比最深层数，层数相同比碎片数，都相同以本地为准 */
export type SaveFreshness = "local" | "cloud"

export function compareSaveFreshness(
  local: Pick<DungeonSave, "bestFloor" | "fragments">,
  cloud: Pick<CloudSaveRow, "best_floor" | "fragments">,
): SaveFreshness {
  if (cloud.best_floor !== local.bestFloor) {
    return cloud.best_floor > local.bestFloor ? "cloud" : "local"
  }
  if (cloud.fragments !== local.fragments) {
    return cloud.fragments > local.fragments ? "cloud" : "local"
  }
  return "local"
}

/** 上次备份时间展示：2026-09-21 14:05；没有就回一句「还没备份过」 */
export function formatBackupTime(value: string | null): string {
  if (!value) return "还没备份过"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "还没备份过"
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* ------------------------------------------------------------------ *
 * 网络（走相对路径，离线，无服务端）
 * ------------------------------------------------------------------ */

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function normalizeRow(raw: unknown): CloudSaveRow | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === "string" ? row.id : ""
  if (!id) return null
  return {
    id,
    player_id: typeof row.player_id === "string" ? row.player_id : "",
    payload: normalizeDungeonSave(
      row.payload && typeof row.payload === "object"
        ? (row.payload as Partial<DungeonSave>)
        : null,
    ),
    fragments: toNumber(row.fragments),
    best_floor: toNumber(row.best_floor),
    updated_ms: toNumber(row.updated_ms),
  }
}

function requirePlayerId(): string {
  const playerId = getRhPlayerId()
  if (!playerId) {
    throw new CloudSaveError("auth", "登录后才能把进度存到云端")
  }
  return playerId
}

async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${getApiBase()}${path}`, init)
  } catch {
    throw new CloudSaveError("network", "连不上云端，检查一下网络再试")
  }
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 401 || res.status === 403 || res.status === 412) {
    throw new CloudSaveError("auth", "登录状态好像过期了，重新登录一下再试")
  }
  if (!res.ok) {
    throw new CloudSaveError("server", `云端暂时没响应（${res.status}）`)
  }
  try {
    return await res.json()
  } catch {
    throw new CloudSaveError("server", "云端返回的内容看不懂")
  }
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...getAuthHeaders() }
}

/* ------------------------------------------------------------------ *
 * 对外 API
 * ------------------------------------------------------------------ */

/** 拉当前登录玩家的那份云存档；还没备份过返回 null */
export async function fetchCloudSave(): Promise<CloudSaveRow | null> {
  const playerId = requirePlayerId()
  const params = new URLSearchParams({
    player_id: playerId,
    perPage: "1",
    sort: "-updated_ms",
  })
  const res = await request(`${COLLECTION_PATH}?${params.toString()}`, {
    headers: { ...getAuthHeaders() },
  })
  const data = await readBody(res)
  const items = (data as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return null
  const rows = items
    .map(normalizeRow)
    .filter((row): row is CloudSaveRow => row !== null)
  return rows.length > 0 ? rows[0] : null
}

/**
 * 上传 / 覆盖当前进度。一个玩家只留一条：先查后写，
 * 已存在就 PATCH，不存在才 create。
 */
export async function pushCloudSave(save: DungeonSave): Promise<CloudSaveRow> {
  const playerId = requirePlayerId()
  const existing = await fetchCloudSave()

  const body = {
    player_id: playerId,
    payload: save,
    fragments: save.fragments,
    best_floor: save.bestFloor,
    updated_ms: Date.now(),
  }

  const res = existing
    ? await request(`${COLLECTION_PATH}/${existing.id}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      })
    : await request(COLLECTION_PATH, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      })

  const data = await readBody(res)
  const row = normalizeRow(data)
  if (!row) {
    throw new CloudSaveError("server", "云端没确认这次备份，稍后再试")
  }
  return row
}

/** 用云端那份覆盖本地存档，并把「上次备份时间」记成云端那条的更新时间 */
export function applyCloudSave(row: CloudSaveRow): DungeonSave {
  const restored = normalizeDungeonSave(row.payload)
  const at =
    row.updated_ms > 0
      ? new Date(row.updated_ms).toISOString()
      : new Date().toISOString()
  return writeDungeonSave({ ...restored, cloudBackupAt: at })
}

/** 备份成功后在本机记一笔「上次备份时间」，云端那份不动 */
export function markLocalBackup(save: DungeonSave): DungeonSave {
  return writeDungeonSave({ ...save, cloudBackupAt: new Date().toISOString() })
}
