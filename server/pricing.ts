import type { LlmModel } from './types.js';

// 成本估算：USD / 1M tokens。
// 优先用快照里的模型级真实定价（updateModelPrices 注入），缺失时回退到厂商默认定价。

export interface Price {
  input: number; // USD / 1M input tokens
  output: number; // USD / 1M output tokens
  cacheRead: number; // USD / 1M cache-read tokens（命中缓存部分的价格，通常远低于 input）
}

// 兜底默认（一个相对保守的通用价），仅当既无模型级也无厂商级价格时使用
const DEFAULT: Price = { input: 1, output: 2, cacheRead: 0.1 };

// 各主流厂商代表性默认定价（USD / 1M tokens）。自定义厂商走 DEFAULT。
export const PROVIDER_PRICING: Record<string, Price> = {
  openai: { input: 2.5, output: 10, cacheRead: 1.25 },
  anthropic: { input: 3, output: 15, cacheRead: 0.3 },
  google: { input: 1.25, output: 5, cacheRead: 0.31 },
  vertex: { input: 1.25, output: 5, cacheRead: 0.31 },
  xai: { input: 2, output: 10, cacheRead: 2 },
  mistral: { input: 0.9, output: 2.7, cacheRead: 0.9 },
  cohere: { input: 1.2, output: 4.8, cacheRead: 1.2 },
  groq: { input: 0.59, output: 0.79, cacheRead: 0.59 },
  together: { input: 0.6, output: 1.8, cacheRead: 0.6 },
  fireworks: { input: 1, output: 2, cacheRead: 0.2 },
  openrouter: { input: 1, output: 3, cacheRead: 0.3 },
  huggingface: { input: 0.6, output: 1.8, cacheRead: 0.6 },
  deepseek: { input: 0.55, output: 2.19, cacheRead: 0.14 },
  moonshot: { input: 0.6, output: 2.4, cacheRead: 0.15 },
  zai: { input: 0.5, output: 1.5, cacheRead: 0.1 },
  qwen: { input: 0.4, output: 1.2, cacheRead: 0.1 },
  volcengine: { input: 0.3, output: 0.9, cacheRead: 0.08 },
  tencent: { input: 0.8, output: 2, cacheRead: 0.2 },
  baidu: { input: 0.5, output: 1.5, cacheRead: 0.12 },
  minimax: { input: 1, output: 3, cacheRead: 0.25 },
  siliconflow: { input: 0.7, output: 1.4, cacheRead: 0.14 },
  stepfun: { input: 1, output: 2, cacheRead: 0.2 },
  aws: { input: 3, output: 15, cacheRead: 0.75 },
  azure: { input: 2.5, output: 10, cacheRead: 1.25 },
  nvidia: { input: 0.8, output: 1.6, cacheRead: 0.2 },
};

// 模型级价格索引：由快照模型库填充，key 为模型 id（及去掉 vendor 前缀的纯模型名）
let modelIndex = new Map<string, Price>();

export function updateModelPrices(models: LlmModel[]): void {
  const next = new Map<string, Price>();
  for (const m of models) {
    const price: Price = {
      input: m.promptPrice ?? DEFAULT.input,
      output: m.completionPrice ?? DEFAULT.output,
      cacheRead: m.cacheReadPrice ?? m.promptPrice ?? DEFAULT.cacheRead,
    };
    next.set(m.id, price);
    const slash = m.id.indexOf('/');
    if (slash >= 0) next.set(m.id.slice(slash + 1), price);
  }
  modelIndex = next;
}

export function priceFor(providerId: string, model: string): Price {
  if (model) {
    const exact = modelIndex.get(model);
    if (exact) return exact;
    const slash = model.indexOf('/');
    if (slash >= 0) {
      const byTail = modelIndex.get(model.slice(slash + 1));
      if (byTail) return byTail;
    }
  }
  return PROVIDER_PRICING[providerId] ?? DEFAULT;
}

export interface CostBreakdown {
  input: number; // USD
  output: number; // USD
  cache: number; // USD（cache-read 部分）
  total: number; // USD
}

// cache-read token 以 cacheRead 价格计，且从 input 计费基数中扣除，避免重复计费
export function estimateCost(
  providerId: string,
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
  cacheReadTokens: number | null,
): CostBreakdown {
  const p = priceFor(providerId, model);
  const cache = cacheReadTokens ? (cacheReadTokens * p.cacheRead) / 1_000_000 : 0;
  const billableInput = Math.max(0, (inputTokens ?? 0) - (cacheReadTokens ?? 0));
  const input = (billableInput * p.input) / 1_000_000;
  const output = outputTokens ? (outputTokens * p.output) / 1_000_000 : 0;
  return { input, output, cache, total: input + output + cache };
}
