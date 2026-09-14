import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeAll, beforeEach } from 'vitest';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-cfg-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const cfg = await import('../server/config.ts');

describe('config: pure helpers', () => {
  it('resolveKeyPool returns apiKeys array', () => {
    const p = { id: 'openai', apiKey: 'k1', enabled: true } as any;
    assert.deepEqual(cfg.resolveKeyPool(p), ['k1']);
    const p2 = { id: 'o', apiKeys: ['a', 'b'], enabled: true } as any;
    assert.deepEqual(cfg.resolveKeyPool(p2), ['a', 'b']);
  });

  it('maskKey hides the middle of a key', () => {
    const masked = cfg.maskKey('sk-abcdefghijklmnop');
    assert.notEqual(masked, 'sk-abcdefghijklmnop');
    assert.ok(masked.length > 0);
  });

  it('maskConfig masks provider api keys while keeping ids', () => {
    const proxy = {
      providers: { openai: { id: 'openai', apiKey: 'secret-key', enabled: true } as any },
    } as any;
    const masked = cfg.maskConfig(proxy);
    assert.equal(masked.providers.openai.apiKeyMasked, '****-key');
    assert.equal(masked.providers.openai.apiKeyCount, 1);
  });

  it('maskConfig keeps modelMapping / retryOn / timeoutMs', () => {
    const proxy = {
      providers: {
        openai: {
          id: 'openai',
          apiKey: 'secret-key',
          enabled: true,
          modelMapping: { 'gpt-4o': 'oai/gpt-4o' },
          retryOn: [429],
          timeoutMs: 30_000,
        } as any,
      },
    } as any;
    const masked = cfg.maskConfig(proxy);
    assert.deepEqual(masked.providers.openai.modelMapping, { 'gpt-4o': 'oai/gpt-4o' });
    assert.deepEqual(masked.providers.openai.retryOn, [429]);
    assert.equal(masked.providers.openai.timeoutMs, 30_000);
    // 脱敏仍然生效：掩码存在且不带明文
    assert.equal((masked.providers.openai as any).apiKey, undefined);
  });
});

describe('config: resolveTimeoutMs', () => {
  it('default non-streaming is 180s', () => {
    assert.equal(cfg.resolveTimeoutMs(undefined, false), 180_000);
  });
  it('default streaming is 600s (long generation headroom)', () => {
    assert.equal(cfg.resolveTimeoutMs(undefined, true), 600_000);
  });
  it('per-provider timeoutMs overrides both stream and non-stream', () => {
    assert.equal(cfg.resolveTimeoutMs({ timeoutMs: 30_000 } as any, false), 30_000);
    assert.equal(cfg.resolveTimeoutMs({ timeoutMs: 30_000 } as any, true), 30_000);
  });
  it('non-positive timeoutMs falls back to default', () => {
    assert.equal(cfg.resolveTimeoutMs({ timeoutMs: 0 } as any, false), 180_000);
    assert.equal(cfg.resolveTimeoutMs({ timeoutMs: -5 } as any, true), 600_000);
  });
});

describe('config: store round-trip (plaintext)', () => {
  beforeEach(() => {
    fs.rmSync(cfg.configPath(), { force: true });
    cfg.initConfigStore();
  });

  it('upsertProvider + loadConfig round-trips', () => {
    cfg.upsertProvider('openai', { apiKey: 'sk-x', enabled: true });
    const loaded = cfg.loadConfig();
    assert.equal(loaded.providers.openai.apiKey, 'sk-x');
  });

  it('deleteProvider removes a provider', () => {
    cfg.upsertProvider('openai', { apiKey: 'sk-x', enabled: true });
    cfg.deleteProvider('openai');
    const loaded = cfg.loadConfig();
    assert.equal(loaded.providers.openai, undefined);
  });

  it('getConfigState reflects plaintext (not encrypted, not locked)', () => {
    const st = cfg.getConfigState();
    assert.equal(st.encrypted, false);
    assert.equal(st.locked, false);
  });

  it('saveConfig + loadConfig preserves arbitrary fields', () => {
    cfg.upsertProvider('anthropic', { apiKey: 'sk-a', authStyle: 'Bearer' as any, enabled: true });
    const loaded = cfg.loadConfig();
    assert.equal(loaded.providers.anthropic.authStyle, 'Bearer');
  });

  it('saveConfig writes atomically: content intact and no leftover tmp', () => {
    cfg.upsertProvider('openai', { apiKey: 'sk-x', enabled: true });
    const dir = path.dirname(cfg.configPath());
    const leftovers = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('.config.json.') && f.endsWith('.tmp'));
    assert.equal(leftovers.length, 0, `leftover tmp files: ${leftovers.join(',')}`);
    const parsed = JSON.parse(fs.readFileSync(cfg.configPath(), 'utf8'));
    assert.equal(parsed.providers.openai.apiKey, 'sk-x');
  });
});

describe('config: listRoutedModels (B6)', () => {
  beforeEach(() => {
    fs.rmSync(cfg.configPath(), { force: true });
    cfg.initConfigStore();
  });

  it('aggregates enabled providers with keys and applies reverse mapping alias', () => {
    cfg.upsertProvider('a', {
      apiKey: 'k',
      enabled: true,
      models: ['oai/gpt-4o', 'oai/gpt-4'],
      modelMapping: { 'gpt-4o': 'oai/gpt-4o' },
      enabledModels: ['oai/gpt-4o'],
    });
    cfg.upsertProvider('b', { apiKey: 'k', enabled: true, models: ['claude-3'] });
    const ids = cfg.listRoutedModels().map((m) => m.id);
    assert.ok(ids.includes('gpt-4o'), '反向映射：上游 oai/gpt-4o → 别名 gpt-4o');
    assert.ok(!ids.includes('oai/gpt-4o'), '上游名已被别名覆盖，不应再出现');
    assert.ok(ids.includes('claude-3'));
  });

  it('excludes disabled / no-key providers and empty enabledModels', () => {
    cfg.upsertProvider('a', { apiKey: '', enabled: true, models: ['x'] }); // 无 key
    cfg.upsertProvider('b', { apiKey: 'k', enabled: false, models: ['y'] }); // 未启用
    cfg.upsertProvider('c', {
      apiKey: 'k',
      enabled: true,
      models: ['m1', 'm2'],
      enabledModels: [],
    }); // 全部禁用
    assert.deepEqual(cfg.listRoutedModels(), []);
  });
});

describe('config: setBudget 增量语义（E1）', () => {
  beforeEach(() => {
    fs.rmSync(cfg.configPath(), { force: true });
    cfg.initConfigStore();
  });

  it('只提交 dailyUsd 时不影响其它字段；月度可独立设置', () => {
    cfg.setBudget({ dailyUsd: 5 });
    assert.deepEqual(cfg.getBudget(), { dailyUsd: 5, monthlyUsd: null, blockOnExceed: false });
    cfg.setBudget({ monthlyUsd: 100 });
    assert.deepEqual(cfg.getBudget(), { dailyUsd: 5, monthlyUsd: 100, blockOnExceed: false });
  });

  it('清除日预算不会连带清掉月度预算，反之亦然', () => {
    cfg.setBudget({ dailyUsd: 5, monthlyUsd: 100, blockOnExceed: true });
    cfg.setBudget({ dailyUsd: null });
    assert.deepEqual(cfg.getBudget(), { dailyUsd: null, monthlyUsd: 100, blockOnExceed: true });
    cfg.setBudget({ monthlyUsd: null });
    // 两项都为空 → 整块移除，配置文件保持干净
    assert.equal(JSON.parse(fs.readFileSync(cfg.configPath(), 'utf8')).budget, undefined);
    assert.deepEqual(cfg.getBudget(), { dailyUsd: null, monthlyUsd: null, blockOnExceed: false });
  });

  it('<=0 视为清除该项；落盘可回读', () => {
    cfg.setBudget({ dailyUsd: 5, monthlyUsd: 100 });
    cfg.setBudget({ dailyUsd: 0 });
    assert.equal(cfg.getBudget().dailyUsd, null);
    assert.equal(cfg.loadConfig().budget?.monthlyUsd, 100);
  });
});
