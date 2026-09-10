import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { exec } from 'node:child_process';
import { buildSnapshot } from './aggregate.js';
import { cached, invalidate } from './cache.js';
import { probeProvider } from './probe.js';
import { PROVIDERS } from './providers.js';
const PROVIDER_MAP = new Map(PROVIDERS.map((p) => [p.id, p]));
import { WEB_ASSETS, WEB_ENTRY } from './generated/webAssets.js';
import {
  loadConfig,
  maskConfig,
  upsertProvider,
  deleteProvider,
  importConfig,
  initConfigStore,
  isLocked,
  isEncrypted,
  hasConfigFile,
  unlock,
  enableEncryption,
  disableEncryption,
  getConfigState,
  resolveKeyPool,
  getProxyTokenState,
  setProxyToken,
  setProxyTokenEnabled,
  generateProxyToken,
} from './config.js';
import { getMetrics, getLogs, getSummary, sampleRateHistory } from './metrics.js';
import {
  loadProfiles,
  listProfiles,
  getAdminProfile,
  ensureAdminProfile,
  createProfile,
  deleteProfile,
  authenticate,
  getSession,
  clearSession,
  isAdmin,
} from './auth.js';
import { proxyRouter, unifiedRouter, buildAuthHeaders, listProviderModels } from './proxy.js';
import { getCacheStats, clearCache } from './responseCache.js';
import { renderMetrics } from './prometheus.js';
import { timingSafeEqualStr } from './crypto.js';
import { getKeyHealth, listDeadKeys, recordSuccess, clearExpired } from './keyHealth.js';
import type { Snapshot, ProbeResult, ProviderKeyHealth } from './types.js';

const BASE_PORT = Number(process.env.API_PORT || 8787);
const SNAPSHOT_TTL = 10 * 60 * 1000;

// 代理访问令牌（B4）：默认关闭，保持单机零配置体验；设置页开关启用。
// 环境变量优先级最高：PROXY_TOKEN=off 强制关闭（逃生开关），PROXY_TOKEN=<值> 强制启用该值。
const ENV_PROXY_TOKEN = (process.env.PROXY_TOKEN ?? '').trim();

// 解析生效的令牌要求（每次请求实时解析，支持运行时开关/重置）：
// 1) 显式 PROXY_TOKEN=off → 关闭（覆盖一切配置）
// 2) 环境变量 PROXY_TOKEN=非空 → 使用该值作为令牌（强制开启）
// 3) 否则回退配置：proxyTokenEnabled && proxyToken 时要求令牌
function resolveProxyTokenRequirement(): { required: boolean; token: string } {
  if (ENV_PROXY_TOKEN === 'off') return { required: false, token: '' };
  if (ENV_PROXY_TOKEN) return { required: true, token: ENV_PROXY_TOKEN };
  const st = getProxyTokenState();
  if (st.enabled && st.token) return { required: true, token: st.token };
  return { required: false, token: '' };
}

function requireProxyToken(req: Request, res: Response, next: NextFunction): void {
  const { required, token } = resolveProxyTokenRequirement();
  if (!required) {
    next();
    return;
  }
  const auth = req.headers.authorization ?? '';
  const provided =
    (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '') ||
    ((req.headers['x-proxy-token'] as string) ?? '');
  if (!timingSafeEqualStr(provided, token)) {
    res.status(401).json({
      error: '缺少或错误的代理令牌（Authorization: Bearer <token> 或 x-proxy-token 头）',
    });
    return;
  }
  next();
}

// 启动日志同时写入 %TEMP%/llm-workbench.log，便于双击闪退时排查（窗口一闪即逝看不到错误）
function logStartup(line: string): void {
  const text = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'llm-workbench.log'), text);
  } catch {
    /* 忽略写入失败 */
  }
  console.log(line);
}

const app = express();
// 代理需要转发较大的请求体（长 prompt），放宽到 20mb
app.use(express.json({ limit: '20mb' }));

// RBAC：仅当存在「非管理员」档案（真正多人协作）时才强制管理员会话；
// 单机所有者（仅一个管理员档案、无其它用户）本地使用无需登录即可保存配置。
function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  const hasNonAdmin = listProfiles().some((p) => p.role !== 'admin');
  if (!hasNonAdmin) {
    next();
    return;
  }
  if (!isAdmin()) {
    res.status(401).json({ error: '需要管理员登录' });
    return;
  }
  next();
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, now: Date.now(), ttlMs: SNAPSHOT_TTL });
});

app.get('/api/snapshot', async (req: Request, res: Response) => {
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  if (force) invalidate('snapshot');
  try {
    const {
      value,
      cached: hit,
      fetchedAt,
      stale,
    } = await cached<Snapshot>('snapshot', SNAPSHOT_TTL, buildSnapshot);
    res.set('Cache-Control', 'no-store');
    res.json({
      ...value,
      meta: {
        cached: hit,
        fetchedAt,
        stale,
        ttlMs: SNAPSHOT_TTL,
        nextAutoRefreshIn: Math.max(0, SNAPSHOT_TTL - (Date.now() - fetchedAt)),
      },
    });
  } catch (err) {
    res.status(502).json({ error: String((err as Error)?.message ?? err) });
  }
});

interface ProbeBody {
  providers?: string[];
  apiKeys?: Record<string, string>;
}

app.post('/api/probe', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as ProbeBody;
  const ids = body.providers?.length ? body.providers : PROVIDERS.map((p) => p.id);
  const targets = PROVIDERS.filter((p) => ids.includes(p.id));
  const keys = body.apiKeys ?? {};

  const results = await Promise.all(
    targets.map((p) => probeProvider(p, keys[p.id]?.trim() || undefined)),
  );
  res.set('Cache-Control', 'no-store');
  res.json({ checkedAt: Date.now(), results });
});

app.get('/api/providers', (_req: Request, res: Response) => {
  res.json({ providers: PROVIDERS });
});

// ───────── 代理访问令牌（B4）：公开管理面，注册在 requireProxyToken 之前以免自锁 ─────────
// 返回状态（不要求令牌本身），供前端判断是否显示提示并自动注入
app.get('/api/proxy/token', (_req: Request, res: Response) => {
  const { required } = resolveProxyTokenRequirement();
  const st = getProxyTokenState();
  res.json({
    enabled: st.enabled,
    required,
    tokenMasked: st.token ? `****${st.token.slice(-4)}` : '',
    envOverridden: ENV_PROXY_TOKEN !== '',
  });
});

// 启用 / 禁用 / 重置令牌（默认单机所有者免登录；多用户时需管理员会话）
app.post('/api/proxy/token', requireAdmin, (req: Request, res: Response) => {
  const { action } = (req.body ?? {}) as { action?: string };
  const st = getProxyTokenState();
  let token = st.token ?? '';
  let enabled = st.enabled;
  if (action === 'enable') {
    enabled = true;
    if (!token) token = generateProxyToken();
  } else if (action === 'disable') {
    enabled = false;
  } else if (action === 'reset' || action === 'generate') {
    token = generateProxyToken();
    enabled = true;
  } else {
    res.status(400).json({ error: 'action 必须为 enable | disable | reset 之一' });
    return;
  }
  setProxyToken(token);
  setProxyTokenEnabled(enabled);
  res.json({
    enabled,
    required: enabled && !!token,
    token: enabled ? token : '', // 仅在启用/重置时回显明文，供前端存储与用户复制
    tokenMasked: enabled ? `****${token.slice(-4)}` : '',
    envOverridden: ENV_PROXY_TOKEN !== '',
  });
});

// 令牌校验必须挂在 /api/proxy 的所有子路由之前（含 config / models / 转发）
app.use('/api/proxy', requireProxyToken);
app.use('/api/v1', requireProxyToken);

// ───────── 本地代理：配置 / 指标 / 日志 / 连通性（必须在 proxyRouter 挂载之前） ─────────
app.get('/api/proxy/config', (_req: Request, res: Response) => {
  res.json({
    ...maskConfig(loadConfig()),
    locked: isLocked(),
    encrypted: isEncrypted(),
    hasConfig: hasConfigFile(),
  });
});

// 密钥加密状态与解锁
app.get('/api/crypto/status', (_req: Request, res: Response) => {
  res.json(getConfigState());
});

app.post('/api/crypto/unlock', requireAdmin, (req: Request, res: Response) => {
  const { password } = (req.body ?? {}) as { password?: string };
  if (!password) {
    res.status(400).json({ error: 'password required' });
    return;
  }
  if (!unlock(password)) {
    res.status(401).json({ error: '密码错误' });
    return;
  }
  res.json(getConfigState());
});

app.post('/api/crypto/init', requireAdmin, (req: Request, res: Response) => {
  const { password } = (req.body ?? {}) as { password?: string };
  if (!password) {
    res.status(400).json({ error: 'password required' });
    return;
  }
  if (isEncrypted() && !isLocked()) {
    res.status(400).json({ error: '已启用加密，无需重复初始化' });
    return;
  }
  if (!enableEncryption(password)) {
    res.status(500).json({ error: '启用加密失败' });
    return;
  }
  res.json(getConfigState());
});

app.post('/api/crypto/disable', requireAdmin, (_req: Request, res: Response) => {
  if (!disableEncryption()) {
    res.status(500).json({ error: '关闭加密失败' });
    return;
  }
  res.json(getConfigState());
});

// ───────── 本地多档案 + RBAC 认证接口 ─────────
app.get('/api/auth/session', (_req: Request, res: Response) => {
  res.json({ session: getSession() });
});

app.get('/api/auth/profiles', (_req: Request, res: Response) => {
  res.json({ profiles: listProfiles() });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { profileId, password } = (req.body ?? {}) as { profileId?: string; password?: string };
  if (!profileId || !password) {
    res.status(400).json({ error: 'profileId 与 password 必填' });
    return;
  }
  const role = authenticate(profileId, password);
  if (!role) {
    res.status(401).json({ error: '档案或密码错误' });
    return;
  }
  res.json({ role, session: getSession() });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  clearSession();
  res.json({ ok: true });
});

app.post('/api/auth/setup', (req: Request, res: Response) => {
  const { password } = (req.body ?? {}) as { password?: string };
  if (!password) {
    res.status(400).json({ error: 'password required' });
    return;
  }
  if (getAdminProfile()) {
    res.status(409).json({ error: '管理员已存在' });
    return;
  }
  ensureAdminProfile(password);
  res.json({ ok: true });
});

app.post('/api/auth/profile', requireAdmin, (req: Request, res: Response) => {
  const { name, role, password } = (req.body ?? {}) as {
    name?: string;
    role?: 'admin' | 'viewer';
    password?: string;
  };
  if (!name || !role || !password) {
    res.status(400).json({ error: 'name / role / password 必填' });
    return;
  }
  const r = createProfile(name, role, password);
  if ('error' in r) {
    res.status(400).json(r);
    return;
  }
  res.json(r);
});

app.delete('/api/auth/profile/:id', requireAdmin, (req: Request, res: Response) => {
  const r = deleteProfile(req.params.id);
  if ('error' in r) {
    res.status(400).json(r);
    return;
  }
  res.json(r);
});

// 响应缓存统计 / 清空
app.get('/api/proxy/cache', (_req: Request, res: Response) => {
  res.json(getCacheStats());
});
app.post('/api/proxy/cache/clear', requireAdmin, (_req: Request, res: Response) => {
  res.json({ cleared: clearCache() });
});

app.post('/api/proxy/config', requireAdmin, (req: Request, res: Response) => {
  const {
    providerId,
    apiKey,
    apiKeys,
    baseUrl,
    enabled,
    customName,
    authStyle,
    apiFormat,
    models,
    enabledModels,
  } = (req.body ?? {}) as {
    providerId?: string;
    apiKey?: string;
    apiKeys?: string[];
    baseUrl?: string;
    enabled?: boolean;
    customName?: string;
    authStyle?: 'bearer' | 'x-api-key' | 'google';
    apiFormat?: 'openai' | 'anthropic' | 'gemini';
    models?: string[];
    enabledModels?: string[];
  };
  if (!providerId) {
    res.status(400).json({ error: 'providerId required' });
    return;
  }
  const cfg = upsertProvider(providerId, {
    apiKey,
    apiKeys: Array.isArray(apiKeys) ? apiKeys : undefined,
    baseUrl,
    enabled,
    customName,
    authStyle,
    apiFormat,
    models: Array.isArray(models) ? models : undefined,
    enabledModels: Array.isArray(enabledModels) ? enabledModels : undefined,
  });
  res.json(maskConfig(cfg));
});

app.post('/api/proxy/config/delete', requireAdmin, (req: Request, res: Response) => {
  const { providerId } = (req.body ?? {}) as { providerId?: string };
  if (!providerId) {
    res.status(400).json({ error: 'providerId required' });
    return;
  }
  res.json(maskConfig(deleteProvider(providerId)));
});

app.post('/api/proxy/import', requireAdmin, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    providers?: Record<
      string,
      {
        apiKey?: string;
        baseUrl?: string;
        enabled?: boolean;
        models?: string[];
        enabledModels?: string[];
      }
    >;
  };
  if (!body.providers || typeof body.providers !== 'object') {
    res
      .status(400)
      .json({ error: 'body.providers 必须为对象 { id: { apiKey, baseUrl, enabled } }' });
    return;
  }
  res.json(maskConfig(importConfig(body)));
});

app.get('/api/proxy/metrics', (_req: Request, res: Response) => {
  res.json({ metrics: getMetrics() });
});

// 浮窗汇总：全局速率 + 当日 token/成本 + 最近模型
app.get('/api/proxy/metrics/summary', (_req: Request, res: Response) => {
  res.json(getSummary());
});

// 聚合端点：metrics + cache + summary 一次返回，前端单一定时器轮询
app.get('/api/proxy/overview', (_req: Request, res: Response) => {
  res.json({ metrics: getMetrics(), cache: getCacheStats(), summary: getSummary() });
});

// Prometheus 指标导出（Grafana / scrape 用）
app.get('/metrics', (_req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(renderMetrics());
});

app.get('/api/proxy/logs', (req: Request, res: Response) => {
  const provider = req.query.provider as string | undefined;
  const status = req.query.status as 'ok' | 'error' | undefined;
  const limit = Number(req.query.limit ?? 200);
  res.json({ logs: getLogs({ provider, status, limit: Number.isFinite(limit) ? limit : 200 }) });
});

// 用已保存的 key 探测已配置厂商的连通性：
// 已知厂商走统一探测端点；自定义厂商直接探测其 baseUrl 的 /models（OpenAI 兼容约定）
app.post('/api/proxy/connectivity', async (req: Request, res: Response) => {
  const cfg = loadConfig();
  const ids =
    ((req.body ?? {}) as { providers?: string[] }).providers ?? Object.keys(cfg.providers);
  const results: ProbeResult[] = [];
  for (const id of ids) {
    const entry = cfg.providers[id];
    const known = PROVIDER_MAP.get(id);
    if (known) {
      if (!entry?.apiKey) {
        results.push({
          providerId: id,
          ok: false,
          httpStatus: null,
          latencyMs: null,
          state: 'error',
          modelCount: null,
          message: '未配置 API Key',
          checkedAt: Date.now(),
        });
        continue;
      }
      results.push(await probeProvider(known, entry.apiKey));
      continue;
    }
    if (!entry) {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: null,
        state: 'error',
        modelCount: null,
        message: '未找到该厂商配置',
        checkedAt: Date.now(),
      });
      continue;
    }
    // 自定义厂商：探测 baseUrl 的 /models 端点
    const baseUrl = entry.baseUrl;
    if (!baseUrl) {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: null,
        state: 'error',
        modelCount: null,
        message: '未配置 baseUrl（API 地址）',
        checkedAt: Date.now(),
      });
      continue;
    }
    if (!entry.apiKey) {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: null,
        state: 'error',
        modelCount: null,
        message: '未配置 API Key',
        checkedAt: Date.now(),
      });
      continue;
    }
    const t0 = Date.now();
    try {
      const modelsUrl = `${baseUrl.replace(/\/+$/, '')}/models`;
      const r = await fetch(modelsUrl, {
        headers: buildAuthHeaders(entry.authStyle ?? 'bearer', entry.apiKey),
        signal: AbortSignal.timeout(15000),
      });
      const ms = Date.now() - t0;
      results.push({
        providerId: id,
        ok: r.ok,
        httpStatus: r.status,
        latencyMs: ms,
        state: r.ok ? 'ok' : r.status === 401 || r.status === 403 ? 'auth-required' : 'error',
        modelCount: null,
        message: r.ok ? '连接正常（baseUrl 可达，鉴权通过）' : `HTTP ${r.status}`,
        checkedAt: Date.now(),
      });
    } catch (e) {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: Date.now() - t0,
        state: 'unreachable',
        modelCount: null,
        message: `无法连接: ${String((e as Error)?.message ?? e).slice(0, 140)}`,
        checkedAt: Date.now(),
      });
    }
  }
  res.json({ checkedAt: Date.now(), results });
});

// ───────── Key 健康度（B3：冷却 / 坏 Key 追踪） ─────────
// 只读：返回各厂商所有 Key 的冷却 / 坏 Key 状态
app.get('/api/proxy/key-health', (_req: Request, res: Response) => {
  const cfg = loadConfig();
  const providers: ProviderKeyHealth[] = [];
  for (const [providerId, entry] of Object.entries(cfg.providers)) {
    const pool = resolveKeyPool(entry);
    if (pool.length === 0) continue;
    providers.push({ providerId, keys: getKeyHealth(providerId, pool) });
  }
  res.json({ now: Date.now(), providers });
});

// 手动触发坏 Key 复活探测（需管理员；默认单机所有者免登录）
app.post('/api/proxy/key-health/probe', requireAdmin, async (_req: Request, res: Response) => {
  try {
    await reviveDeadKeys();
    res.json({ ok: true, revivedAt: Date.now() });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
});

// 周期性对坏 Key 做探测，探测通过（state==='ok'）即复活；随后清理过期健康条目
async function reviveDeadKeys(): Promise<void> {
  const dead = listDeadKeys();
  for (const { providerId, key } of dead) {
    const provider = PROVIDER_MAP.get(providerId);
    if (!provider) continue;
    try {
      const r = await probeProvider(provider, key);
      if (r.state === 'ok') recordSuccess(providerId, key);
    } catch {
      /* 探测失败则保持坏 Key 状态 */
    }
  }
}

// 自动获取某厂商模型清单（须在 proxyRouter 之前注册，否则会被通配路由捕获）
app.get('/api/proxy/:provider/models', async (req: Request, res: Response) => {
  const providerId = req.params.provider;
  try {
    const models = await listProviderModels(providerId);
    res.json({ models });
  } catch (e) {
    res.status(502).json({ error: String((e as Error)?.message ?? e) });
  }
});

// 通用反向代理：/api/proxy/:provider/<path> → provider.apiBase/<path>
app.use('/api/proxy', proxyRouter);

// 统一 OpenAI 兼容端点：/api/v1/<path>，厂商由请求头或模型名前缀决定
app.use('/api/v1', unifiedRouter);

// 生产模式：托管前端构建产物
// 优先级：WEB_DIR 环境变量（须真实存在 index.html）> 内嵌资源（pkg / 打包 Electron，写入临时目录）> 开发态 dist/
function resolveWebDir(): string {
  const envDir = process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : '';
  if (envDir) {
    // WEB_DIR 指向的目录必须真实含有 index.html；否则视为无效（如打包态指向不存在的
    // resources/app/dist），回退到内嵌/开发态资源，避免主窗口加载 404 黑屏。
    if (fs.existsSync(path.join(envDir, 'index.html'))) return envDir;
    console.warn(`[web] WEB_DIR 无 index.html，回退内嵌/开发态资源: ${envDir}`);
  }
  const versions = process.versions as Record<string, string | undefined>;
  const embedded =
    Boolean((process as { pkg?: unknown }).pkg) ||
    process.env.USE_EMBED === '1' ||
    Boolean(versions.electron); // Electron 主进程内运行的 server.cjs
  if (embedded && Object.keys(WEB_ASSETS).length > 0) {
    const dir = path.join(os.tmpdir(), 'llm-workbench-web');
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, b64] of Object.entries(WEB_ASSETS)) {
      const fp = path.join(dir, rel);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
    }
    return dir;
  }
  // 开发/普通 node 运行：从 cwd 或其上一级找 dist（不依赖 import.meta.url，兼容 CJS 打包）
  const candidates = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), '..', 'dist'),
    path.resolve(process.cwd(), 'llm-workbench', 'dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return candidates[0];
}

const dist = resolveWebDir();
app.use(express.static(dist));
app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(dist, WEB_ENTRY), (err) => {
    if (err) res.status(404).send('Frontend not built. Run: npm run build');
  });
});

// 若同端口已有实例在跑，则直接复用（打开浏览器）而非再起一个 → 避免重复占用/闪退
async function tryReuse(basePort: number): Promise<boolean> {
  if (process.env.NO_OPEN || process.env.NO_REUSE) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const r = await fetch(`http://127.0.0.1:${basePort}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (r.ok) {
      const url = `http://127.0.0.1:${basePort}`;
      logStartup(`[api] 已有实例运行于 ${url}，直接打开浏览器`);
      exec(process.platform === 'win32' ? `cmd /c start "" "${url}"` : `open "${url}"`);
      return true;
    }
  } catch {
    /* 端口无服务，需新启动 */
  }
  return false;
}

function openBrowser(port: number): void {
  if (process.env.NO_OPEN) return;
  const url = `http://127.0.0.1:${port}`;
  const cmd = process.platform === 'win32' ? `cmd /c start "" "${url}"` : `open "${url}"`;
  exec(cmd, (err) => {
    if (err) logStartup(`[api] 自动打开浏览器失败（请手动访问）: ${url}`);
  });
}

// 自动选端口：从 BASE_PORT 起，被占用则顺延（最多 +10），彻底避免 EADDRINUSE 闪退
let httpServer: ReturnType<typeof app.listen> | null = null;
let actualPort: number | null = null;
function listenOn(port: number, maxPort: number): void {
  const s = app.listen(port, '127.0.0.1', () => {
    actualPort = port;
    const url = `http://127.0.0.1:${port}`;
    logStartup(`[api] LLM Workbench API on ${url}`);
    openBrowser(port);
  });
  httpServer = s;
  s.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && port < maxPort) {
      logStartup(`[api] 端口 ${port} 被占用，尝试 ${port + 1}`);
      s.close();
      listenOn(port + 1, maxPort);
    } else {
      logStartup(`[api] 启动失败: ${err.message}`);
      // 保留窗口 6 秒，便于看到错误（双击场景下窗口会一闪而过）
      setTimeout(() => process.exit(1), 6000);
    }
  });
}

let rateTimer: ReturnType<typeof setInterval> | null = null;
let reviveTimer: ReturnType<typeof setInterval> | null = null;

// 启动入口：封装为可导出函数，便于被 Electron 主进程直接调用复用全部后端逻辑；
// 仅在「直接运行」时才自启（tsx server/index.ts / node server.cjs / pkg 打包的 server.bundle.cjs）。
export function startServer(): void {
  logStartup(`[api] 启动中… 基础端口 ${BASE_PORT}`);
  initConfigStore();
  loadProfiles();
  // 启动速率历史采样（每 2s 一次），供浮窗趋势图展示真实持久化数据
  sampleRateHistory();
  rateTimer = setInterval(sampleRateHistory, 2000);
  // B3：坏 Key 复活巡检（启动先探一次，之后每 60s 探一次并清理过期健康条目）
  void reviveDeadKeys().finally(clearExpired);
  reviveTimer = setInterval(() => {
    void reviveDeadKeys().finally(clearExpired);
  }, 60_000);
  installShutdownHandlers();
  (async () => {
    if (await tryReuse(BASE_PORT)) {
      // 复用已有实例：保持窗口短暂可见，明确告知是「已在浏览器打开」而非崩溃闪退
      logStartup(
        `[api] 应用已在浏览器打开（http://127.0.0.1:${BASE_PORT}）。本窗口 2 秒后自动关闭。`,
      );
      setTimeout(() => process.exit(0), 2000);
      return;
    }
    listenOn(BASE_PORT, BASE_PORT + 10);
  })();
}

/** 返回实际监听端口（被占用顺延后得到）；Electron 主进程据此建窗，避免打到别的实例 */
export function getServerPort(): number | null {
  return actualPort;
}

/** 优雅退出：停掉采样定时器并关闭监听；Electron 可在 will-quit 中调用 */
export function stopServer(): void {
  if (rateTimer) {
    clearInterval(rateTimer);
    rateTimer = null;
  }
  if (reviveTimer) {
    clearInterval(reviveTimer);
    reviveTimer = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

let shutdownInstalled = false;
function installShutdownHandlers(): void {
  if (shutdownInstalled) return;
  shutdownInstalled = true;
  const onSignal = (sig: string) => {
    logStartup(`[api] 收到 ${sig}，正在退出…`);
    stopServer();
    setTimeout(() => process.exit(0), 200).unref();
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGHUP', () => onSignal('SIGHUP'));
}

function isRunDirectly(): boolean {
  const entry = process.argv[1] || '';
  return (
    entry.endsWith('index.ts') ||
    entry.endsWith('index.js') ||
    entry.endsWith('index.cjs') ||
    entry.endsWith('server.cjs') ||
    entry.endsWith('server.js') ||
    entry.endsWith('server.bundle.cjs')
  );
}

if (isRunDirectly()) {
  startServer();
}
