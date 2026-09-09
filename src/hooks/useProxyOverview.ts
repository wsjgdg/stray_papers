import { useCallback, useEffect, useState } from 'react';
import { fetchProxyOverview, type ProxyMetrics, type CacheStats, type ProxySummary } from '../api';

export interface ProxyOverview {
  metrics: ProxyMetrics[];
  cache: CacheStats;
  summary: ProxySummary;
}

// 统一轮询：服务端聚合 metrics/cache/summary 于单端点，前端仅一个定时器。
export function useProxyOverview(intervalMs = 3000) {
  const [metrics, setMetrics] = useState<ProxyMetrics[]>([]);
  const [cache, setCache] = useState<CacheStats | null>(null);
  const [summary, setSummary] = useState<ProxySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetchProxyOverview();
      setMetrics(r.metrics);
      setCache(r.cache);
      setSummary(r.summary);
    } catch {
      /* 瞬时错误静默忽略，下次轮询重试 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs, nonce]);

  return {
    metrics,
    cache,
    summary,
    loading,
    refetch: () => setNonce((n) => n + 1),
  };
}
