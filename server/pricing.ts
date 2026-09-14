import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, configDir } from './config.js';
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

// ───────── B5：基准定价表外置（data/pricing.json / configDir()/pricing.json）─────────
// 加载优先级：$PRICING_FILE > configDir()/pricing.json（UI 导入，可写）> 仓库 data/pricing.json。
// 文件条目与内置表**合并**（覆盖同名 provider 项）；无可用文件时回退内置表。
// 用户覆盖（D1）优先级不变：模型覆盖 > 快照模型价 > 厂商覆盖 > 基准表 > DEFAULT。

export const BUILTIN_PRICING_VERSION = 1;

export interface PricingTable {
  version: number;
  updatedAt?: string;
  providers: Record<string, Price>;
}

let tablePricing: Record<string, Price> | null = null;
let tableMeta: { source: 'file' | 'builtin'; version: number; updatedAt?: string; path?: string } =
  {
    source: 'builtin',
    version: BUILTIN_PRICING_VERSION,
  };

/** 校验基准表：providers 必须是「非空 key → 合法价格」；version 缺省 1，cacheRead 缺省同 input */
export function parsePricingTable(input: unknown): PricingTable | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const src = o.providers;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return null;
  const providers: Record<string, Price> = {};
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (!k.trim() || !v || typeof v !== 'object') return null;
    const p = v as Record<string, unknown>;
    if (typeof p.input !== 'number' || typeof p.output !== 'number') return null;
    if (!Number.isFinite(p.input) || p.input < 0) return null;
    if (!Number.isFinite(p.output) || p.output < 0) return null;
    const cacheRead = p.cacheRead === undefined ? p.input : p.cacheRead;
    if (typeof cacheRead !== 'number' || !Number.isFinite(cacheRead) || cacheRead < 0) return null;
    providers[k.trim()] = { input: p.input, output: p.output, cacheRead };
  }
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
    providers,
  };
}

function tableCandidates(): string[] {
  const out: string[] = [];
  if (process.env.PRICING_FILE) out.push(process.env.PRICING_FILE);
  out.push(pricingTablePath());
  out.push(path.join(process.cwd(), 'data', 'pricing.json'));
  return out;
}

/** 导出/导入用的落地路径（UI 导入写这里，始终可写） */
export function pricingTablePath(): string {
  return path.join(configDir(), 'pricing.json');
}

/**
 * 启动时调用（initConfigStore 之后）：按候选顺序加载首个可用文件，否则回退内置表。
 * candidatesOverride 仅用于单测注入候选路径。
 */
export function initPricingTable(candidatesOverride?: string[]): void {
  for (const p of candidatesOverride ?? tableCandidates()) {
    try {
      const parsed = parsePricingTable(JSON.parse(fs.readFileSync(p, 'utf8')));
      if (parsed) {
        tablePricing = { ...PROVIDER_PRICING, ...parsed.providers };
        tableMeta = {
          source: 'file',
          version: parsed.version,
          updatedAt: parsed.updatedAt,
          path: p,
        };
        return;
      }
    } catch {
      /* 该候选不可读或不合法 → 试下一个 */
    }
  }
  tablePricing = null;
  tableMeta = { source: 'builtin', version: BUILTIN_PRICING_VERSION };
}

/** 当前基准表状态（UI 显示来源/版本 + 生效价表） */
export function getPricingTableState(): {
  source: 'file' | 'builtin';
  version: number;
  updatedAt?: string;
  path?: string;
  providers: Record<string, Price>;
} {
  return {
    source: tableMeta.source,
    version: tableMeta.version,
    updatedAt: tableMeta.updatedAt,
    path: tableMeta.path,
    providers: tablePricing ?? PROVIDER_PRICING,
  };
}

/** 导入基准表：原子写 configDir()/pricing.json 并立即生效 */
export function savePricingTable(table: PricingTable): void {
  fs.mkdirSync(configDir(), { recursive: true });
  atomicWriteJson(pricingTablePath(), JSON.stringify(table, null, 2));
  initPricingTable();
}

/** 移除导入的基准表，回退内置 */
export function deletePricingTable(): void {
  try {
    fs.rmSync(pricingTablePath(), { force: true });
  } catch {
    /* ignore */
  }
  initPricingTable();
}

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
    // 用户模型级覆盖优先于快照价格（覆盖的目的是修正过期价），
    // 且按「精确 id → 去 vendor 前缀 tail」两级别名依次查找，避免快照的完整 id 抢先于用户的 tail 覆盖
    const slash = model.indexOf('/');
    const tail = slash >= 0 ? model.slice(slash + 1) : '';
    const hit =
      modelOverrides.get(model) ??
      (tail ? modelOverrides.get(tail) : undefined) ??
      modelIndex.get(model) ??
      (tail ? modelIndex.get(tail) : undefined);
    if (hit) return hit;
  }
  // 用户厂商级覆盖优先于基准表（外置文件优先于内置）
  const table = tablePricing ?? PROVIDER_PRICING;
  return providerOverrides.get(providerId) ?? table[providerId] ?? DEFAULT;
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

// ───────── D1：用户定价覆盖（configDir()/pricing-overrides.json）─────────
// 解决两类问题：模型价格过期（改代码才能修）与自定义厂商走 DEFAULT 不准。
// 优先级：模型覆盖 > 快照模型价 > 厂商覆盖 > 内置厂商默认 > DEFAULT。

export interface PricingOverrides {
  version: number;
  updatedAt?: string;
  providers?: Record<string, Price>; // key = providerId（如 openai / 自定义 id）
  models?: Record<string, Price>; // key = 模型 id 或去 vendor 前缀的纯模型名
}

let providerOverrides = new Map<string, Price>();
let modelOverrides = new Map<string, Price>();
let overridesSource: 'user' | 'builtin' = 'builtin';

// 校验并规范化用户输入：非法结构/价格返回 null（端点据此回 400，不抛错）
export function parsePricingOverrides(input: unknown): PricingOverrides | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const price = (v: unknown): Price | null => {
    if (!v || typeof v !== 'object') return null;
    const p = v as Record<string, unknown>;
    const inP = num(p.input);
    const outP = num(p.output);
    if (inP === null || outP === null) return null;
    return { input: inP, output: outP, cacheRead: num(p.cacheRead) ?? inP };
  };
  const mapOf = (v: unknown): Record<string, Price> | null => {
    if (v === undefined || v === null) return {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: Record<string, Price> = {};
    for (const [k, val] of Object.entries(v)) {
      if (!k.trim()) return null;
      const pr = price(val);
      if (!pr) return null;
      out[k.trim()] = pr;
    }
    return out;
  };
  const providers = mapOf(o.providers);
  const models = mapOf(o.models);
  if (!providers || !models) return null;
  return { version: typeof o.version === 'number' ? o.version : 1, providers, models };
}

export function applyPricingOverrides(ov: PricingOverrides): void {
  providerOverrides = new Map(Object.entries(ov.providers ?? {}));
  modelOverrides = new Map(Object.entries(ov.models ?? {}));
  overridesSource =
    Object.keys(ov.providers ?? {}).length + Object.keys(ov.models ?? {}).length > 0
      ? 'user'
      : 'builtin';
}

export function resetPricingOverrides(): void {
  providerOverrides = new Map();
  modelOverrides = new Map();
  overridesSource = 'builtin';
}

// 当前覆盖状态（GET 端点回显 + 前端展示）
export function getPricingState(): { source: 'user' | 'builtin'; overrides: PricingOverrides } {
  return {
    source: overridesSource,
    overrides: {
      version: 1,
      providers: Object.fromEntries(providerOverrides),
      models: Object.fromEntries(modelOverrides),
    },
  };
}

function overridesPath(): string {
  return path.join(configDir(), 'pricing-overrides.json');
}

// 启动时调用（initConfigStore 之后）；文件不存在或损坏时静默回退内置定价
export function initPricingOverrides(): void {
  try {
    const parsed = parsePricingOverrides(JSON.parse(fs.readFileSync(overridesPath(), 'utf8')));
    if (parsed) applyPricingOverrides(parsed);
  } catch {
    /* 无覆盖文件或解析失败 → 内置定价 */
  }
}

export function savePricingOverrides(ov: PricingOverrides): void {
  // 全新环境下目录可能尚未创建（saveConfig 同样先建目录再原子写）
  fs.mkdirSync(configDir(), { recursive: true });
  atomicWriteJson(overridesPath(), JSON.stringify(ov, null, 2));
  applyPricingOverrides(ov);
}

export function deletePricingOverrides(): void {
  try {
    fs.rmSync(overridesPath(), { force: true });
  } catch {
    /* ignore */
  }
  resetPricingOverrides();
}
