import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';

// 隔离 HOME：auth/config 模块在加载时按 home 计算路径，必须先设环境变量再动态 import
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-sec-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const cryptomod = await import('../server/crypto.ts');
const auth = await import('../server/auth.ts');
const cfgmod = await import('../server/config.ts');
const {
  deriveKey,
  encryptWithKey,
  decryptWithKey,
  resolveScryptParams,
  DEFAULT_SCRYPT,
  LEGACY_SCRYPT,
} = cryptomod;

describe('security: KDF versioning + config encryption', () => {
  it('legacy profile (no kdfParams) still logs in', () => {
    const salt = Buffer.from('legacy-salt-0123456');
    const verifier = deriveKey('legacy-pw', salt, LEGACY_SCRYPT).toString('base64');
    fs.writeFileSync(
      path.join(HOME, '.llm-workbench', 'auth.json'),
      JSON.stringify(
        [{ id: 'admin', name: '管理员', role: 'admin', salt: salt.toString('base64'), verifier }],
        null,
        2,
      ),
    );
    auth.loadProfiles();
    assert.equal(auth.authenticate('admin', 'legacy-pw'), 'admin');
    assert.equal(auth.authenticate('admin', 'wrong'), null);
  });

  it('new profile uses stronger default KDF + UUID id', () => {
    const r = auth.createProfile('bob', 'viewer', 'bob-pw');
    assert.ok('id' in r);
    const p = auth.listProfiles().find((x) => x.name === 'bob')!;
    assert.match(p.id, /^p_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const raw = JSON.parse(fs.readFileSync(path.join(HOME, '.llm-workbench', 'auth.json'), 'utf8'));
    const bob = raw.find((x) => x.name === 'bob');
    assert.equal(bob.kdfParams?.N, DEFAULT_SCRYPT.N);
    assert.ok(DEFAULT_SCRYPT.N > LEGACY_SCRYPT.N);
    auth.loadProfiles();
    assert.equal(auth.authenticate(p.id, 'bob-pw'), 'viewer');
    assert.equal(auth.authenticate(p.id, 'nope'), null);
  });

  it('encryption blob is KDF-versioned and legacy blob still decrypts', () => {
    const key = deriveKey('pw', Buffer.from('some-salt-0123456'), DEFAULT_SCRYPT);
    const blob = encryptWithKey({ providers: {} }, key);
    assert.equal(blob.kdfParams?.N, DEFAULT_SCRYPT.N);

    const salt = Buffer.from('legacy-blob-salt-0123');
    const legacyKey = deriveKey('pw', salt, LEGACY_SCRYPT);
    const legacy = encryptWithKey(
      { providers: { a: { apiKey: 'k', enabled: true } } },
      legacyKey,
      salt,
    );
    delete legacy.kdfParams;
    const restored = decryptWithKey(
      legacy,
      deriveKey('pw', Buffer.from(legacy.salt, 'base64'), resolveScryptParams(legacy.kdfParams)),
    );
    assert.equal(restored.providers?.a?.apiKey, 'k');
    assert.equal(resolveScryptParams(undefined).N, LEGACY_SCRYPT.N);
    assert.equal(resolveScryptParams({ N: 999, r: 8, p: 1 }).N, 999);
  });

  it('config encryption round-trip (enable -> restart -> unlock -> save)', () => {
    const CFG = path.join(HOME, '.llm-workbench', 'config.json');
    fs.rmSync(CFG, { force: true });
    cfgmod.initConfigStore();
    cfgmod.upsertProvider('openai', { apiKey: 'sk-round-trip', enabled: true });

    assert.equal(cfgmod.enableEncryption('master-pw'), true);
    const raw = JSON.parse(fs.readFileSync(CFG, 'utf8'));
    assert.equal(raw.enc, 'aes-256-gcm');

    cfgmod.initConfigStore();
    assert.equal(cfgmod.isLocked(), true);
    assert.equal(cfgmod.isEncrypted(), true);
    assert.equal(cfgmod.unlock('wrong-pw'), false);
    assert.equal(cfgmod.unlock('master-pw'), true);
    assert.equal(cfgmod.loadConfig().providers?.openai?.apiKey, 'sk-round-trip');

    cfgmod.upsertProvider('openai', { apiKey: 'sk-updated', enabled: true });
    cfgmod.initConfigStore();
    assert.equal(cfgmod.unlock('master-pw'), true);
    assert.equal(cfgmod.loadConfig().providers?.openai?.apiKey, 'sk-updated');

    assert.equal(cfgmod.disableEncryption(), true);
    const plain = JSON.parse(fs.readFileSync(CFG, 'utf8'));
    assert.equal(plain.providers?.openai?.apiKey, 'sk-updated');
  });
});
