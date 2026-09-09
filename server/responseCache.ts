import crypto from 'node:crypto';

// 代理响应缓存：相同（方法 + 路径 + 请求体）哈希命中后直接回放，省去上游调用与 token 消耗。
// 仅缓存非流式、成功的响应；密钥等鉴权信息不参与 key 计算。
//
// 容量约束：进程常驻（Electron / 双击 exe）场景必须限容，否则缓存只增不减。
// 这里用「插入序 Map + 双阈值（条目数 / 字节数）」做 FIFO 淘汰，并配合主动过期清理。

interface CacheEntry {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  storedAt: number;
}

const store = new Map<string, CacheEntry>();

const MAX_ENTRIES = 256;
const MAX_BYTES = 64 * 1024 * 1024; // 64MB

let enabled = true;
let ttlMs = 5 * 60 * 1000; // 默认 5 分钟
let hits = 0;
let misses = 0;
let bytes = 0;
let evictions = 0;
let expired = 0;

export function setCacheConfig(cfg: { enabled?: boolean; ttlMs?: number }): void {
  if (cfg.enabled !== undefined) enabled = cfg.enabled;
  if (cfg.ttlMs !== undefined) ttlMs = Math.max(1000, cfg.ttlMs);
}

export function getCacheConfig(): { enabled: boolean; ttlMs: number } {
  return { enabled, ttlMs };
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
    if (now - e.storedAt > ttlMs) {
      drop(k);
      expired += 1;
      n += 1;
    }
  }
  return n;
}

/** 按条目数 / 字节数双阈值淘汰最旧条目（Map 保持插入序，首个 key 即最旧） */
function evictIfNeeded(): void {
  while (store.size > 0 && (store.size > MAX_ENTRIES || bytes > MAX_BYTES)) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    drop(oldest);
    evictions += 1;
  }
}

export function getCached(key: string): CacheEntry | null {
  if (!enabled) {
    misses += 1;
    return null;
  }
  const e = store.get(key);
  if (!e) {
    misses += 1;
    return null;
  }
  if (Date.now() - e.storedAt > ttlMs) {
    drop(key);
    expired += 1;
    misses += 1;
    return null;
  }
  // 命中后移到末尾，使 Map 保持 LRU 序
  store.delete(key);
  store.set(key, e);
  hits += 1;
  return e;
}

export function putCached(key: string, entry: CacheEntry): void {
  if (!enabled) return;
  // 尊重上游的 no-store / private 指令
  const cc = (entry.headers['cache-control'] ?? '').toLowerCase();
  if (cc.includes('no-store') || cc.includes('private')) return;
  // 单条响应过大直接不缓存（避免一次塞满预算）
  if (entry.body.byteLength > MAX_BYTES) return;

  if (store.has(key)) drop(key);
  store.set(key, entry);
  bytes += entry.body.byteLength;
  evictIfNeeded();
}

export interface CacheStats {
  enabled: boolean;
  ttlMs: number;
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
