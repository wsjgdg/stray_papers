import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';
import type { Leaderboard, LeaderboardEntry, LlmModel } from '../../server/types';
import { fmtCtx, fmtPrice } from '../api';
import { Bar, Chip, Empty } from '../ui';
import { ScatterPlot } from './charts';

const MIN_SCATTER_POINTS = 3;
// D1：排名色改走主题令牌（旧的写死色号在浅色下对比度不足）
const RANK_COLORS = ['var(--c-rank1)', 'var(--c-rank2)', 'var(--c-rank3)'];

interface ScatterPoint {
  name: string;
  x: number;
  y: number;
  price: number;
  intelligence: number;
}

/** Elo / elo 类榜单按整数展示 */
function isEloKey(metricKey: string): boolean {
  return /elo/i.test(metricKey);
}

function fmtMetric(value: number, metricKey: string): string {
  if (!Number.isFinite(value)) return '—';
  if (metricKey === 'analystAgent') return `${value.toFixed(1)}%`;
  if (metricKey === 'outputSpeed') return `${Math.round(value)} tok/s`;
  if (metricKey === 'timePerTask') return `${value.toFixed(1)} 分钟`;
  if (isEloKey(metricKey)) return String(Math.round(value));
  return value.toFixed(1);
}

function RankBadge({ rank }: { rank: number }) {
  const color = rank <= 3 ? RANK_COLORS[rank - 1] : 'var(--c-rank-rest)';
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums"
      // border/background 由 currentColor 派生，这样换主题不必再配一对色号
      style={{
        color,
        borderColor: 'color-mix(in srgb, currentColor 40%, transparent)',
        background: 'color-mix(in srgb, currentColor 12%, transparent)',
      }}
    >
      {rank}
    </span>
  );
}

function EntryRow({
  entry,
  rank,
  max,
  metricKey,
  model,
}: {
  entry: LeaderboardEntry;
  rank: number;
  max: number;
  metricKey: string;
  model: LlmModel | undefined;
}) {
  const detailsHref = entry.detailsUrl ?? null;
  return (
    <div className="flex items-center gap-3 border-b border-edge/60 px-4 py-2.5 transition-colors hover:bg-hover">
      <RankBadge rank={rank} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {detailsHref ? (
            <a
              className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-ink hover:text-accent"
              href={detailsHref}
              target="_blank"
              rel="noreferrer"
            >
              <span className="truncate">{entry.label}</span>
              <ExternalLink size={11} className="shrink-0 text-muted" />
            </a>
          ) : (
            <span className="truncate text-xs font-medium text-ink">{entry.label}</span>
          )}
          {model && <span className="shrink-0 text-[10px] text-muted">{model.vendorLabel}</span>}
        </div>
        <div className="mt-1.5 pr-2">
          <Bar
            value={entry.value}
            max={max}
            color={rank <= 3 ? 'var(--c-accent)' : 'var(--c-chart-dim)'}
            height={6}
          />
        </div>
      </div>

      <div className="w-24 shrink-0 text-right text-xs tabular-nums text-ink">
        {fmtMetric(entry.value, metricKey)}
      </div>

      <div className="hidden w-[320px] shrink-0 items-center justify-end gap-1 lg:flex">
        {model ? (
          <>
            <Chip tone="accent">输入 {fmtPrice(model.promptPrice)}</Chip>
            <Chip>输出 {fmtPrice(model.completionPrice)}</Chip>
            <Chip>上下文 {fmtCtx(model.context)}</Chip>
            <a href={model.openrouterUrl} target="_blank" rel="noreferrer">
              <Chip tone="ok">
                OpenRouter
                <ExternalLink size={10} />
              </Chip>
            </a>
          </>
        ) : (
          <span className="text-[11px] text-muted">未匹配到可用 API</span>
        )}
      </div>
    </div>
  );
}

export default function Leaderboards({
  leaderboards,
  models,
}: {
  leaderboards: Leaderboard[];
  models: LlmModel[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onlyMatched, setOnlyMatched] = useState(false);

  const board = useMemo<Leaderboard | null>(() => {
    if (leaderboards.length === 0) return null;
    return leaderboards.find((b) => b.id === activeId) ?? leaderboards[0];
  }, [leaderboards, activeId]);

  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  const matchedCount = useMemo(
    () => (board ? board.entries.filter((e) => e.modelId !== null).length : 0),
    [board],
  );

  /** 按榜单方向重排，保证 1 号为最优 */
  const rows = useMemo<LeaderboardEntry[]>(() => {
    if (!board) return [];
    const list = board.entries.filter((e) => (onlyMatched ? e.modelId !== null : true));
    return [...list].sort((a, b) => (board.higherBetter ? b.value - a.value : a.value - b.value));
  }, [board, onlyMatched]);

  const maxValue = useMemo(() => rows.reduce((m, e) => Math.max(m, e.value), 0), [rows]);

  /** 价格—智能散点：仅取有智能指数且平均价 > 0 的模型 */
  const points = useMemo<ScatterPoint[]>(() => {
    const out: ScatterPoint[] = [];
    for (const m of models) {
      if (m.intelligence === null) continue;
      const price = (m.promptPrice + m.completionPrice) / 2;
      if (!Number.isFinite(price) || price <= 0) continue;
      out.push({
        name: m.name,
        x: Number(price.toFixed(4)),
        y: m.intelligence,
        price,
        intelligence: m.intelligence,
      });
    }
    return out;
  }, [models]);

  return (
    <div className="h-full flex flex-col min-h-0 gap-3">
      {!board ? (
        <div className="card flex-1">
          <Empty text="暂无评估榜单数据（数据源不可达）" />
        </div>
      ) : (
        <>
          <section className="card flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* 榜单切换 */}
            <div className="shrink-0 overflow-x-auto overscroll-contain border-b border-edge">
              <div className="flex gap-1 px-2 py-2">
                {leaderboards.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={clsx(
                      'shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs transition-colors',
                      b.id === board.id
                        ? 'border-accent/60 bg-accent/15 text-accent'
                        : 'border-edge bg-raised text-muted hover:text-ink',
                    )}
                    onClick={() => setActiveId(b.id)}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 榜单信息 */}
            <div className="shrink-0 border-b border-edge px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-ink">{board.name}</h3>
                <Chip tone={board.higherBetter ? 'accent' : 'warn'}>
                  {board.higherBetter ? '越高越好' : '越低越好'}
                </Chip>
                <Chip>{board.entries.length} 条</Chip>
                {board.sourceUrl && (
                  <a
                    className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                    href={board.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={11} />
                    {board.sourceName}
                  </a>
                )}
                <Chip tone="ok">
                  {matchedCount}/{board.entries.length} 已匹配到可用 API
                </Chip>
                <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={onlyMatched}
                    onChange={(e) => setOnlyMatched(e.target.checked)}
                  />
                  仅显示已匹配到 API 的模型
                </label>
              </div>
              {board.description && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{board.description}</p>
              )}
            </div>

            {/* 排行列表 */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {rows.length === 0 ? (
                <Empty text="当前筛选条件下没有条目" />
              ) : (
                rows.map((entry, i) => (
                  <EntryRow
                    key={`${entry.aaSlug ?? entry.label}-${i}`}
                    entry={entry}
                    rank={i + 1}
                    max={maxValue}
                    metricKey={board.metricKey}
                    model={entry.modelId ? modelById.get(entry.modelId) : undefined}
                  />
                ))
              )}
            </div>
          </section>

          {/* 价格 vs 智能指数 */}
          {points.length >= MIN_SCATTER_POINTS && (
            <section className="shrink-0 rounded-xl border border-edge bg-panel px-3 py-2">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink">价格 vs 智能指数</span>
                <span className="text-[11px] text-muted">
                  共 {points.length} 个模型 · 横轴为输入/输出均价（USD / 1M tokens）
                </span>
              </div>
              <ScatterPlot
                data={points.map((p) => ({
                  name: p.name,
                  x: p.x,
                  y: p.y,
                  meta: [
                    { label: '平均价', value: `${fmtPrice(p.price)} / 1M` },
                    { label: '智能指数', value: p.intelligence.toFixed(1) },
                  ],
                }))}
                height={240}
                xLabel="平均价 USD / 1M tokens"
                yLabel="智能指数"
                yFormat={(v) => v.toFixed(0)}
                ariaLabel="价格与智能指数散点图"
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
