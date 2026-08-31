interface Entry<T> {
  value: T;
  storedAt: number;
}

const store = new Map<string, Entry<unknown>>();

/** 读取缓存；返回 undefined 表示缓存不存在（不区分过期） */
export function readCache<T>(key: string): Entry<T> | undefined {
  return store.get(key) as Entry<T> | undefined;
}

export function writeCache<T>(key: string, value: T): void {
  store.set(key, { value, storedAt: Date.now() });
}

export function invalidate(prefix?: string): number {
  if (!prefix) {
    const n = store.size;
    store.clear();
    return n;
  }
  let n = 0;
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) {
      store.delete(k);
      n += 1;
    }
  }
  return n;
}

/**
 * 带 TTL 的抓取包装：命中未过期缓存直接返回；
 * 过期或缺失时重新抓取，失败则回退到已存在的陈旧缓存。
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<{ value: T; cached: boolean; fetchedAt: number; stale: boolean }> {
  const hit = readCache<T>(key);
  const now = Date.now();
  if (hit && now - hit.storedAt < ttlMs) {
    return { value: hit.value, cached: true, fetchedAt: hit.storedAt, stale: false };
  }
  try {
    const value = await loader();
    writeCache(key, value);
    return { value, cached: false, fetchedAt: Date.now(), stale: false };
  } catch (err) {
    if (hit) {
      return { value: hit.value, cached: true, fetchedAt: hit.storedAt, stale: true };
    }
    throw err;
  }
}
