// B1：模型路由 + fallback 链解析（纯函数，便于测试）。
// 路由决定「一次请求依次尝试哪些厂商」，fallback 由调用方（unifiedRouter）在
// 上游失败时按链顺序切换。解析阶段只负责把模型名映射到一条可用厂商链。
import { resolveKeyPool, type ProxyConfig } from './config.js';

export interface RoutingConfig {
  // 模型名 → 厂商回退链；key 支持精确名或通配符（`*` 匹配任意段，如 `gpt-*`、`*-mini`）
  routes: Record<string, string[]>;
  // 未命中任何 routes 时的默认链（按配置顺序尝试）
  default: string[];
}

// 单条链最多尝试 3 个厂商：避免无限回退 + 控制单请求延迟上限
export const MAX_CHAIN = 3;

/** 路由配置合法性：default 必须是字符串数组；routes 若存在须为「字符串→字符串数组」 */
export function isValidRouting(v: unknown): v is RoutingConfig {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.default)) return false;
  if (o.default.some((x) => typeof x !== 'string')) return false;
  if (o.routes !== undefined) {
    if (typeof o.routes !== 'object' || Array.isArray(o.routes)) return false;
    const routes = o.routes as Record<string, unknown>;
    for (const [k, val] of Object.entries(routes)) {
      if (k.trim().length === 0) return false;
      if (!Array.isArray(val) || val.some((x) => typeof x !== 'string')) return false;
    }
  }
  return true;
}

/** 通配匹配：普通串精确比较；`*` 匹配任意非空段（按正则元字符转义其余字符） */
function globMatch(pattern: string, model: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === model;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp('^' + escaped + '$').test(model);
}

/**
 * 在 routes 中匹配模型名，返回命中链。
 * 优先级：精确名（非通配）> 通配（按 pattern 字面长度越长越具体）。
 * 无命中返回 null。
 */
export function matchRoute(model: string, routing: RoutingConfig | undefined): string[] | null {
  if (!routing || !routing.routes) return null;
  let best: string[] | null = null;
  let bestScore = -Infinity;
  for (const [pattern, chain] of Object.entries(routing.routes)) {
    if (!globMatch(pattern, model)) continue;
    // 精确匹配（无 *）优先级最高；通配按字面长度排序（越长越具体），但始终低于精确匹配
    const score = pattern.includes('*') ? pattern.length : 1000 - pattern.length;
    if (score > bestScore) {
      bestScore = score;
      best = chain;
    }
  }
  return best;
}

/** 过滤出「可用」厂商：存在、已启用、且有 key；去重并截断到 MAX_CHAIN */
function usableChain(raw: string[] | undefined, cfg: ProxyConfig): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw ?? []) {
    if (!id || seen.has(id)) continue;
    const e = cfg.providers[id];
    if (!e || !e.enabled || resolveKeyPool(e).length === 0) continue;
    seen.add(id);
    out.push(id);
  }
  return out.slice(0, MAX_CHAIN);
}

/**
 * 解析一次请求的完整回退链：
 * 优先级：精确/通配 routes 命中 > default 链 > 空链（调用方据此改判错误）。
 * 仅保留「配置中存在且可用」的厂商，空 key / 未启用者自动跳过。
 */
export function resolveChain(
  model: string,
  routing: RoutingConfig | undefined,
  cfg: ProxyConfig,
): string[] {
  const matched = matchRoute(model, routing);
  if (matched && matched.length > 0) return usableChain(matched, cfg);
  return usableChain(routing?.default, cfg);
}
