import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { describe, it, beforeAll, afterAll } from 'vitest';

// 隔离 HOME，避免污染真实 ~/.llm-workbench 配置
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-tag-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;

const cfg = await import('../server/config.js');
const proxy = await import('../server/proxy.js');
const metrics = await import('../server/metrics.js');
const usage = await import('../server/usageStore.js');
const spend = await import('../server/spendExport.js');
const expressMod = await import('express');

function okBody() {
  return JSON.stringify({
    id: 'chatcmpl-1',
    choices: [{ message: { role: 'assistant', content: 'ok' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

// ───────── 单元：metrics 标签透传 + 过滤 ─────────
describe('metrics: B2 tag pass-through', () => {
  beforeAll(() => metrics.resetMetrics());

  it('recordCall 携带 tag，getLogs 可按 tag 过滤', () => {
    metrics.resetMetrics();
    metrics.recordCall({
      ts: Date.now(),
      provider: 'openai',
      model: 'gpt-4o',
      method: 'POST',
      path: '/chat/completions',
      status: 200,
      latencyMs: 10,
      inputTokens: 5,
      outputTokens: 5,
      cacheReadTokens: null,
      cacheHitRate: null,
      error: null,
      requestBytes: 10,
      responseBytes: 20,
      requestId: 'r1',
      keyMask: '****abcd',
      fromCache: false,
      keySwitches: 0,
      tag: 'proj-x',
    });
    metrics.recordCall({
      ts: Date.now(),
      provider: 'openai',
      model: 'gpt-4o-mini',
      method: 'POST',
      path: '/chat/completions',
      status: 200,
      latencyMs: 10,
      inputTokens: 3,
      outputTokens: 3,
      cacheReadTokens: null,
      cacheHitRate: null,
      error: null,
      requestBytes: 8,
      responseBytes: 16,
      requestId: 'r2',
      keyMask: '****abcd',
      fromCache: false,
      keySwitches: 0,
      tag: 'proj-y',
    });
    const all = metrics.getLogs();
    assert.equal(all.length, 2);
    assert.ok(
      all.every((l) => l.tag != null),
      '两条都应带 tag',
    );
    const xOnly = metrics.getLogs({ tag: 'proj-x' });
    assert.equal(xOnly.length, 1);
    assert.equal(xOnly[0].tag, 'proj-x');
    const yOnly = metrics.getLogs({ tag: 'proj-y' });
    assert.equal(yOnly.length, 1);
    assert.equal(yOnly[0].tag, 'proj-y');
    // 不带 tag 过滤时不命中任何（因为都带 tag）
    assert.equal(metrics.getLogs({ tag: 'nope' }).length, 0);
    metrics.resetMetrics();
  });
});

// ───────── 单元：usageStore tag 维度 + 迁移 ─────────
describe('usageStore: B2 tag dimension + legacy migration', () => {
  it('recordUsage 按 tag 分桶，usageByTag 聚合', () => {
    // 以空存档初始化，确保内存 data 可控（同时启动节流落盘定时器）
    usage.initUsageStore();
    const now = new Date(`${new Date().toISOString().slice(0, 10)}T12:00:00`).getTime();
    usage.recordUsage(now, 'anthropic', 'claude-3', 'proj-x', 4, 4, 0, 0.02);
    usage.recordUsage(now, 'anthropic', 'claude-3', 'proj-y', 1, 1, 0, 0.005);
    const rows = usage.usageByTag({ days: 30 });
    const px = rows.find((r: any) => r.tag === 'proj-x');
    assert.ok(px, '应存在 proj-x 聚合');
    assert.ok(px.costUsd > 0);
    assert.ok(
      rows.some((r: any) => r.tag === 'proj-y'),
      '应存在 proj-y 聚合',
    );
  });

  it('sanitize 把旧的 day→provider→model→cell 迁移进 UNTAGGED 桶', () => {
    const data = usage.sanitize({
      '2026-09-14': {
        openai: {
          'gpt-4o': { requests: 3, input: 9, output: 7, cacheRead: 2, cost: 0.03 },
        },
      },
    });
    const cell = data['2026-09-14'].openai['gpt-4o'][usage.UNTAGGED];
    assert.ok(cell, '旧结构应折叠进 UNTAGGED');
    assert.equal(cell.requests, 3);
    assert.equal(cell.cost, 0.03);
  });
});

// ───────── 单元：spendExport 含 tag 列 ─────────
describe('spendExport: B2 tag column', () => {
  it('aggregateSpend 按 day|provider|model|tag 聚合，spendToCsv 含 tag 头', () => {
    const rows = spend.aggregateSpend(
      [
        {
          ts: new Date('2026-09-14T12:00:00').getTime(),
          provider: 'openai',
          model: 'gpt-4o',
          tag: 'proj-x',
          inputTokens: 10,
          outputTokens: 8,
          cacheReadTokens: 1,
          costUsd: 0.01,
        },
        {
          ts: new Date('2026-09-14T12:00:00').getTime(),
          provider: 'openai',
          model: 'gpt-4o',
          tag: 'proj-y',
          inputTokens: 5,
          outputTokens: 4,
          cacheReadTokens: 0,
          costUsd: 0.005,
        },
      ],
      { days: 30 },
    );
    assert.equal(rows.length, 2, '不同 tag 应分两行');
    const csv = spend.spendToCsv(rows);
    assert.ok(csv.startsWith('day,provider,model,tag,'), 'CSV 头应含 tag');
    assert.ok(csv.includes('proj-x') && csv.includes('proj-y'));
  });
});

// ───────── 集成：x-lb-tag 头 → 日志 tag ─────────
const express = (expressMod as any).default;
function startUpstream() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.all('*', (_req: any, res: any) => res.status(200).json(JSON.parse(okBody())));
  return app.listen(0) as http.Server;
}
function startServer(base: string) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1', proxy.unifiedRouter);
  return app.listen(0) as http.Server;
}
function call(
  server: http.Server,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const port = (server.address() as any).port;
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: chunks }));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('unifiedRouter: B2 x-lb-tag header', () => {
  let upstream: http.Server;
  let server: http.Server;
  beforeAll(() => {
    upstream = startUpstream();
    const base = `http://127.0.0.1:${(upstream.address() as any).port}`;
    server = startServer(base);
    cfg.initConfigStore();
    cfg.upsertProvider('openai', { apiKey: 'key-o', enabled: true, baseUrl: base });
    metrics.resetMetrics();
  });
  afterAll(() => {
    upstream.close();
    server.close();
  });

  it('请求头 x-lb-tag 透传到调用日志 tag 字段', async () => {
    const r = await call(
      server,
      { model: 'gpt-4o', stream: false, messages: [{ role: 'user', content: 'hi' }] },
      { 'x-lb-provider': 'openai', 'x-lb-tag': 'proj-acme' },
    );
    assert.equal(r.status, 200);
    const hit = metrics.getLogs().find((l: any) => l.tag === 'proj-acme');
    assert.ok(hit, '日志应带有 tag=proj-acme');
    assert.equal(hit.provider, 'openai');
  });

  it('不带 x-lb-tag 时 tag 为 null（归入 (untagged)）', async () => {
    const r = await call(
      server,
      { model: 'gpt-4o', stream: false, messages: [{ role: 'user', content: 'hi' }] },
      { 'x-lb-provider': 'openai' },
    );
    assert.equal(r.status, 200);
    const hit = metrics.getLogs().find((l: any) => l.tag === null);
    assert.ok(hit, '应存在 tag=null 的调用');
  });
});
