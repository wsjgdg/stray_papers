import { useCallback, useState } from 'react';
import { fetchBudget, setBudget, type BudgetStatus } from '../../api';
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling';
import { Card, Chip } from '../../ui';

const LEVEL_TONE = { ok: 'down', warn: 'warn', exceed: 'up' } as const;
const LEVEL_LABEL = { ok: '正常', warn: '接近预算', exceed: '已超预算' } as const;

// D3 前端消费：日预算进度条 + 内联设置/清除；阈值判定在服务端（80% 预警 / 100% 超限）
export function BudgetBar() {
  const [status, setStatus] = useState<BudgetStatus | null>(null);
  const [input, setInput] = useState('');
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

  const save = async (dailyUsd: number | null) => {
    setBusy(true);
    setErr(null);
    try {
      setStatus(await setBudget(dailyUsd));
      setInput('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const v = Number(input);
    if (!Number.isFinite(v) || v <= 0) {
      setErr('预算必须为正数（USD）');
      return;
    }
    void save(v);
  };

  const ratio = status?.ratio ?? null;
  const pct = ratio === null ? 0 : Math.min(100, Math.round(ratio * 100));
  const barColor =
    status?.level === 'exceed'
      ? 'bg-red-500'
      : status?.level === 'warn'
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <Card title="日预算" subtitle="今日成本达到预算 80% 预警、100% 超限">
      <div className="space-y-2 text-[11px]">
        {status?.dailyUsd ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={LEVEL_TONE[status.level]}>{LEVEL_LABEL[status.level]}</Chip>
              <span className="text-muted">
                今日 <b className="text-ink">${status.todayUsd.toFixed(4)}</b> / 预算 $
                {status.dailyUsd}
                {ratio !== null && `（${pct}%）`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#0e1728]">
              <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <div className="text-muted">
            未设置预算（今日成本 ${status ? status.todayUsd.toFixed(4) : '0.0000'}）
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            step={1}
            className="input w-32"
            placeholder="日预算 USD"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={apply}
            disabled={busy || !input.trim()}
          >
            设置
          </button>
          {status?.dailyUsd != null && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => void save(null)}
              disabled={busy}
            >
              清除
            </button>
          )}
          {err && <span className="text-up">{err}</span>}
        </div>
      </div>
    </Card>
  );
}
