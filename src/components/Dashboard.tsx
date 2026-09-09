import { useMemo, useState } from 'react';
import { Activity, Cpu, Database, Gauge, Layers, Sparkles, Zap } from 'lucide-react';
import type { LlmModel, SourceStatus } from '../../server/types';
import type { SnapshotResponse } from '../api';
import { fmtCtx, fmtDate, fmtPrice, fmtTime } from '../api';
import { Bar, Card, Chip, Empty, Stat } from '../ui';

interface Props {
  snapshot: SnapshotResponse;
}

function avgPrice(m: LlmModel): number {
  return (m.promptPrice + m.completionPrice) / 2;
}

/** 每美元智能：智能指数 / 平均价格，粗略性价比 */
function valueScore(m: LlmModel): number {
  const p = avgPrice(m);
  if (!m.intelligence || p <= 0) return 0;
  return m.intelligence / p;
}

export default function Dashboard({ snapshot }: Props) {
  const { models, leaderboards, sources, meta, generatedAt } = snapshot;
  const [tab, setTab] = useState<'intelligence' | 'value' | 'speed' | 'context'>('intelligence');

  const stats = useMemo(() => {
    const vendors = new Set(models.map((m) => m.vendor));
    const maxCtx = models.reduce((a, b) => (b.context > a.context ? b : a), models[0]);
    const newest = models.reduce((a, b) => (b.created > a.created ? b : a), models[0]);
    const cutoff = Date.now() / 1000 - 30 * 86400;
    const fresh = models.filter((m) => m.created >= cutoff).length;
    const priced = models.filter((m) => avgPrice(m) > 0);
    const cheapest = priced.reduce((a, b) => (avgPrice(b) < avgPrice(a) ? b : a), priced[0]);
    const fastest = models.reduce((a, b) => ((b.speed ?? 0) > (a.speed ?? 0) ? b : a), models[0]);
    return { vendors: vendors.size, maxCtx, newest, fresh, cheapest, fastest };
  }, [models]);

  const ranked = useMemo(() => {
    const withIntel = models.filter((m) => m.intelligence !== null);
    const withSpeed = models.filter((m) => m.speed !== null);
    return {
      intelligence: [...withIntel]
        .sort((a, b) => (b.intelligence ?? 0) - (a.intelligence ?? 0))
        .slice(0, 12),
      value: [...withIntel].sort((a, b) => valueScore(b) - valueScore(a)).slice(0, 12),
      speed: [...withSpeed].sort((a, b) => (b.speed ?? 0) - (a.speed ?? 0)).slice(0, 12),
      context: [...models].sort((a, b) => b.context - a.context).slice(0, 12),
    };
  }, [models]);

  const vendorRank = useMemo(() => {
    const map = new Map<string, { label: string; count: number; ctx: number }>();
    for (const m of models) {
      const cur = map.get(m.vendorLabel) ?? { label: m.vendorLabel, count: 0, ctx: 0 };
      cur.count += 1;
      cur.ctx = Math.max(cur.ctx, m.context);
      map.set(m.vendorLabel, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [models]);

  const recent = useMemo(
    () => [...models].sort((a, b) => b.created - a.created).slice(0, 10),
    [models],
  );

  const rows = ranked[tab];
  const rowMax =
    tab === 'intelligence'
      ? Math.max(...rows.map((m) => m.intelligence ?? 0), 1)
      : tab === 'speed'
        ? Math.max(...rows.map((m) => m.speed ?? 0), 1)
        : tab === 'context'
          ? Math.max(...rows.map((m) => m.context), 1)
          : Math.max(...rows.map(valueScore), 1);

  return (
    <div className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="模型总数" value={models.length} hint={`${stats.vendors} 家厂商`} />
        <Stat
          label="评估榜单"
          value={leaderboards.length}
          hint="Artificial Analysis"
          tone="accent"
        />
        <Stat
          label="最长上下文"
          value={fmtCtx(stats.maxCtx?.context ?? 0)}
          hint={stats.maxCtx?.name ?? '—'}
        />
        <Stat
          label="最高智能指数"
          value={(ranked.intelligence[0]?.intelligence ?? 0).toFixed(1)}
          hint={ranked.intelligence[0]?.name ?? '—'}
          tone="accent"
        />
        <Stat
          label="最快输出"
          value={`${Math.round(stats.fastest?.speed ?? 0)} tok/s`}
          hint={stats.fastest?.name ?? '—'}
        />
        <Stat
          label="30 天内新模型"
          value={stats.fresh}
          hint={`最新：${fmtDate(stats.newest?.created ?? 0)}`}
          tone="warn"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="模型排行"
          subtitle="按不同维度实时排序，数据来自 Artificial Analysis 与 OpenRouter"
          right={
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['intelligence', '智能指数', Gauge],
                  ['value', '性价比', Sparkles],
                  ['speed', '输出速度', Zap],
                  ['context', '上下文', Layers],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`btn px-2 py-1 text-[11px] ${tab === key ? 'btn-primary' : ''}`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {rows.length === 0 ? (
            <Empty text="该维度暂无数据" />
          ) : (
            <ul className="space-y-2">
              {rows.map((m, i) => {
                const value =
                  tab === 'intelligence'
                    ? (m.intelligence ?? 0)
                    : tab === 'speed'
                      ? (m.speed ?? 0)
                      : tab === 'context'
                        ? m.context
                        : valueScore(m);
                return (
                  <li key={m.id} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-xs text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs text-ink">{m.name}</span>
                        <Chip>{m.vendorLabel}</Chip>
                        {m.intelligence !== null && tab !== 'intelligence' && (
                          <span className="text-[11px] text-muted">
                            智能 {m.intelligence.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1">
                        <Bar
                          value={value}
                          max={rowMax}
                          color={tab === 'value' ? '#f59e0b' : '#4da3ff'}
                        />
                      </div>
                    </div>
                    <div className="w-28 shrink-0 text-right text-xs tabular-nums text-ink">
                      {tab === 'intelligence' && (m.intelligence ?? 0).toFixed(1)}
                      {tab === 'speed' && `${Math.round(m.speed ?? 0)} tok/s`}
                      {tab === 'context' && fmtCtx(m.context)}
                      {tab === 'value' && `${value.toFixed(0)} 分/$`}
                    </div>
                    <div className="w-24 shrink-0 text-right text-[11px] tabular-nums text-muted">
                      {fmtPrice(m.promptPrice)} / {fmtPrice(m.completionPrice)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="厂商模型数量" subtitle="Top 12 · 含最大上下文">
            <ul className="space-y-2">
              {vendorRank.map((v) => (
                <li key={v.label} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-ink">{v.label}</span>
                  <div className="min-w-0 flex-1">
                    <Bar
                      value={v.count}
                      max={vendorRank[0]?.count ?? 1}
                      color="#22d3ee"
                      height={5}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">
                    {v.count}
                  </span>
                  <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted">
                    {fmtCtx(v.ctx)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="数据源状态"
            subtitle={`快照生成于 ${fmtTime(generatedAt)} · 缓存 ${Math.round(meta.ttlMs / 60000)} 分钟`}
          >
            <SourceList sources={sources} />
          </Card>
        </div>
      </div>

      <Card title="最新上架模型" subtitle="按 OpenRouter 上架时间倒序">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {recent.map((m) => (
            <div key={m.id} className="rounded-lg border border-edge bg-[#0e1728] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-ink">{m.name}</span>
                <span className="shrink-0 text-[11px] text-muted">{fmtDate(m.created)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Chip>{fmtCtx(m.context)}</Chip>
                <Chip tone="accent">
                  {fmtPrice(m.promptPrice)} / {fmtPrice(m.completionPrice)}
                </Chip>
                {m.reasoning && <Chip tone="ok">推理</Chip>}
                {m.tools && <Chip>工具</Chip>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SourceList({ sources }: { sources: SourceStatus[] }) {
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.id} className="flex items-start gap-2">
          {s.ok ? (
            <Activity size={13} className="mt-0.5 shrink-0 text-down" />
          ) : (
            <Cpu size={13} className="mt-0.5 shrink-0 text-up" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs text-ink">{s.name}</span>
              <Chip tone={s.ok ? 'down' : 'up'}>{s.ok ? '正常' : '失败'}</Chip>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
              <Database size={10} />
              <span>{s.count ?? '—'} 条</span>
              {s.latencyMs !== null && <span>{s.latencyMs} ms</span>}
              {s.error && <span className="truncate text-up">{s.error}</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
