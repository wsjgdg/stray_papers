import { useState } from 'react';
import clsx from 'clsx';
import { Card, Empty, Spinner } from '../../ui';
import { Stat, fmtCost, type Currency } from './shared';
import { CachePanel } from './CachePanel';
import { useProxyOverview } from '../../hooks/useProxyOverview';

// ───────── 实时指标 ─────────
export function MetricsPanel() {
  const { metrics, cache, loading, refetch } = useProxyOverview();
  const [currency, setCurrency] = useState<Currency>('USD');

  const totalCost = metrics.reduce((s, m) => s + (m.totalCostUsd ?? 0), 0);

  if (loading) return <Spinner label="加载指标…" />;
  if (metrics.length === 0)
    return (
      <div className="mx-auto max-w-6xl space-y-3">
        <CachePanel stats={cache} onCleared={refetch} />
        <Empty text="暂无调用记录。去「试用」页发一条请求即可看到指标。" />
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <CachePanel stats={cache} onCleared={refetch} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>累计成本估算</span>
          <span className="text-base font-semibold text-ink">{fmtCost(totalCost, currency)}</span>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-edge">
          {(['USD', 'CNY'] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={clsx(
                'px-3 py-1 text-[11px]',
                currency === c ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-[#16223a]',
              )}
            >
              {c === 'USD' ? '$ USD' : '¥ CNY'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <Card key={m.provider} title={m.provider}>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Stat label="总请求" value={m.totalRequests} />
              <Stat label="成功/失败" value={`${m.successRequests}/${m.errorRequests}`} />
              <Stat label="平均延迟" value={`${m.avgLatencyMs}ms`} />
              <Stat label="请求速率" value={`${m.reqRate}/s`} />
              <Stat label="输入速率" value={`${m.inputRateTokS} tok/s`} />
              <Stat label="输出速率" value={`${m.outputRateTokS} tok/s`} />
              <Stat label="累计输入 tok" value={m.totalInputTokens.toLocaleString()} />
              <Stat label="累计输出 tok" value={m.totalOutputTokens.toLocaleString()} />
              <Stat label="缓存命中 tok" value={m.totalCacheReadTokens.toLocaleString()} />
              <Stat label="累计成本" value={fmtCost(m.totalCostUsd ?? 0, currency)} />
              <Stat label="Key 切换" value={m.totalKeySwitches ?? 0} />
              <Stat label="最近状态" value={m.lastStatus ?? '—'} />
            </div>
            {m.lastError && <div className="mt-2 text-[11px] text-up">最近错误: {m.lastError}</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}
