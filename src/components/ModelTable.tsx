import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, Download, ExternalLink, Search, X } from 'lucide-react';
import type { LlmModel } from '../../server/types';
import { fmtCtx, fmtDate, fmtPrice } from '../api';
import { Chip, Empty, Stat } from '../ui';
import { useVirtualList } from '../hooks/useVirtualList';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import { ColumnPicker } from './ColumnPicker';

type SortKey =
  'created' | 'context' | 'promptPrice' | 'completionPrice' | 'intelligence' | 'speed' | 'agentic';

type CapKey = 'reasoning' | 'tools' | 'structuredOutput' | 'multimodal';

interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

// C10：排序设置持久化到 localStorage，刷新/重启后保留
const SORT_STORAGE_KEY = 'modeltable.sort';
const SORT_KEYS: readonly SortKey[] = [
  'created',
  'context',
  'promptPrice',
  'completionPrice',
  'intelligence',
  'speed',
  'agentic',
];
const DEFAULT_SORT: SortState = { key: 'created', dir: 'desc' };

function readStoredSort(): SortState {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_SORT;
    const s = JSON.parse(raw) as SortState;
    if (SORT_KEYS.includes(s.key) && (s.dir === 'asc' || s.dir === 'desc')) {
      return { key: s.key, dir: s.dir };
    }
  } catch {
    /* 存档损坏或隐私模式不可用时静默回默认 */
  }
  return DEFAULT_SORT;
}

// D2：改为窗口化渲染（虚拟滚动），不再分页。
// 行高不固定（展开行会变高），所以只给一个估算值，实测值由 useVirtualList 回报后重算偏移。
const EST_ROW_H = 48;
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
    return (
      m.name
        .slice(label.length)
        .replace(/^[\s:\-—]+/, '')
        .trim() || m.name
    );
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

/** 深链容忍匹配：raw proxy 字符串（如 gpt-5 / openai/gpt-5）对 LlmModel.id / name / 去前缀名 */
function matchFocus(m: LlmModel, raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (!s) return false;
  if (m.id.toLowerCase() === s) return true;
  if (m.id.toLowerCase().includes(s)) return true;
  if (m.name.toLowerCase().includes(s)) return true;
  const stripped = stripVendorPrefix(m).toLowerCase();
  return stripped === s || stripped.includes(s);
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

// D5：列定义集中在这里——表头、单元格、列显隐、CSV 顺序都用同一份，避免多处不一致。
interface ColDef {
  key: string;
  label: string;
  thClass?: string;
  sortKey?: SortKey;
  tdClass?: string;
  cell: (m: LlmModel) => ReactNode;
}

const MODEL_COLUMNS: ColDef[] = [
  {
    key: 'name',
    label: '模型',
    cell: (m) => (
      <div className="flex items-center gap-2">
        <span
          className="h-6 w-1 shrink-0 rounded"
          style={{ background: vendorColor(m.vendorLabel) }}
        />
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-ink">{stripVendorPrefix(m)}</div>
          <div className="truncate font-mono text-[10px] text-muted">{m.id}</div>
        </div>
      </div>
    ),
  },
  {
    key: 'vendor',
    label: '厂商',
    thClass: 'w-28',
    tdClass: 'truncate text-muted',
    cell: (m) => m.vendorLabel,
  },
  {
    key: 'context',
    label: '上下文',
    thClass: 'w-20 text-right',
    sortKey: 'context',
    tdClass: 'text-right tabular-nums',
    cell: (m) => fmtCtx(m.context),
  },
  {
    key: 'promptPrice',
    label: '输入价',
    thClass: 'w-20 text-right',
    sortKey: 'promptPrice',
    tdClass: 'text-right tabular-nums',
    cell: (m) => fmtPrice(m.promptPrice),
  },
  {
    key: 'completionPrice',
    label: '输出价',
    thClass: 'w-20 text-right',
    sortKey: 'completionPrice',
    tdClass: 'text-right tabular-nums',
    cell: (m) => fmtPrice(m.completionPrice),
  },
  {
    key: 'cacheReadPrice',
    label: '缓存读取价',
    thClass: 'w-24 text-right',
    tdClass: 'text-right tabular-nums text-muted',
    cell: (m) => fmtPrice(m.cacheReadPrice),
  },
  {
    key: 'intelligence',
    label: '智能指数',
    thClass: 'w-20 text-right',
    sortKey: 'intelligence',
    tdClass: 'text-right tabular-nums',
    cell: (m) => fmtScore(m.intelligence),
  },
  {
    key: 'speed',
    label: '速度',
    thClass: 'w-20 text-right',
    sortKey: 'speed',
    tdClass: 'text-right tabular-nums',
    cell: (m) => fmtSpeed(m.speed),
  },
  {
    key: 'created',
    label: '发布日',
    thClass: 'w-24',
    sortKey: 'created',
    tdClass: 'tabular-nums text-muted',
    cell: (m) => fmtDate(m.created),
  },
  {
    key: 'caps',
    label: '能力',
    cell: (m) => (
      <div className="flex flex-wrap gap-1">
        {m.reasoning && <Chip tone="accent">推理</Chip>}
        {m.tools && <Chip tone="ok">工具</Chip>}
        {m.structuredOutput && <Chip>结构化</Chip>}
        {m.inputModalities.includes('image') && <Chip tone="warn">视觉</Chip>}
        {m.inputModalities.includes('audio') && <Chip tone="up">音频</Chip>}
      </div>
    ),
  },
];

const MODEL_COLUMN_KEYS = MODEL_COLUMNS.map((c) => c.key);
const MODEL_COLUMN_STORAGE_KEY = 'modeltable.columns';

export default function ModelTable({
  models,
  focus,
  onModelActivate,
}: {
  models: LlmModel[];
  focus?: { model: string; nonce: number } | null;
  onModelActivate?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [vendor, setVendor] = useState<string>(ALL_VENDOR);
  const [caps, setCaps] = useState<CapKey[]>([]);
  const [onlyScored, setOnlyScored] = useState(false);
  const [sort, setSortRaw] = useState<SortState>(readStoredSort);
  // 包装 setter：任何排序变化同步写入 localStorage（兼容值与 updater 两种调用形态）
  const setSort = useCallback((update: SortState | ((prev: SortState) => SortState)) => {
    setSortRaw((prev) => {
      const next = typeof update === 'function' ? update(prev) : update;
      try {
        localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 持久化失败不影响交互 */
      }
      return next;
    });
  }, []);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [warn, setWarn] = useState<string | null>(null);

  // D2：滚动容器。筛选条件一变就回到顶部（等价于原先「重置到第 1 页」的语义）。
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = 0;
  }, [query, vendor, caps, onlyScored]);

  const vendorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of models) counts.set(m.vendorLabel, (counts.get(m.vendorLabel) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count }));
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

  // D5：列显隐（本机持久化）
  const colPrefs = useColumnPrefs(MODEL_COLUMN_STORAGE_KEY, MODEL_COLUMN_KEYS);
  const cols = useMemo(
    () => MODEL_COLUMNS.filter((c) => colPrefs.visible.includes(c.key)),
    [colPrefs.visible],
  );
  /** 勾选列 + 可见数据列（占位/展开行的 colSpan 要用） */
  const colSpan = cols.length + 1;

  // D2：窗口化（虚拟滚动）。行高不固定（展开行更高），所以给估算值 + 实测回报。
  const keyOf = useCallback((m: LlmModel) => m.id, []);
  const virt = useVirtualList({
    items: sorted,
    getKey: keyOf,
    estimate: EST_ROW_H,
    overscan: 8,
    scrollRef: scrollerRef,
  });

  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const compared = selected.map((id) => byId.get(id)).filter((m): m is LlmModel => Boolean(m));

  // 模型深链：浮窗点来的 raw 字符串（gpt-5 / openai/gpt-5 等）→ 容忍匹配并精确展开对应行。
  // 用 nonce 去重，避免 30s 轮询刷新 models 引用时重复重置筛选。
  const { scrollToIndex } = virt;
  const lastFocusNonce = useRef<number | null>(null);
  useEffect(() => {
    if (!focus) return;
    if (lastFocusNonce.current === focus.nonce) return;
    lastFocusNonce.current = focus.nonce;
    const m = models.find((x) => matchFocus(x, focus.model));
    if (!m) return;
    // 精确跳转：清空筛选并切默认排序，直接滚到该模型（不把模型串写进搜索框污染搜索词）
    setQuery('');
    setVendor(ALL_VENDOR);
    setCaps([]);
    setOnlyScored(false);
    setSort({ key: 'created', dir: 'desc' });
    setExpandedId(m.id);
    setFlashId(m.id);
    // 排序/筛选的 state 要等下一次渲染才生效，且未渲染过的行只有估算高度，
    // 所以用两次 rAF 做两遍定位：第一遍按估算滚过去，实测回报后再校正一次。
    const align = () => {
      const idx = sorted.findIndex((x) => x.id === m.id);
      if (idx >= 0) scrollToIndex(idx, 'center');
    };
    const r1 = requestAnimationFrame(() => {
      align();
      requestAnimationFrame(align);
    });
    const timer = window.setTimeout(() => setFlashId((cur) => (cur === m.id ? null : cur)), 2400);
    return () => {
      cancelAnimationFrame(r1);
      window.clearTimeout(timer);
    };
    // sorted 故意不进依赖：它每次排序都会换引用，会让深链重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, models, setSort, scrollToIndex]);

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
          className="rounded-lg border border-edge bg-sunken px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
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
                  : 'border-edge bg-raised text-muted hover:text-ink',
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

        <div className="ml-auto flex items-center gap-2">
          <ColumnPicker columns={MODEL_COLUMNS} prefs={colPrefs} />
          <button type="button" className="btn" onClick={exportCsv} disabled={total === 0}>
            <Download size={13} />
            导出 CSV
          </button>
        </div>
      </div>

      {/* 对比栏 */}
      {compared.length > 0 && (
        <div className="shrink-0 rounded-xl border border-edge bg-panel px-3 py-2">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] text-muted">
              对比 {compared.length}/{MAX_COMPARE}
            </span>
            {/* D6：提示类信息加 aria-live，读屏用户能听到"已达上限" */}
            <span className="text-[11px] text-warn" role="status" aria-live="polite">
              {warn ?? ''}
            </span>
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
        <div
          ref={scrollerRef}
          className="min-h-0 max-h-full flex-1 overflow-auto overscroll-contain"
        >
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-edge">
                <th className="th w-8" />
                {cols.map((c) =>
                  c.sortKey ? (
                    <SortTh
                      key={c.key}
                      label={c.label}
                      sortKey={c.sortKey}
                      sort={sort}
                      onSort={toggleSort}
                      className={c.thClass}
                    />
                  ) : (
                    <th key={c.key} className={clsx('th', c.thClass)}>
                      {c.label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {/* 窗口上方的占位行：让首行落在正确的滚动位置 */}
              {virt.padTop > 0 && (
                <tr aria-hidden style={{ height: virt.padTop }}>
                  <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
              {virt.rows.map(({ item: m }) => {
                const expanded = expandedId === m.id;
                const checked = selected.includes(m.id);
                return (
                  <Fragment key={m.id}>
                    <tr
                      ref={(el) => {
                        if (!el) return;
                        // 展开时把紧随其后的详情行也算进这一项的高度
                        const next = el.nextElementSibling as HTMLElement | null;
                        const extra = next && next.dataset.vrow === m.id ? next.offsetHeight : 0;
                        virt.reportSize(m.id, el.offsetHeight + extra);
                      }}
                      className={clsx(
                        'cursor-pointer border-b border-edge/60 transition-colors hover:bg-hover',
                        expanded && 'bg-hover',
                        flashId === m.id && 'ring-2 ring-accent',
                      )}
                      onClick={() => {
                        setExpandedId(expanded ? null : m.id);
                        onModelActivate?.(m.id);
                      }}
                    >
                      <td className="td" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={checked}
                          onChange={(e) => toggleSelect(m.id, e.target.checked)}
                        />
                      </td>
                      {cols.map((c) => (
                        <td key={c.key} className={clsx('td', c.tdClass)}>
                          {c.cell(m)}
                        </td>
                      ))}
                    </tr>
                    {expanded && (
                      <tr
                        data-vrow={m.id}
                        ref={(el) => {
                          if (!el) return;
                          // 详情行后挂载时再报一次合计高度（此时折叠行已在 DOM 里）
                          const prev = el.previousElementSibling as HTMLElement | null;
                          virt.reportSize(m.id, (prev?.offsetHeight ?? 0) + el.offsetHeight);
                        }}
                        className="border-b border-edge"
                      >
                        <td colSpan={colSpan} className="bg-raised px-4 py-3">
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
              {/* 窗口下方的占位行：撑出剩余滚动高度 */}
              {virt.padBottom > 0 && (
                <tr aria-hidden style={{ height: virt.padBottom }}>
                  <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
                </tr>
              )}
            </tbody>
          </table>
          {total === 0 && <Empty text="没有匹配的模型" />}
        </div>

        {/* 状态栏（D2 后不再分页：一次性滚动全部结果） */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge px-3 py-2 text-[11px] text-muted">
          <span className="tabular-nums">共 {total} 条</span>
          <span className="tabular-nums">当前渲染 {virt.rows.length} 行（窗口化）</span>
          {total > 0 && (
            <span className="tabular-nums">
              {sorted.length > 0 && virt.rows.length > 0
                ? `第 ${(virt.rows[0]?.index ?? 0) + 1}–${(virt.rows[virt.rows.length - 1]?.index ?? 0) + 1} 条`
                : ''}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn px-2 py-1"
              disabled={total === 0}
              onClick={() => virt.scrollToIndex(0, 'start')}
            >
              <ChevronUp size={12} />
              回到顶部
            </button>
            <button
              type="button"
              className="btn px-2 py-1"
              disabled={total === 0}
              onClick={() => virt.scrollToIndex(Math.max(0, total - 1), 'center')}
            >
              跳到末尾
              <ChevronDown size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
