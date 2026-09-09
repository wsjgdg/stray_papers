import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ExternalLink } from 'lucide-react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Leaderboard, LeaderboardEntry, LlmModel } from '../../server/types';
import { fmtCtx, fmtPrice } from '../api';
import { Bar, Chip, Empty } from '../ui';

const AXIS = '#9aa7bd';
const GRID = '#1f2d44';
const AA_ORIGIN = 'https://artificialanalysis.ai';
const MIN_SCATTER_POINTS = 3;
const RANK_COLORS = ['#f2c14e', '#c9d1de', '#d18b4c'];

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
  const color = rank <= 3 ? RANK_COLORS[rank - 1] : '#5a6d8c';
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums"
      style={{ color, borderColor: `${color}66`, background: `${color}1f` }}
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
  const detailsHref = entry.detailsUrl ? `${AA_ORIGIN}${entry.detailsUrl}` : null;
  return (
    <div className="flex items-center gap-3 border-b border-edge/60 px-4 py-2.5 transition-colors hover:bg-[#16213a]">
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
          <Bar value={entry.value} max={max} color={rank <= 3 ? '#4da3ff' : '#3a5b8c'} height={6} />
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

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ScatterPoint }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-edge bg-[#0e1728] px-3 py-2 text-[11px] shadow-lg">
      <div className="mb-1 max-w-[260px] truncate font-medium text-ink">{point.name}</div>
      <div className="text-muted">
        平均价 <span className="tabular-nums text-ink">{fmtPrice(point.price)}</span> / 1M tokens
      </div>
      <div className="text-muted">
        智能指数 <span className="tabular-nums text-accent">{point.intelligence.toFixed(1)}</span>
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
                        : 'border-edge bg-[#0e1728] text-muted hover:text-ink',
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
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
                    <CartesianGrid stroke={GRID} />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="平均价"
                      stroke={GRID}
                      tickLine={false}
                      tick={{ fill: AXIS, fontSize: 10 }}
                      label={{
                        value: '平均价 USD / 1M tokens',
                        position: 'insideBottom',
                        offset: -14,
                        fill: AXIS,
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="智能指数"
                      stroke={GRID}
                      tickLine={false}
                      width={48}
                      tick={{ fill: AXIS, fontSize: 10 }}
                    />
                    <Tooltip
                      content={<ScatterTooltip />}
                      cursor={{ stroke: GRID, strokeDasharray: '3 3' }}
                    />
                    <Scatter
                      data={points}
                      fill="#4da3ff"
                      fillOpacity={0.7}
                      isAnimationActive={false}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
