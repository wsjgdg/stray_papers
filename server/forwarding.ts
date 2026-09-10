// B9：从 proxy.ts 拆出的「转发相关纯函数 + 目标解析 + 模型清单」。
// 这些函数无内部可变状态依赖，行为与原 proxy.ts 完全一致，仅做搬运。
import { fetch as upstreamFetch } from 'undici';
import { PROVIDERS } from './providers.js';
import { type ApiFormat } from './translate.js';
import { loadConfig, resolveKeyPool, type AuthStyle } from './config.js';
import { buildAuthHeaders, styleOfKnown } from './upstreamAuth.js';
import { getDispatcher } from './httpAgent.js';
import type { ProviderConsole } from './types.js';

const PROVIDER_MAP = new Map<string, ProviderConsole>(PROVIDERS.map((p) => [p.id, p]));

export interface Usage {
  input?: number | null;
  output?: number | null;
  cache?: number | null;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function extractUsageFromObject(obj: unknown): Usage {
  if (!obj || typeof obj !== 'object') return {};
  const u = (obj as Record<string, unknown>).usage as Record<string, unknown> | undefined;
  if (!u) return {};
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    input: num(u.prompt_tokens) ?? num(u.input_tokens) ?? num(u.promptTokens),
    output: num(u.completion_tokens) ?? num(u.output_tokens) ?? num(u.completionTokens),
    cache:
      num((u.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens) ??
      num(u.cache_read_input_tokens) ??
      num((u as Record<string, unknown>).cacheReadInputTokens),
  };
}

// SSE 文本里可能含多条 data:，挑最后一条带 usage 的
export function extractUsageFromSSE(text: string): Usage {
  let best: Usage = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^data:\s*(.*)$/);
    if (!m) continue;
    const payload = m[1].trim();
    if (payload === '[DONE]') continue;
    try {
      const u = extractUsageFromObject(JSON.parse(payload));
      if (u.input !== undefined || u.output !== undefined || u.cache !== undefined) best = u;
    } catch {
      /* 非 JSON */
    }
  }
  return best;
}

export function classifyError(status: number | null, bodyText: string): string {
  if (status === null) return '网络/传输层错误（未收到响应）';
  if (status === 401 || status === 403) return `鉴权失败 (${status}) · Key 无效或权限不足`;
  if (status === 404) return '404 · 路径/模型不存在';
  if (status === 429) return '429 · 触发限流 (Rate limit)';
  if (status >= 500) return `上游服务错误 (${status})`;
  if (status >= 400) return `客户端错误 (${status})`;
  try {
    const e = JSON.parse(bodyText)?.error;
    if (e?.message) return `${status} · ${e.message}`.slice(0, 200);
  } catch {
    /* ignore */
  }
  return `HTTP ${status}`;
}

export function forwardHeaders(req: { headers: Record<string, unknown> }): Record<string, string> {
  const out: Record<string, string> = {};
  const ct = req.headers['content-type'];
  if (typeof ct === 'string') out['content-type'] = ct;
  const accept = req.headers['accept'];
  if (typeof accept === 'string') out['accept'] = accept;
  return out;
}

// 解析目标厂商：已知厂商走默认；未知 id 且配置中存在 → 视为自定义厂商（用其 baseUrl + 自定义鉴权方式）
export function resolveTarget(
  providerId: string,
  cfg: ReturnType<typeof loadConfig>,
): { provider: ProviderConsole; authStyle: AuthStyle } | null {
  const known = PROVIDER_MAP.get(providerId);
  if (known) return { provider: known, authStyle: styleOfKnown(providerId) };
  const entry = cfg.providers[providerId];
  if (!entry) return null;
  const synth: ProviderConsole = {
    id: providerId,
    name: entry.customName || providerId,
    nameCn: entry.customName || providerId,
    region: 'intl',
    console: '',
    docs: '',
    pricing: '',
    playground: null,
    status: null,
    modelsEndpoint: null,
    apiBase: entry.baseUrl || null,
    note: '自定义厂商',
  };
  return { provider: synth, authStyle: entry.authStyle ?? 'bearer' };
}

export function joinUrl(base: string, suffix: string): string {
  const b = base.replace(/\/+$/, '');
  const s = suffix.replace(/^\/+/, '');
  return `${b}/${s}`;
}

/**
 * 自动获取某厂商的模型清单：命中上游 /models 端点并解析。
 * - 已知厂商用其 modelsEndpoint（完整 URL）；
 * - OpenAI 兼容自定义厂商 → baseUrl + /models（与 chat 同约定：baseUrl 已含 /v1，如 https://host/v1）；
 * - Gemini 格式 → baseUrl + /models（响应为 { models:[{name:"models/xxx"}] }）。
 * 返回去重、排序后的模型 id 列表。
 */
export async function listProviderModels(providerId: string): Promise<string[]> {
  const cfg = loadConfig();
  const target = resolveTarget(providerId, cfg);
  if (!target) throw new Error(`未知厂商: ${providerId}（自定义厂商请先在配置页添加）`);
  const { provider, authStyle } = target;
  const entry = cfg.providers[providerId];
  if (!entry || !entry.enabled) throw new Error('该厂商未启用，请先在「代理」页配置并启用');
  const baseUrl = entry.baseUrl || provider.apiBase;
  if (!baseUrl) throw new Error('该厂商无可用 baseUrl，请在配置中填写');
  const pool = resolveKeyPool(entry);
  if (pool.length === 0) throw new Error('该厂商未配置 API Key');
  const apiKey = pool[0];

  const format: ApiFormat =
    (entry.apiFormat as ApiFormat) ?? (provider.id === 'google' ? 'gemini' : 'openai');
  let modelsUrl: string;
  if (provider.modelsEndpoint) {
    modelsUrl = provider.modelsEndpoint;
  } else if (format === 'gemini') {
    modelsUrl = joinUrl(baseUrl, 'models');
  } else {
    modelsUrl = joinUrl(baseUrl, 'models');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await upstreamFetch(modelsUrl, {
      headers: buildAuthHeaders(authStyle, apiKey),
      signal: controller.signal,
      dispatcher: getDispatcher(providerId),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`上游返回 HTTP ${r.status} @ ${modelsUrl}: ${txt.slice(0, 200)}`);
    }
    const body = (await r.json().catch(() => null)) as unknown;
    if (!body || typeof body !== 'object') {
      throw new Error(`上游响应不是合法 JSON @ ${modelsUrl}`);
    }
    const stripName = (s?: string) =>
      typeof s === 'string' ? s.replace(/^models\//, '').trim() : '';
    // 兼容各类 OpenAI 兼容形态：{data:[{id|name}]} / {models:[{id|name}]} / 字符串数组 / 顶层数组
    const one = (m: unknown): string => {
      if (typeof m === 'string') return stripName(m);
      if (m && typeof m === 'object') {
        const o = m as Record<string, unknown>;
        return (
          stripName(o.id as string) || stripName(o.name as string) || stripName(o.model as string)
        );
      }
      return '';
    };
    const b = body as Record<string, unknown>;
    let raw: unknown[] = [];
    if (Array.isArray(body)) raw = body;
    else if (Array.isArray(b.data)) raw = b.data;
    else if (Array.isArray(b.models)) raw = b.models;
    let ids: string[] = raw.map(one).filter(Boolean);
    if (ids.length === 0) {
      // 区分两类失败，给出可执行的下一步提示：
      // 1) 识别到 data/models 数组但为空 → 多半是该 Key 未开通模型访问权限（bankofai 等会返回 200 + 空 data）
      // 2) 完全未识别的结构 → 把原始响应（截断）带回，便于定位格式（或手动添加模型名兜底）
      if (Array.isArray(b.data) || Array.isArray(b.models)) {
        throw new Error(
          `上游返回了模型列表结构，但 data/models 为空数组 @ ${modelsUrl}。通常是该 API Key 未开通模型访问权限（或账户无可用模型）。可改用「手动添加模型名」兜底。`,
        );
      }
      const preview = JSON.stringify(body).slice(0, 400);
      throw new Error(`上游返回空列表 @ ${modelsUrl}。原始响应: ${preview}`);
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    out.sort();
    return out;
  } finally {
    clearTimeout(timer);
  }
}
