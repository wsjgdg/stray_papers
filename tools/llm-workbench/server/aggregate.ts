import type { Snapshot, SourceStatus, Leaderboard, LlmModel } from './types.js';
import { SOURCE_REGISTRY } from './sources/registry.js';
import type { SourcePayload, SourcePricing } from './sources/types.js';
import { PROVIDERS } from './providers.js';
import { buildIndex, matchModel } from './match.js';
import { updateModelPrices } from './pricing.js';

async function timed<T>(run: () => Promise<T>): Promise<{ data: T; latencyMs: number }> {
  const t0 = Date.now();
  const data = await run();
  return { data, latencyMs: Date.now() - t0 };
}

/** 数据源在主负载里的条目数（用于 SourceStatus.count 展示） */
function payloadCount(p: SourcePayload): number {
  return Math.max(p.models?.length ?? 0, p.leaderboards?.length ?? 0);
}

/**
 * 评估榜单 → 模型字段回填映射。
 * 新增一个「写回 LlmModel 标量字段」的评估维度，只需在此登记 boardId→字段，
 * 并给 LlmModel 增加对应可空字段；通用 attach 循环即可生效（不再硬编码四处调用）。
 */
const METRIC_FIELDS: Record<string, 'intelligence' | 'agentic' | 'omniscience' | 'speed'> = {
  intelligence: 'intelligence',
  agentic: 'agentic',
  omniscience: 'omniscience',
  speed: 'speed',
};

/** 拉取全量数据并做跨源关联，产出前端快照 */
export async function buildSnapshot(): Promise<Snapshot> {
  const settled = await Promise.allSettled(SOURCE_REGISTRY.map((s) => timed(s.fetch)));

  const sources: SourceStatus[] = SOURCE_REGISTRY.map((def, i) => {
    const r = settled[i];
    return {
      id: def.id,
      name: def.name,
      url: def.url,
      ok: r.status === 'fulfilled',
      latencyMs: r.status === 'fulfilled' ? r.value.latencyMs : null,
      fetchedAt: Date.now(),
      count: r.status === 'fulfilled' ? payloadCount(r.value.data) : null,
      error: r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : null,
    };
  });

  // 聚合各源产物（G-R2：榜单 sourceId/sourceUrl 将由注册表统一打标）
  let models: LlmModel[] = [];
  let leaderboards: Leaderboard[] = [];
  const aaPricing = new Map<string, SourcePricing>();
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    const p = r.value.data;
    if (p.models) models = models.concat(p.models);
    if (p.leaderboards) leaderboards = leaderboards.concat(p.leaderboards);
    if (p.pricing) for (const [k, v] of p.pricing) aaPricing.set(k, v);
  }

  // 评估指标回填到模型表
  if (models.length && leaderboards.length) {
    const keys = buildIndex(models);
    const byId = new Map(models.map((m) => [m.id, m]));

    for (const [boardId, field] of Object.entries(METRIC_FIELDS)) {
      const board = leaderboards.find((b) => b.id === boardId);
      if (!board) continue;
      for (const entry of board.entries) {
        const hit = matchModel(entry.label, entry.aaSlug, keys);
        entry.modelId = hit?.id ?? null;
        const target = hit ? byId.get(hit.id) : undefined;
        if (target) {
          target[field] = entry.value;
          target.aaSlug = entry.aaSlug;
        }
      }
    }

    // 开放度：多个分量求和
    const opennessBoard = leaderboards.find((b) => b.id === 'openness');
    if (opennessBoard) {
      for (const entry of opennessBoard.entries) {
        const hit = matchModel(entry.label, entry.aaSlug, keys);
        if (!hit) continue;
        const target = byId.get(hit.id);
        if (!target) continue;
        const sum = Object.entries(entry.extra)
          .filter(([k]) => k.startsWith('transparency') || k === 'modelAvailability')
          .reduce((acc, [, v]) => acc + v, 0);
        target.openness = Math.round(sum * 10) / 10;
        target.aaSlug = entry.aaSlug ?? target.aaSlug;
      }
    }

    // AA 独立测得定价
    for (const m of models) {
      if (!m.aaSlug) continue;
      const p = aaPricing.get(m.aaSlug);
      if (!p) continue;
      m.aaPriceInput = p.input;
      m.aaPriceOutput = p.output;
      m.aaPriceCacheHit = p.cacheHit;
    }
  }

  models = models.sort((a, b) => b.created - a.created);

  // 把模型级真实定价灌入定价索引，供代理成本估算使用
  updateModelPrices(models);

  return {
    generatedAt: Date.now(),
    models,
    leaderboards,
    providers: PROVIDERS,
    sources,
  };
}
