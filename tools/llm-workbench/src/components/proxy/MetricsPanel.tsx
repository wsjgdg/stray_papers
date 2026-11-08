import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Card, Empty, Spinner } from '../../ui';
import { Stat, fmtCost, type Currency } from './shared';
import { CachePanel } from './CachePanel';
import { BudgetBar } from './BudgetBar';
import { UsageOpsCard } from './UsageOpsCard';
import { fetchUsageByTag, type UsageByTagRow } from '../../api';
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
        <BudgetBar />
        <CachePanel stats={cache} onCleared={refetch} />
        <UsageOpsCard />
        <Empty text="暂无调用记录。去「试用」页发一条请求即可看到指标。" />
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <BudgetBar />
      <CachePanel stats={cache} onCleared={refetch} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>累计成本估算</span>
          <span className="text-base font-semibold text-ink">{fmtCost(totalCost, currency)}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* D2 成本导出：按「日 × 厂商 × 模型」聚合最近 30 天支出 */}
          <a className="btn btn-sm" href="/api/proxy/metrics/export?format=csv&days=30" download>
            导出 CSV
          </a>
          <a
            className="btn btn-sm"
            href="/api/proxy/metrics/export?format=json&days=30"
            target="_blank"
            rel="noreferrer"
          >
            JSON
          </a>
          <div className="flex overflow-hidden rounded-lg border border-edge">
            {(['USD', 'CNY'] as Currency[]).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={clsx(
                  'px-3 py-1 text-[11px]',
                  currency === c ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-hover',
                )}
              >
                {c === 'USD' ? '$ USD' : '¥ CNY'}
              </button>
            ))}
          </div>
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

      <TagSpendCard />
      <UsageOpsCard />
    </div>
  );
}

// ───────── B2：按调用标签（x-lb-tag）归集成本 ─────────
function TagSpendCard() {
  const [rows, setRows] = useState<UsageByTagRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchUsageByTag(30)
      .then((r) => setRows(r.rows))
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (rows === null) return null;
  if (rows.length === 0)
    return (
      <Card
        title="按标签归集成本（B2）"
        subtitle="客户端带 x-lb-tag 头即可按项目/团队拆分成本；未带标签的调用归入 (untagged)"
      >
        <div className="text-[11px] text-muted">
          暂无带标签的用量。在请求头加入 <code className="text-accent">x-lb-tag: proj-a</code>{' '}
          后，这里会按标签汇总请求数 / token / 成本。
        </div>
      </Card>
    );

  return (
    <Card
      title="按标签归集成本（B2）"
      subtitle="多项目共用一套 Key 时按 x-lb-tag 拆分成本；CSV 导出已含 tag 列"
      right={
        <a className="btn btn-sm" href="/api/proxy/metrics/export?format=csv&days=30" download>
          导出 CSV（含 tag）
        </a>
      }
    >
      {/* D6：外壳常驻，内层条件渲染 */}
      <div role="alert">{err && <div className="mb-2 text-[11px] text-up">{err}</div>}</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[11px]">
          <thead className="bg-raised text-muted">
            <tr>
              <th className="px-2 py-1.5 text-left">标签</th>
              <th className="px-2 py-1.5 text-right">请求</th>
              <th className="px-2 py-1.5 text-right">输入 tok</th>
              <th className="px-2 py-1.5 text-right">输出 tok</th>
              <th className="px-2 py-1.5 text-right">缓存命中 tok</th>
              <th className="px-2 py-1.5 text-right">成本</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tag} className="border-t border-edge">
                <td className="px-2 py-1 font-mono text-accent">{r.tag}</td>
                <td className="px-2 py-1 text-right tabular-nums text-ink">
                  {r.requests.toLocaleString()}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-ink">
                  {r.inputTokens.toLocaleString()}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-ink">
                  {r.outputTokens.toLocaleString()}
                </td>
                <td className="px-2 py-1 text-right tabular-nums text-accent">
                  {r.cacheReadTokens.toLocaleString()}
                </td>
                <td className="px-2 py-1 text-right tabular-nums font-medium text-ink">
                  ${r.costUsd.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
