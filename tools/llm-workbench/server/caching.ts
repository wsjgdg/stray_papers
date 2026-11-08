// B9：从 proxy.ts 拆出的「响应缓存 SWR 后台刷新」逻辑。
// 注册缓存刷新回调：命中 stale 时由 responseCache 的 triggerRefresh 调用，
// 用条目携带的下游配方重新请求上游并回填新鲜值（失败非致命）。
import { fetch as upstreamFetch } from 'undici';
import { getReplay, putCached, setCacheRefreshHandler, type CacheReplay } from './responseCache.js';
import { getDispatcher } from './httpAgent.js';

async function refreshCacheEntry(key: string): Promise<void> {
  const r = getReplay(key);
  if (!r) return;
  try {
    const resp = await upstreamFetch(r.url, {
      method: r.method,
      headers: r.headers,
      body: r.body || undefined,
      redirect: 'manual',
      dispatcher: getDispatcher(r.providerId),
    });
    if (resp.status >= 200 && resp.status < 300) {
      const buf = Buffer.from(await resp.arrayBuffer());
      const headers: Record<string, string> = {};
      const ct = resp.headers.get('content-type');
      if (ct) headers['content-type'] = ct;
      const cc = resp.headers.get('cache-control');
      if (cc) headers['cache-control'] = cc;
      putCached(key, { status: resp.status, headers, body: buf, storedAt: Date.now() }, r);
    }
  } catch {
    /* 后台刷新失败非致命：条目保持 stale，下次请求再触发 */
  }
}

/** 向 responseCache 注册 SWR 后台刷新回调（proxy.ts 在模块加载时调用一次） */
export function registerCacheRefreshHandler(): void {
  setCacheRefreshHandler((key) => {
    void refreshCacheEntry(key);
  });
}

// 兼容旧引用类型：刷新配方由 responseCache 定义
export type { CacheReplay };
