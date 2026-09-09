import { useCallback, useState } from 'react';
import { Key } from 'lucide-react';
import { fetchProxyLogs, fmtTime, type ProxyLog, type MaskedProviderConfig } from '../../api';
import { Chip, Empty, Spinner } from '../../ui';
import type { ProviderConsole } from '../../../server/types';
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling';

// ───────── 日志 ─────────
export function LogsPanel({
  providers,
  cfg,
}: {
  providers: ProviderConsole[];
  cfg: Record<string, MaskedProviderConfig>;
}) {
  const [logs, setLogs] = useState<ProxyLog[]>([]);
  const [filterProvider, setFilterProvider] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ok' | 'error' | ''>('');
  const [loading, setLoading] = useState(true);

  // 合并主流厂商 + 自定义厂商（来自 cfg）作为筛选下拉项
  const providerOptions = [
    ...providers.map((p) => ({ id: p.id, name: p.nameCn || p.name })),
    ...Object.entries(cfg)
      .filter(([, c]) => c.custom)
      .map(([id, c]) => ({ id, name: c.name || id })),
  ];

  const load = useCallback(async () => {
    try {
      setLogs(
        await fetchProxyLogs({
          provider: filterProvider || undefined,
          status: (filterStatus || undefined) as 'ok' | 'error' | undefined,
          limit: 200,
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [filterProvider, filterStatus]);

  useVisibilityPolling(3000, load, [filterProvider, filterStatus]);

  if (loading) return <Spinner label="加载日志…" />;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Key size={13} className="text-muted" />
        <select
          className="input w-auto"
          value={filterProvider}
          onChange={(e) => setFilterProvider(e.target.value)}
        >
          <option value="">全部厂商</option>
          {providerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'ok' | 'error' | '')}
        >
          <option value="">全部状态</option>
          <option value="ok">成功</option>
          <option value="error">错误</option>
        </select>
      </div>
      {logs.length === 0 ? (
        <Empty text="暂无日志" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge">
          <table className="w-full text-[11px]">
            <thead className="bg-[#0e1728] text-muted">
              <tr>
                <th className="px-2 py-1.5 text-left">时间</th>
                <th className="px-2 py-1.5 text-left">厂商</th>
                <th className="px-2 py-1.5 text-left">模型</th>
                <th className="px-2 py-1.5 text-left">路径</th>
                <th className="px-2 py-1.5 text-left">状态</th>
                <th className="px-2 py-1.5 text-right">延迟</th>
                <th className="px-2 py-1.5 text-right">in/out</th>
                <th className="px-2 py-1.5 text-right">缓存</th>
                <th className="px-2 py-1.5 text-right">成本</th>
                <th className="px-2 py-1.5 text-left">错误</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-edge">
                  <td className="px-2 py-1 text-muted">{fmtTime(l.ts)}</td>
                  <td className="px-2 py-1 text-ink">
                    <span className="flex items-center gap-1">
                      {l.provider}
                      {l.fromCache && (
                        <span className="rounded bg-accent/15 px-1 text-[9px] text-accent">
                          CACHE
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-ink">{l.model}</td>
                  <td className="px-2 py-1 text-muted">
                    {l.method} {l.path}
                  </td>
                  <td className="px-2 py-1">
                    <Chip tone={l.status != null && l.status < 400 ? 'down' : 'up'}>
                      {l.status ?? 'ERR'}
                    </Chip>
                  </td>
                  <td className="px-2 py-1 text-right text-ink">
                    {l.latencyMs}ms{l.ttftMs != null ? ` · TT ${l.ttftMs}` : ''}
                  </td>
                  <td className="px-2 py-1 text-right text-ink">
                    {l.inputTokens ?? '—'}/{l.outputTokens ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-right text-accent">
                    {l.cacheHitRate != null ? `${(l.cacheHitRate * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-ink">
                    ${l.costUsd.toFixed(4)}
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-1 text-up" title={l.error ?? ''}>
                    {l.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
