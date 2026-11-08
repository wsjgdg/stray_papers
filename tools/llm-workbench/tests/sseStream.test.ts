import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeAll, afterAll } from 'vitest';

// 隔离 HOME，避免污染真实 ~/.llm-workbench 配置；NO_OPEN 阻止自动开浏览器
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-sse-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });
process.env.USERPROFILE = HOME;
process.env.HOME = HOME;
process.env.NO_OPEN = '1';

const srv = await import('../server/index.ts');
const cfg = await import('../server/config.ts');

/** 读取 SSE 流首帧 JSON（或首个 data: 行），超时返回 null */
async function readFirstFrame(res: Response, timeoutMs = 5000): Promise<unknown | null> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const blockEnd = buf.indexOf('\n\n');
      if (blockEnd >= 0) {
        const block = buf.slice(0, blockEnd);
        const dataLine = block
          .split('\n')
          .map((l) => l.trim())
          .find((l) => l.startsWith('data:'));
        if (dataLine) return JSON.parse(dataLine.slice(5).trim());
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return null;
}

describe('SSE streaming endpoint (B8)', () => {
  beforeAll(async () => {
    srv.startServer();
    for (let i = 0; i < 50; i++) {
      if (srv.getServerPort()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, 12000);

  afterAll(() => {
    srv.stopServer();
  });

  it('starts listening within timeout', () => {
    assert.ok(srv.getServerPort(), 'server should bind a port');
  });

  it('serves streaming overview with correct headers and payload shape', async () => {
    const port = srv.getServerPort()!;
    const res = await fetch(`http://127.0.0.1:${port}/api/proxy/stream`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    assert.match(res.headers.get('cache-control') ?? '', /no-cache/);

    const frame = (await readFirstFrame(res)) as {
      metrics: unknown[];
      cache: object;
      summary: object;
    } | null;
    assert.ok(frame, 'should receive a data frame');
    assert.ok(Array.isArray(frame!.metrics), 'metrics must be an array');
    assert.ok(frame!.cache && typeof frame!.cache === 'object', 'cache must be present');
    assert.ok(frame!.summary && typeof frame!.summary === 'object', 'summary must be present');
  }, 10000);

  it('enforces proxy token via ?token= for EventSource (401 without, 200 with)', async () => {
    const port = srv.getServerPort()!;
    // ENV_PROXY_TOKEN 在模块加载时为 const 捕获，无法在测试中切换；改用实时配置开关
    const tok = 'sse-test-secret';
    cfg.setProxyToken(tok);
    cfg.setProxyTokenEnabled(true);
    try {
      const noTok = await fetch(`http://127.0.0.1:${port}/api/proxy/stream`);
      assert.equal(noTok.status, 401, 'missing token must be rejected');

      const withTok = await fetch(
        `http://127.0.0.1:${port}/api/proxy/stream?token=${encodeURIComponent(tok)}`,
      );
      assert.equal(withTok.status, 200, 'valid ?token= must be accepted');
      const frame = await readFirstFrame(withTok);
      assert.ok(frame, 'authenticated stream should still yield a frame');
    } finally {
      cfg.setProxyTokenEnabled(false);
      cfg.setProxyToken('');
    }
  }, 10000);
});
