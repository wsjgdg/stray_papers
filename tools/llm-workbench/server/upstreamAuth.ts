import type { AuthStyle } from './config.js';

// 上游鉴权头构造：probe（连通性探测）与 proxy（真实转发）必须共用同一份实现，
// 否则「探测通过但转发 401」这类不一致会很难排查。

const KNOWN_AUTH_STYLE: Record<string, AuthStyle> = {
  anthropic: 'x-api-key',
  google: 'google',
};

/** 已知厂商的鉴权头风格（未知 id 一律按 bearer 处理，与自定义厂商默认一致） */
export function styleOfKnown(id: string): AuthStyle {
  return KNOWN_AUTH_STYLE[id] ?? 'bearer';
}

export function buildAuthHeaders(style: AuthStyle, apiKey: string): Record<string, string> {
  if (style === 'x-api-key') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  if (style === 'google') return { 'x-goog-api-key': apiKey };
  return { Authorization: `Bearer ${apiKey}` };
}
