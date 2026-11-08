import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach } from 'vitest';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-tok-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const cfg = await import('../server/config.ts');

describe('config: proxy token (B4)', () => {
  beforeEach(() => {
    fs.rmSync(cfg.configPath(), { force: true });
    cfg.initConfigStore();
  });

  it('generateProxyToken returns url-safe, sufficiently long token', () => {
    const t = cfg.generateProxyToken();
    assert.ok(/^[A-Za-z0-9_-]+$/.test(t), 'must be base64url (url-safe)');
    assert.ok(t.length >= 24, 'should be reasonably long');
    assert.notEqual(cfg.generateProxyToken(), cfg.generateProxyToken(), 'should be random');
  });

  it('default state is disabled with no token', () => {
    const st = cfg.getProxyTokenState();
    assert.equal(st.enabled, false);
    assert.equal(st.token, null);
  });

  it('enable flag alone does not generate a token', () => {
    cfg.setProxyTokenEnabled(true);
    const st = cfg.getProxyTokenState();
    assert.equal(st.enabled, true);
    assert.equal(st.token, null);
  });

  it('setProxyToken stores a token and reflects in state', () => {
    const tok = cfg.generateProxyToken();
    cfg.setProxyToken(tok);
    const st = cfg.getProxyTokenState();
    assert.equal(st.token, tok);
    assert.equal(st.enabled, false); // 仅写入令牌，未启用
  });

  it('round-trips through saveConfig/loadConfig', () => {
    const tok = cfg.generateProxyToken();
    cfg.setProxyToken(tok);
    cfg.setProxyTokenEnabled(true);
    cfg.initConfigStore(); // 重新从磁盘载入
    const st = cfg.getProxyTokenState();
    assert.equal(st.enabled, true);
    assert.equal(st.token, tok);
  });

  it('disable keeps token but clears enabled flag', () => {
    const tok = cfg.generateProxyToken();
    cfg.setProxyToken(tok);
    cfg.setProxyTokenEnabled(true);
    cfg.setProxyTokenEnabled(false);
    const st = cfg.getProxyTokenState();
    assert.equal(st.enabled, false);
    assert.equal(st.token, tok); // 保留，便于再次启用复用
  });

  it('provider config survives a token write (no clobber)', () => {
    cfg.upsertProvider('openai', { apiKey: 'sk-x', enabled: true });
    cfg.setProxyToken(cfg.generateProxyToken());
    cfg.setProxyTokenEnabled(true);
    const loaded = cfg.loadConfig();
    assert.equal(loaded.providers.openai.apiKey, 'sk-x');
    assert.equal(loaded.proxyTokenEnabled, true);
    assert.ok(loaded.proxyToken);
  });
});
