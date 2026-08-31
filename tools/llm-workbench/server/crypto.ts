import crypto from 'node:crypto';

// AES-256-GCM 配置存储加密。
// 主密码经 scrypt 派生 32 字节 key；salt 保存在加密 blob 中（仅用于错误密码时重派生/验证）。
// 解密成功即认为密码正确（GCM auth tag 会校验）。

const ALGO = 'aes-256-gcm';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

let masterKey: Buffer | null = null;

export function hasMasterKey(): boolean {
  return masterKey !== null;
}
export function getMasterKey(): Buffer | null {
  return masterKey;
}
export function setMasterKey(key: Buffer | null): void {
  masterKey = key;
}

export function randomSalt(): Buffer {
  return crypto.randomBytes(16);
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

export interface EncryptedBlob {
  v: 1;
  enc: 'aes-256-gcm';
  kdf: 'scrypt';
  salt: string; // base64
  nonce: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
}

export function isEncryptedBlob(v: unknown): v is EncryptedBlob {
  return Boolean(v) && typeof v === 'object' && (v as { enc?: string }).enc === 'aes-256-gcm';
}

export function encryptWithKey(value: unknown, key: Buffer): EncryptedBlob {
  const salt = randomSalt();
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, nonce);
  const json = JSON.stringify(value);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    enc: 'aes-256-gcm',
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: enc.toString('base64'),
  };
}

export function decryptWithKey(blob: EncryptedBlob, key: Buffer): unknown {
  const nonce = Buffer.from(blob.nonce, 'base64');
  const tag = Buffer.from(blob.tag, 'base64');
  const data = Buffer.from(blob.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}
