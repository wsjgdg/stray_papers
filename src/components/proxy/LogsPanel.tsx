import { useCallback, useState } from 'react';
import { Key, RotateCw } from 'lucide-react';
import {
  fetchProxyLogs,
  fmtTime,
  replayProxyLog,
  type ProxyLog,
  type ReplayResult,
  type MaskedProviderConfig,
} from '../../api';
import { Card, Chip, Empty, Spinner } from '../../ui';
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
  // B5：历史日志（落盘 ndjson）加载开关 + 是否可用
  const [historyMode, setHistoryMode] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  // B4：请求重放
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayFor, setReplayFor] = useState<string | null>(null);
  const [replayErr, setReplayErr] = useState<string | null>(null);

  const doReplay = async (requestId: string) => {
    setReplayFor(requestId);
    setReplayErr(null);
    setReplay(null);
    try {
      setReplay(await replayProxyLog(requestId));
    } catch (e) {
      setReplayErr((e as Error).message);
    } finally {
      setReplayFor(null);
    }
  };

  // 合并主流厂商 + 自定义厂商（来自 cfg）作为筛选下拉项
  const providerOptions = [
    ...providers.map((p) => ({ id: p.id, name: p.nameCn || p.name })),
    ...Object.entries(cfg)
      .filter(([, c]) => c.custom)
      .map(([id, c]) => ({ id, name: c.name || id })),
  ];

  const load = useCallback(async () => {
    try {
      const r = await fetchProxyLogs({
        provider: filterProvider || undefined,
        status: (filterStatus || undefined) as 'ok' | 'error' | undefined,
        limit: historyMode ? 500 : 200,
        history: historyMode,
      });
      setLogs(r.logs);
      setHistoryAvailable(r.historyAvailable);
    } finally {
      setLoading(false);
    }
  }, [filterProvider, filterStatus, historyMode]);

  useVisibilityPolling(3000, load, [filterProvider, filterStatus, historyMode]);

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
        {historyAvailable && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setHistoryMode((v) => !v)}
            title="加载重启前落盘的结构化日志（LOG_PERSIST=1 时记录）"
          >
            {historyMode ? '返回实时' : '加载历史'}
          </button>
        )}
      </div>
      {historyMode && (
        <div className="rounded-md border border-edge bg-[#0e1728] px-3 py-1.5 text-[11px] text-muted">
          历史模式：展示落盘的结构化日志（重启前记录），按时间倒序，最多 500 条。
        </div>
      )}
      {logs.length === 0 ? (
        <Empty text="暂无日志" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge">
          <table className="w-full text-[11px]">
            <thead className="bg-[#0e1728] text-muted">
              <tr>
                <th className="px-2 py-1.5 text-left">时间</th>
                <th className="px-2 py-1.5 text-left">ReqID</th>
                <th className="px-2 py-1.5 text-left">厂商</th>
                <th className="px-2 py-1.5 text-left">模型</th>
                <th className="px-2 py-1.5 text-left">标签</th>
                <th className="px-2 py-1.5 text-left">路径</th>
                <th className="px-2 py-1.5 text-left">状态</th>
                <th className="px-2 py-1.5 text-right">延迟</th>
                <th className="px-2 py-1.5 text-right">in/out</th>
                <th className="px-2 py-1.5 text-right">缓存</th>
                <th className="px-2 py-1.5 text-right">成本</th>
                <th className="px-2 py-1.5 text-left">错误</th>
                <th className="px-2 py-1.5 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-edge">
                  <td className="px-2 py-1 text-muted">{fmtTime(l.ts)}</td>
                  <td
                    className="px-2 py-1 font-mono text-[10px] text-muted"
                    title={l.requestId ?? ''}
                  >
                    {l.requestId ? l.requestId.slice(0, 8) : '—'}
                  </td>
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
                  <td className="px-2 py-1">
                    {l.tag ? (
                      <span className="rounded bg-[#1d2a44] px-1.5 py-0.5 font-mono text-[10px] text-accent">
                        {l.tag}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted">—</span>
                    )}
                  </td>
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
                  <td className="px-2 py-1">
                    <button
                      className="btn btn-ghost btn-sm"
                      title={
                        l.hasReqBody
                          ? '用存档请求体重发一次（不含鉴权头，使用当前配置的 Key）'
                          : '无请求体存档，无法重放'
                      }
                      disabled={!l.requestId || !l.hasReqBody || replayFor === l.requestId}
                      onClick={() => l.requestId && doReplay(l.requestId)}
                    >
                      <RotateCw size={11} />
                      {replayFor === l.requestId ? '重放中…' : '重放'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(replay || replayErr) && (
        <Card
          title="重放结果（B4）"
          subtitle="用存档请求体经代理重发，与原始记录并排对比；重放同样计入指标与成本"
          right={
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setReplay(null);
                setReplayErr(null);
              }}
            >
              关闭
            </button>
          }
        >
          {replayErr && <div className="text-[11px] text-up">{replayErr}</div>}
          {replay && (
            <div className="space-y-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">原始</span>
                <Chip
                  tone={
                    replay.original.status != null && replay.original.status < 400 ? 'down' : 'up'
                  }
                >
                  {replay.original.status ?? 'ERR'}
                </Chip>
                <span className="text-ink">{replay.original.latencyMs}ms</span>
                <span className="text-muted">${replay.original.costUsd.toFixed(4)}</span>
                <span className="max-w-[160px] truncate text-muted">{replay.original.model}</span>
                <span className="mx-1 text-muted">→</span>
                <span className="text-muted">重放</span>
                <Chip tone={replay.replay.status < 400 ? 'down' : 'up'}>
                  {replay.replay.status}
                </Chip>
                <span className="text-ink">{replay.replay.latencyMs}ms</span>
                {replay.replay.cache && (
                  <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">
                    {replay.replay.cache}
                  </span>
                )}
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-[#0d1728] p-2 font-mono text-[10px] leading-relaxed text-ink">
                {replay.replay.body}
              </pre>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
