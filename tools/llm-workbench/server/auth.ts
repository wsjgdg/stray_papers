// 本地多档案 + RBAC（管理员 / 只读）。
// 单机本地工具，无网络认证：档案仅存本机 home，含密码 verifier（scrypt 派生，不存明文）。
// 会话为服务端内存态（随进程生存，页面刷新不丢；进程重启需重新登录）。
// 管理员密码同时作为配置加密主密码（复用 crypto.deriveKey）；只读用户只能看，不能改配置/看明文 key。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  deriveKey,
  randomSalt,
  resolveScryptParams,
  timingSafeEqualStr,
  DEFAULT_SCRYPT,
  type ScryptParams,
} from './crypto.js';
import { configDir } from './config.js';

export type Role = 'admin' | 'viewer';

export interface Profile {
  id: string;
  name: string;
  role: Role;
  salt: string; // base64
  verifier: string; // base64（scrypt 派生的 key，用于校验密码）
  kdfParams?: ScryptParams; // 缺失时按历史参数派生（见 crypto.resolveScryptParams）
}

export interface Session {
  profileId: string;
  name: string;
  role: Role;
}

const AUTH_PATH = path.join(configDir(), 'auth.json');

let profiles: Profile[] = [];
let session: Session | null = null;

export function loadProfiles(): void {
  try {
    profiles = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
  } catch {
    profiles = [];
  }
}

function saveProfiles(): void {
  fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  fs.writeFileSync(AUTH_PATH, JSON.stringify(profiles, null, 2), 'utf8');
}

export function listProfiles(): { id: string; name: string; role: Role }[] {
  return profiles.map((p) => ({ id: p.id, name: p.name, role: p.role }));
}

function hashPassword(pw: string): { salt: string; verifier: string; kdfParams: ScryptParams } {
  const salt = randomSalt();
  const params = { ...DEFAULT_SCRYPT };
  const key = deriveKey(pw, salt, params);
  return { salt: salt.toString('base64'), verifier: key.toString('base64'), kdfParams: params };
}

function verifyPassword(p: Profile, pw: string): boolean {
  // 用档案记录的 KDF 参数派生，保证提高默认强度不会让旧档案失效
  const key = deriveKey(pw, Buffer.from(p.salt, 'base64'), resolveScryptParams(p.kdfParams));
  return timingSafeEqualStr(key.toString('base64'), p.verifier);
}

export function getAdminProfile(): Profile | undefined {
  return profiles.find((p) => p.role === 'admin');
}

/** 确保存在 admin 档案（首次启用加密 / 首次解锁时调用，用该密码创建） */
export function ensureAdminProfile(password: string): void {
  if (getAdminProfile()) return;
  const { salt, verifier, kdfParams } = hashPassword(password);
  profiles.push({ id: 'admin', name: '管理员', role: 'admin', salt, verifier, kdfParams });
  saveProfiles();
}

export function createProfile(
  name: string,
  role: Role,
  password: string,
): { id: string } | { error: string } {
  if (!name || !password) return { error: 'name 与 password 必填' };
  if (profiles.some((p) => p.name === name)) return { error: '同名档案已存在' };
  const id = 'p_' + crypto.randomUUID();
  const { salt, verifier, kdfParams } = hashPassword(password);
  profiles.push({ id, name, role, salt, verifier, kdfParams });
  saveProfiles();
  return { id };
}

export function deleteProfile(profileId: string): { ok: boolean } | { error: string } {
  if (profileId === 'admin') return { error: '不能删除管理员' };
  const idx = profiles.findIndex((p) => p.id === profileId);
  if (idx < 0) return { error: '档案不存在' };
  profiles.splice(idx, 1);
  saveProfiles();
  return { ok: true };
}

/** 校验密码并登录；成功写入会话并返回 role，失败返回 null */
export function authenticate(profileId: string, password: string): Role | null {
  const p = profiles.find((x) => x.id === profileId);
  if (!p || !verifyPassword(p, password)) return null;
  session = { profileId: p.id, name: p.name, role: p.role };
  return p.role;
}

export function getSession(): Session | null {
  return session;
}
export function clearSession(): void {
  session = null;
}
export function isAdmin(): boolean {
  return session?.role === 'admin';
}
export function isViewer(): boolean {
  return session?.role === 'viewer';
}

// ───────── A2：登录节流（失败指数退避 + 连续失败锁定）─────────
// 内存态：进程重启即清零（本机单机工具，刻意不做持久化，避免把自己锁死）。
// scrypt 只抬高单次成本，不阻止反复尝试；这里补上计数退避与临时锁定。
const LOGIN_BACKOFF_CAP_MS = 30_000; // 单次退避上限 30s
const LOGIN_LOCK_MS = 5 * 60_000; // 连续失败达阈值后锁 5 分钟
const LOGIN_LOCK_THRESHOLD = 10;

const loginAttempts = new Map<string, { fails: number; until: number }>();

export interface LoginThrottle {
  blocked: boolean; // 现在是否必须等待
  retryAfterMs: number; // 还需等待毫秒
  locked: boolean; // 是否已进入长锁定（提示用）
}

export function loginThrottle(key: string): LoginThrottle {
  const st = loginAttempts.get(key);
  if (!st) return { blocked: false, retryAfterMs: 0, locked: false };
  const wait = st.until - Date.now();
  if (wait <= 0) return { blocked: false, retryAfterMs: 0, locked: false };
  return { blocked: true, retryAfterMs: wait, locked: st.fails >= LOGIN_LOCK_THRESHOLD };
}

/** 记录一次登录失败，返回本次需要等待的毫秒数 */
export function recordLoginFailure(key: string): number {
  const prev = loginAttempts.get(key);
  const fails = (prev?.fails ?? 0) + 1;
  const delay =
    fails >= LOGIN_LOCK_THRESHOLD
      ? LOGIN_LOCK_MS
      : Math.min(LOGIN_BACKOFF_CAP_MS, 2 ** (fails - 1) * 1000);
  loginAttempts.set(key, { fails, until: Date.now() + delay });
  return delay;
}

export function clearLoginFailures(key: string): void {
  loginAttempts.delete(key);
}
