import { beforeEach, describe, expect, it, vi } from 'vitest';

// pricing 的覆盖状态是模块级单例：每个用例前重置模块注册表拿干净实例
type Pricing = typeof import('../server/pricing.js');
let pz: Pricing;

beforeEach(async () => {
  vi.resetModules();
  pz = await import('../server/pricing.js');
});

const model = (id: string, promptPrice: number, completionPrice: number, cacheReadPrice?: number) =>
  ({ id, promptPrice, completionPrice, cacheReadPrice }) as any;

describe('parsePricingOverrides', () => {
  it('合法输入规范化，cacheRead 缺省与 input 同价', () => {
    expect(
      pz.parsePricingOverrides({
        providers: { openai: { input: 2.5, output: 10 } },
        models: { 'gpt-x': { input: 1, output: 2, cacheRead: 0.5 } },
      }),
    ).toEqual({
      version: 1,
      providers: { openai: { input: 2.5, output: 10, cacheRead: 2.5 } },
      models: { 'gpt-x': { input: 1, output: 2, cacheRead: 0.5 } },
    });
  });

  it('非法输入返回 null：非对象 / 负价 / 非数字 / 数组 / 空 key', () => {
    expect(pz.parsePricingOverrides(null)).toBeNull();
    expect(pz.parsePricingOverrides('x')).toBeNull();
    expect(pz.parsePricingOverrides([1])).toBeNull();
    expect(pz.parsePricingOverrides({ providers: { x: { input: -1, output: 2 } } })).toBeNull();
    expect(pz.parsePricingOverrides({ providers: { x: { input: 'a', output: 2 } } })).toBeNull();
    expect(pz.parsePricingOverrides({ providers: [] })).toBeNull();
    expect(pz.parsePricingOverrides({ providers: { ' ': { input: 1, output: 2 } } })).toBeNull();
  });
});

describe('overrides + priceFor 优先级', () => {
  it('厂商覆盖优先于内置默认价，未覆盖厂商不受影响', () => {
    pz.applyPricingOverrides({
      version: 1,
      providers: { openai: { input: 9, output: 9, cacheRead: 9 } },
    });
    expect(pz.priceFor('openai', '')).toEqual({ input: 9, output: 9, cacheRead: 9 });
    expect(pz.priceFor('anthropic', '').input).toBe(3);
  });

  it('模型覆盖优先于快照模型价，支持去 vendor 前缀匹配', () => {
    pz.updateModelPrices([model('openai/gpt-4o', 2.5, 10, 1.25)]);
    pz.applyPricingOverrides({
      version: 1,
      models: { 'gpt-4o': { input: 5, output: 5, cacheRead: 0.5 } },
    });
    expect(pz.priceFor('openai', 'openai/gpt-4o')).toEqual({ input: 5, output: 5, cacheRead: 0.5 });
  });

  it('无覆盖时依次回退：快照模型价 → 内置厂商价 → DEFAULT', () => {
    pz.updateModelPrices([model('openai/gpt-4o', 2.5, 10)]);
    expect(pz.priceFor('openai', 'openai/gpt-4o').input).toBe(2.5);
    expect(pz.priceFor('openai', 'm2').input).toBe(2.5); // openai 内置价
    expect(pz.priceFor('unknown-vendor', 'm2').input).toBe(1); // DEFAULT
  });

  it('estimateCost 使用覆盖后的价格（cache-read 从计费基数扣除）', () => {
    pz.applyPricingOverrides({
      version: 1,
      providers: { zai: { input: 2, output: 4, cacheRead: 0.2 } },
    });
    const c = pz.estimateCost('zai', 'glm-4.7', 1_000_000, 500_000, 200_000);
    expect(c.input).toBeCloseTo(1.6); // 800k × 2
    expect(c.output).toBeCloseTo(2); // 500k × 4
    expect(c.cache).toBeCloseTo(0.04); // 200k × 0.2
    expect(c.total).toBeCloseTo(3.64);
  });

  it('resetPricingOverrides 恢复内置价且 source 回到 builtin；空覆盖视为 builtin', () => {
    pz.applyPricingOverrides({
      version: 1,
      providers: { openai: { input: 9, output: 9, cacheRead: 9 } },
    });
    expect(pz.getPricingState().source).toBe('user');
    pz.resetPricingOverrides();
    expect(pz.getPricingState().source).toBe('builtin');
    expect(pz.priceFor('openai', '').input).toBe(2.5);

    pz.applyPricingOverrides({ version: 1, providers: {}, models: {} });
    expect(pz.getPricingState().source).toBe('builtin');
  });
});
