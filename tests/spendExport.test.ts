import { describe, expect, it, vi, afterEach } from 'vitest';
import { aggregateSpend, spendToCsv, type SpendSource } from '../server/spendExport.js';

// 固定「当前时间」，让 days 过滤与排序断言可复现
afterEach(() => {
  vi.useRealTimers();
});

function call(partial: Partial<SpendSource> & { ts: number; provider: string }): SpendSource {
  return {
    model: 'm1',
    tag: '(untagged)',
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    costUsd: 0,
    ...partial,
  };
}

function tsOf(y: number, m: number, d: number, h = 12): number {
  return new Date(y, m - 1, d, h).getTime();
}

describe('aggregateSpend', () => {
  it('按 日 × 厂商 × 模型 聚合，累加 token 与成本', () => {
    const rows = aggregateSpend([
      call({
        ts: tsOf(2026, 9, 10),
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 100,
        costUsd: 0.5,
      }),
      call({
        ts: tsOf(2026, 9, 10, 20),
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 50,
        outputTokens: 20,
        cacheReadTokens: 10,
        costUsd: 0.25,
      }),
      call({ ts: tsOf(2026, 9, 10), provider: 'openai', model: 'gpt-4o-mini', costUsd: 0.01 }),
      call({ ts: tsOf(2026, 9, 10), provider: 'anthropic', model: 'claude', costUsd: 1 }),
      call({ ts: tsOf(2026, 9, 11), provider: 'openai', model: 'gpt-4o', costUsd: 2 }),
    ]);
    expect(rows).toHaveLength(4);
    const gpt = rows.find((r) => r.model === 'gpt-4o' && r.day === '2026-09-10');
    expect(gpt).toMatchObject({
      day: '2026-09-10',
      provider: 'openai',
      requests: 2,
      inputTokens: 150,
      outputTokens: 20,
      cacheReadTokens: 10,
    });
    expect(gpt?.costUsd).toBeCloseTo(0.75);
  });

  it('days 过滤：仅保留最近 N 天（含今天），更早的剔除', () => {
    vi.useFakeTimers();
    vi.setSystemTime(tsOf(2026, 9, 13));
    const rows = aggregateSpend(
      [
        call({ ts: tsOf(2026, 9, 10), provider: 'openai', costUsd: 1 }), // 4 天前
        call({ ts: tsOf(2026, 9, 11, 0, 0), provider: 'openai', costUsd: 2 }), // 3 天前，边界内
        call({ ts: tsOf(2026, 9, 13), provider: 'openai', costUsd: 4 }), // 今天
      ],
      { days: 3 },
    );
    expect(rows.map((r) => r.day)).toEqual(['2026-09-13', '2026-09-11']);
  });

  it('排序：日期新的在前，同日内按 provider/model 字典序', () => {
    const rows = aggregateSpend([
      call({ ts: tsOf(2026, 9, 10), provider: 'zeta', model: 'a' }),
      call({ ts: tsOf(2026, 9, 11), provider: 'alpha', model: 'b' }),
      call({ ts: tsOf(2026, 9, 11), provider: 'alpha', model: 'a' }),
    ]);
    expect(rows.map((r) => `${r.day}/${r.provider}/${r.model}`)).toEqual([
      '2026-09-11/alpha/a',
      '2026-09-11/alpha/b',
      '2026-09-10/zeta/a',
    ]);
  });

  it('空日志与 days 非法值不抛错', () => {
    expect(aggregateSpend([])).toEqual([]);
    expect(
      aggregateSpend([call({ ts: tsOf(2026, 9, 10), provider: 'x' })], { days: 0 }),
    ).toHaveLength(1);
    expect(
      aggregateSpend([call({ ts: tsOf(2026, 9, 10), provider: 'x' })], { days: -5 }),
    ).toHaveLength(1);
  });
});

describe('spendToCsv', () => {
  it('表头 + 行，costUsd 保留 6 位小数，末尾换行', () => {
    const csv = spendToCsv(
      aggregateSpend([
        call({
          ts: tsOf(2026, 9, 10),
          provider: 'openai',
          model: 'gpt-4o',
          inputTokens: 10,
          costUsd: 0.123456789,
        }),
      ]),
    );
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'day,provider,model,tag,requests,inputTokens,outputTokens,cacheReadTokens,costUsd',
    );
    expect(lines[1]).toContain('2026-09-10,openai,gpt-4o,(untagged),1,10,0,0,0.123457');
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('含逗号/引号的字段按 CSV 规则转义', () => {
    const csv = spendToCsv([
      {
        day: '2026-09-10',
        provider: 'my,gate',
        model: 'a"b',
        tag: '(untagged)',
        requests: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0,
      },
    ]);
    expect(csv).toContain('"my,gate"');
    expect(csv).toContain('"a""b"');
  });

  it('公式注入防护：以 =+-@ 开头的文本单元格前置单引号', () => {
    const csv = spendToCsv([
      {
        day: '2026-09-10',
        provider: '=SUM(A1)',
        model: '@x',
        tag: '(untagged)',
        requests: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0,
      },
    ]);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("'@x");
  });
});

describe('spendToCsv: tag 分组', () => {
  it('同 provider/model 但不同 tag 聚合为两行，CSV 各带 tag', () => {
    const rows = aggregateSpend([
      call({
        ts: tsOf(2026, 9, 10),
        provider: 'openai',
        model: 'gpt-4o',
        tag: 'proj-x',
        costUsd: 1,
      }),
      call({
        ts: tsOf(2026, 9, 10),
        provider: 'openai',
        model: 'gpt-4o',
        tag: 'proj-y',
        costUsd: 2,
      }),
    ]);
    expect(rows).toHaveLength(2);
    const csv = spendToCsv(rows);
    expect(csv).toContain(',proj-x,');
    expect(csv).toContain(',proj-y,');
  });
});
