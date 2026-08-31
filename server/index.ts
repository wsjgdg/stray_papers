import express from 'express';
import type { Request, Response } from 'express';
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
import { proxyRouter, unifiedRouter } from './proxy.js';
import { getCacheStats, clearCache } from './responseCache.js';
import { renderMetrics } from './prometheus.js';
import type { Snapshot, ProbeResult } from './types.js';

const BASE_PORT = Number(process.env.API_PORT || 8787);
const SNAPSHOT_TTL = 10 * 60 * 1000;

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

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, now: Date.now(), ttlMs: SNAPSHOT_TTL });
});

app.get('/api/snapshot', async (req: Request, res: Response) => {
  const force = req.query.refresh === '1' || req.query.refresh === 'true';
  if (force) invalidate('snapshot');
  try {
    const { value, cached: hit, fetchedAt, stale } = await cached<Snapshot>(
      'snapshot',
      SNAPSHOT_TTL,
      buildSnapshot,
    );
    res.set('Cache-Control', 'no-store');
    res.json({
      ...value,
      meta: { cached: hit, fetchedAt, stale, ttlMs: SNAPSHOT_TTL, nextAutoRefreshIn: Math.max(0, SNAPSHOT_TTL - (Date.now() - fetchedAt)) },
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

  const results = await Promise.all(targets.map((p) => probeProvider(p, keys[p.id]?.trim() || undefined)));
  res.set('Cache-Control', 'no-store');
  res.json({ checkedAt: Date.now(), results });
});

app.get('/api/providers', (_req: Request, res: Response) => {
  res.json({ providers: PROVIDERS });
});

// ───────── 本地代理：配置 / 指标 / 日志 / 连通性（必须在 proxyRouter 挂载之前） ─────────
app.get('/api/proxy/config', (_req: Request, res: Response) => {
  res.json({ ...maskConfig(loadConfig()), locked: isLocked(), encrypted: isEncrypted(), hasConfig: hasConfigFile() });
});

// 密钥加密状态与解锁
app.get('/api/crypto/status', (_req: Request, res: Response) => {
  res.json(getConfigState());
});

app.post('/api/crypto/unlock', (req: Request, res: Response) => {
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

app.post('/api/crypto/init', (req: Request, res: Response) => {
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

app.post('/api/crypto/disable', (_req: Request, res: Response) => {
  if (!disableEncryption()) {
    res.status(500).json({ error: '关闭加密失败' });
    return;
  }
  res.json(getConfigState());
});

// 响应缓存统计 / 清空
app.get('/api/proxy/cache', (_req: Request, res: Response) => {
  res.json(getCacheStats());
});
app.post('/api/proxy/cache/clear', (_req: Request, res: Response) => {
  res.json({ cleared: clearCache() });
});

app.post('/api/proxy/config', (req: Request, res: Response) => {
  const { providerId, apiKey, apiKeys, baseUrl, enabled, customName, authStyle } = (req.body ?? {}) as {
    providerId?: string;
    apiKey?: string;
    apiKeys?: string[];
    baseUrl?: string;
    enabled?: boolean;
    customName?: string;
    authStyle?: 'bearer' | 'x-api-key' | 'google';
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
  });
  res.json(maskConfig(cfg));
});

app.post('/api/proxy/config/delete', (req: Request, res: Response) => {
  const { providerId } = (req.body ?? {}) as { providerId?: string };
  if (!providerId) {
    res.status(400).json({ error: 'providerId required' });
    return;
  }
  res.json(maskConfig(deleteProvider(providerId)));
});

app.post('/api/proxy/import', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { providers?: Record<string, { apiKey?: string; baseUrl?: string; enabled?: boolean }> };
  if (!body.providers || typeof body.providers !== 'object') {
    res.status(400).json({ error: 'body.providers 必须为对象 { id: { apiKey, baseUrl, enabled } }' });
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

// 用已保存的 key 探测已配置厂商的连通性（自定义厂商无统一探测端点，提示手动验证）
app.post('/api/proxy/connectivity', async (req: Request, res: Response) => {
  const cfg = loadConfig();
  const ids = ((req.body ?? {}) as { providers?: string[] }).providers ?? Object.keys(cfg.providers);
  const results: ProbeResult[] = [];
  for (const id of ids) {
    const entry = cfg.providers[id];
    if (!entry?.apiKey) continue;
    const known = PROVIDER_MAP.get(id);
    if (known) {
      results.push(await probeProvider(known, entry.apiKey));
    } else {
      results.push({
        providerId: id,
        ok: false,
        httpStatus: null,
        latencyMs: null,
        state: 'error',
        modelCount: null,
        message: '自定义厂商：无统一探测端点，请在「试用」页手动验证连接',
        checkedAt: Date.now(),
      });
    }
  }
  res.json({ checkedAt: Date.now(), results });
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
function listenOn(port: number, maxPort: number): void {
  const s = app.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`;
    logStartup(`[api] LLM Workbench API on ${url}`);
    openBrowser(port);
  });
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

logStartup(`[api] 启动中… 基础端口 ${BASE_PORT}`);
initConfigStore();
// 启动速率历史采样（每 2s 一次），供浮窗趋势图展示真实持久化数据
sampleRateHistory();
setInterval(sampleRateHistory, 2000);
(async () => {
  if (await tryReuse(BASE_PORT)) {
    process.exit(0);
  }
  listenOn(BASE_PORT, BASE_PORT + 10);
})();
