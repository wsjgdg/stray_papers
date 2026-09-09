import type { ProbeResult, ProviderConsole } from './types.js';
import { fetchText } from './http.js';
import { buildAuthHeaders, styleOfKnown } from './upstreamAuth.js';

/** 各厂商鉴权头风格（仅在用户主动填入 key 时使用，key 不落盘）；与代理转发共用同一实现 */
function buildHeaders(
  provider: ProviderConsole,
  apiKey?: string,
): Record<string, string> | undefined {
  if (!apiKey) return undefined;
  return buildAuthHeaders(styleOfKnown(provider.id), apiKey);
}

function countModels(text: string): number | null {
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json?.data)) return json.data.length;
    if (Array.isArray(json?.models)) return json.models.length;
    if (Array.isArray(json)) return json.length;
  } catch {
    /* 非 JSON 响应 */
  }
  return null;
}

export async function probeProvider(
  provider: ProviderConsole,
  apiKey?: string,
): Promise<ProbeResult> {
  const base: ProbeResult = {
    providerId: provider.id,
    ok: false,
    httpStatus: null,
    latencyMs: null,
    state: 'unreachable',
    modelCount: null,
    message: '',
    checkedAt: Date.now(),
  };

  if (!provider.modelsEndpoint) {
    return { ...base, state: 'error', message: '该平台使用 IAM / 区域化域名，无法统一探测' };
  }

  // Google 用 x-goog-api-key 头而非 URL 查询串：避免 key 进入上游访问日志 / 代理日志
  const url = provider.modelsEndpoint;

  try {
    const res = await fetchText(url, { timeoutMs: 12000, headers: buildHeaders(provider, apiKey) });
    const modelCount = countModels(res.text);

    if (res.status >= 200 && res.status < 300) {
      return {
        ...base,
        ok: true,
        httpStatus: res.status,
        latencyMs: res.latencyMs,
        state: 'ok',
        modelCount,
        message: apiKey
          ? `鉴权通过 · 可见模型 ${modelCount ?? '—'} 个`
          : `端点可直连 · 可见模型 ${modelCount ?? '—'} 个`,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ...base,
        httpStatus: res.status,
        latencyMs: res.latencyMs,
        state: 'auth-required',
        message: apiKey ? 'Key 无效或权限不足' : '端点可达，需要 API Key',
      };
    }
    return {
      ...base,
      httpStatus: res.status,
      latencyMs: res.latencyMs,
      state: 'error',
      message: `HTTP ${res.status}`,
    };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    return {
      ...base,
      state: 'unreachable',
      message: msg.includes('abort') ? '请求超时（>12s）' : `网络不可达：${msg.slice(0, 80)}`,
    };
  }
}
