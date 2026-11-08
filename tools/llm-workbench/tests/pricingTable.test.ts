import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// pricing.ts 的基准表状态是模块级单例：每个用例重置模块注册表 + 指向临时 HOME，实现隔离。
type Pricing = typeof import('../server/pricing.js');
let p: Pricing;
let tmpHome: string;

beforeEach(() => {
  vi.resetModules();
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-pricing-'));
  process.env.LLM_WORKBENCH_HOME = tmpHome; // configDir() 即该目录本身
  delete process.env.PRICING_FILE;
});

afterEach(() => {
  delete process.env.LLM_WORKBENCH_HOME;
  delete process.env.PRICING_FILE;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

async function fresh(): Promise<Pricing> {
  p = await import('../server/pricing.js');
  return p;
}

function writeJson(file: string, data: unknown): string {
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

describe('pricingTable: B5 解析', () => {
  it('parsePricingTable 接受合法表，cacheRead 缺省同 input', async () => {
    const s = await fresh();
    const t = s.parsePricingTable({ version: 3, providers: { foo: { input: 1, output: 2 } } });
    expect(t).not.toBeNull();
    expect(t!.version).toBe(3);
    expect(t!.providers.foo).toEqual({ input: 1, output: 2, cacheRead: 1 });
  });

  it('parsePricingTable 拒绝非法结构 / 负价 / 缺 providers', async () => {
    const s = await fresh();
    expect(s.parsePricingTable(null)).toBeNull();
    expect(s.parsePricingTable({})).toBeNull();
    expect(s.parsePricingTable({ providers: [] })).toBeNull();
    expect(s.parsePricingTable({ providers: { a: { input: -1, output: 2 } } })).toBeNull();
    expect(s.parsePricingTable({ providers: { a: { input: 1 } } })).toBeNull();
    expect(s.parsePricingTable({ providers: { '': { input: 1, output: 2 } } })).toBeNull();
    expect(s.parsePricingTable({ providers: { a: { input: 'x', output: 2 } } })).toBeNull();
  });
});

describe('pricingTable: B5 加载与优先级', () => {
  it('从文件加载：source=file，version/updatedAt 生效，priceFor 用文件价', async () => {
    const s = await fresh();
    const f = writeJson(path.join(tmpHome, 't.json'), {
      version: 7,
      updatedAt: '2026-09-14',
      providers: { openai: { input: 9, output: 9, cacheRead: 9 } },
    });
    s.initPricingTable([f]);
    const st = s.getPricingTableState();
    expect(st.source).toBe('file');
    expect(st.version).toBe(7);
    expect(st.updatedAt).toBe('2026-09-14');
    expect(s.priceFor('openai', '')).toEqual({ input: 9, output: 9, cacheRead: 9 });
  });

  it('文件条目与内置表合并：未覆盖的厂商仍用内置价', async () => {
    const s = await fresh();
    const f = writeJson(path.join(tmpHome, 't.json'), {
      version: 1,
      providers: { 'my-gateway': { input: 0.1, output: 0.2, cacheRead: 0.05 } },
    });
    s.initPricingTable([f]);
    expect(s.priceFor('my-gateway', '')).toEqual({ input: 0.1, output: 0.2, cacheRead: 0.05 });
    // 未在文件中出现的厂商 → 内置表
    expect(s.priceFor('anthropic', '')).toEqual(s.PROVIDER_PRICING.anthropic);
  });

  it('候选不可用/不合法时回退内置表（source=builtin）', async () => {
    const s = await fresh();
    const bad = writeJson(path.join(tmpHome, 'bad.json'), { nope: true });
    s.initPricingTable([path.join(tmpHome, 'missing.json'), bad]);
    const st = s.getPricingTableState();
    expect(st.source).toBe('builtin');
    expect(s.priceFor('openai', '')).toEqual(s.PROVIDER_PRICING.openai);
  });

  it('非法候选会被跳过，继续尝试后续候选', async () => {
    const s = await fresh();
    const bad = writeJson(path.join(tmpHome, 'bad.json'), { nope: true });
    const good = writeJson(path.join(tmpHome, 'good.json'), {
      version: 2,
      providers: { openai: { input: 5, output: 5, cacheRead: 5 } },
    });
    s.initPricingTable([bad, good]);
    expect(s.getPricingTableState().source).toBe('file');
    expect(s.getPricingTableState().version).toBe(2);
  });

  it('savePricingTable 落盘数据目录并立即生效；deletePricingTable 回退内置', async () => {
    const s = await fresh();
    s.savePricingTable({
      version: 4,
      providers: { openai: { input: 3, output: 4, cacheRead: 1 } },
    });
    expect(fs.existsSync(s.pricingTablePath())).toBe(true);
    expect(s.getPricingTableState().source).toBe('file');
    expect(s.priceFor('openai', '')).toEqual({ input: 3, output: 4, cacheRead: 1 });

    s.deletePricingTable();
    expect(fs.existsSync(s.pricingTablePath())).toBe(false);
    // 删除后回退：无 PRICING_FILE、数据目录已删 → 若仓库 data/pricing.json 存在则 source=file，否则 builtin
    const st = s.getPricingTableState();
    expect(st.providers.openai).toBeDefined();
  });

  it('D1 用户覆盖仍优先于基准表', async () => {
    const s = await fresh();
    s.savePricingTable({
      version: 1,
      providers: { openai: { input: 3, output: 4, cacheRead: 1 } },
    });
    s.applyPricingOverrides({
      version: 1,
      providers: { openai: { input: 100, output: 200, cacheRead: 1 } },
    });
    expect(s.priceFor('openai', '')).toEqual({ input: 100, output: 200, cacheRead: 1 });
  });
});
