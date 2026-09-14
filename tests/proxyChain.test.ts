import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { describe, it, beforeAll, afterAll } from 'vitest';

// 隔离 HOME，避免污染真实 ~/.llm-workbench 配置
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-chain-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const cfg = await import('../server/config.js');
const proxy = await import('../server/proxy.js');
const expressMod = await import('express');

function okBody() {
  return JSON.stringify({
    id: 'chatcmpl-1',
    choices: [{ message: { role: 'assistant', content: 'ok' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

// 真实上游 mock：按 Authorization 区分厂商，返回 500 / 200，并记录收到过的模型名
const upstreamHits: string[] = [];
let failKeyA = false; // 控制 key-a 是否返回 500（fallback 场景切换）
function startUpstream() {
  const app = (expressMod as any).default();
  app.use((expressMod as any).default.json({ limit: '1mb' }));
  app.all('*', (req: any, res: any) => {
    const auth = (req.headers.authorization ?? '') as string;
    upstreamHits.push(`${req.method} ${req.url} auth=${auth} model=${req.body?.model}`);
    if (failKeyA && auth.includes('key-a')) {
      res.status(500).json({ error: 'boom' });
      return;
    }
    res.status(200).json(JSON.parse(okBody()));
  });
  return app.listen(0) as http.Server;
}

function startServer(upstreamBase: string) {
  const app = (expressMod as any).default();
  app.use((expressMod as any).default.json({ limit: '1mb' }));
  app.use('/api/v1', proxy.unifiedRouter);
  return app.listen(0) as http.Server;
}

function call(
  server: http.Server,
  method: string,
  p: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const port = (server.address() as any).port;
  return new Promise((resolve, reject) => {
    const data = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: p,
        method,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
          ...headers,
        },
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
    if (data) req.write(data);
    req.end();
  });
}

describe('unifiedRouter: B1 fallback chain', () => {
  let upstream: http.Server;
  let upstreamPort: number;
  let server: http.Server;

  beforeAll(() => {
    upstream = startUpstream();
    upstreamPort = (upstream.address() as any).port;
    const base = `http://127.0.0.1:${upstreamPort}`;
    server = startServer(base);
    cfg.initConfigStore();
    cfg.upsertProvider('a', { apiKey: 'key-a', enabled: true, baseUrl: base });
    cfg.upsertProvider('b', { apiKey: 'key-b', enabled: true, baseUrl: base });
  });
  afterAll(() => {
    upstream.close();
    server.close();
  });

  it('falls back to next provider on non-retryable 500', async () => {
    failKeyA = true;
    cfg.setRouting({ default: ['a', 'b'] });
    upstreamHits.length = 0;
    const r = await call(server, 'POST', '/api/v1/chat/completions', {
      model: 'gpt-4o',
      stream: false,
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers['x-route-used'], 'b');
    assert.equal(r.headers['x-route-attempts'], '2');
    assert.equal(JSON.parse(r.body).choices[0].message.content, 'ok');
    assert.equal(upstreamHits.filter((h) => h.includes('key-a')).length, 1, 'a 仅尝试一次');
    assert.ok(
      upstreamHits.some((h) => h.includes('key-b')),
      'b 被回退尝试',
    );
  });

  it('explicit x-lb-provider header does NOT fall back', async () => {
    failKeyA = true; // 即便 a 失败，显式头也不应回退
    cfg.setRouting({ default: ['a', 'b'] });
    upstreamHits.length = 0;
    const r = await call(
      server,
      'POST',
      '/api/v1/chat/completions',
      { model: 'gpt-4o', stream: false, messages: [{ role: 'user', content: 'hi' }] },
      { 'x-lb-provider': 'a' },
    );
    assert.equal(r.status, 500);
    assert.equal(r.headers['x-route-used'], 'a');
    assert.equal(r.headers['x-route-attempts'], '1');
  });

  it('vendor/model prefix routes to that provider and strips prefix', async () => {
    failKeyA = false;
    upstreamHits.length = 0;
    const r = await call(server, 'POST', '/api/v1/chat/completions', {
      model: 'a/gpt-4o',
      stream: false,
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers['x-route-used'], 'a');
    assert.ok(
      upstreamHits.some((h) => h.includes('model=gpt-4o')),
      '上游收到去掉前缀的模型名 gpt-4o',
    );
    assert.ok(!upstreamHits.some((h) => h.includes('a/gpt-4o')), '上游不应收到带前缀的模型名');
  });

  it('no route / no provider => 400 with guidance', async () => {
    failKeyA = false;
    cfg.setRouting(null);
    upstreamHits.length = 0;
    const r = await call(server, 'POST', '/api/v1/chat/completions', {
      model: 'unknown-model',
      stream: false,
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(r.status, 400);
    assert.ok(JSON.parse(r.body).error.includes('x-lb-provider'));
  });
});
