// B9：从 proxy.ts 拆出的「多 Key 轮询/冷却/退避」逻辑。
// 每个厂商一个 key 轮询游标（单进程、请求串行推进游标，无锁足够）。
import { isUsable, recordSuccess, recordFailure } from './keyHealth.js';
import { computeBackoff, sleep } from './retryPolicy.js';

export interface TryResult {
  committed: boolean;
  status: number | null;
  error: string | null;
  retryable: boolean;
  retryAfterMs?: number | null;
}

// 每个厂商一个 key 轮询游标（多线程无锁足够：单进程、请求串行推进游标）
const keyCursor = new Map<string, number>();

/** 推进并返回当前游标起点（下一次请求从 start 开始依次尝试所有 key） */
export function advanceKeyCursor(providerId: string, poolLength: number): number {
  const start = keyCursor.get(providerId) ?? 0;
  keyCursor.set(providerId, (start + 1) % poolLength);
  return start;
}

export interface RotationResult {
  committed: boolean;
  last: TryResult | null;
  triedAny: boolean;
  retries: number;
}

/**
 * 用单 key 依次尝试整个池：跳过冷却/坏 Key，成功即 commit 并复位健康度，
 * 失败计入健康度；不可重试的错误直接返回，可重试则指数退避后切下一个 key。
 * `tryKey(apiKey, retries)` 由调用方提供（它需要 proxyRequest 的闭包上下文）。
 */
export async function rotateKeys(
  providerId: string,
  pool: string[],
  tryKey: (apiKey: string, retries: number) => Promise<TryResult>,
): Promise<RotationResult> {
  const start = advanceKeyCursor(providerId, pool.length);
  let retries = 0;
  let last: TryResult | null = null;
  let triedAny = false;
  for (let i = 0; i < pool.length; i++) {
    const idx = (start + i) % pool.length;
    const key = pool[idx];
    // B3：跳过处于冷却 / 被标记为坏 Key 的条目，避免对失效 Key 反复轮询
    if (!isUsable(providerId, key)) continue;
    triedAny = true;
    const r = await tryKey(key, retries);
    if (r.committed) {
      // B3：成功（含流式已开启）复位该 Key 健康度
      recordSuccess(providerId, key);
      return { committed: true, last: r, triedAny, retries };
    }
    // B3：失败计入健康度（仅 401/403/429 生效；冷却 / 坏 Key 由此产生）
    recordFailure(providerId, key, r.status);
    last = r;
    if (!r.retryable) break; // 不可重试的错误（如 400）→ 直接返回，不再切换
    // 指数退避后再切下一个 key：避免多个 key 连打上游；尊重上游 Retry-After
    if (i + 1 < pool.length) {
      const delay = computeBackoff(retries, r.retryAfterMs ?? null);
      if (delay > 0) await sleep(delay);
      retries++; // 仅当确有一个后续 key 可切换时才计一次切换
    }
  }
  return { committed: false, last, triedAny, retries };
}
