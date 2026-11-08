// D5：配置加密备份。bundle = { config 原文, auth 原文 }，passphrase 经 scrypt（随机盐）派生
// AES-256-GCM key 加密；盐/iv/authTag/kdfParams 全部嵌入 blob，恢复时按 blob 内参数重新派生。
// GCM auth tag 保证：口令错误或内容被篡改都会在解密时失败，不区分返回（避免口令探测）。
import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './config.js';
import {
  decryptWithKey,
  deriveKey,
  encryptWithKey,
  isEncryptedBlob,
  randomSalt,
  resolveScryptParams,
  type EncryptedBlob,
} from './crypto.js';

const BACKUP_FORMAT = 'lwb-backup';
const BACKUP_VERSION = 1;

export interface BackupBundle {
  format: 'lwb-backup';
  version: 1;
  exportedAt: string;
  config: string | null; // config.json 原文（保持其加密态，不做二次处理）
  auth: string | null; // auth.json 原文
}

function readRawFile(name: string): string | null {
  try {
    return fs.readFileSync(path.join(configDir(), name), 'utf8');
  } catch {
    return null; // 文件不存在（如尚未创建档案）→ 备份中留空
  }
}

function decryptBundle(blobText: string, passphrase: string): BackupBundle {
  const fail = () => new Error('备份文件校验失败：口令错误或文件损坏');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(blobText, 'base64').toString('utf8'));
  } catch {
    throw fail();
  }
  if (!isEncryptedBlob(parsed)) throw fail();
  const blob = parsed as EncryptedBlob;
  try {
    const key = deriveKey(
      passphrase,
      Buffer.from(blob.salt, 'base64'),
      resolveScryptParams(blob.kdfParams),
    );
    const bundle = decryptWithKey(blob, key) as BackupBundle;
    if (bundle?.format !== BACKUP_FORMAT || bundle?.version !== BACKUP_VERSION) {
      throw new Error(
        `不支持的备份格式: ${String((bundle as { format?: string })?.format ?? '?')}`,
      );
    }
    return bundle;
  } catch (e) {
    if ((e as Error).message.startsWith('不支持的备份格式')) throw e;
    throw fail(); // GCM tag 不匹配 / ciphertext 破坏 / JSON 解析失败 → 统一口径
  }
}

function assertPassphrase(passphrase: string): void {
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('备份口令至少 8 个字符');
  }
}

/** 导出加密备份（base64 文本，可直接保存为 .lwb 文件） */
export function createBackupBlob(passphrase: string): string {
  assertPassphrase(passphrase);
  const bundle: BackupBundle = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    config: readRawFile('config.json'),
    auth: readRawFile('auth.json'),
  };
  const salt = randomSalt();
  const key = deriveKey(passphrase, salt);
  const blob = encryptWithKey(bundle, key, salt); // salt 与派生一致（见 crypto.ts 注释）
  return Buffer.from(JSON.stringify(blob), 'utf8').toString('base64');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateBackupFile(raw: unknown, name: 'config' | 'auth'): void {
  if (raw === null) return;
  const fail = () => new Error(`备份文件校验失败：${name}.json 结构无效`);
  if (typeof raw !== 'string') throw fail();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw fail();
  }
  if (name === 'auth') {
    if (
      !Array.isArray(value) ||
      !value.every(
        (p: unknown) =>
          isRecord(p) &&
          ['id', 'name', 'salt', 'verifier'].every(
            (k) => typeof p[k] === 'string' && p[k].length > 0,
          ) &&
          (p.role === 'admin' || p.role === 'viewer'),
      )
    )
      throw fail();
  } else if (isEncryptedBlob(value)) {
    // The config password may differ from the backup password; validate only its envelope.
    if (
      value.v !== 1 ||
      value.kdf !== 'scrypt' ||
      !['salt', 'nonce', 'tag', 'ciphertext'].every(
        (k) =>
          typeof (value as unknown as Record<string, unknown>)[k] === 'string' &&
          String((value as unknown as Record<string, unknown>)[k]).length > 0,
      )
    )
      throw fail();
  } else if (
    !isRecord(value) ||
    !isRecord(value.providers) ||
    !Object.values(value.providers).every(isRecord)
  ) {
    throw fail();
  }
}

/** Restore with synchronous failure rollback, not cross-file crash atomicity. */
export function restoreBackupBlob(
  blobText: string,
  passphrase: string,
): { restoredConfig: boolean; restoredAuth: boolean } {
  assertPassphrase(passphrase);
  const bundle = decryptBundle(blobText, passphrase);
  validateBackupFile(bundle.config, 'config');
  validateBackupFile(bundle.auth, 'auth');
  const files = (['config', 'auth'] as const).flatMap((name) => {
    const raw = bundle[name];
    if (raw === null) return [];
    const target = path.join(configDir(), `${name}.json`);
    let previous: Buffer | null;
    try {
      if (!fs.lstatSync(target).isFile()) throw new Error(`恢复目标不是普通文件：${name}.json`);
      previous = fs.readFileSync(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      previous = null;
    }
    return [{ name, raw, target, previous }];
  });
  if (files.length === 0) return { restoredConfig: false, restoredAuth: false };
  fs.mkdirSync(configDir(), { recursive: true });
  const staging = fs.mkdtempSync(path.join(configDir(), '.restore-'));
  const committed: typeof files = [];
  let keepStaging = false;
  try {
    for (const file of files) {
      fs.writeFileSync(path.join(staging, `${file.name}.new`), file.raw, { mode: 0o600 });
      if (file.previous !== null)
        fs.writeFileSync(path.join(staging, `${file.name}.old`), file.previous, { mode: 0o600 });
    }
    for (const file of files) {
      fs.renameSync(path.join(staging, `${file.name}.new`), file.target);
      committed.push(file);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const file of committed.reverse()) {
      try {
        if (file.previous === null) fs.unlinkSync(file.target);
        else fs.renameSync(path.join(staging, `${file.name}.old`), file.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      keepStaging = true;
      throw new AggregateError(
        [error, ...rollbackErrors],
        `备份恢复失败且回滚未完成，原文件保留在 ${staging}`,
      );
    }
    throw error;
  } finally {
    if (!keepStaging) fs.rmSync(staging, { recursive: true, force: true });
  }
  return { restoredConfig: bundle.config !== null, restoredAuth: bundle.auth !== null };
}
