// 回归：代理响应缓存的容量与过期治理（server/responseCache.ts）。
// 历史 bug：裸 Map 无上限、TTL 仅惰性删除 → 常驻进程内存单调增长。
import assert from 'node:assert/strict';
import {
  setCacheConfig,
  getCacheConfig,
  cacheKey,
  putCached,
  getCached,
  getCacheStats,
  clearCache,
  sweepExpired,
} from '../server/responseCache.ts';

let pass = 0;
const ok = (name, extra = '') => {
  pass++;
  console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`);
};

const entry = (body = 'x', storedAt = Date.now(), cc = '') => ({
  status: 200,
  headers: cc ? { 'content-type': 'application/json', 'cache-control': cc } : { 'content-type': 'application/json' },
  body: Buffer.from(body),
  storedAt,
});

setCacheConfig({ enabled: true, ttlMs: 60_000 });

// 1) 命中回放
clearCache();
{
  const k = cacheKey('POST', '/chat/completions', '{"a":1}', 'openai');
  putCached(k, entry('hello'));
  const hit = getCached(k);
  assert.equal(hit?.body.toString(), 'hello');
  ok('缓存命中回放', `body=${hit.body.toString()}`);
}

// 2) 条目数上限：写 600 条后不超过 maxEntries
clearCache();
{
  for (let i = 0; i < 600; i++) putCached(`k-${i}`, entry('x'));
  const s = getCacheStats();
  assert.ok(s.size <= s.maxEntries, `size=${s.size} > max=${s.maxEntries}`);
  assert.ok(s.evictions > 0, '未发生淘汰');
  ok('条目数超限时淘汰最旧', `size=${s.size}/${s.maxEntries}, evictions=${s.evictions}`);
}

// 3) 字节数上限：单条 1MB，写入 100 条后总字节受控
clearCache();
{
  const big = 'y'.repeat(1024 * 1024);
  for (let i = 0; i < 100; i++) putCached(`big-${i}`, entry(big));
  const s = getCacheStats();
  assert.ok(s.bytes <= s.maxBytes, `bytes=${s.bytes} > max=${s.maxBytes}`);
  ok('字节数超限时淘汰最旧', `bytes=${(s.bytes / 1e6).toFixed(1)}MB/${(s.maxBytes / 1e6).toFixed(0)}MB`);
}

// 4) 过期条目被主动清理（不依赖再次被请求）
clearCache();
{
  const stale = Date.now() - getCacheConfig().ttlMs - 1_000;
  for (let i = 0; i < 5; i++) putCached(`old-${i}`, entry('x', stale));
  const n = sweepExpired(); // 注意：getCacheStats() 内部也会 sweep，故此断言必须在其之前
  assert.equal(n, 5, `清理数 ${n}`);
  assert.equal(getCacheStats().size, 0);
  assert.ok(getCacheStats().expired >= 5);
  ok('过期条目主动清理', `swept=${n}, size=0`);
}

// 5) 尊重上游 no-store / private
clearCache();
{
  putCached('ns', entry('x', Date.now(), 'no-store'));
  putCached('pv', entry('x', Date.now(), 'private, max-age=0'));
  assert.equal(getCacheStats().size, 0, 'no-store/private 不应入缓存');
  ok('尊重 no-store / private');
}

// 6) 关闭缓存后 misses 仍计数（统计口径修正）
clearCache();
{
  setCacheConfig({ enabled: false });
  const before = getCacheStats().misses;
  assert.equal(getCached('whatever'), null);
  const after = getCacheStats().misses;
  assert.equal(after, before + 1, `misses ${before} → ${after}`);
  setCacheConfig({ enabled: true });
  ok('disabled 状态仍计 miss');
}

// 7) clearCache 归零
{
  putCached('z', entry('x'));
  assert.equal(clearCache(), 1);
  const s = getCacheStats();
  assert.equal(s.size, 0);
  assert.equal(s.bytes, 0);
  ok('clearCache 清空条目与字节计数');
}

console.log(`\n结果: ${pass} 通过 / 0 失败`);
