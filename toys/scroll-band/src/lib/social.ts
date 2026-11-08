// 滚动乐团 · 公共画廊与天梯榜（本地 IndexedDB 实现，零后端）
//   原 VibeX 版走 PocketBase 自定义路由 /api/works、/api/scores、/api/levels；
//   现改为浏览器 IndexedDB（见 lib/localStore.ts），离线可用、无外部依赖。
import { newId, patchOne, putOne, readAll, type StoreName } from "@/lib/localStore"

export interface WorkItem {
  id: string
  title: string
  canvas: string
  tcode: string
  nick: string
  created: string
  /** 接龙账本（encodeRelayParam 产物）；非接龙作品为空 */
  relay?: string
}

export interface ScoreItem {
  id: string
  level: number
  nick: string
  grade: string
  acc: number
  combo: number
  /** 生存模式坚持秒数（level=100/200 的成绩专用，其他关卡缺省） */
  dur?: number
  /** 每日挑战日期键 "YYYY-MM-DD"（level=200 专用） */
  day?: string
  /** 每日挑战命中音数（level=200 专用） */
  hits?: number
}

const NICK_KEY = "so-nick"

export function getNick(): string {
  try {
    return window.localStorage.getItem(NICK_KEY) || ""
  } catch {
    return ""
  }
}

export function setNick(name: string): void {
  try {
    window.localStorage.setItem(NICK_KEY, name.slice(0, 24))
  } catch {
    // 忽略
  }
}

/** 展示用昵称：未设置时给一个温和的默认 */
export function displayNick(): string {
  return getNick().trim() || "匿名乐手"
}

async function readStore<T>(name: StoreName): Promise<T[]> {
  try {
    return (await readAll(name)) as T[]
  } catch {
    return []
  }
}

export async function listWorks(size = 20): Promise<WorkItem[]> {
  const items = (await readStore<WorkItem>("works")).slice()
  items.sort((a, b) => (b.created || "").localeCompare(a.created || ""))
  return items.slice(0, size)
}

export async function publishWork(args: {
  title: string
  canvas: string
  tcode: string
  nick: string
  relay?: string
}): Promise<boolean> {
  try {
    const item: WorkItem = { id: newId(), created: new Date().toISOString(), ...args }
    await putOne("works", item as unknown as Record<string, unknown>)
    return true
  } catch {
    return false
  }
}

export async function listTopScores(level: number, size = 5): Promise<ScoreItem[]> {
  const items = (await readStore<ScoreItem>("scores"))
    .filter((s) => s.level === level)
    .sort((a, b) => b.combo - a.combo || b.acc - a.acc)
  return items.slice(0, size)
}

// ---- UGC 自定义关卡库（本地 IndexedDB：list + create + update） ----

export interface LevelItem {
  id: string
  title: string
  code: string
  bpm: number
  stars: number
  notes: number
  nick: string
  plays: number
}

export async function listLevels(): Promise<LevelItem[]> {
  const items = (await readStore<LevelItem>("levels")).slice()
  items.sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title))
  return items
}

/** 发布一张关卡；成功返回记录 id，失败 null */
export async function publishLevel(args: {
  title: string
  code: string
  bpm: number
  stars: number
  notes: number
  nick: string
}): Promise<string | null> {
  try {
    const id = newId()
    await putOne("levels", { id, plays: 0, ...args } as unknown as Record<string, unknown>)
    return id
  } catch {
    return null
  }
}

/** 开打回写 plays+1：尽力而为，失败静默（不打断游玩） */
export function patchLevelPlays(id: string, plays: number): void {
  void patchOne("levels", id, { plays }).catch(() => undefined)
}

export async function findLevelById(id: string): Promise<LevelItem | null> {
  const items = await readStore<LevelItem>("levels")
  return items.find((x) => x.id === id) ?? null
}

export async function submitScore(args: {
  level: number
  nick: string
  grade: string
  acc: number
  combo: number
  /** 生存模式坚持秒数（level=100/200 专用） */
  dur?: number
  /** 每日挑战（level=200）：日期键与命中音数 */
  day?: string
  hits?: number
}): Promise<boolean> {
  try {
    await putOne("scores", { id: newId(), ...args } as unknown as Record<string, unknown>)
    return true
  } catch {
    return false
  }
}
