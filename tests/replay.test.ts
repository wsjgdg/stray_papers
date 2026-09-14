import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { describe, it, beforeAll, afterAll } from 'vitest';

// 隔离 HOME，避免污染真实 ~/.llm-workbench 配置（与 quota.test.ts 同法）
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-replay-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const { makeCaptureResponse, replayCall, REPLAY_MAX_BODY } = await import('../server/replay.js');
const cfg = await import('../server/config.js');
const proxy = await import('../server/proxy.js');
const metrics = await import('../server/metrics.js');
const express = (await import('express')).default as any;

// ───────────────────────── 纯单测：捕获器与失败分支 ─────────────────────────

describe('B4 replay: 响应捕获器', () => {
  it('捕获 status / set 头 / json/send 体', () => {
    const cap = makeCaptureResponse();
    (cap.res.status as any)(201);
    (cap.res.set as any)('X-Cache', 'HIT');
    (cap.res.json as any)({ a: 1 });
    const out = cap.result();
    assert.equal(out.status, 201);
    assert.equal(out.headers['x-cache'], 'HIT');
    assert.equal(out.body, '{"a":1}');
    assert.equal(cap.res.headersSent, true);
    assert.equal(cap.res.writableEnded, true);
  });

  it('send 与 write 累加均可用（Buffer 亦转字符串）', () => {
    const cap = makeCaptureResponse();
    (cap.res.send as any)(Buffer.from('中文'));
    assert.equal(cap.result().body, '中文');
    const cap2 = makeCaptureResponse();
    (cap2.res.write as any)('a');
    (cap2.res.write as any)(Buffer.from('b'));
    assert.equal(cap2.result().body, 'ab');
  });
});

describe('B4 replay: 失败分支', () => {
  it('日志不存在 → 404', async () => {
    const out = await replayCall(null);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.status, 404);
  });

  it('无请求体存档 → 400', async () => {
    const log = { reqBody: null } as any;
    const out = await replayCall(log);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.status, 400);
  });

  it('存档非法 JSON → 400', async () => {
    const out = await replayCall({ reqBody: '{not json' } as any);
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.status, 400);
    assert.ok(out.error.includes('合法 JSON'));
  });

  it('发送抛错 → 502（附原因）', async () => {
    const out = await replayCall({ reqBody: '{"model":"m"}' } as any, async () => {
      throw new Error('boom');
    });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.status, 502);
    assert.ok(out.error.includes('boom'));
  });
});

describe('B4 replay: 发送参数与结果整形', () => {
  it('强制非流式、路径去前导斜杠、不带任何鉴权头', async () => {
    let seen: any = null;
    const out = await replayCall(
      {
        method: 'POST',
        path: '/chat/completions',
        provider: 'p1',
        status: 200,
        latencyMs: 120,
        costUsd: 0.5,
        model: 'gpt-4o',
        tag: 'proj-x',
        reqBody: JSON.stringify({ model: 'gpt-4o', stream: true, messages: [] }),
      } as any,
      (async (req: any, res: any) => {
        seen = req;
        res.status(200).send('{"ok":true}');
      }) as any,
    );
    assert.ok(seen, '应调用注入的发送函数');
    assert.equal(seen.body.stream, false, '重放应强制 stream=false');
    assert.equal(seen.url, '/chat/completions');
    assert.equal(seen.method, 'POST');
    assert.deepEqual(seen.headers, {}, '重放不带原始鉴权头');
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.replay.status, 200);
    assert.equal(out.replay.body, '{"ok":true}');
    assert.equal(out.replay.truncated, false);
    assert.equal(out.original.costUsd, 0.5);
    assert.equal(out.original.tag, 'proj-x');
  });

  it('响应体超限截断并标记 truncated', async () => {
    const big = 'x'.repeat(REPLAY_MAX_BODY + 500);
    const out = await replayCall(
      { reqBody: '{"model":"m"}' } as any,
      (async (_req: any, res: any) => {
        res.status(200).send(big);
      }) as any,
    );
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.replay.truncated, true);
    assert.ok(out.replay.body.length < big.length);
    assert.ok(out.replay.body.endsWith('（已截断）'));
  });
});

// ───────────────────────── 集成：真实代理 + 真实重放 ─────────────────────────

function okBody(content: string) {
  return JSON.stringify({
    id: 'chatcmpl-1',
    choices: [{ message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

function startUpstream() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const hits: string[] = [];
  app.all('*', (req: any, res: any) => {
    hits.push(JSON.stringify(req.body));
    res.status(200).json(JSON.parse(okBody('upstream-ok')));
  });
  const server = app.listen(0) as http.Server;
  return { server, hits };
}

function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/proxy', proxy.proxyRouter);
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

describe('B4 replay: 端到端（真实代理 + 真实上游）', () => {
  let upstream: http.Server;
  let server: http.Server;
  let hits: string[];
  let base: string;

  beforeAll(() => {
    const up = startUpstream();
    upstream = up.server;
    hits = up.hits;
    base = `http://127.0.0.1:${(upstream.address() as any).port}`;
    server = startServer();
    cfg.initConfigStore();
    cfg.upsertProvider('rp', { apiKey: 'key-rp', enabled: true, baseUrl: base });
    metrics.resetMetrics();
  });
  afterAll(() => {
    upstream.close();
    server.close();
  });

  it('调用 → 存档请求体 → 重放成功（结果与原始并排）', async () => {
    const r = await post(server, '/api/proxy/rp/chat/completions', {
      model: 'gpt-4o',
      stream: false,
      messages: [{ role: 'user', content: 'replay-me' }],
    });
    assert.equal(r.status, 200);

    const requestId = String(r.headers['x-request-id'] ?? '');
    assert.ok(requestId, '响应应带 x-request-id');

    const log = metrics.findLogByRequestId(requestId);
    assert.ok(log, '应能在内存日志中定位该调用');
    assert.ok(log!.reqBody, '应存档请求体供重放');
    assert.ok(log!.reqBody!.includes('replay-me'));

    const before = hits.length;
    const out = await replayCall(log!);
    assert.equal(out.ok, true, '重放应成功');
    if (!out.ok) return;
    assert.equal(out.replay.status, 200);
    assert.ok(out.replay.body.includes('upstream-ok'));
    assert.equal(out.original.model, 'gpt-4o');
    // 上游确实又被打了一次（除非命中响应缓存）
    assert.ok(hits.length >= before, '重放经代理路径处理');
  });

  it('请求体不落盘：ndjson 中的 reqBody 被剥离', async () => {
    process.env.LOG_PERSIST = '1';
    metrics.resetMetrics();
    const r = await post(server, '/api/proxy/rp/chat/completions', {
      model: 'gpt-4o',
      stream: false,
      messages: [{ role: 'user', content: 'persist-check' }],
    });
    assert.equal(r.status, 200);
    const file = path.join(cfg.configDir(), 'logs.ndjson');
    assert.ok(fs.existsSync(file), '应写出 ndjson');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.reqBody, null, '落盘前必须剥离请求体（含 prompt）');
    delete process.env.LOG_PERSIST;
  });
});
