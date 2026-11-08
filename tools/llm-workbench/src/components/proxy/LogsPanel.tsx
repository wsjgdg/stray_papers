import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Key, RotateCw, Search, X } from 'lucide-react';
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
import { useDismissable } from '../../hooks/useDismissable';
import { useColumnPrefs } from '../../hooks/useColumnPrefs';
import { ColumnPicker } from '../ColumnPicker';

// D5：列定义集中一处 → 表头、单元格、列显隐共用同一份
interface LogColDef {
  key: string;
  label: string;
  thClass?: string;
  tdClass?: string;
  cell: (l: ProxyLog) => ReactNode;
}

const LOG_COLUMNS: LogColDef[] = [
  {
    key: 'ts',
    label: '时间',
    thClass: 'text-left',
    tdClass: 'text-muted',
    cell: (l) => fmtTime(l.ts),
  },
  {
    key: 'requestId',
    label: 'ReqID',
    thClass: 'text-left',
    tdClass: 'font-mono text-[10px] text-muted',
    cell: (l) => (
      <span title={l.requestId ?? ''}>{l.requestId ? l.requestId.slice(0, 8) : '—'}</span>
    ),
  },
  {
    key: 'provider',
    label: '厂商',
    thClass: 'text-left',
    tdClass: 'text-ink',
    cell: (l) => (
      <span className="flex items-center gap-1">
        {l.provider}
        {l.fromCache && (
          <span className="rounded bg-accent/15 px-1 text-[9px] text-accent">CACHE</span>
        )}
      </span>
    ),
  },
  { key: 'model', label: '模型', thClass: 'text-left', tdClass: 'text-ink', cell: (l) => l.model },
  {
    key: 'tag',
    label: '标签',
    thClass: 'text-left',
    cell: (l) =>
      l.tag ? (
        <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[10px] text-accent">
          {l.tag}
        </span>
      ) : (
        <span className="text-[10px] text-muted">—</span>
      ),
  },
  {
    key: 'path',
    label: '路径',
    thClass: 'text-left',
    tdClass: 'text-muted',
    cell: (l) => `${l.method} ${l.path}`,
  },
  {
    key: 'status',
    label: '状态',
    thClass: 'text-left',
    cell: (l) => (
      <Chip tone={l.status != null && l.status < 400 ? 'down' : 'up'}>{l.status ?? 'ERR'}</Chip>
    ),
  },
  {
    key: 'latency',
    label: '延迟',
    thClass: 'text-right',
    tdClass: 'text-right text-ink',
    cell: (l) => `${l.latencyMs}ms${l.ttftMs != null ? ` · TT ${l.ttftMs}` : ''}`,
  },
  {
    key: 'tokens',
    label: 'in/out',
    thClass: 'text-right',
    tdClass: 'text-right text-ink',
    cell: (l) => `${l.inputTokens ?? '—'}/${l.outputTokens ?? '—'}`,
  },
  {
    key: 'cache',
    label: '缓存',
    thClass: 'text-right',
    tdClass: 'text-right text-accent',
    cell: (l) => (l.cacheHitRate != null ? `${(l.cacheHitRate * 100).toFixed(0)}%` : '—'),
  },
  {
    key: 'cost',
    label: '成本',
    thClass: 'text-right',
    tdClass: 'text-right tabular-nums text-ink',
    cell: (l) => `$${l.costUsd.toFixed(4)}`,
  },
  {
    key: 'error',
    label: '错误',
    thClass: 'text-left',
    tdClass: 'max-w-[200px] truncate text-up',
    cell: (l) => <span title={l.error ?? ''}>{l.error ?? ''}</span>,
  },
];

const LOG_COLUMN_KEYS = LOG_COLUMNS.map((c) => c.key);
const LOG_COLUMN_STORAGE_KEY = 'logspanel.columns';

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
  // D4：关键词检索。输入即时反馈用 qInput，检索走 300ms 防抖后的 qApplied（减少请求）
  const [qInput, setQInput] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [loading, setLoading] = useState(true);
  // B5：历史日志（落盘 ndjson）加载开关 + 是否可用
  const [historyMode, setHistoryMode] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  // D4：详情抽屉（含 B4 重放入口）
  const [detail, setDetail] = useState<ProxyLog | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  useDismissable(closeDetail, detail !== null, drawerRef);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayFor, setReplayFor] = useState<string | null>(null);
  const [replayErr, setReplayErr] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setQApplied(qInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

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

  /** 打开抽屉时清掉上一次的重放结果，避免看着新日志的字段读旧结论 */
  const openDetail = (l: ProxyLog) => {
    setDetail(l);
    setReplay(null);
    setReplayErr(null);
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
        q: qApplied || undefined,
        limit: historyMode ? 500 : 200,
        history: historyMode,
      });
      setLogs(r.logs);
      setHistoryAvailable(r.historyAvailable);
    } finally {
      setLoading(false);
    }
  }, [filterProvider, filterStatus, qApplied, historyMode]);

  useVisibilityPolling(3000, load, [filterProvider, filterStatus, qApplied, historyMode]);

  // D5：列显隐（本机持久化）
  const colPrefs = useColumnPrefs(LOG_COLUMN_STORAGE_KEY, LOG_COLUMN_KEYS);
  const cols = LOG_COLUMNS.filter((c) => colPrefs.visible.includes(c.key));

  if (loading) return <Spinner label="加载日志…" />;

  const searching = qInput.trim() !== qApplied;

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

        {/* D4：关键词检索 */}
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search
            size={12}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="input pl-7 pr-7"
            type="search"
            placeholder="搜索模型 / ReqID / 错误 / 标签 / 路径…"
            aria-label="日志关键词检索"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
          {qInput && (
            <button
              type="button"
              aria-label="清空检索"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"
              onClick={() => setQInput('')}
            >
              <X size={12} />
            </button>
          )}
        </div>

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

        <ColumnPicker columns={LOG_COLUMNS} prefs={colPrefs} />
      </div>

      {/* 状态提示：aria-live 让读屏用户听到检索/历史模式的切换结果 */}
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-edge bg-raised px-3 py-1.5 text-[11px] text-muted"
      >
        {historyMode && '历史模式（重启前落盘记录）· '}
        {qApplied ? (
          <>
            关键词「{qApplied}」命中 <span className="tabular-nums text-ink">{logs.length}</span> 条
            {searching && ' · 检索中…'}
          </>
        ) : (
          <>
            共 <span className="tabular-nums text-ink">{logs.length}</span> 条
          </>
        )}
        {!historyMode && ' · 仅显示最近 200 条，历史可在 LOG_PERSIST=1 下加载'}
      </div>

      {logs.length === 0 ? (
        <Empty text={qApplied ? `没有匹配「${qApplied}」的日志` : '暂无日志'} />
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-lg border border-edge">
          <table className="w-full text-[11px]">
            <thead className="bg-raised text-muted">
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={`px-2 py-1.5 ${c.thClass ?? ''}`}>
                    {c.label}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-edge">
                  {cols.map((c) => (
                    <td key={c.key} className={`px-2 py-1 ${c.tdClass ?? ''}`}>
                      {c.cell(l)}
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <button
                      className="btn btn-ghost btn-sm"
                      title="查看完整字段与重放入口"
                      onClick={() => openDetail(l)}
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* D4：详情抽屉（含 B4 重放） */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onMouseDown={closeDetail}
          role="presentation"
        >
          <div
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="调用详情"
            className="h-full w-full max-w-xl overflow-y-auto overscroll-contain border-l border-edge bg-panel p-4 outline-none"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-ink">调用详情</h3>
                <div className="mt-0.5 truncate font-mono text-[10px] text-muted">
                  {detail.requestId ?? '(无 requestId)'}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeDetail}>
                <X size={12} />
                关闭
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Chip tone={detail.status != null && detail.status < 400 ? 'down' : 'up'}>
                {detail.status ?? 'ERR'}
              </Chip>
              {detail.fromCache && <Chip tone="accent">响应缓存命中</Chip>}
              {detail.tag && <Chip tone="accent">#{detail.tag}</Chip>}
              <button
                className="btn btn-sm"
                title={
                  detail.hasReqBody
                    ? '用存档请求体重发一次（不含鉴权头，使用当前配置的 Key）'
                    : '无请求体存档，无法重放（重启或已落盘的历史日志不带 body）'
                }
                disabled={!detail.requestId || !detail.hasReqBody || replayFor === detail.requestId}
                onClick={() => detail.requestId && doReplay(detail.requestId)}
              >
                <RotateCw size={11} />
                {replayFor === detail.requestId ? '重放中…' : '重放'}
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3">
              {(
                [
                  ['时间', fmtTime(detail.ts)],
                  ['厂商', detail.provider],
                  ['模型', detail.model],
                  ['方法 / 路径', `${detail.method} ${detail.path}`],
                  ['延迟', `${detail.latencyMs}ms`],
                  ['首字节 TTFT', detail.ttftMs != null ? `${detail.ttftMs}ms` : '—'],
                  ['输入 tokens', detail.inputTokens ?? '—'],
                  ['输出 tokens', detail.outputTokens ?? '—'],
                  ['缓存读取 tokens', detail.cacheReadTokens ?? '—'],
                  [
                    '缓存命中率',
                    detail.cacheHitRate != null
                      ? `${(detail.cacheHitRate * 100).toFixed(1)}%`
                      : '—',
                  ],
                  ['成本', `$${detail.costUsd.toFixed(6)}`],
                  ['Key 掩码', detail.keyMask ?? '—'],
                  ['Key 切换次数', detail.keySwitches ?? 0],
                  ['请求体大小', `${detail.requestBytes}B`],
                  ['响应体大小', `${detail.responseBytes}B`],
                  ['可按原路重放', detail.hasReqBody ? '是' : '否'],
                ] as [string, unknown][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted">{k}</dt>
                  <dd className="truncate tabular-nums text-ink" title={String(v)}>
                    {String(v)}
                  </dd>
                </div>
              ))}
            </dl>

            {detail.routeChain && detail.routeChain.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[11px] text-muted">模型路由链（B1）</div>
                <div className="flex flex-wrap items-center gap-1">
                  {detail.routeChain.map((m, i) => (
                    <span key={`${m}-${i}`} className="flex items-center gap-1">
                      {i > 0 && <span className="text-muted">→</span>}
                      <Chip tone={m === detail.model ? 'accent' : 'default'}>{m}</Chip>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {detail.error && (
              <div className="mt-3">
                <div className="mb-1 text-[11px] text-muted">错误</div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-sunken p-2 font-mono text-[10px] leading-relaxed text-up">
                  {detail.error}
                </pre>
              </div>
            )}

            {(replay || replayErr) && (
              <Card title="重放结果（B4）" subtitle="用存档请求体经代理重发，同样计入指标与成本">
                {replayErr && <div className="text-[11px] text-up">{replayErr}</div>}
                {replay && (
                  <div className="space-y-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted">原始</span>
                      <Chip
                        tone={
                          replay.original.status != null && replay.original.status < 400
                            ? 'down'
                            : 'up'
                        }
                      >
                        {replay.original.status ?? 'ERR'}
                      </Chip>
                      <span className="text-ink">{replay.original.latencyMs}ms</span>
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
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-sunken p-2 font-mono text-[10px] leading-relaxed text-ink">
                      {replay.replay.body}
                    </pre>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
