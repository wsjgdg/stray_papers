import crypto from 'node:crypto';

// 代理响应缓存：相同（方法 + 路径 + 请求体）哈希命中后直接回放，省去上游调用与 token 消耗。
// 仅缓存非流式、成功的响应；密钥等鉴权信息不参与 key 计算。

interface CacheEntry {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  storedAt: number;
}

const store = new Map<string, CacheEntry>();

let enabled = true;
let ttlMs = 5 * 60 * 1000; // 默认 5 分钟
let hits = 0;
let misses = 0;

export function setCacheConfig(cfg: { enabled?: boolean; ttlMs?: number }): void {
  if (cfg.enabled !== undefined) enabled = cfg.enabled;
  if (cfg.ttlMs !== undefined) ttlMs = Math.max(1000, cfg.ttlMs);
}

export function getCacheConfig(): { enabled: boolean; ttlMs: number } {
  return { enabled, ttlMs };
}

export function cacheKey(method: string, path: string, body: string): string {
  return crypto.createHash('sha256').update(`${method}\n${path}\n${body}`).digest('hex');
}

export function getCached(key: string): CacheEntry | null {
  if (!enabled) return null;
  const e = store.get(key);
  if (!e) {
    misses += 1;
    return null;
  }
  if (Date.now() - e.storedAt > ttlMs) {
    store.delete(key);
    misses += 1;
    return null;
  }
  hits += 1;
  return e;
}

export function putCached(key: string, entry: CacheEntry): void {
  if (!enabled) return;
  store.set(key, entry);
}

export interface CacheStats {
  enabled: boolean;
  ttlMs: number;
  size: number;
  hits: number;
  misses: number;
}

export function getCacheStats(): CacheStats {
  return { enabled, ttlMs, size: store.size, hits, misses };
}

export function clearCache(): number {
  const n = store.size;
  store.clear();
  return n;
}
