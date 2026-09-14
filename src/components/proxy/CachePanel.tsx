import { useState } from 'react';
import { clearResponseCache, type CacheStats } from '../../api';
import { Card } from '../../ui';

// 响应缓存统计：命中 / 未命中 / 条目数 + 清空
export function CachePanel({
  stats,
  onCleared,
}: {
  stats: CacheStats | null;
  onCleared: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const clear = async () => {
    setBusy(true);
    try {
      await clearResponseCache();
      onCleared();
    } finally {
      setBusy(false);
    }
  };

  if (!stats) return null;
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? Math.round((stats.hits / total) * 100) : 0;

  return (
    <Card
      title="响应缓存"
      subtitle="相同请求（方法+路径+请求体，不含密钥）命中后直接回放，省去上游调用与 token 消耗"
      right={
        <button className="btn btn-ghost" onClick={clear} disabled={busy || stats.size === 0}>
          清空 ({stats.size})
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-4 text-[11px]">
        <span className={stats.enabled ? 'text-down' : 'text-muted'}>
          状态: {stats.enabled ? '启用' : '关闭'}
        </span>
        <span className="text-muted">TTL: {Math.round(stats.ttlMs / 1000)}s</span>
        <span className="text-muted">条目: {stats.size}</span>
        <span className="text-accent">命中: {stats.hits}</span>
        <span className="text-muted">未命中: {stats.misses}</span>
        <span className="text-ink">命中率: {hitRate}%</span>
      </div>
    </Card>
  );
}
