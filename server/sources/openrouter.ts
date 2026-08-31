import type { LlmModel } from '../types.js';
import { fetchJson, perMillion } from '../http.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/models';

interface OrModel {
  id: string;
  canonical_slug?: string;
  name: string;
  created: number;
  description: string;
  context_length: number;
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
  };
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string | null;
  };
  top_provider?: { max_completion_tokens?: number | null; context_length?: number };
  supported_parameters?: string[];
  reasoning?: { supported?: boolean } | null;
}

const VENDOR_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  'x-ai': 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Alibaba Qwen',
  moonshotai: 'Moonshot AI',
  'z-ai': 'Z.ai (Zhipu)',
  tencent: 'Tencent',
  moonshot: 'Moonshot AI',
  minimax: 'MiniMax',
  'minimax-ai': 'MiniMax',
  mistralai: 'Mistral AI',
  'bytedance-seed': 'ByteDance Seed',
  meta: 'Meta',
  nvidia: 'NVIDIA',
  xiaomi: 'Xiaomi',
  baichuan: 'Baichuan',
  '01-ai': '01.AI',
  stepfun: 'StepFun',
  cohere: 'Cohere',
  ai21: 'AI21',
  perplexity: 'Perplexity',
  openrouter: 'OpenRouter',
  liquid: 'Liquid AI',
  upstage: 'Upstage',
  inclusionai: 'InclusionAI',
  meituan: 'Meituan',
  sakana: 'Sakana AI',
  nousresearch: 'Nous Research',
  'inception-labs': 'Inception Labs',
  arcee: 'Arcee AI',
  'morph-labs': 'Morph Labs',
  'nex-agi': 'NEX AGI',
  'aion-labs': 'Aion Labs',
  poolside: 'Poolside',
  thinkingmachines: 'Thinking Machines',
  'dots-studio': 'Dots Studio',
  kwaipilot: 'Kwaipilot',
  relace: 'Relace',
  'prime-intellect': 'Prime Intellect',
};

export function vendorLabel(vendor: string, name: string): string {
  const colon = name.indexOf(':');
  if (colon > 0 && colon < 32) return name.slice(0, colon).trim();
  if (VENDOR_LABELS[vendor]) return VENDOR_LABELS[vendor];
  return vendor
    .split(/[-_]/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ');
}

/** 去掉厂商前缀后的纯模型名，用于与评估榜单做匹配 */
export function bareName(name: string): string {
  const colon = name.indexOf(':');
  return (colon > 0 ? name.slice(colon + 1) : name).trim();
}

export async function fetchOpenRouterModels(): Promise<LlmModel[]> {
  const json = await fetchJson<{ data: OrModel[] }>(ENDPOINT, { timeoutMs: 25000 });
  const raw = Array.isArray(json?.data) ? json.data : [];

  const models: LlmModel[] = raw.map((m) => {
    const vendor = m.id.split('/')[0] || 'other';
    const params = m.supported_parameters ?? [];
    const pricing = m.pricing ?? ({} as OrModel['pricing']);
    return {
      id: m.id,
      slug: m.canonical_slug ?? m.id,
      name: m.name,
      vendor,
      vendorLabel: vendorLabel(vendor, m.name),
      created: m.created ?? 0,
      context: m.context_length ?? 0,
      maxOutput: m.top_provider?.max_completion_tokens ?? null,
      promptPrice: perMillion(pricing.prompt) ?? 0,
      completionPrice: perMillion(pricing.completion) ?? 0,
      cacheReadPrice: perMillion(pricing.input_cache_read ?? null),
      modality: m.architecture?.modality ?? 'text->text',
      inputModalities: m.architecture?.input_modalities ?? ['text'],
      outputModalities: m.architecture?.output_modalities ?? ['text'],
      reasoning: Boolean(m.reasoning?.supported) || params.includes('reasoning'),
      tools: params.includes('tools'),
      structuredOutput:
        params.includes('structured_outputs') || params.includes('response_format'),
      supportedParams: params,
      openrouterUrl: `https://openrouter.ai/${m.id.replace(/^.*?\//, '')}`,
      description: (m.description ?? '').slice(0, 600),
      intelligence: null,
      agentic: null,
      omniscience: null,
      speed: null,
      aaPriceInput: null,
      aaPriceOutput: null,
      aaPriceCacheHit: null,
      openness: null,
      aaSlug: null,
    };
  });

  // 过滤掉非对话类（embedding / moderation 等）
  return models.filter((m) => (m.inputModalities.join('').length ? true : false));
}

export const OPENROUTER_ENDPOINT = ENDPOINT;
