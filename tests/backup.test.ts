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
const AUTH_FIXTURE = JSON.stringify({ profiles: [{ id: 'p_admin', name: 'admin' }] });

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
});
