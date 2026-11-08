import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { describe, it, beforeAll, afterAll } from 'vitest';

// 隔离 HOME，避免污染真实 ~/.llm-workbench 配置
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-quota-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const cfg = await import('../server/config.js');
const proxy = await import('../server/proxy.js');
const metrics = await import('../server/metrics.js');
const kb = await import('../server/keyBudget.js');
const rl = await import('../server/rateLimit.js');
const expressMod = await import('express');
const express = (expressMod as any).default;

function okBody() {
  return JSON.stringify({
    id: 'chatcmpl-1',
    choices: [{ message: { role: 'assistant', content: 'ok' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

function startUpstream() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((_req: any, res: any) => res.status(200).json(JSON.parse(okBody())));
  return app.listen(0) as http.Server;
}

function startServer(base: string) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/proxy', proxy.proxyRouter); // 单厂商路由：proxyRequest(chain=false)，会写 429 + Retry-After
  return app.listen(0) as http.Server;
}

function post(
  server: http.Server,
  p: string,
  body: unknown,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const port = (server.address() as any).port;
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: p,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: chunks }),
        );
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const REQ = { model: 'gpt-4o', stream: false, messages: [{ role: 'user', content: 'hi' }] };

describe('proxy: B3 quota', () => {
  let upstream: http.Server;
  let server: http.Server;
  let base: string;

  beforeAll(() => {
    upstream = startUpstream();
    base = `http://127.0.0.1:${(upstream.address() as any).port}`;
    server = startServer(base);
    cfg.initConfigStore();
    kb.resetKeyBudget();
    rl.resetRateLimits();
  });
  afterAll(() => {
    upstream.close();
    server.close();
  });

  it('超过 maxRps 的突发请求返回 429 + Retry-After', async () => {
    cfg.upsertProvider('rl', { apiKey: 'key-rl', enabled: true, baseUrl: base, maxRps: 1 });
    rl.resetRateLimits();
    // 两发 body 不同 → 缓存键不同，确保都真正打上游（限流在缓存之后生效）
    const r1 = await post(server, '/api/proxy/rl/chat/completions', {
      ...REQ,
      messages: [{ role: 'user', content: 'hi-1' }],
    });
    assert.equal(r1.status, 200, '突发第一发应通过');
    const r2 = await post(server, '/api/proxy/rl/chat/completions', {
      ...REQ,
      messages: [{ role: 'user', content: 'hi-2' }],
    });
    assert.equal(r2.status, 429, '突发第二发应被限流');
    assert.ok(r2.headers['retry-after'], '应带 Retry-After 头');
    assert.ok(JSON.parse(r2.body).error.includes('速率上限'));
  });

  it('单 Key 达当日成本上限后返回 429（成本上限）', async () => {
    cfg.upsertProvider('budgeted', {
      apiKey: 'key-bud',
      enabled: true,
      baseUrl: base,
      dailyKeyBudgetUsd: 1,
    });
    // 直接把该 Key 的当日成本预置到超限（不依赖真实计价）
    const mask = metrics.maskKey('key-bud')!;
    kb.addKeySpend('budgeted', mask, 5);
    const r = await post(server, '/api/proxy/budgeted/chat/completions', REQ);
    assert.equal(r.status, 429);
    assert.ok(JSON.parse(r.body).error.includes('成本上限'));
  });
});
