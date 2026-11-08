// Phase 1 加固端到端验证：
//  1) 3xx 响应转发 Location 且不写入响应缓存（否则客户端拿到没有跳转目标的废重定向）；
//  2) 客户端在流式响应中途断开时，服务端立即中止上游请求（否则连接/内存拖到 180s 超时）。
// 使用临时 HOME 隔离真实配置，自带 mock 上游。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NODE = process.execPath; // 用当前运行时，避免硬编码机器特定路径
const TSX = path.resolve('node_modules/tsx/dist/cli.mjs');
const ROOT = process.cwd();

const API = 8961 + Math.floor(Math.random() * 30);
const MOCK = API + 100;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-harden-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(path.join(HOME, '.llm-workbench'), { recursive: true });

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── mock 上游 ──
let mockHits = 0;
let activeStreams = 0; // 当前仍在写 SSE 的连接数：客户端断开后应立刻回落到 0
const mock = http.createServer((req, res) => {
  mockHits++;
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const model = (() => {
      try {
        return JSON.parse(body || '{}').model ?? '';
      } catch {
        return '';
      }
    })();

    if (model === 'redir') {
      res.writeHead(302, {
        'content-type': 'application/json',
        location: 'https://example.com/moved',
      });
      res.end(JSON.stringify({ moved: true }));
      return;
    }

    if (model === 'slow') {
      activeStreams++;
      // 注意：应该用 res 的 close 判断连接终结；req 的 close 在请求体读完后就会触发
      res.on('close', () => {
        activeStreams--;
      });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      let i = 0;
      const t = setInterval(() => {
        res.write(`data: {"choices":[{"delta":{"content":"tok${i++}"}}]}\n\n`);
        if (i > 500) {
          clearInterval(t);
          res.end();
        }
      }, 50);
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1 } }),
    );
  });
});

function startServer() {
  const env = {
    ...process.env,
    API_PORT: String(API),
    USERPROFILE: HOME,
    HOME,
    NO_OPEN: '1',
    NO_REUSE: '1',
  };
  const p = spawn(NODE, [TSX, 'server/index.ts'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {});
  p.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`));
  return p;
}

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${API}/api/health`);
      if (r.ok) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

async function main() {
  await new Promise((r) => mock.listen(MOCK, r));
  const srv = startServer();
  const base = `http://127.0.0.1:${API}`;
  const proxyUrl = `${base}/api/proxy/custom/chat/completions`;

  check('server healthy', await waitHealth());

  // 配置自定义厂商指向 mock
  const cfgRes = await fetch(`${base}/api/proxy/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      providerId: 'custom',
      apiKey: 'sk-test',
      baseUrl: `http://127.0.0.1:${MOCK}/v1`,
      enabled: true,
      customName: 'Mock',
      apiFormat: 'openai',
    }),
  });
  check('配置自定义厂商', cfgRes.ok, `status=${cfgRes.status}`);

  // ── 1) 3xx：转发 Location ──
  {
    const r = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'redir' }),
      redirect: 'manual',
    });
    const loc = r.headers.get('location');
    check(
      '3xx 转发 Location 头',
      loc === 'https://example.com/moved',
      `status=${r.status}, location=${loc}`,
    );
  }

  // ── 2) 3xx：不进响应缓存 ──
  {
    const before = await (await fetch(`${base}/api/proxy/cache`)).json();
    const hitsBefore = mockHits;
    await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'redir' }),
      redirect: 'manual',
    });
    await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'redir' }),
      redirect: 'manual',
    });
    const after = await (await fetch(`${base}/api/proxy/cache`)).json();
    check(
      '3xx 未被缓存（mock 每次都收到请求）',
      mockHits === hitsBefore + 2,
      `+${mockHits - hitsBefore}`,
    );
    check('缓存条目数未增长', after.size === before.size, `${before.size} → ${after.size}`);
  }

  // ── 3) 2xx 仍会被缓存（确认收紧范围没有误伤） ──
  {
    const payload = JSON.stringify({ model: 'plain', prompt: 'cache-me' });
    const hitsBefore = mockHits;
    await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    });
    check(
      '2xx 仍命中缓存（第二次不打上游）',
      mockHits === hitsBefore + 1,
      `+${mockHits - hitsBefore}`,
    );
  }

  // ── 4) 流式：客户端断开后上游立即中止 ──
  {
    const ac = new AbortController();
    const p = fetch(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'slow', stream: true }),
      signal: ac.signal,
    }).catch(() => {});
    await sleep(600);
    const during = activeStreams;
    ac.abort();
    await sleep(1500);
    const after = activeStreams;
    await p;
    check('流式进行中上游处于连接态', during === 1, `activeStreams=${during}`);
    check('客户端断开后上游立即中止（未拖到 180s）', after === 0, `activeStreams=${after}`);
  }

  srv.kill();
  mock.close();
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
