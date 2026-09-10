import { useEffect, useState } from 'react';
import {
  fetchProxyOverview,
  getProxyToken,
  type ProxyMetrics,
  type CacheStats,
  type ProxySummary,
} from '../api';

export interface ProxyOverview {
  metrics: ProxyMetrics[];
  cache: CacheStats;
  summary: ProxySummary;
}

// B8：默认走 SSE（/api/proxy/stream）实时推送，免去前端 3s 轮询；
// 仅当 SSE 不可用（协议不支持 / 断线 / 鉴权失败）时降级为定时轮询。
export function useProxyOverview() {
  const [metrics, setMetrics] = useState<ProxyMetrics[]>([]);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [summary, setSummary] = useState<ProxySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const apply = (d: ProxyOverview) => {
      setMetrics(d.metrics);
      setCache(d.cache);
      setSummary(d.summary);
      setLoading(false);
    };

    const poll = async () => {
      try {
        apply(await fetchProxyOverview());
      } catch {
        /* 瞬时错误静默忽略，下次重试 */
      }
    };

    const token = getProxyToken();
    const url = '/api/proxy/stream' + (token ? `?token=${encodeURIComponent(token)}` : '');
    try {
      es = new EventSource(url);
      es.onmessage = (ev) => {
        try {
          apply(JSON.parse(ev.data) as ProxyOverview);
        } catch {
          /* 忽略坏帧 */
        }
      };
      es.onerror = () => {
        // SSE 不可用 → 降级轮询（仅起一个定时器）
        if (es) {
          es.close();
          es = null;
        }
        if (!pollTimer && !closed) {
          void poll();
          pollTimer = setInterval(poll, 3000);
        }
      };
    } catch {
      void poll();
      pollTimer = setInterval(poll, 3000);
    }

    return () => {
      closed = true;
      if (es) es.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [nonce]);

  return {
    metrics,
    cache,
    summary,
    loading,
    refetch: () => setNonce((n) => n + 1),
  };
}
