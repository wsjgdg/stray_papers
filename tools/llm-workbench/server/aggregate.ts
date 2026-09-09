import type { Snapshot, SourceStatus, Leaderboard } from './types.js';
import { fetchOpenRouterModels } from './sources/openrouter.js';
import { AA_PAGE, fetchArtificialAnalysis } from './sources/artificialAnalysis.js';
import { OPENROUTER_ENDPOINT } from './sources/openrouter.js';
import { PROVIDERS } from './providers.js';
import { buildIndex, matchModel } from './match.js';
import { updateModelPrices } from './pricing.js';

async function timed<T>(run: () => Promise<T>): Promise<{ data: T; latencyMs: number }> {
  const t0 = Date.now();
  const data = await run();
  return { data, latencyMs: Date.now() - t0 };
}

/** 拉取全量数据并做跨源关联，产出前端快照 */
export async function buildSnapshot(): Promise<Snapshot> {
  const [orSettled, aaSettled] = await Promise.allSettled([
    timed(fetchOpenRouterModels),
    timed(fetchArtificialAnalysis),
  ]);

  const sources: SourceStatus[] = [];

  let models = orSettled.status === 'fulfilled' ? orSettled.value.data : [];
  sources.push({
    id: 'openrouter',
    name: 'OpenRouter Models API',
    url: OPENROUTER_ENDPOINT,
    ok: orSettled.status === 'fulfilled',
    latencyMs: orSettled.status === 'fulfilled' ? orSettled.value.latencyMs : null,
    fetchedAt: Date.now(),
    count: orSettled.status === 'fulfilled' ? models.length : null,
    error:
      orSettled.status === 'rejected'
        ? String(orSettled.reason?.message ?? orSettled.reason)
        : null,
  });

  let leaderboards: Leaderboard[] = [];
  let aaPricing = new Map<
    string,
    { input: number | null; output: number | null; cacheHit: number | null }
  >();
  if (aaSettled.status === 'fulfilled') {
    leaderboards = aaSettled.value.data.leaderboards;
    aaPricing = aaSettled.value.data.pricing;
  }
  sources.push({
    id: 'artificial-analysis',
    name: 'Artificial Analysis Leaderboards',
    url: AA_PAGE,
    ok: aaSettled.status === 'fulfilled',
    latencyMs: aaSettled.status === 'fulfilled' ? aaSettled.value.latencyMs : null,
    fetchedAt: Date.now(),
    count: aaSettled.status === 'fulfilled' ? leaderboards.length : null,
    error:
      aaSettled.status === 'rejected'
        ? String(aaSettled.reason?.message ?? aaSettled.reason)
        : null,
  });

  // 评估指标回填到模型表
  if (models.length && leaderboards.length) {
    const keys = buildIndex(models);
    const byId = new Map(models.map((m) => [m.id, m]));
    const attach = (
      boardId: string,
      field: 'intelligence' | 'agentic' | 'omniscience' | 'speed' | 'openness',
    ) => {
      const board = leaderboards.find((b) => b.id === boardId);
      if (!board) return;
      for (const entry of board.entries) {
        const hit = matchModel(entry.label, entry.aaSlug, keys);
        entry.modelId = hit?.id ?? null;
        if (hit) {
          const target = byId.get(hit.id);
          if (target) {
            target[field] = entry.value;
            target.aaSlug = entry.aaSlug;
          }
        }
      }
    };
    attach('intelligence', 'intelligence');
    attach('agentic', 'agentic');
    attach('omniscience', 'omniscience');
    attach('speed', 'speed');

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
