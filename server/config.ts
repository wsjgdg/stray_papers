import fs from 'node:fs';
import path from 'node:path';
import os from 'os';
import { randomBytes } from 'node:crypto';
import { PROVIDERS } from './providers.js';
import type { RoutingConfig } from './routing.js';
import {
  deriveKey,
  encryptWithKey,
  decryptWithKey,
  isEncryptedBlob,
  hasMasterKey,
  setMasterKey,
  getMasterKey,
  randomSalt,
  resolveScryptParams,
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
  models?: string[]; // 自动获取的模型清单（上游返回的模型 id）
  enabledModels?: string[]; // 用户在清单中手动启用的子集；为空数组表示全部禁用
  retryOn?: number[]; // 触发换 key 重试的 HTTP 状态码集合；缺省 [401,403,429]
  timeoutMs?: number; // 上游请求超时（毫秒）；缺省非流式 180s、流式 600s
  modelMapping?: Record<string, string>; // 模型映射：请求模型名 → 上游实际模型名，如 { "gpt-4o": "oai-gpt-4o" }；未命中原样透传
  maxRps?: number; // B3：该厂商请求速率上限（req/s，令牌桶）；未配置不限流。超限返回 429 + Retry-After
  dailyKeyBudgetUsd?: number; // B3：单 Key 当日成本上限（USD）；超限的 Key 当日退出轮询，次日归零
}

// 上游请求超时（毫秒）：per-provider 可覆盖；流式长生成默认放宽到 600s，非流式 180s。
const DEFAULT_TIMEOUT_MS = 180_000;
const STREAM_TIMEOUT_MS = 600_000;

export function resolveTimeoutMs(
  entry: { timeoutMs?: number } | undefined,
  isStreaming: boolean,
): number {
  if (entry?.timeoutMs && entry.timeoutMs > 0) return entry.timeoutMs;
  return isStreaming ? STREAM_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
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
  // 代理访问令牌（B4）：启用后 /api/v1 与 /api/proxy 必须携带，防止本机其它进程白嫖已存 key。
  // 明文落地本机；localhost 单用户场景由前端存 localStorage 透明携带，外部客户端复制使用。
  proxyToken?: string | null;
  proxyTokenEnabled?: boolean;
  // 预算（D3 日预算 / E1 月度预算）：达到 80% 预警 / 100% 超限；阈值判定见 metrics.ratioLevel。
  // blockOnExceed = fail-closed：日预算超限后代理直接拒绝转发（402），默认 false 只告警。
  // 月度预算只做告警与月终预测（见 usageStore.projectMonthEnd），不参与拦截。
  budget?: { dailyUsd?: number; monthlyUsd?: number; blockOnExceed?: boolean };
  // B1：模型路由 + fallback 链；决定「一次请求按什么顺序尝试哪些厂商」。
  // 缺省（未配置）时统一端点退化为「首个启用且有 key 的厂商」。
  routing?: RoutingConfig;
}

// 数据目录统一（B12）：Electron 主进程经 LLM_WORKBENCH_HOME 注入 app.getPath('userData')，
// server 据此与 float-stats/app-settings 落入同一目录；独立运行（dev:api / CLI）回退旧目录。
const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.llm-workbench');

function resolveConfigDir(): string {
  const home = process.env.LLM_WORKBENCH_HOME;
  if (home && home.trim()) return path.resolve(home);
  return LEGACY_CONFIG_DIR;
}

const CONFIG_DIR = resolveConfigDir();
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const MIGRATION_MARKER = path.join(CONFIG_DIR, '.migrated-from-legacy');

export function configDir(): string {
  return CONFIG_DIR;
}
export function configPath(): string {
  return CONFIG_PATH;
}

/**
 * 一次性迁移：Electron 首次启动（CONFIG_DIR 指向 userData）时，把旧 ~/.llm-workbench
 * 的配置/日志拷入新目录。幂等（靠 MIGRATION_MARKER 防重）+ 非破坏（旧目录保留）。
 * 目标目录已存在 config.json 时跳过拷贝（userData 内既有配置优先）。
 */
export interface MigrationResult {
  migrated: boolean;
  from: string | null;
  to: string;
  notice: string | null;
}

let lastMigration: MigrationResult | null = null;

export function getMigrationNotice(): string | null {
  return lastMigration?.notice ?? null;
}

export function migrateLegacyDataDir(): MigrationResult {
  const to = CONFIG_DIR;
  const from = LEGACY_CONFIG_DIR;
  const noop = (): MigrationResult => ({ migrated: false, from: null, to, notice: null });
  if (to === from) return noop();
  if (fs.existsSync(MIGRATION_MARKER)) return noop();
  try {
    fs.mkdirSync(to, { recursive: true });
    if (!fs.existsSync(from)) {
      fs.writeFileSync(MIGRATION_MARKER, from); // 无旧目录也写标记，避免每次启动都判
      return noop();
    }
    let copied = false;
    const legacyConfig = path.join(from, 'config.json');
    if (fs.existsSync(legacyConfig) && !fs.existsSync(CONFIG_PATH)) {
      fs.copyFileSync(legacyConfig, CONFIG_PATH);
      copied = true;
    }
    const legacyLog = path.join(from, 'logs.ndjson');
    if (fs.existsSync(legacyLog) && !fs.existsSync(path.join(to, 'logs.ndjson'))) {
      fs.copyFileSync(legacyLog, path.join(to, 'logs.ndjson'));
      copied = true;
    }
    const legacyLogsDir = path.join(from, 'logs');
    if (fs.existsSync(legacyLogsDir) && !fs.existsSync(path.join(to, 'logs'))) {
      fs.cpSync(legacyLogsDir, path.join(to, 'logs'), { recursive: true });
      copied = true;
    }
    fs.writeFileSync(MIGRATION_MARKER, from);
    const notice = copied
      ? `已将旧配置从 ${from} 迁移至 ${to}（旧目录保留，可手动删除）`
      : `检测到旧目录 ${from}，但新目录 ${to} 已有配置，跳过迁移`;
    console.log('[config] ' + notice);
    const res: MigrationResult = { migrated: copied, from, to, notice };
    lastMigration = res;
    return res;
  } catch (e) {
    const notice = `旧目录迁移失败（${String(e)}），配置将在新目录新建`;
    console.warn('[config] ' + notice);
    try {
      fs.mkdirSync(to, { recursive: true });
      fs.writeFileSync(MIGRATION_MARKER, from);
    } catch {
      /* noop */
    }
    const res: MigrationResult = { migrated: false, from, to, notice };
    lastMigration = res;
    return res;
  }
}

// ── 内存态：活跃配置 + 锁定/加密状态 ──
let activeConfig: ProxyConfig = { providers: {} };
let encrypted = false;
let locked = false;
// 加密所用 salt：必须与写入 blob 的 salt 一致，否则解锁时无法重新派生出同一个 key
let cryptoSalt: Buffer | null = null;

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
  migrateLegacyDataDir();
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
  const parsedObj = parsed as Partial<ProxyConfig>;
  activeConfig = {
    providers: parsedObj.providers ?? {},
    proxyToken: parsedObj.proxyToken ?? null,
    proxyTokenEnabled: parsedObj.proxyTokenEnabled ?? false,
    routing: parsedObj.routing,
    budget: parsedObj.budget,
  };
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

// 原子写：先落同目录临时文件，再 rename 替换目标。
// rename 在同一文件系统内是原子操作，可避免写入中途（崩溃 / 并发保存 / 磁盘满）
// 导致 config.json 半截损坏、进而丢失全部厂商 Key 配置。临时文件名带 pid，
// 多进程并发时各自写不同 tmp，最终 rename 先后决定胜者，且不会出现半截文件。
export function atomicWriteJson(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function saveConfig(cfg: ProxyConfig): void {
  activeConfig = cfg;
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (encrypted && hasMasterKey()) {
    const salt = cryptoSalt ?? randomSalt();
    cryptoSalt = salt;
    const blob = encryptWithKey(cfg, getMasterKeySafe(), salt);
    atomicWriteJson(CONFIG_PATH, JSON.stringify(blob, null, 2));
  } else {
    atomicWriteJson(CONFIG_PATH, JSON.stringify(cfg, null, 2));
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
    const salt = Buffer.from(parsed.salt, 'base64');
    // KDF 参数随 blob 持久化：旧配置用旧参数派生，新配置用新参数，互不失效
    const key = deriveKey(password, salt, resolveScryptParams(parsed.kdfParams));
    const cfg = decryptWithKey(parsed, key) as ProxyConfig;
    if (!cfg || typeof cfg !== 'object' || !('providers' in cfg)) throw new Error('格式错误');
    activeConfig = {
      providers: cfg.providers ?? {},
      proxyToken: cfg.proxyToken ?? null,
      proxyTokenEnabled: cfg.proxyTokenEnabled ?? false,
      routing: cfg.routing,
      budget: cfg.budget,
    };
    cryptoSalt = salt;
    setMasterKey(key);
    locked = false;
    return true;
  } catch {
    return false; // 密码错误或数据损坏
  }
}

/** 启用加密：用主密码派生 key，把当前（明文）配置重新以密文落盘。
 *  真正的 salt 由 encryptWithKey 生成并随 blob 持久化，这里只需派生出主密钥本身。 */
export function enableEncryption(password: string): boolean {
  const salt = randomSalt();
  const key = deriveKey(password, salt);
  const prevSalt = cryptoSalt;
  const prevEncrypted = encrypted;
  cryptoSalt = salt;
  setMasterKey(key);
  encrypted = true;
  locked = false;
  try {
    saveConfig(activeConfig);
    return true;
  } catch {
    encrypted = prevEncrypted;
    cryptoSalt = prevSalt;
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
    cryptoSalt = null;
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

// ───────── 代理访问令牌（B4）：默认关闭，设置页开关启用 ─────────
/** 生成 url-safe 代理令牌（32 字节随机，base64url 无填充） */
export function generateProxyToken(): string {
  return randomBytes(24).toString('base64url');
}

/** 读取内存态令牌状态（启用开关 + 明文令牌） */
export function getProxyTokenState(): { enabled: boolean; token: string | null } {
  return {
    enabled: Boolean(activeConfig.proxyTokenEnabled),
    token: activeConfig.proxyToken ?? null,
  };
}

/** 写入令牌明文并原子落盘；锁定态禁止写入（避免覆盖密文） */
export function setProxyToken(token: string | null): ProxyConfig {
  if (locked) return activeConfig;
  activeConfig.proxyToken = token ?? null;
  saveConfig(activeConfig);
  return activeConfig;
}

/** 切换令牌启用开关并原子落盘；锁定态禁止写入 */
export function setProxyTokenEnabled(enabled: boolean): ProxyConfig {
  if (locked) return activeConfig;
  activeConfig.proxyTokenEnabled = enabled;
  saveConfig(activeConfig);
  return activeConfig;
}

// ───────── 预算（D3 日预算 / E1 月度预算） ─────────
/** 读取内存态预算（USD；未设置为 null）与 fail-closed 开关；月度仅用于告警，不参与拦截 */
export function getBudget(): {
  dailyUsd: number | null;
  monthlyUsd: number | null;
  blockOnExceed: boolean;
} {
  return {
    dailyUsd: activeConfig.budget?.dailyUsd ?? null,
    monthlyUsd: activeConfig.budget?.monthlyUsd ?? null,
    blockOnExceed: Boolean(activeConfig.budget?.blockOnExceed),
  };
}

/**
 * 按字段增量写入/清除预算并原子落盘（<=0 或 null 视为清除该字段）。
 * 只改动传入的字段：清日预算不会连带清掉月度预算（反之亦然）；两项都为空则整块删除。
 * blockOnExceed 缺省保持原值。锁定态禁止写入（避免覆盖密文）。
 */
export function setBudget(patch: {
  dailyUsd?: number | null;
  monthlyUsd?: number | null;
  blockOnExceed?: boolean;
}): ProxyConfig {
  if (locked) return activeConfig;
  const next: { dailyUsd?: number; monthlyUsd?: number; blockOnExceed?: boolean } = {
    ...activeConfig.budget,
  };
  for (const key of ['dailyUsd', 'monthlyUsd'] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    if (v == null || v <= 0) delete next[key];
    else next[key] = v;
  }
  if (patch.blockOnExceed !== undefined) next.blockOnExceed = patch.blockOnExceed;
  if (next.dailyUsd === undefined && next.monthlyUsd === undefined) {
    delete activeConfig.budget; // 无任何额度上限时整块移除，配置文件保持干净
  } else {
    activeConfig.budget = next;
  }
  saveConfig(activeConfig);
  return activeConfig;
}

// ───────── B1 模型路由 + fallback 链 ─────────
/** 读取内存态路由配置（未设置为 undefined） */
export function getRouting(): RoutingConfig | undefined {
  return activeConfig.routing;
}

/** 写入/清除路由配置并原子落盘；null 视为清除；调用方需先经 isValidRouting 校验；锁定态禁止写入 */
export function setRouting(routing: RoutingConfig | null): ProxyConfig {
  if (locked) return activeConfig;
  if (routing && routing.default) {
    activeConfig.routing = routing;
  } else {
    delete activeConfig.routing;
  }
  saveConfig(activeConfig);
  return activeConfig;
}

/**
 * B6：聚合「已启用且有 key」厂商的模型，作为 /api/v1/models 的统一目录来源。
 * 应用模型映射的「反向别名」（上游名 → 请求侧名），便于客户端按请求名选用；
 * enabledModels 为空数组 = 全部禁用，undefined = 全部启用，非空 = 子集。
 */
export function listRoutedModels(): { id: string; owned_by: string }[] {
  const data: { id: string; owned_by: string }[] = [];
  const seen = new Set<string>();
  for (const [id, p] of Object.entries(activeConfig.providers)) {
    const isLocal = PROVIDER_BY_ID.get(id)?.kind === 'local';
    if (!p.enabled) continue;
    if (!isLocal && resolveKeyPool(p).length === 0) continue;
    const upstream = p.models ?? [];
    const rev: Record<string, string> = {};
    if (p.modelMapping) for (const [req, up] of Object.entries(p.modelMapping)) rev[up] = req;
    const enabled = p.enabledModels; // undefined = 全部启用；[] = 全部禁用；非空 = 子集
    for (const m of upstream) {
      if (enabled && enabled.length === 0) continue; // 全部禁用
      if (enabled && enabled.length > 0 && !enabled.includes(m)) continue; // 子集
      const display = rev[m] ?? m;
      if (seen.has(display)) continue;
      seen.add(display);
      data.push({ id: display, owned_by: id });
    }
  }
  data.sort((a, b) => a.id.localeCompare(b.id));
  return data;
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
  routing?: RoutingConfig;
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
      models: p.models,
      enabledModels: p.enabledModels,
      retryOn: p.retryOn,
      timeoutMs: p.timeoutMs,
      modelMapping: p.modelMapping,
      maxRps: p.maxRps,
      dailyKeyBudgetUsd: p.dailyKeyBudgetUsd,
      // 只配了多 key 池（apiKey 为空）时也要给出掩码，避免 UI 显示「未配置」
      apiKeyMasked: maskKey(p.apiKey || resolveKeyPool(p)[0] || ''),
      hasKey: Boolean(p.apiKey) || (p.apiKeys?.length ?? 0) > 0,
      apiKeyCount: resolveKeyPool(p).length,
      custom: !KNOWN_IDS.has(id),
      name: KNOWN_IDS.has(id) ? PROVIDER_BY_ID.get(id)!.nameCn : p.customName || id,
    };
  }
  return { providers: out, routing: cfg.routing };
}

export function upsertProvider(id: string, patch: Partial<ProviderConfig>): ProxyConfig {
  if (locked) return activeConfig; // 锁定态禁止写入，避免覆盖密文
  const cfg = activeConfig;
  const prev = cfg.providers[id] ?? { apiKey: '', enabled: true };
  const apiKeys =
    patch.apiKeys !== undefined && patch.apiKeys.length > 0
      ? patch.apiKeys.filter((k) => k && k.trim().length > 0)
      : prev.apiKeys;
  cfg.providers[id] = {
    apiKey: patch.apiKey !== undefined ? patch.apiKey : prev.apiKey,
    apiKeys: apiKeys !== undefined ? apiKeys : prev.apiKeys,
    baseUrl: patch.baseUrl !== undefined ? patch.baseUrl : prev.baseUrl,
    enabled: patch.enabled !== undefined ? patch.enabled : prev.enabled,
    customName: patch.customName !== undefined ? patch.customName : prev.customName,
    authStyle: patch.authStyle !== undefined ? patch.authStyle : prev.authStyle,
    apiFormat: patch.apiFormat !== undefined ? patch.apiFormat : prev.apiFormat,
    models: patch.models !== undefined ? patch.models : prev.models,
    enabledModels: patch.enabledModels !== undefined ? patch.enabledModels : prev.enabledModels,
    retryOn: patch.retryOn !== undefined ? patch.retryOn : prev.retryOn,
    timeoutMs: patch.timeoutMs !== undefined ? patch.timeoutMs : prev.timeoutMs,
    modelMapping: patch.modelMapping !== undefined ? patch.modelMapping : prev.modelMapping,
    maxRps: patch.maxRps !== undefined ? patch.maxRps : prev.maxRps,
    dailyKeyBudgetUsd:
      patch.dailyKeyBudgetUsd !== undefined ? patch.dailyKeyBudgetUsd : prev.dailyKeyBudgetUsd,
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

/**
 * 模型映射合法性：必须是「非空字符串 → 非空字符串」的平面映射。
 * 空值视为未命中（转发时原样透传），因此在入口就拒绝，避免配置里留下无效项。
 */
export function isValidModelMapping(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.entries(v as Record<string, unknown>).every(
    ([k, val]) =>
      k.trim().length > 0 && typeof val === 'string' && (val as string).trim().length > 0,
  );
}

/** 批量导入：与现有配置做浅合并（不传的字段保留原值；传空字符串的 key 视为不修改） */
export function importConfig(partial: {
  providers?: Record<string, Partial<ProviderConfig>>;
}): ProxyConfig {
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
      models: p.models !== undefined ? p.models : prev.models,
      enabledModels: p.enabledModels !== undefined ? p.enabledModels : prev.enabledModels,
      retryOn: p.retryOn !== undefined ? p.retryOn : prev.retryOn,
      timeoutMs: p.timeoutMs !== undefined ? p.timeoutMs : prev.timeoutMs,
      modelMapping: p.modelMapping !== undefined ? p.modelMapping : prev.modelMapping,
      maxRps: p.maxRps !== undefined ? p.maxRps : prev.maxRps,
      dailyKeyBudgetUsd:
        p.dailyKeyBudgetUsd !== undefined ? p.dailyKeyBudgetUsd : prev.dailyKeyBudgetUsd,
    };
  }
  saveConfig(cfg);
  return cfg;
}
