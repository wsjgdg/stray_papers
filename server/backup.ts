// D5：配置加密备份。bundle = { config 原文, auth 原文 }，passphrase 经 scrypt（随机盐）派生
// AES-256-GCM key 加密；盐/iv/authTag/kdfParams 全部嵌入 blob，恢复时按 blob 内参数重新派生。
// GCM auth tag 保证：口令错误或内容被篡改都会在解密时失败，不区分返回（避免口令探测）。
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJson, configDir } from './config.js';
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

/** 恢复备份：原子写回原文；调用方需随后 initConfigStore() + loadProfiles() 刷新内存态 */
export function restoreBackupBlob(
  blobText: string,
  passphrase: string,
): { restoredConfig: boolean; restoredAuth: boolean } {
  assertPassphrase(passphrase);
  const bundle = decryptBundle(blobText, passphrase);
  let restoredConfig = false;
  let restoredAuth = false;
  if (typeof bundle.config === 'string') {
    atomicWriteJson(path.join(configDir(), 'config.json'), bundle.config);
    restoredConfig = true;
  }
  if (typeof bundle.auth === 'string') {
    atomicWriteJson(path.join(configDir(), 'auth.json'), bundle.auth);
    restoredAuth = true;
  }
  return { restoredConfig, restoredAuth };
}
