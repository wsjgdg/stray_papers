// 本地多档案 + RBAC（管理员 / 只读）。
// 单机本地工具，无网络认证：档案仅存本机 home，含密码 verifier（scrypt 派生，不存明文）。
// 会话为服务端内存态（随进程生存，页面刷新不丢；进程重启需重新登录）。
// 管理员密码同时作为配置加密主密码（复用 crypto.deriveKey）；只读用户只能看，不能改配置/看明文 key。

import fs from 'node:fs';
import path from 'node:path';
import { deriveKey, randomSalt } from './crypto.js';
import { configDir } from './config.js';

export type Role = 'admin' | 'viewer';

export interface Profile {
  id: string;
  name: string;
  role: Role;
  salt: string; // base64
  verifier: string; // base64（scrypt 派生的 key，用于校验密码）
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

function hashPassword(pw: string): { salt: string; verifier: string } {
  const salt = randomSalt();
  const key = deriveKey(pw, salt);
  return { salt: salt.toString('base64'), verifier: key.toString('base64') };
}

function verifyPassword(p: Profile, pw: string): boolean {
  const key = deriveKey(pw, Buffer.from(p.salt, 'base64'));
  return key.toString('base64') === p.verifier;
}

export function getAdminProfile(): Profile | undefined {
  return profiles.find((p) => p.role === 'admin');
}

/** 确保存在 admin 档案（首次启用加密 / 首次解锁时调用，用该密码创建） */
export function ensureAdminProfile(password: string): void {
  if (getAdminProfile()) return;
  const { salt, verifier } = hashPassword(password);
  profiles.push({ id: 'admin', name: '管理员', role: 'admin', salt, verifier });
  saveProfiles();
}

export function createProfile(
  name: string,
  role: Role,
  password: string,
): { id: string } | { error: string } {
  if (!name || !password) return { error: 'name 与 password 必填' };
  if (profiles.some((p) => p.name === name)) return { error: '同名档案已存在' };
  const id = 'p_' + Math.random().toString(36).slice(2, 10);
  const { salt, verifier } = hashPassword(password);
  profiles.push({ id, name, role, salt, verifier });
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
