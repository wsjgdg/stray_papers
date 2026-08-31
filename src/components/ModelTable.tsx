import { Fragment, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, Download, ExternalLink, Search, X } from 'lucide-react';
import type { LlmModel } from '../../server/types';
import { fmtCtx, fmtDate, fmtPrice } from '../api';
import { Chip, Empty, Stat } from '../ui';

type SortKey =
  | 'created'
  | 'context'
  | 'promptPrice'
  | 'completionPrice'
  | 'intelligence'
  | 'speed'
  | 'agentic';

type CapKey = 'reasoning' | 'tools' | 'structuredOutput' | 'multimodal';

interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const PAGE_SIZE = 50;
const MAX_COMPARE = 4;
const ALL_VENDOR = '__all__';

const CAPS: { key: CapKey; label: string }[] = [
  { key: 'reasoning', label: '推理' },
  { key: 'tools', label: '工具调用' },
  { key: 'structuredOutput', label: '结构化输出' },
  { key: 'multimodal', label: '多模态输入' },
];

/** 去掉厂商前缀后的模型名（"OpenAI: GPT-5" -> "GPT-5"） */
function stripVendorPrefix(m: LlmModel): string {
  const colon = m.name.indexOf(':');
  if (colon > 0) return m.name.slice(colon + 1).trim();
  const label = m.vendorLabel;
  if (label && m.name.toLowerCase().startsWith(label.toLowerCase())) {
    return m.name.slice(label.length).replace(/^[\s:\-—]+/, '').trim() || m.name;
  }
  return m.name;
}

function hasCap(m: LlmModel, key: CapKey): boolean {
  switch (key) {
    case 'reasoning':
      return m.reasoning;
    case 'tools':
      return m.tools;
    case 'structuredOutput':
      return m.structuredOutput;
    case 'multimodal':
      return m.inputModalities.includes('image') || m.inputModalities.includes('audio');
  }
}

/** 厂商稳定色，用于行首色条 */
function vendorColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) % 360;
  return `hsl(${hash} 68% 58%)`;
}

function metricOf(m: LlmModel, key: SortKey): number | null {
  switch (key) {
    case 'created':
      return m.created || null;
    case 'context':
      return m.context || null;
    case 'promptPrice':
      return m.promptPrice;
    case 'completionPrice':
      return m.completionPrice;
    case 'intelligence':
      return m.intelligence;
    case 'speed':
      return m.speed;
    case 'agentic':
      return m.agentic;
  }
}

/** 空值恒排末尾 */
function compareMetric(a: number | null, b: number | null, dir: 'asc' | 'desc'): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

function fmtScore(v: number | null): string {
  return v === null ? '—' : v.toFixed(1);
}

function fmtSpeed(v: number | null): string {
  return v === null ? '—' : String(Math.round(v));
}

function csvCell(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\ufeff${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronDown;
  return (
    <th
      className={clsx('th cursor-pointer select-none whitespace-nowrap', className)}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon size={12} className={active ? 'text-accent' : 'text-muted/40'} />
      </span>
    </th>
  );
}

export default function ModelTable({ models }: { models: LlmModel[] }) {
  const [query, setQuery] = useState('');
  const [vendor, setVendor] = useState<string>(ALL_VENDOR);
  const [caps, setCaps] = useState<CapKey[]>([]);
  const [onlyScored, setOnlyScored] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'created', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [warn, setWarn] = useState<string | null>(null);

  useEffect(() => {
    setPage(0);
  }, [query, vendor, caps, onlyScored]);

  const vendorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of models) counts.set(m.vendorLabel, (counts.get(m.vendorLabel) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  }, [models]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (vendor !== ALL_VENDOR && m.vendorLabel !== vendor) return false;
      if (onlyScored && m.intelligence === null) return false;
      if (caps.length && !caps.every((c) => hasCap(m, c))) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.vendorLabel.toLowerCase().includes(q)
      );
    });
  }, [models, query, vendor, caps, onlyScored]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const d = compareMetric(metricOf(a, sort.key), metricOf(b, sort.key), sort.dir);
      if (d !== 0) return d;
      if (b.created !== a.created) return b.created - a.created;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [filtered, sort]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const compared = selected.map((id) => byId.get(id)).filter((m): m is LlmModel => Boolean(m));

  function toggleSort(key: SortKey): void {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' },
    );
  }

  function toggleCap(key: CapKey): void {
    setCaps((prev) => (prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]));
  }

  function toggleSelect(id: string, checked: boolean): void {
    setWarn(null);
    if (!checked) {
      setSelected((prev) => prev.filter((x) => x !== id));
      return;
    }
    if (selected.includes(id)) return;
    if (selected.length >= MAX_COMPARE) {
      setWarn(`最多同时对比 ${MAX_COMPARE} 个模型`);
      return;
    }
    setSelected([...selected, id]);
  }

  function exportCsv(): void {
    const header = [
      'id',
      'name',
      'vendor',
      'context',
      'promptPrice',
      'completionPrice',
      'cacheReadPrice',
      'intelligence',
      'speed',
      'created',
    ];
    const lines = [header.join(',')];
    for (const m of sorted) {
      lines.push(
        [
          csvCell(m.id),
          csvCell(m.name),
          csvCell(m.vendorLabel),
          csvCell(m.context),
          csvCell(m.promptPrice),
          csvCell(m.completionPrice),
          csvCell(m.cacheReadPrice),
          csvCell(m.intelligence),
          csvCell(m.speed),
          csvCell(m.created),
        ].join(','),
      );
    }
    downloadCsv(`models-${sorted.length}.csv`, lines.join('\r\n'));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 工具条 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input py-1.5 pl-7 text-xs"
            placeholder="搜索模型名 / ID / 厂商"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <select
          className="rounded-lg border border-edge bg-[#0d1728] px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
        >
          <option value={ALL_VENDOR}>全部厂商</option>
          {vendorOptions.map((v) => (
            <option key={v.label} value={v.label}>
              {v.label} ({v.count})
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-1.5">
          {CAPS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={clsx(
                'rounded-md border px-2 py-1 text-[11px] transition-colors',
                caps.includes(c.key)
                  ? 'border-accent/50 bg-accent/15 text-accent'
                  : 'border-edge bg-[#0e1728] text-muted hover:text-ink',
              )}
              onClick={() => toggleCap(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            className="accent-accent"
            checked={onlyScored}
            onChange={(e) => setOnlyScored(e.target.checked)}
          />
          仅显示有评估分
        </label>

        <button type="button" className="btn ml-auto" onClick={exportCsv} disabled={total === 0}>
          <Download size={13} />
          导出 CSV
        </button>
      </div>

      {/* 对比栏 */}
      {compared.length > 0 && (
        <div className="shrink-0 rounded-xl border border-edge bg-panel px-3 py-2">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] text-muted">
              对比 {compared.length}/{MAX_COMPARE}
            </span>
            {warn && <span className="text-[11px] text-amber-400">{warn}</span>}
            <button
              type="button"
              className="btn ml-auto px-2 py-1"
              onClick={() => {
                setSelected([]);
                setWarn(null);
              }}
            >
              <X size={12} />
              清空
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto overscroll-contain">
            {compared.map((m) => (
              <div key={m.id} className="card min-w-[520px] flex-1 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="h-3 w-1 shrink-0 rounded"
                    style={{ background: vendorColor(m.vendorLabel) }}
                  />
                  <span className="truncate text-xs font-semibold text-ink">
                    {stripVendorPrefix(m)}
                  </span>
                  <span className="truncate text-[11px] text-muted">{m.vendorLabel}</span>
                  <button
                    type="button"
                    className="ml-auto text-muted hover:text-ink"
                    onClick={() => toggleSelect(m.id, false)}
                    aria-label="移出对比"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <Stat label="输入价" value={fmtPrice(m.promptPrice)} />
                  <Stat label="输出价" value={fmtPrice(m.completionPrice)} />
                  <Stat label="上下文" value={fmtCtx(m.context)} />
                  <Stat label="智能指数" value={fmtScore(m.intelligence)} tone="accent" />
                  <Stat label="速度" value={fmtSpeed(m.speed)} hint="tok/s" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 表格 */}
      <div className="card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 max-h-full flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-edge">
                <th className="th w-8" />
                <th className="th">模型</th>
                <th className="th w-28">厂商</th>
                <SortTh label="上下文" sortKey="context" sort={sort} onSort={toggleSort} className="w-20 text-right" />
                <SortTh label="输入价" sortKey="promptPrice" sort={sort} onSort={toggleSort} className="w-20 text-right" />
                <SortTh label="输出价" sortKey="completionPrice" sort={sort} onSort={toggleSort} className="w-20 text-right" />
                <th className="th w-24 text-right">缓存读取价</th>
                <SortTh label="智能指数" sortKey="intelligence" sort={sort} onSort={toggleSort} className="w-20 text-right" />
                <SortTh label="速度" sortKey="speed" sort={sort} onSort={toggleSort} className="w-20 text-right" />
                <SortTh label="发布日" sortKey="created" sort={sort} onSort={toggleSort} className="w-24" />
                <th className="th">能力</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((m) => {
                const expanded = expandedId === m.id;
                const checked = selected.includes(m.id);
                return (
                  <Fragment key={m.id}>
                    <tr
                      className={clsx(
                        'cursor-pointer border-b border-edge/60 transition-colors hover:bg-[#16213a]',
                        expanded && 'bg-[#16213a]',
                      )}
                      onClick={() => setExpandedId(expanded ? null : m.id)}
                    >
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={checked}
                          onChange={(e) => toggleSelect(m.id, e.target.checked)}
                        />
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-6 w-1 shrink-0 rounded"
                            style={{ background: vendorColor(m.vendorLabel) }}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-ink">
                              {stripVendorPrefix(m)}
                            </div>
                            <div className="truncate font-mono text-[10px] text-muted">{m.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="td truncate text-muted">{m.vendorLabel}</td>
                      <td className="td text-right tabular-nums">{fmtCtx(m.context)}</td>
                      <td className="td text-right tabular-nums">{fmtPrice(m.promptPrice)}</td>
                      <td className="td text-right tabular-nums">{fmtPrice(m.completionPrice)}</td>
                      <td className="td text-right tabular-nums text-muted">
                        {fmtPrice(m.cacheReadPrice)}
                      </td>
                      <td className="td text-right tabular-nums">{fmtScore(m.intelligence)}</td>
                      <td className="td text-right tabular-nums">{fmtSpeed(m.speed)}</td>
                      <td className="td tabular-nums text-muted">{fmtDate(m.created)}</td>
                      <td className="td">
                        <div className="flex flex-wrap gap-1">
                          {m.reasoning && <Chip tone="accent">推理</Chip>}
                          {m.tools && <Chip tone="ok">工具</Chip>}
                          {m.structuredOutput && <Chip>结构化</Chip>}
                          {m.inputModalities.includes('image') && <Chip tone="warn">视觉</Chip>}
                          {m.inputModalities.includes('audio') && <Chip tone="up">音频</Chip>}
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-edge">
                        <td colSpan={11} className="bg-[#0e1728] px-4 py-3">
                          <div className="mb-3 text-xs leading-relaxed text-muted">
                            {m.description || '暂无描述'}
                          </div>
                          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                            <Stat label="智能指数" value={fmtScore(m.intelligence)} tone="accent" />
                            <Stat label="Agentic" value={fmtScore(m.agentic)} tone="accent" />
                            <Stat label="Omniscience" value={fmtScore(m.omniscience)} />
                            <Stat label="速度" value={fmtSpeed(m.speed)} hint="tok/s" />
                            <Stat label="开放度" value={fmtScore(m.openness)} />
                          </div>
                          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                            <Stat label="上下文" value={fmtCtx(m.context)} />
                            <Stat label="最大输出" value={fmtCtx(m.maxOutput ?? 0)} />
                            <Stat label="输入价" value={fmtPrice(m.promptPrice)} />
                            <Stat label="输出价" value={fmtPrice(m.completionPrice)} />
                          </div>
                          {m.supportedParams.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-1">
                              {m.supportedParams.map((p) => (
                                <Chip key={p}>{p}</Chip>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <a
                              className="inline-flex items-center gap-1 text-accent hover:underline"
                              href={`https://openrouter.ai/${m.id}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              OpenRouter
                              <ExternalLink size={12} />
                            </a>
                            {m.aaSlug && (
                              <a
                                className="inline-flex items-center gap-1 text-accent hover:underline"
                                href={`https://artificialanalysis.ai/models/${m.aaSlug}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Artificial Analysis
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {total === 0 && <Empty text="没有匹配的模型" />}
        </div>

        {/* 分页 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-edge px-3 py-2 text-[11px] text-muted">
          <span className="tabular-nums">共 {total} 条</span>
          <span className="tabular-nums">
            第 {total === 0 ? 0 : safePage + 1} / {pageCount} 页
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn px-2 py-1"
              disabled={safePage <= 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronDown size={12} className="rotate-90" />
              上一页
            </button>
            <button
              type="button"
              className="btn px-2 py-1"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              下一页
              <ChevronDown size={12} className="-rotate-90" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
