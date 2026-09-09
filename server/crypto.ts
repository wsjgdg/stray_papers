import crypto from 'node:crypto';

// AES-256-GCM 配置存储加密。
// 主密码经 scrypt 派生 32 字节 key；salt 与 KDF 参数一起持久化到加密 blob / 档案中。
// KDF 参数版本化：新产物用 DEFAULT_SCRYPT（更高 N），历史产物按其记录的 LEGACY_SCRYPT 派生，
// 这样提升默认强度不会让既有配置/档案失效。
// 解密成功即认为密码正确（GCM auth tag 会校验）。

const ALGO = 'aes-256-gcm';
const KEYLEN = 32;

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** 新产物的默认 KDF 参数 */
export const DEFAULT_SCRYPT: ScryptParams = { N: 32768, r: 8, p: 1 };
/** 未记录参数的历史产物所用参数（不得再改动，仅供回退） */
export const LEGACY_SCRYPT: ScryptParams = { N: 16384, r: 8, p: 1 };

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

// 内存占用约 128*N*r；N=32768/r=8 需要 ~32MB，超过 Node 默认 32MB maxmem 上限，故显式放宽
const SCRYPT_MAXMEM = 128 * 1024 * 1024;

export function deriveKey(
  password: string,
  salt: Buffer,
  params: ScryptParams = DEFAULT_SCRYPT,
): Buffer {
  return crypto.scryptSync(password, salt, KEYLEN, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM,
  });
}

export interface EncryptedBlob {
  v: 1;
  enc: 'aes-256-gcm';
  kdf: 'scrypt';
  salt: string; // base64
  nonce: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
  kdfParams?: ScryptParams; // 缺失时按 LEGACY_SCRYPT 处理
}

export function isEncryptedBlob(v: unknown): v is EncryptedBlob {
  return Boolean(v) && typeof v === 'object' && (v as { enc?: string }).enc === 'aes-256-gcm';
}

/** 取回产物记录的 KDF 参数；无该字段的历史产物回退到旧参数 */
export function resolveScryptParams(recorded?: Partial<ScryptParams> | null): ScryptParams {
  if (!recorded || typeof recorded.N !== 'number') return { ...LEGACY_SCRYPT };
  return {
    N: recorded.N,
    r: recorded.r ?? LEGACY_SCRYPT.r,
    p: recorded.p ?? LEGACY_SCRYPT.p,
  };
}

/**
 * 加密并输出 blob。
 * 关键：用于派生 key 的 salt 必须与写入 blob 的 salt 一致，否则解锁时按 blob.salt 重新派生
 * 会得到不同的 key，导致永久无法解密（历史上这里曾各自随机生成 salt → 启用加密即锁死配置）。
 * 调用方若不传 salt，则由本函数随机生成一个并作为返回值的一部分返回。
 */
export function encryptWithKey(
  value: unknown,
  key: Buffer,
  salt: Buffer = randomSalt(),
): EncryptedBlob {
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
    kdfParams: { ...DEFAULT_SCRYPT },
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

/** 恒定时间比较：避免通过比较耗时侧信道推断密钥/口令 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
