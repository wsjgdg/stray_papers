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
    assert.equal(masked.providers.openai.hasKey, true);
    assert.equal(masked.providers.openai.apiKeyCount, 1);
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
