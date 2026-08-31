import fs from 'node:fs';
import path from 'node:path';
import os from 'os';
import crypto from 'node:crypto';
import { PROVIDERS } from './providers.js';
import {
  deriveKey,
  encryptWithKey,
  decryptWithKey,
  isEncryptedBlob,
  hasMasterKey,
  setMasterKey,
  getMasterKey,
  type EncryptedBlob,
} from './crypto.js';

// 本地代理配置：仅本机存储（用户 home 下，不进仓库）。
// 可选 AES-256-GCM 加密：主密码经 scrypt 派生 key，写入磁盘的是密文。
// 代理服务只监听 127.0.0.1，不外泄到网络；响应中 Key 一律 mask。

export type AuthStyle = 'bearer' | 'x-api-key' | 'google';
export type ApiFormat = 'openai' | 'anthropic' | 'gemini';

export interface ProviderConfig {
  apiKey: string; // 明文保存在本机文件，仅 localhost 使用；加密态下为密文
  apiKeys?: string[]; // 多 key 池：用于轮询 / 失败切换（兜底）。为空时回退单 apiKey
  baseUrl?: string; // 主流厂商：覆盖默认 apiBase；自定义厂商：必填
  enabled: boolean;
  customName?: string; // 自定义厂商显示名
  authStyle?: AuthStyle; // 仅自定义厂商使用；主流厂商按 id 推断
  apiFormat?: ApiFormat; // 仅自定义厂商：上游 API 格式，代理据此改写请求/响应体
}

/**
 * 解析可用 key 池：去重 + 过滤空值。
 * apiKeys 优先；若未配置 apiKeys 则回退单 apiKey；都为空则返回 []。
 */
export function resolveKeyPool(p: ProviderConfig): string[] {
  const raw = (p.apiKeys && p.apiKeys.length > 0 ? p.apiKeys : [p.apiKey]).filter(
    (k): k is string => Boolean(k) && k.trim().length > 0,
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const t = k.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

const KNOWN_IDS = new Set(PROVIDERS.map((p) => p.id));
const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export interface ProxyConfig {
  providers: Record<string, ProviderConfig>;
}

const CONFIG_DIR = path.join(os.homedir(), '.llm-workbench');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function configDir(): string {
  return CONFIG_DIR;
}
export function configPath(): string {
  return CONFIG_PATH;
}

// ── 内存态：活跃配置 + 锁定/加密状态 ──
let activeConfig: ProxyConfig = { providers: {} };
let encrypted = false;
let locked = false;

export function isEncrypted(): boolean {
  return encrypted;
}
export function isLocked(): boolean {
  return locked;
}
export function hasConfigFile(): boolean {
  try {
    return fs.existsSync(CONFIG_PATH);
  } catch {
    return false;
  }
}
export function getConfigState(): { encrypted: boolean; locked: boolean; hasConfig: boolean } {
  return { encrypted, locked, hasConfig: hasConfigFile() };
}

// 启动时调用：读取磁盘，决定锁定/加密态（加密文件 → 锁定待解锁；明文 → 直接载入）
export function initConfigStore(): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    activeConfig = { providers: {} };
    encrypted = false;
    locked = false;
    return;
  }
  if (isEncryptedBlob(parsed)) {
    encrypted = true;
    locked = true; // 需主密码解锁后才能载入明文配置
    activeConfig = { providers: {} };
    return;
  }
  // 明文（兼容旧版 & 未启用加密）
  activeConfig = { providers: (parsed as Partial<ProxyConfig>).providers ?? {} };
  encrypted = false;
  locked = false;
}

export function loadConfig(): ProxyConfig {
  // 锁定态返回空配置；调用方应另行检查 isLocked()
  return activeConfig;
}

function getMasterKeySafe(): Buffer {
  const k = getMasterKey();
  if (!k) throw new Error('主密钥未初始化');
  return k;
}

export function saveConfig(cfg: ProxyConfig): void {
  activeConfig = cfg;
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (encrypted && hasMasterKey()) {
    const blob = encryptWithKey(cfg, getMasterKeySafe());
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(blob, null, 2), 'utf8');
  } else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  }
}

/** 用主密码解锁加密配置；成功返回 true 并载入明文到内存 */
export function unlock(password: string): boolean {
  if (!encrypted) return true;
  let parsed: EncryptedBlob;
  try {
    parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as EncryptedBlob;
  } catch {
    return false;
  }
  try {
    const key = deriveKey(password, Buffer.from(parsed.salt, 'base64'));
    const cfg = decryptWithKey(parsed, key) as ProxyConfig;
    if (!cfg || typeof cfg !== 'object' || !('providers' in cfg)) throw new Error('格式错误');
    activeConfig = { providers: cfg.providers ?? {} };
    setMasterKey(key);
    locked = false;
    return true;
  } catch {
    return false; // 密码错误或数据损坏
  }
}

/** 启用加密：用主密码派生 key，把当前（明文）配置重新以密文落盘 */
export function enableEncryption(password: string): boolean {
  const key = deriveKey(password, crypto.randomBytes(16));
  setMasterKey(key);
  encrypted = true;
  locked = false;
  try {
    saveConfig(activeConfig);
    return true;
  } catch {
    encrypted = false;
    return false;
  }
}

/** 关闭加密：以明文重新落盘，并清空内存中的主密钥 */
export function disableEncryption(): boolean {
  if (!hasMasterKey()) return false;
  encrypted = false;
  try {
    saveConfig(activeConfig); // 此时 encrypted=false → 明文写出
    setMasterKey(null);
    return true;
  } catch {
    encrypted = true;
    return false;
  }
}

/** 仅展示后 4 位，避免 key 出现在 API 响应 / 前端里 */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '****';
  return '****' + key.slice(-4);
}

/** 用于 API 响应的脱敏配置 */
export function maskConfig(cfg: ProxyConfig): {
  providers: Record<
    string,
    Omit<ProviderConfig, 'apiKey'> & {
      apiKeyMasked: string;
      hasKey: boolean;
      apiKeyCount: number;
      custom: boolean;
      name: string;
    }
  >;
} {
  const out: Record<
    string,
    Omit<ProviderConfig, 'apiKey'> & {
      apiKeyMasked: string;
      hasKey: boolean;
      apiKeyCount: number;
      custom: boolean;
      name: string;
    }
  > = {};
  for (const [id, p] of Object.entries(cfg.providers)) {
    out[id] = {
      baseUrl: p.baseUrl,
      enabled: p.enabled,
      customName: p.customName,
      authStyle: p.authStyle,
      apiFormat: p.apiFormat,
      apiKeyMasked: maskKey(p.apiKey),
      hasKey: Boolean(p.apiKey) || (p.apiKeys?.length ?? 0) > 0,
      apiKeyCount: resolveKeyPool(p).length,
      custom: !KNOWN_IDS.has(id),
      name: KNOWN_IDS.has(id) ? PROVIDER_BY_ID.get(id)!.nameCn : p.customName || id,
    };
  }
  return { providers: out };
}

export function upsertProvider(id: string, patch: Partial<ProviderConfig>): ProxyConfig {
  if (locked) return activeConfig; // 锁定态禁止写入，避免覆盖密文
  const cfg = activeConfig;
  const prev = cfg.providers[id] ?? { apiKey: '', enabled: true };
  const apiKeys =
    patch.apiKeys !== undefined ? patch.apiKeys.filter((k) => k && k.trim().length > 0) : prev.apiKeys;
  cfg.providers[id] = {
    apiKey: patch.apiKey !== undefined ? patch.apiKey : prev.apiKey,
    apiKeys: apiKeys !== undefined ? apiKeys : prev.apiKeys,
    baseUrl: patch.baseUrl !== undefined ? patch.baseUrl : prev.baseUrl,
    enabled: patch.enabled !== undefined ? patch.enabled : prev.enabled,
    customName: patch.customName !== undefined ? patch.customName : prev.customName,
    authStyle: patch.authStyle !== undefined ? patch.authStyle : prev.authStyle,
    apiFormat: patch.apiFormat !== undefined ? patch.apiFormat : prev.apiFormat,
  };
  saveConfig(cfg);
  return cfg;
}

export function deleteProvider(id: string): ProxyConfig {
  if (locked) return activeConfig;
  const cfg = activeConfig;
  delete cfg.providers[id];
  saveConfig(cfg);
  return cfg;
}

/** 批量导入：与现有配置做浅合并（不传的字段保留原值；传空字符串的 key 视为不修改） */
export function importConfig(partial: { providers?: Record<string, Partial<ProviderConfig>> }): ProxyConfig {
  if (locked) return activeConfig;
  const cfg = activeConfig;
  for (const [id, p] of Object.entries(partial.providers ?? {})) {
    const prev = cfg.providers[id] ?? { apiKey: '', enabled: true };
    const apiKeys =
      p.apiKeys && p.apiKeys.length > 0
        ? p.apiKeys.filter((k) => k && k.trim().length > 0)
        : prev.apiKeys;
    cfg.providers[id] = {
      apiKey: p.apiKey && p.apiKey.length > 0 ? p.apiKey : prev.apiKey,
      apiKeys: apiKeys !== undefined ? apiKeys : prev.apiKeys,
      baseUrl: p.baseUrl !== undefined ? p.baseUrl : prev.baseUrl,
      enabled: p.enabled !== undefined ? p.enabled : prev.enabled,
      customName: p.customName !== undefined ? p.customName : prev.customName,
      authStyle: p.authStyle !== undefined ? p.authStyle : prev.authStyle,
      apiFormat: p.apiFormat !== undefined ? p.apiFormat : prev.apiFormat,
    };
  }
  saveConfig(cfg);
  return cfg;
}
