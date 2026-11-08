import type { SourceDef } from './types.js';
import { OPENROUTER_ENDPOINT, fetchOpenRouterModels } from './openrouter.js';
import { AA_PAGE, fetchArtificialAnalysis } from './artificialAnalysis.js';

/**
 * 数据源注册表。新增数据源 = 在 sources/ 下实现 fetcher（返回 SourcePayload）
 * 并在此登记一项；buildSnapshot 自动并发抓取并按 id 推送 SourceStatus。
 * 既有的 openrouter / artificial-analysis 仅是其中两项实现，行为不变。
 */
export const SOURCE_REGISTRY: SourceDef[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter Models API',
    url: OPENROUTER_ENDPOINT,
    fetch: async () => ({ models: await fetchOpenRouterModels() }),
  },
  {
    id: 'artificial-analysis',
    name: 'Artificial Analysis Leaderboards',
    url: AA_PAGE,
    fetch: fetchArtificialAnalysis,
  },
];
