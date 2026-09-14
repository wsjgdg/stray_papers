import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  DollarSign,
  ExternalLink,
  KeyRound,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { ProbeResult, ProviderConsole } from '../../server/types';
import { fmtTime, runProbe } from '../api';
import { Chip, Empty, Spinner } from '../ui';

type RegionFilter = 'all' | 'cn' | 'intl';

type ProbeState = ProbeResult['state'];

const KEY_HINT = 'Key 仅保存在内存中用于本次探测，不写入磁盘、不上传第三方';

/** 状态指示灯颜色：未探测=灰，ok=绿脉动，auth-required=黄，error=橙，unreachable=红灰 */
function dotClass(state: ProbeState | null): string {
  switch (state) {
    case 'ok':
      return 'bg-down animate-pulse';
    case 'auth-required':
      return 'bg-warn';
    case 'error':
      return 'bg-warn';
    case 'unreachable':
      return 'bg-up/60';
    default:
      return 'bg-line';
  }
}

function stateTone(state: ProbeState): 'default' | 'accent' | 'up' | 'down' | 'warn' | 'ok' {
  switch (state) {
    case 'ok':
      return 'down';
    case 'auth-required':
      return 'warn';
    case 'error':
      return 'up';
    default:
      return 'default';
  }
}

function stateLabel(state: ProbeState): string {
  switch (state) {
    case 'ok':
      return '直连可用';
    case 'auth-required':
      return '需鉴权';
    case 'unreachable':
      return '不可达';
    default:
      return '异常';
  }
}

function dotTitle(state: ProbeState | null): string {
  return state === null ? '未探测' : stateLabel(state);
}

function fmtInt(v: number | null): string {
  return v === null ? '—' : String(v);
}

interface ProviderCardProps {
  provider: ProviderConsole;
  result: ProbeResult | undefined;
  apiKey: string;
  expanded: boolean;
  busy: boolean;
  copied: boolean;
  onToggle: () => void;
  onKeyChange: (value: string) => void;
  onProbe: () => void;
  onCopy: () => void;
}

function ProviderCard({
  provider,
  result,
  apiKey,
  expanded,
  busy,
  copied,
  onToggle,
  onKeyChange,
  onProbe,
  onCopy,
}: ProviderCardProps) {
  const state = result ? result.state : null;
  const cn = provider.region === 'cn';

  return (
    <div className="card flex flex-col gap-2.5 p-3">
      {/* 标题行 */}
      <div className="flex items-center gap-2">
        <h3 className="truncate text-sm font-semibold text-ink">{provider.nameCn}</h3>
        <span className="truncate text-[11px] text-muted">{provider.name}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Chip tone={cn ? 'accent' : 'default'}>{cn ? '国内' : '国际'}</Chip>
          <span
            className={clsx('h-2 w-2 rounded-full', dotClass(state))}
            title={dotTitle(state)}
            aria-label={dotTitle(state)}
          />
        </span>
      </div>

      <p className="truncate text-[11px] leading-relaxed text-muted" title={provider.note}>
        {provider.note || '—'}
      </p>

      {/* 按钮组 */}
      <div className="flex flex-wrap gap-1.5">
        <a className="btn px-2 py-1" href={provider.console} target="_blank" rel="noreferrer">
          <ExternalLink size={12} />
          控制台
        </a>
        <a className="btn px-2 py-1" href={provider.docs} target="_blank" rel="noreferrer">
          <BookOpen size={12} />
          文档
        </a>
        <a className="btn px-2 py-1" href={provider.pricing} target="_blank" rel="noreferrer">
          <DollarSign size={12} />
          定价
        </a>
        {provider.playground && (
          <a className="btn px-2 py-1" href={provider.playground} target="_blank" rel="noreferrer">
            <Sparkles size={12} />
            Playground
          </a>
        )}
        {provider.status && (
          <a className="btn px-2 py-1" href={provider.status} target="_blank" rel="noreferrer">
            <Activity size={12} />
            状态页
          </a>
        )}
      </div>

      {/* API Base */}
      <div className="flex items-center gap-2 rounded-lg border border-edge bg-sunken px-2.5 py-1.5">
        <span className="shrink-0 text-[11px] text-muted">API Base</span>
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">
          {provider.apiBase ?? '—'}
        </code>
        <button
          type="button"
          className="btn shrink-0 px-2 py-0.5"
          disabled={!provider.apiBase}
          onClick={onCopy}
        >
          {copied ? <Check size={12} className="text-down" /> : <Copy size={12} />}
          <span aria-live="polite">{copied ? '已复制' : '复制'}</span>
        </button>
      </div>

      {/* API Key 探测 */}
      <button
        type="button"
        className="btn w-full justify-start border-dashed px-2 py-1"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <KeyRound size={12} />
        API Key 探测
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 rounded-lg border border-edge bg-sunken p-2.5">
          <div className="flex gap-2">
            <input
              className="input py-1.5 text-xs"
              type="password"
              placeholder="sk-…"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => onKeyChange(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary shrink-0 px-2.5 py-1"
              disabled={busy}
              onClick={onProbe}
            >
              <Zap size={12} />
              {busy ? '探测中' : '探测'}
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted/80">{KEY_HINT}</p>

          {result && (
            <div className="flex flex-col gap-1 border-t border-edge pt-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip tone={stateTone(result.state)}>{stateLabel(result.state)}</Chip>
                <span className="text-[11px] text-muted">HTTP {fmtInt(result.httpStatus)}</span>
                <span className="text-[11px] text-muted">{fmtInt(result.latencyMs)} ms</span>
                <span className="text-[11px] text-muted">模型 {fmtInt(result.modelCount)}</span>
                <span className="ml-auto text-[10px] text-muted/70">
                  {fmtTime(result.checkedAt)}
                </span>
              </div>
              <p className="break-words text-[11px] leading-relaxed text-muted">{result.message}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConsoleGrid({ providers }: { providers: ProviderConsole[] }) {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState<RegionFilter>('all');
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Map<string, ProbeResult>>(new Map());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [probingAll, setProbingAll] = useState(false);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [lastProbeAt, setLastProbeAt] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      if (region !== 'all' && p.region !== region) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.nameCn.toLowerCase().includes(q) ||
        p.note.toLowerCase().includes(q)
      );
    });
  }, [providers, query, region]);

  const stats = useMemo(() => {
    let ok = 0;
    let auth = 0;
    let unreach = 0;
    for (const r of results.values()) {
      if (r.state === 'ok') ok += 1;
      else if (r.state === 'auth-required') auth += 1;
      else if (r.state === 'unreachable') unreach += 1;
    }
    return { total: results.size, ok, auth, unreach };
  }, [results]);

  async function doProbe(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const all = ids.length > 1;
    setError(null);
    if (all) setProbingAll(true);
    else setProbingId(ids[0]);
    try {
      const apiKeys: Record<string, string> = {};
      for (const id of ids) apiKeys[id] = keys[id] ?? '';
      const list = await runProbe(ids, apiKeys);
      setResults((prev) => {
        const next = new Map(prev);
        for (const r of list) next.set(r.providerId, r);
        return next;
      });
      setLastProbeAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (all) setProbingAll(false);
      else setProbingId(null);
    }
  }

  async function copyBase(id: string, text: string): Promise<void> {
    if (!navigator.clipboard) {
      setError('复制失败：当前环境不支持剪贴板');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '复制失败');
    }
  }

  const regionBtn = (value: RegionFilter, label: string) => (
    <button
      key={value}
      type="button"
      className={clsx(
        'rounded-md border px-2 py-1 text-[11px] transition-colors',
        region === value
          ? 'border-accent/50 bg-accent/15 text-accent'
          : 'border-edge bg-raised text-muted hover:text-ink',
      )}
      onClick={() => setRegion(value)}
    >
      {label}
    </button>
  );

  if (providers.length === 0) {
    return (
      <div className="h-full min-h-0">
        <Empty text="暂无厂商接入信息" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 工具条 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 pb-3">
        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input py-1.5 pl-7 text-xs"
            placeholder="搜索厂商 / 备注"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {regionBtn('all', '全部')}
          {regionBtn('cn', '国内')}
          {regionBtn('intl', '国际')}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={probingAll || filtered.length === 0}
          onClick={() => void doProbe(filtered.map((p) => p.id))}
        >
          {probingAll ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-edge border-t-accent" />
          ) : (
            <Zap size={13} />
          )}
          探测全部
        </button>

        {probingAll && (
          <div className="flex h-6 items-center overflow-hidden">
            <Spinner label="正在探测…" />
          </div>
        )}

        <span className="ml-auto shrink-0 text-[11px] text-muted">
          上次探测：{lastProbeAt === null ? '未探测' : fmtTime(lastProbeAt)}
        </span>
      </div>

      {error && <div className="shrink-0 pb-2 text-[11px] text-warn">探测失败：{error}</div>}

      {/* 卡片网格 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {filtered.length === 0 ? (
          <Empty text="没有匹配的厂商" />
        ) : (
          <div className="grid grid-cols-1 gap-4 pb-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                result={results.get(p.id)}
                apiKey={keys[p.id] ?? ''}
                expanded={Boolean(expanded[p.id])}
                busy={probingAll || probingId === p.id}
                copied={copiedId === p.id}
                onToggle={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                onKeyChange={(value) => setKeys((prev) => ({ ...prev, [p.id]: value }))}
                onProbe={() => void doProbe([p.id])}
                onCopy={() => {
                  if (p.apiBase) void copyBase(p.id, p.apiBase);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 统计条 */}
      <div className="shrink-0 border-t border-edge pt-2 text-[11px] text-muted">
        <span className="tabular-nums">已探测 {stats.total} 家</span>
        <span className="mx-1.5 text-muted/40">·</span>
        <span className="tabular-nums text-down">直连可用 {stats.ok}</span>
        <span className="mx-1.5 text-muted/40">·</span>
        <span className="tabular-nums text-warn">需鉴权 {stats.auth}</span>
        <span className="mx-1.5 text-muted/40">·</span>
        <span className="tabular-nums text-up/80">不可达 {stats.unreach}</span>
      </div>
    </div>
  );
}
