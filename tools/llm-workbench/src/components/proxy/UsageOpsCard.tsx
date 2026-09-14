import { useCallback, useState } from 'react';
import {
  fetchUsageOps,
  purgeUsage,
  usageExportUrl,
  type UsageOpsStats,
  type UsagePurgePlan,
} from '../../api';
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling';
import { Card } from '../../ui';

type Plan = UsagePurgePlan & { keepDays: number; dayCount: number };

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const usd = (v: number) => `$${v.toFixed(4)}`;

// E2：用量留存可运维 —— 概览（数据范围 / 累计 / 维度基数 / 文件体积）+ 全量导出 + 收缩窗口。
// 「预览 → 确认清理」两段式：预览与实际清理在服务端共用同一实现，所见即所删。
export function UsageOpsCard() {
  const [stats, setStats] = useState<UsageOpsStats | null>(null);
  const [keepDays, setKeepDays] = useState('30');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 轮询只刷新概览，不覆盖用户正在确认的预览结果
  const load = useCallback(() => {
    fetchUsageOps(30)
      .then((r) => setStats(r.stats))
      .catch(() => {
        /* 瞬时错误静默忽略，下次轮询重试 */
      });
  }, []);
  useVisibilityPolling(10000, load);

  const preview = async () => {
    const n = Number(keepDays);
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const r = await fetchUsageOps(Number.isFinite(n) ? n : 30);
      setStats(r.stats);
      setPlan(r.purge);
      if (r.purge.dayCount === 0) setMsg('该窗口内没有可清理的数据');
    } catch (e) {
      setErr((e as Error).message);
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmPurge = async () => {
    if (!plan) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await purgeUsage(plan.keepDays);
      setStats(r.stats);
      setMsg(
        r.removed.days.length > 0
          ? `已删除 ${r.removed.days.length} 天（${r.removed.requests} 次请求 / ${usd(r.removed.costUsd)}）`
          : '没有数据被删除',
      );
      setPlan(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const range =
    stats?.firstDay && stats.lastDay
      ? `${stats.firstDay} → ${stats.lastDay}（${stats.days} 天）`
      : '暂无数据';

  return (
    <Card
      title="用量留存"
      subtitle="日粒度用量按 日 × 厂商 × 模型 × 标签 落盘，用于跨重启的成本统计与导出"
      right={
        <a className="btn btn-sm" href={usageExportUrl()} download>
          导出全量 JSON
        </a>
      }
    >
      <div className="space-y-3 text-[11px]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-muted">
            数据范围 <b className="text-ink">{range}</b>
          </span>
          <span className="text-muted">
            累计 <b className="text-ink">{stats ? usd(stats.totalCostUsd) : '—'}</b> /{' '}
            {stats ? stats.totalRequests.toLocaleString() : '—'} 次请求
          </span>
          <span className="text-muted">
            厂商 {stats?.providers ?? '—'} · 模型 {stats?.models ?? '—'} · 标签 {stats?.tags ?? '—'}
          </span>
          <span className="text-muted">
            文件 {stats ? fmtBytes(stats.fileBytes) : '—'}
            {stats?.dirty ? '（有未落盘改动）' : ''}
          </span>
          <span className="text-muted">
            自动保留 {stats?.retentionDays ?? '—'} 天（早于 {stats?.cutoffDay ?? '—'} 的自动裁剪）
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-muted">保留最近</span>
          <input
            type="number"
            min={1}
            max={stats?.retentionDays ?? 90}
            step={1}
            className="input w-24"
            aria-label="清理后保留天数"
            value={keepDays}
            onChange={(e) => {
              setKeepDays(e.target.value);
              setPlan(null); // 天数一变，先前预览即失效，必须重新预览
              setMsg(null);
            }}
          />
          <span className="text-muted">天，删除更早的数据</span>
          <button className="btn btn-sm" onClick={() => void preview()} disabled={busy}>
            预览
          </button>
          {/* 无可清理数据时不渲染确认按钮（避免出现禁用的「确认清理（0 天）」噪音） */}
          {plan && plan.dayCount > 0 && (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => void confirmPurge()}
              disabled={busy}
            >
              确认清理（{plan.dayCount} 天 / {usd(plan.costUsd)}）
            </button>
          )}
        </div>

        {plan && plan.dayCount > 0 && (
          <div className="text-muted">
            将删除 <b className="text-up">{plan.dayCount}</b> 天（{plan.days[0]} →{' '}
            {plan.days[plan.days.length - 1]}），共 {plan.requests.toLocaleString()} 次请求 /{' '}
            {usd(plan.costUsd)}；保留 {plan.keepDays} 天起的数据。此操作不可撤销。
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-down" role="status">
            {msg ?? ''}
          </span>
          <span className="text-up" role="alert">
            {err ?? ''}
          </span>
        </div>
      </div>
    </Card>
  );
}
