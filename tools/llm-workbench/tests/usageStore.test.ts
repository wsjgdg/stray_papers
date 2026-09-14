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

  it('usageDayTotals：按日期升序聚合，跨 provider/model/tag 求和（E1）', async () => {
    const s = await fresh();
    s.initUsageStore();
    const d13 = new Date(2026, 8, 13, 10).getTime();
    const d14 = new Date(2026, 8, 14, 10).getTime();
    s.recordUsage(d14, 'openai', 'a', null, 10, 5, 0, 0.5);
    s.recordUsage(d14, 'anthropic', 'b', 'proj-x', 20, 10, 4, 0.25);
    s.recordUsage(d13, 'openai', 'a', null, 1, 1, 0, 0.125);
    const totals = s.usageDayTotals();
    expect(totals.map((t) => t.day)).toEqual(['2026-09-13', '2026-09-14']);
    expect(totals[1]).toMatchObject({
      cost: 0.75,
      requests: 2,
      inputTokens: 30,
      outputTokens: 15,
    });
  });

  it('今日成本口径：跨重启仍保留，日预算守卫不再 fail-open（E1）', async () => {
    const ts = Date.now();
    let s = await fresh();
    s.initUsageStore();
    s.recordUsage(ts, 'openai', 'm', null, 100, 50, 0, 0.5);
    expect(s.usageTodayCost(ts)).toBe(0.5);
    s.stopUsageStore(); // 落盘并停表

    // 模拟进程重启：重置模块注册表后重新加载（原先 metrics 的内存日桶在此归零）
    vi.resetModules();
    s = await fresh();
    s.initUsageStore();
    const m = await import('../server/metrics.js');
    expect(s.usageTodayCost()).toBe(0.5);
    const summary = m.getSummary();
    expect(summary.todayCostUsd).toBe(0.5); // 重启前写入的成本仍参与日预算判定
    expect(summary.todayInputTokens).toBe(100);
  });

  it('usageDayTotalsOf / usageTodayTotals：缺失日期返回零值而非抛错', async () => {
    const s = await fresh();
    s.initUsageStore();
    expect(s.usageDayTotalsOf('1999-01-01')).toEqual({
      requests: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cost: 0,
    });
    expect(s.usageTodayTotals()).toEqual({
      requests: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cost: 0,
    });
    expect(s.usageTodayCost()).toBe(0);
    expect(s.usageMonthProjection().projectedMonthUsd).toBe(0);
  });

  it('usageStats：天数/范围/累计/维度基数/保留策略（E2）', async () => {
    const s = await fresh();
    s.initUsageStore();
    const now = Date.now();
    s.recordUsage(now, 'openai', 'gpt-4o', 'proj-a', 100, 50, 0, 0.5);
    s.recordUsage(now, 'anthropic', 'claude', null, 10, 5, 0, 0.25);
    s.recordUsage(now - 86_400_000, 'openai', 'gpt-4o', null, 1, 1, 0, 0.125);
    s.flush();
    const st = s.usageStats(now);
    expect(st.days).toBe(2);
    expect(st.lastDay).toBe(s.usageDayTotals()[1].day);
    expect(st.firstDay).toBe(s.usageDayTotals()[0].day);
    expect(st.totalRequests).toBe(3);
    expect(st.totalCostUsd).toBeCloseTo(0.875, 6);
    expect(st.totalInputTokens).toBe(111);
    expect(st.totalOutputTokens).toBe(56);
    expect(st.providers).toBe(2);
    expect(st.models).toBe(2); // openai/gpt-4o 与 anthropic/claude
    expect(st.tags).toBe(2); // 'proj-a' 与 '(untagged)'
    expect(st.retentionDays).toBe(90);
    expect(st.cutoffDay).toBe(s.purgeCutoffForKeepDays(91, now)); // 90 天窗口 = 保留 91 天（含今日）
    expect(st.dirty).toBe(false); // flush 之后
    expect(st.fileBytes).toBeGreaterThan(0);
  });

  it('usageStats：空存储不抛错，范围为 null', async () => {
    const s = await fresh();
    s.initUsageStore();
    const st = s.usageStats();
    expect(st).toMatchObject({
      days: 0,
      firstDay: null,
      lastDay: null,
      totalRequests: 0,
      totalCostUsd: 0,
      providers: 0,
      models: 0,
      tags: 0,
      fileBytes: 0,
    });
  });

  it('purgeCutoffForKeepDays：保留 N 天含今日（N=1 → 起点为今日）', async () => {
    const s = await fresh();
    s.initUsageStore();
    const now = new Date(2026, 8, 14, 10).getTime();
    expect(s.purgeCutoffForKeepDays(1, now)).toBe('2026-09-14');
    expect(s.purgeCutoffForKeepDays(3, now)).toBe('2026-09-12');
    expect(s.purgeCutoffForKeepDays(0, now)).toBe('2026-09-14'); // 下限钳到 1 天，永不删今日
    expect(s.purgeCutoffForKeepDays(2.7, now)).toBe('2026-09-13'); // 取整
  });

  it('usagePurgePlan 是纯函数：只算不改，preview 与实删一致（E2）', async () => {
    const s = await fresh();
    s.initUsageStore();
    const now = Date.now();
    s.recordUsage(now, 'openai', 'm', null, 1, 1, 0, 1);
    s.recordUsage(now - 5 * 86_400_000, 'openai', 'm', null, 2, 2, 0, 2);
    s.recordUsage(now - 6 * 86_400_000, 'openai', 'm', null, 3, 3, 0, 3);

    const cutoff = s.purgeCutoffForKeepDays(3, now);
    const plan = s.usagePurgePlan(cutoff);
    expect(plan.days).toHaveLength(2); // 5 天前 + 6 天前
    expect(plan.requests).toBe(2); // requests 是调用次数（每次 recordUsage +1），不是入参
    expect(plan.costUsd).toBeCloseTo(5, 6);
    // 规划阶段不改内存态
    expect(s.usageStats(now).days).toBe(3);

    const removed = s.purgeUsageBefore(cutoff);
    expect(removed).toEqual(plan); // 所见即所删
    const after = s.usageStats(now);
    expect(after.days).toBe(1);
    expect(after.totalCostUsd).toBeCloseTo(1, 6);
  });

  it('purgeUsageBefore 落盘：重启后仍是清理后的数据（E2）', async () => {
    let s = await fresh();
    s.initUsageStore();
    const now = new Date();
    const dayMs = 86_400_000;
    s.recordUsage(now.getTime(), 'openai', 'm', null, 1, 1, 0, 1);
    s.recordUsage(now.getTime() - 10 * dayMs, 'openai', 'old', null, 1, 1, 0, 9);
    s.purgeUsageBefore(s.purgeCutoffForKeepDays(1, now.getTime()));
    s.stopUsageStore();

    vi.resetModules();
    s = await fresh();
    s.initUsageStore();
    const rows = s.usageSpendSources();
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('m');
    expect(rows[0].costUsd).toBeCloseTo(1, 6);
  });

  it('usagePurgeBefore：无匹配数据时返回空计划且不写盘', async () => {
    const s = await fresh();
    s.initUsageStore();
    const now = Date.now();
    s.recordUsage(now, 'openai', 'm', null, 1, 1, 0, 1);
    s.flush();
    const sizeBefore = fs.statSync(path.join(tmpHome, 'usage-daily.json')).size;
    const plan = s.purgeUsageBefore('1999-01-01');
    expect(plan).toEqual({ cutoffDay: '1999-01-01', days: [], requests: 0, costUsd: 0 });
    expect(fs.statSync(path.join(tmpHome, 'usage-daily.json')).size).toBe(sizeBefore);
  });

  it('usageSnapshot 返回深拷贝：改快照不影响内存态（E2）', async () => {
    const s = await fresh();
    s.initUsageStore();
    s.recordUsage(Date.now(), 'openai', 'm', 'tag-x', 5, 5, 0, 1);
    const snap = s.usageSnapshot();
    const day = Object.keys(snap)[0];
    snap[day].openai.m['tag-x'].cost = 999;
    delete snap[day].openai.m;
    expect(s.usageStats().totalCostUsd).toBeCloseTo(1, 6);
    expect(s.usageSpendSources()).toHaveLength(1);
  });
});
