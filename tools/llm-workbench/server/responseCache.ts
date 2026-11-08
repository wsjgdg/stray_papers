import crypto from 'node:crypto';

// 代理响应缓存：相同（方法 + 路径 + 请求体）哈希命中后直接回放，省去上游调用与 token 消耗。
// 仅缓存非流式、成功的响应；密钥等鉴权信息不参与 key 计算。
//
// 容量约束：进程常驻（Electron / 双击 exe）场景必须限容，否则缓存只增不减。
// 这里用「插入序 Map + 双阈值（条目数 / 字节数）」做 LRU 淘汰（命中移尾），并配合主动过期清理。
//
// B7：在既有 LRU（命中移尾）之上，新增 stale-while-revalidate（SWR）：
//   TTL 过期后 `swrMs` 窗口内仍回放旧值（响应头标记 `x-cache: STALE`），并异步后台刷新，
//   下次请求即拿到新鲜值。窗口外（或无可用 replay）按正常 miss 处理并淘汰。

export interface CacheReplay {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  providerId: string;
}

interface CacheEntry {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  storedAt: number;
  /** 后台刷新所需的下游请求配方（含鉴权头）；缺省则 TTL 过期后不可 SWR 回放 */
  replay?: CacheReplay;
}

export type CacheState = 'fresh' | 'stale' | 'miss';

export interface CacheLookup {
  state: CacheState;
  entry: CacheEntry | null;
}

const store = new Map<string, CacheEntry>();

const MAX_ENTRIES = 256;
const MAX_BYTES = 64 * 1024 * 1024; // 64MB

const SWR_MS_DEFAULT = Number(process.env.CACHE_SWR_MS ?? 30_000);

let enabled = true;
let ttlMs = 5 * 60 * 1000; // 默认 5 分钟
let swrMs = Number.isFinite(SWR_MS_DEFAULT) && SWR_MS_DEFAULT >= 0 ? SWR_MS_DEFAULT : 30_000;
let hits = 0;
let misses = 0;
let bytes = 0;
let evictions = 0;
let expired = 0;

let refreshHandler: ((key: string) => void) | null = null;

export function setCacheConfig(cfg: { enabled?: boolean; ttlMs?: number; swrMs?: number }): void {
  if (cfg.enabled !== undefined) enabled = cfg.enabled;
  if (cfg.ttlMs !== undefined) ttlMs = Math.max(1000, cfg.ttlMs);
  if (cfg.swrMs !== undefined) swrMs = Math.max(0, cfg.swrMs);
}

export function getCacheConfig(): { enabled: boolean; ttlMs: number; swrMs: number } {
  return { enabled, ttlMs, swrMs };
}

export function cacheKey(method: string, path: string, body: string, provider?: string): string {
  return crypto
    .createHash('sha256')
    .update(`${provider ?? '*'}\n${method}\n${path}\n${body}`)
    .digest('hex');
}

function drop(key: string): void {
  const e = store.get(key);
  if (!e) return;
  bytes -= e.body.byteLength;
  store.delete(key);
}

/** 主动清理过期条目：缓存不依赖「再次被请求」才回收，避免常驻进程内存单调增长 */
export function sweepExpired(): number {
  const now = Date.now();
  let n = 0;
  for (const [k, e] of store) {
    if (now - e.storedAt > ttlMs + Math.max(0, swrMs)) {
      drop(k);
      expired += 1;
      n += 1;
    }
  }
  return n;
}

/** 按条目数 / 字节数双阈值淘汰最旧条目（Map 保持 LRU 序，首个 key 即最久未用） */
function evictIfNeeded(): void {
  while (store.size > 0 && (store.size > MAX_ENTRIES || bytes > MAX_BYTES)) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    drop(oldest);
    evictions += 1;
  }
}

/**
 * 查询缓存。返回三态：
 *  - fresh：TTL 内，直接回放；
 *  - stale：TTL 过期但在 SWR 窗口内且有 replay，立即回放旧值（调用方应触发后台刷新）；
 *  - miss：无命中 / 已过期且无 SWR / SWR 但缺 replay，按正常未命中处理（调用方应转发上游）。
 * 命中（fresh 或 stale）均执行「移尾」以维持 LRU 序。
 */
export function getCached(key: string): CacheLookup {
  if (!enabled) {
    misses += 1;
    return { state: 'miss', entry: null };
  }
  const e = store.get(key);
  if (!e) {
    misses += 1;
    return { state: 'miss', entry: null };
  }
  const age = Date.now() - e.storedAt;
  // fresh：TTL 内
  if (age <= ttlMs) {
    store.delete(key);
    store.set(key, e);
    hits += 1;
    return { state: 'fresh', entry: e };
  }
  // stale：TTL 已过、仍在 SWR 窗口内、且具备后台刷新配方 → 立即回放并提示刷新
  if (swrMs > 0 && age <= ttlMs + swrMs && e.replay) {
    store.delete(key);
    store.set(key, e);
    hits += 1;
    return { state: 'stale', entry: e };
  }
  // miss：过期且无 SWR 能力，淘汰
  drop(key);
  expired += 1;
  misses += 1;
  return { state: 'miss', entry: null };
}

/** 取某 key 的 SWR 后台刷新配方；无则返回 null（不可刷新） */
export function getReplay(key: string): CacheReplay | null {
  return store.get(key)?.replay ?? null;
}

/** 注册 SWR 后台刷新回调（由 proxy 注入，负责用 replay 配方重新请求上游并 putCached）；传 null 可清除 */
export function setCacheRefreshHandler(fn: ((key: string) => void) | null): void {
  refreshHandler = fn;
}

/** 触发一次后台刷新（fire-and-forget）。无 handler 或无 replay 时静默无操作。 */
export function triggerRefresh(key: string): void {
  if (!refreshHandler) return;
  try {
    refreshHandler(key);
  } catch {
    /* 后台刷新触发异常不阻塞主链路 */
  }
}

export function putCached(key: string, entry: CacheEntry, replay?: CacheReplay): void {
  if (!enabled) return;
  // 尊重上游的 no-store / private 指令
  const cc = (entry.headers['cache-control'] ?? '').toLowerCase();
  if (cc.includes('no-store') || cc.includes('private')) return;
  // 单条响应过大直接不缓存（避免一次塞满预算）
  if (entry.body.byteLength > MAX_BYTES) return;

  if (store.has(key)) drop(key);
  // 保留调用方传入的 storedAt（SWR 刷新由 proxy/refreshHandler 显式传 Date.now() 续期）
  const toStore: CacheEntry = { ...entry };
  if (replay) toStore.replay = replay;
  store.set(key, toStore);
  bytes += entry.body.byteLength;
  evictIfNeeded();
}

export interface CacheStats {
  enabled: boolean;
  ttlMs: number;
  swrMs: number;
  size: number;
  hits: number;
  misses: number;
  bytes: number;
  evictions: number;
  expired: number;
  maxEntries: number;
  maxBytes: number;
}

export function getCacheStats(): CacheStats {
  sweepExpired();
  return {
    enabled,
    ttlMs,
    swrMs,
    size: store.size,
    hits,
    misses,
    bytes,
    evictions,
    expired,
    maxEntries: MAX_ENTRIES,
    maxBytes: MAX_BYTES,
  };
}

export function clearCache(): number {
  const n = store.size;
  store.clear();
  bytes = 0;
  return n;
}
