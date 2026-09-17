import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// backup 读写 <dataDir>/config.json 与 auth.json；dataDir 在模块加载时由 LLM_WORKBENCH_HOME 决定。
// 每个用例重置模块注册表 + 指向临时目录（该目录本身就是数据目录，无 .llm-workbench 子目录）。
type Backup = typeof import('../server/backup.js');
let bk: Backup;
let tmpHome: string;

const CONFIG_FIXTURE = JSON.stringify({
  providers: { openai: { apiKey: 'sk-test-123', enabled: true } },
  budget: { dailyUsd: 5, blockOnExceed: false },
});
const AUTH_FIXTURE = JSON.stringify([
  {
    id: 'p_admin',
    name: 'admin',
    role: 'admin',
    salt: Buffer.alloc(16).toString('base64'),
    verifier: Buffer.alloc(32).toString('base64'),
  },
]);

beforeEach(() => {
  vi.resetModules();
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-backup-'));
  process.env.LLM_WORKBENCH_HOME = tmpHome;
  fs.writeFileSync(path.join(tmpHome, 'config.json'), CONFIG_FIXTURE);
  fs.writeFileSync(path.join(tmpHome, 'auth.json'), AUTH_FIXTURE);
});

afterEach(() => {
  delete process.env.LLM_WORKBENCH_HOME;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

async function fresh(): Promise<Backup> {
  bk = await import('../server/backup.js');
  return bk;
}

describe('backup', () => {
  it('导出→恢复到新目录：config/auth 原文一致', async () => {
    const s = await fresh();
    const blob = s.createBackupBlob('passphrase-123');
    expect(typeof blob).toBe('string');

    // 模拟恢复到"另一台机器"：清空数据目录后导入
    fs.rmSync(path.join(tmpHome, 'config.json'));
    fs.rmSync(path.join(tmpHome, 'auth.json'));
    const r = s.restoreBackupBlob(blob, 'passphrase-123');
    expect(r).toEqual({ restoredConfig: true, restoredAuth: true });
    expect(fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8')).toBe(CONFIG_FIXTURE);
    expect(fs.readFileSync(path.join(tmpHome, 'auth.json'), 'utf8')).toBe(AUTH_FIXTURE);
  });

  it('篡改 blob 任意一个字符 → 导入抛校验错误', async () => {
    const s = await fresh();
    const blob = s.createBackupBlob('passphrase-123');
    // 翻转 base64 中段一个字符（保证仍是合法 base64 但内容已变）
    const idx = Math.floor(blob.length / 2);
    const flipped = (blob[idx] === 'A' ? 'B' : 'A') as string;
    const tampered = blob.slice(0, idx) + flipped + blob.slice(idx + 1);
    expect(() => s.restoreBackupBlob(tampered, 'passphrase-123')).toThrow(
      '备份文件校验失败：口令错误或文件损坏',
    );
  });

  it('错误口令 → 导入抛校验错误（GCM tag 校验）', async () => {
    const s = await fresh();
    const blob = s.createBackupBlob('passphrase-123');
    expect(() => s.restoreBackupBlob(blob, 'wrong-passphrase')).toThrow(
      '备份文件校验失败：口令错误或文件损坏',
    );
  });

  it('口令过短（<8）导出与导入都抛错', async () => {
    const s = await fresh();
    expect(() => s.createBackupBlob('short')).toThrow('备份口令至少 8 个字符');
    expect(() => s.restoreBackupBlob('x', 'short')).toThrow('备份口令至少 8 个字符');
  });

  it('非 base64 / 非 JSON 的 blob → 统一校验错误', async () => {
    const s = await fresh();
    expect(() => s.restoreBackupBlob('not-a-backup', 'passphrase-123')).toThrow(
      '备份文件校验失败：口令错误或文件损坏',
    );
  });

  it('config 不存在时导出为 null，恢复只写 auth', async () => {
    const s = await fresh();
    fs.rmSync(path.join(tmpHome, 'config.json'));
    const blob = s.createBackupBlob('passphrase-123');
    const r = s.restoreBackupBlob(blob, 'passphrase-123');
    expect(r).toEqual({ restoredConfig: false, restoredAuth: true });
    expect(fs.existsSync(path.join(tmpHome, 'config.json'))).toBe(false);
  });

  it.each([false, true])(
    'rolls back a failed second rename (config absent: %s)',
    async (absent) => {
      const s = await fresh();
      const blob = s.createBackupBlob('passphrase-123');
      if (absent) fs.rmSync(path.join(tmpHome, 'config.json'));
      else fs.writeFileSync(path.join(tmpHome, 'config.json'), '{"providers":{}}');
      const rename = fs.renameSync.bind(fs);
      const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (String(to) === path.join(tmpHome, 'auth.json'))
          throw new Error('Injected rename failure');
        return rename(from, to);
      });
      try {
        expect(() => s.restoreBackupBlob(blob, 'passphrase-123')).toThrow(
          'Injected rename failure',
        );
      } finally {
        spy.mockRestore();
      }
      expect(fs.existsSync(path.join(tmpHome, 'config.json'))).toBe(!absent);
      if (!absent)
        expect(fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8')).toBe('{"providers":{}}');
      expect(fs.readFileSync(path.join(tmpHome, 'auth.json'), 'utf8')).toBe(AUTH_FIXTURE);
      expect(fs.readdirSync(tmpHome).sort()).toEqual(
        absent ? ['auth.json'] : ['auth.json', 'config.json'],
      );
    },
  );

  it('preserves encrypted config and accepts empty profile arrays', async () => {
    const s = await fresh();
    const crypto = await import('../server/crypto.js');
    const salt = crypto.randomSalt();
    const encrypted = JSON.stringify(
      crypto.encryptWithKey(
        JSON.parse(CONFIG_FIXTURE),
        crypto.deriveKey('different-config-password', salt),
        salt,
      ),
    );
    fs.writeFileSync(path.join(tmpHome, 'config.json'), encrypted);
    fs.writeFileSync(path.join(tmpHome, 'auth.json'), '[]');
    const blob = s.createBackupBlob('passphrase-123');
    expect(s.restoreBackupBlob(blob, 'passphrase-123')).toEqual({
      restoredConfig: true,
      restoredAuth: true,
    });
    expect(fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8')).toBe(encrypted);
  });

  it.each([
    { config: 42, auth: null },
    { config: null, auth: {} },
    { config: '{"providers":[]}', auth: null },
    { config: '{"providers":{"openai":null}}', auth: null },
    { config: '{"enc":"aes-256-gcm"}', auth: null },
    { config: null, auth: '[null]' },
    { config: null, auth: '[{"id":"admin"}]' },
  ])('rejects malformed backup fields: %j', async (fields) => {
    const s = await fresh();
    const crypto = await import('../server/crypto.js');
    const salt = crypto.randomSalt();
    const blob = crypto.encryptWithKey(
      { format: 'lwb-backup', version: 1, exportedAt: new Date().toISOString(), ...fields },
      crypto.deriveKey('passphrase-123', salt),
      salt,
    );
    expect(() =>
      s.restoreBackupBlob(Buffer.from(JSON.stringify(blob)).toString('base64'), 'passphrase-123'),
    ).toThrow();
    expect(fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8')).toBe(CONFIG_FIXTURE);
    expect(fs.readFileSync(path.join(tmpHome, 'auth.json'), 'utf8')).toBe(AUTH_FIXTURE);
  });

  it('config 不是合法 JSON → 恢复整体抛错，磁盘文件不被破坏', async () => {
    const s = await fresh();
    const crypto = await import('../server/crypto.js');
    const salt = crypto.randomSalt();
    const key = crypto.deriveKey('passphrase-123', salt);
    const bundle = {
      format: 'lwb-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      config: '{broken json',
      auth: null,
    };
    const blobText = Buffer.from(
      JSON.stringify(crypto.encryptWithKey(bundle, key, salt)),
      'utf8',
    ).toString('base64');
    const before = fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8');
    expect(() => s.restoreBackupBlob(blobText, 'passphrase-123')).toThrow();
    expect(fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8')).toBe(before);
  });

  it('config 不是合法配置结构（缺 providers 对象）→ 恢复抛错且不落盘', async () => {
    const s = await fresh();
    const crypto = await import('../server/crypto.js');
    const salt = crypto.randomSalt();
    const key = crypto.deriveKey('passphrase-123', salt);
    const bundle = {
      format: 'lwb-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      config: JSON.stringify({ foo: 'bar' }),
      auth: null,
    };
    const blobText = Buffer.from(
      JSON.stringify(crypto.encryptWithKey(bundle, key, salt)),
      'utf8',
    ).toString('base64');
    const before = fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8');
    expect(() => s.restoreBackupBlob(blobText, 'passphrase-123')).toThrow();
    expect(fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8')).toBe(before);
  });

  it('auth 不是合法档案结构（缺 profiles 数组）→ 恢复抛错且不落盘', async () => {
    const s = await fresh();
    const crypto = await import('../server/crypto.js');
    const salt = crypto.randomSalt();
    const key = crypto.deriveKey('passphrase-123', salt);
    const bundle = {
      format: 'lwb-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      config: JSON.stringify({ providers: {} }),
      auth: JSON.stringify({ foo: 'bar' }),
    };
    const blobText = Buffer.from(
      JSON.stringify(crypto.encryptWithKey(bundle, key, salt)),
      'utf8',
    ).toString('base64');
    const before = fs.readFileSync(path.join(tmpHome, 'auth.json'), 'utf8');
    expect(() => s.restoreBackupBlob(blobText, 'passphrase-123')).toThrow();
    expect(fs.readFileSync(path.join(tmpHome, 'auth.json'), 'utf8')).toBe(before);
  });

  it('事务性：config 合法但 auth 写入失败 → config 也不落盘（保持原样）', async () => {
    const s = await fresh();
    const goodConfig = JSON.stringify({
      providers: { openai: { apiKey: 'sk-new', enabled: true } },
    });
    const crypto = await import('../server/crypto.js');
    const salt = crypto.randomSalt();
    const key = crypto.deriveKey('passphrase-123', salt);
    const bundle = {
      format: 'lwb-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      config: goodConfig,
      auth: AUTH_FIXTURE,
    };
    const blobText = Buffer.from(
      JSON.stringify(crypto.encryptWithKey(bundle, key, salt)),
      'utf8',
    ).toString('base64');
    const origAuth = fs.readFileSync(path.join(tmpHome, 'auth.json'), 'utf8');
    // 用只读目录无法触发（同目录原子写会先失败 tmp）；改为把 auth.json 变成目录，使 rename 目标非法
    fs.rmSync(path.join(tmpHome, 'auth.json'));
    fs.mkdirSync(path.join(tmpHome, 'auth.json'));
    expect(() => s.restoreBackupBlob(blobText, 'passphrase-123')).toThrow();
    // config 必须保持原值（未被执行写入）
    expect(fs.readFileSync(path.join(tmpHome, 'config.json'), 'utf8')).toBe(CONFIG_FIXTURE);
    expect(origAuth).toBe(AUTH_FIXTURE);
  });
});
