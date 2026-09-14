import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// usageStore 读写 <dataDir>/usage-daily.json，dataDir 在模块加载时由环境决定：
// 每个用例重置模块注册表 + 指向临时 HOME，实现完全隔离（不碰真实配置）。
type UsageStore = typeof import('../server/usageStore.js');
let us: UsageStore;
let tmpHome: string;

beforeEach(() => {
  vi.resetModules();
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-usage-'));
  process.env.LLM_WORKBENCH_HOME = tmpHome;
});

afterEach(() => {
  us?.stopUsageStore();
  delete process.env.LLM_WORKBENCH_HOME;
  fs.rmSync(tmpHome, { recursive: true, force: true });
  vi.useRealTimers();
});

async function fresh(): Promise<UsageStore> {
  us = await import('../server/usageStore.js');
  return us;
}

describe('usageStore', () => {
  it('recordUsage 按 day/provider/model 累加', async () => {
    const s = await fresh();
    s.initUsageStore();
    const ts = new Date(2026, 8, 14, 12).getTime(); // 本地 2026-09-14
    s.recordUsage(ts, 'openai', 'gpt-4o', null, 100, 50, 10, 0.5);
    s.recordUsage(ts, 'openai', 'gpt-4o', null, 30, null, null, 0.2);
    s.recordUsage(ts, 'openai', 'gpt-4o-mini', null, 5, 5, null, 0.01);
    s.recordUsage(ts + 86_400_000, 'anthropic', 'claude', null, 1, 1, null, 1);
    const rows = s.usageSpendSources();
    expect(rows).toHaveLength(3);
    const gpt = rows.find((r) => r.model === 'gpt-4o')!;
    expect(gpt.inputTokens).toBe(130);
    expect(gpt.outputTokens).toBe(50);
    expect(gpt.cacheReadTokens).toBe(10);
    expect(gpt.costUsd).toBeCloseTo(0.7);
  });

  it('flush 落盘后重新 init 可完整恢复（跨重启）', async () => {
    let s = await fresh();
    s.initUsageStore();
    const ts = new Date(2026, 8, 14, 12).getTime();
    s.recordUsage(ts, 'openai', 'gpt-4o', null, 100, 50, 10, 0.5);
    s.flush();

    // 模拟进程重启：重置模块注册表后重新加载 + init
    vi.resetModules();
    s = await fresh();
    s.initUsageStore();
    const rows = s.usageSpendSources();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: 'openai', model: 'gpt-4o', inputTokens: 100 });
    expect(rows[0].costUsd).toBeCloseTo(0.5);
  });

  it('stopUsageStore 强制落盘（不需要显式 flush）', async () => {
    let s = await fresh();
    s.initUsageStore();
    s.recordUsage(Date.now(), 'openai', 'm', null, 1, 1, null, 0.1);
    const file = path.join(tmpHome, 'usage-daily.json'); // LLM_WORKBENCH_HOME 即数据目录本身（无子目录）
    expect(fs.existsSync(file)).toBe(false); // 尚未到节流周期
    s.stopUsageStore();
    expect(fs.existsSync(file)).toBe(true);

    vi.resetModules();
    s = await fresh();
    s.initUsageStore();
    expect(s.usageSpendSources()).toHaveLength(1);
  });

  it('prune：超过 90 天的日期被丢弃', async () => {
    const s = await fresh();
    s.initUsageStore();
    const now = Date.now();
    s.recordUsage(now, 'openai', 'new', null, 1, 1, null, 1);
    s.recordUsage(now - 91 * 86_400_000, 'openai', 'old', null, 1, 1, null, 1);
    s.flush();
    const days = s.usageSpendSources().map((r) => new Date(r.ts).getDate());
    expect(days).toHaveLength(1);
  });

  it('损坏的存档文件安全回退为空', async () => {
    fs.writeFileSync(path.join(tmpHome, 'usage-daily.json'), '{not json');
    const s = await fresh();
    s.initUsageStore();
    expect(s.usageSpendSources()).toEqual([]);
  });

  it('结构异常的条目被 sanitize 丢弃（负数/非法日期/非对象）', async () => {
    fs.writeFileSync(
      path.join(tmpHome, 'usage-daily.json'),
      JSON.stringify({
        '2026-09-14': {
          openai: { 'gpt-4o': { requests: 2, input: 10, output: 5, cacheRead: 0, cost: 0.5 } },
        },
        'bad-date': { openai: { m: { requests: 1, input: 1, output: 1, cacheRead: 0, cost: 1 } } },
        '2026-09-13': {
          openai: { m: { requests: -1, input: -5, output: 1, cacheRead: 0, cost: 1 } },
        },
        '2026-09-12': 'garbage',
      }),
    );
    const s = await fresh();
    s.initUsageStore();
    const rows = s.usageSpendSources();
    // 合法 1 条；负数条目被归零保留（值安全）；非法日期与垃圾结构被丢弃
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ provider: 'openai', model: 'gpt-4o', inputTokens: 10 });
  });
});
