import { useCallback, useState } from 'react';
import { fetchBudget, setBudget, type BudgetStatus } from '../../api';
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling';
import { Card, Chip } from '../../ui';

const LEVEL_TONE = { ok: 'down', warn: 'warn', exceed: 'up' } as const;
const LEVEL_LABEL = { ok: '正常', warn: '接近预算', exceed: '已超预算' } as const;

type Level = keyof typeof LEVEL_LABEL;

const usd = (v: number) => `$${v.toFixed(4)}`;
const clampPct = (ratio: number | null | undefined) =>
  ratio == null ? 0 : Math.min(100, Math.max(0, ratio * 100));
const barTone = (level: Level) =>
  level === 'exceed' ? 'bg-up' : level === 'warn' ? 'bg-warn' : 'bg-down';

// 进度条：ratio 为已用比例，marker 为可选的预测位置（竖标）
function Bar({
  ratio,
  level,
  marker,
  title,
}: {
  ratio: number | null;
  level: Level;
  marker?: number | null;
  title?: string;
}) {
  const used = clampPct(ratio);
  const mark = marker == null ? null : clampPct(marker);
  return (
    <div
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-raised"
      title={title}
      aria-hidden
    >
      <div className={`h-full ${barTone(level)} transition-all`} style={{ width: `${used}%` }} />
      {mark != null && mark > used && (
        <div
          className="absolute inset-y-0 w-[2px] bg-ink/40"
          style={{ left: `calc(${mark}% - 1px)` }}
        />
      )}
    </div>
  );
}

// D3 日预算 + E1 月度预算：阈值判定在服务端（日 80% 预警 / 100% 超限并可拦截；月度只告警）。
// 月终预测由服务端 usageStore.projectMonthEnd 线性外推，进度条上的竖标即预测落点。
export function BudgetBar() {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [dayInput, setDayInput] = useState('');
  const [monthInput, setMonthInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchBudget()
      .then(setStatus)
      .catch(() => {
        /* 瞬时错误静默忽略，下次轮询重试 */
      });
  }, []);
  useVisibilityPolling(3000, load);

  const save = async (patch: { dailyUsd?: number | null; monthlyUsd?: number | null }) => {
    setBusy(true);
    setErr(null);
    try {
      setStatus(await setBudget(patch));
      if ('dailyUsd' in patch) setDayInput('');
      if ('monthlyUsd' in patch) setMonthInput('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = (field: 'dailyUsd' | 'monthlyUsd', raw: string) => {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) {
      setErr('预算必须为正数（USD）');
      return;
    }
    void save({ [field]: v });
  };

  const month = status?.month;
  const projectedOver = month?.projectedOverageUsd ?? 0;
  // 预测色调直接取服务端 projectedLevel（预测月终 / 月预算的 80%·100% 阈），避免前后端两套口径
  const forecastTone = LEVEL_TONE[month ? month.projectedLevel : 'ok'];

  return (
    <Card title="预算" subtitle="日预算 80% 预警 / 100% 超限（可拦截）；月度仅预警不拦截">
      <div className="space-y-3 text-[11px]">
        {/* ── 日预算 ── */}
        <section className="space-y-2">
          <div className="text-muted">日预算</div>
          {status?.dailyUsd ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={LEVEL_TONE[status.level]}>{LEVEL_LABEL[status.level]}</Chip>
                <span className="text-muted">
                  今日 <b className="text-ink">{usd(status.todayUsd)}</b> / 预算 ${status.dailyUsd}
                  {status.ratio !== null && `（${Math.round(clampPct(status.ratio))}%）`}
                </span>
              </div>
              <Bar ratio={status.ratio} level={status.level} />
            </>
          ) : (
            <div className="text-muted">
              未设置（今日成本 {status ? usd(status.todayUsd) : '$0.0000'}）
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              className="input w-32"
              placeholder="日预算 USD"
              aria-label="日预算（USD）"
              value={dayInput}
              onChange={(e) => setDayInput(e.target.value)}
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={() => apply('dailyUsd', dayInput)}
              disabled={busy || !dayInput.trim()}
            >
              设置
            </button>
            {status?.dailyUsd != null && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => void save({ dailyUsd: null })}
                disabled={busy}
              >
                清除
              </button>
            )}
          </div>
        </section>

        {/* ── 月度预算与月终预测 ── */}
        <section className="space-y-2 border-t border-line pt-3">
          <div className="text-muted">月度预算（仅告警）</div>
          {month && status?.monthlyUsd ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={LEVEL_TONE[month.level]}>{LEVEL_LABEL[month.level]}</Chip>
                <span className="text-muted">
                  本月 <b className="text-ink">{usd(month.monthToDateUsd)}</b> / 预算 $
                  {status.monthlyUsd}
                  {month.ratio !== null && `（${Math.round(clampPct(month.ratio))}%）`}
                </span>
              </div>
              <Bar
                ratio={month.ratio}
                level={month.level}
                marker={month.projectedRatio}
                title="竖标 = 按近期日均预测的月终落点"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={forecastTone}>
                  {projectedOver > 0
                    ? `预计超支 ${usd(projectedOver)}`
                    : `预计月终 ${usd(month.projectedMonthUsd)}`}
                </Chip>
                <span className="text-muted">
                  月终预测 <b className="text-ink">{usd(month.projectedMonthUsd)}</b>
                  {projectedOver > 0 && ` · 超额 ${usd(projectedOver)}`}
                  {month.basis === 'recent'
                    ? ` · 近 ${month.windowDays} 日均 ${usd(month.recentDailyAvgUsd)}/天`
                    : ' · 月初样本不足，按今日至今推算'}
                  {` · 剩 ${month.remainingDays} 天`}
                </span>
              </div>
            </>
          ) : (
            <div className="text-muted">
              未设置（本月累计 {month ? usd(month.monthToDateUsd) : '$0.0000'}
              {month && `，预计月终 ${usd(month.projectedMonthUsd)}`}）
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={0}
              step={1}
              className="input w-32"
              placeholder="月预算 USD"
              aria-label="月度预算（USD）"
              value={monthInput}
              onChange={(e) => setMonthInput(e.target.value)}
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={() => apply('monthlyUsd', monthInput)}
              disabled={busy || !monthInput.trim()}
            >
              设置
            </button>
            {status?.monthlyUsd != null && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => void save({ monthlyUsd: null })}
                disabled={busy}
              >
                清除
              </button>
            )}
          </div>
        </section>

        <span className="text-up" role="alert">
          {err ?? ''}
        </span>
      </div>
    </Card>
  );
}
