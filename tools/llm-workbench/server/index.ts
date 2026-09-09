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
import type { Snapshot, ProbeResult } from './types.js';

const BASE_PORT = Number(process.env.API_PORT || 8787);
const SNAPSHOT_TTL = 10 * 60 * 1000;

// 可选代理令牌：默认不启用（保持单机零配置体验）。
// 设置 PROXY_TOKEN 后，/api/v1 与 /api/proxy/* 必须携带该令牌，防止本机其它进程白嫖已配置的 key。
const PROXY_TOKEN = (process.env.PROXY_TOKEN ?? '').trim();

function requireProxyToken(req: Request, res: Response, next: NextFunction): void {
  if (!PROXY_TOKEN) {
    next();
    return;
  }
  const auth = req.headers.authorization ?? '';
  const provided =
    (auth.startsWith('Bearer ') ? auth.slice(7) : '') ||
    ((req.headers['x-proxy-token'] as string) ?? '');
  if (!timingSafeEqualStr(provided, PROXY_TOKEN)) {
    res.status(401).json({ error: '缺少或错误的代理令牌（Authorization: Bearer <PROXY_TOKEN>）' });
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
// 优先级：WEB_DIR 环境变量 > 内嵌资源（打包 exe，写入临时目录） > 开发态 dist/
function resolveWebDir(): string {
  if (process.env.WEB_DIR) return path.resolve(process.env.WEB_DIR);
  const embedded = Boolean((process as { pkg?: unknown }).pkg) || process.env.USE_EMBED === '1';
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
function listenOn(port: number, maxPort: number): void {
  const s = app.listen(port, '127.0.0.1', () => {
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

// 启动入口：封装为可导出函数，便于被 Electron 主进程直接调用复用全部后端逻辑；
// 仅在「直接运行」时才自启（tsx server/index.ts / node server.cjs / pkg 打包的 server.bundle.cjs）。
export function startServer(): void {
  logStartup(`[api] 启动中… 基础端口 ${BASE_PORT}`);
  initConfigStore();
  loadProfiles();
  // 启动速率历史采样（每 2s 一次），供浮窗趋势图展示真实持久化数据
  sampleRateHistory();
  rateTimer = setInterval(sampleRateHistory, 2000);
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

/** 优雅退出：停掉采样定时器并关闭监听；Electron 可在 will-quit 中调用 */
export function stopServer(): void {
  if (rateTimer) {
    clearInterval(rateTimer);
    rateTimer = null;
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
