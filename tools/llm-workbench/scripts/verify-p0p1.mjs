// P0 (成本/加密) + P1 (缓存/统一端点) 端到端验证。
// 使用临时 HOME 隔离真实配置；自带 mock 上游，验证 4 项特性。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NODE = 'C:/Users/sibop/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';
const TSX = path.resolve('node_modules/tsx/dist/cli.mjs');
const ROOT = process.cwd();

const API = 8931 + Math.floor(Math.random() * 50);
const MOCK = API + 100;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-verify-'));
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

// ── mock 上游：非流式 JSON + 流式 SSE，记录请求数 ──
let mockHits = 0;
const mock = http.createServer((req, res) => {
  mockHits++;
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const stream = /"stream"\s*:\s*true/i.test(body);
    if (stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const evs = [
        '{"choices":[{"delta":{"content":"你好"}}]}',
        '{"choices":[{"delta":{"content":"世界"}}]}',
        '{"usage":{"prompt_tokens":10,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":8}}}',
      ];
      let i = 0;
      const t = setInterval(() => {
        res.write(`data: ${evs[i++]}\n\n`);
        if (i >= evs.length) {
          clearInterval(t);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }, 10);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: 'hi' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }));
  });
});

function startServer() {
  const env = { ...process.env, API_PORT: String(API), USERPROFILE: HOME, HOME, NO_OPEN: '1', NO_REUSE: '1' };
  const p = spawn(NODE, [TSX, 'server/index.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
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

  const ok = await waitHealth();
  if (!ok) {
    console.log('服务器未启动，终止');
    srv.kill('SIGKILL');
    mock.close();
    process.exit(1);
  }
  console.log(`服务器就绪 ${base} · mock ${MOCK}`);

  const MOCK_URL = `http://127.0.0.1:${MOCK}`;
  const PROV = 'my-gw';

  // 配置自定义厂商指向 mock
  const cfgResp = await fetch(`${base}/api/proxy/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      providerId: PROV,
      apiKey: 'sk-test',
      baseUrl: MOCK_URL,
      enabled: true,
      customName: 'Mock Gateway',
      authStyle: 'bearer',
    }),
  });
  const cfg = await cfgResp.json();
  check('自定义厂商配置保存', cfg.providers[PROV]?.hasKey === true);

  // ── P0-1 成本金钱化 ──
  // 非流式调用 → 产生 usage，metrics 应有 totalCostUsd > 0
  await fetch(`${base}/api/proxy/${PROV}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'mock-model', messages: [{ role: 'user', content: 'hi' }] }),
  });
  const metricsResp = await fetch(`${base}/api/proxy/metrics`);
  const metrics = (await metricsResp.json()).metrics;
  const m = metrics.find((x) => x.provider === PROV);
  check('成本估算聚合 totalCostUsd > 0', m && m.totalCostUsd > 0, m ? `$${m.totalCostUsd.toFixed(6)}` : 'no metric');

  // ── P1-1 响应缓存 ──
  const beforeHits = mockHits;
  const body1 = JSON.stringify({ model: 'mock-model', messages: [{ role: 'user', content: 'cache me' }] });
  await fetch(`${base}/api/proxy/${PROV}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body1 });
  await fetch(`${base}/api/proxy/${PROV}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body1 });
  const cacheResp = await fetch(`${base}/api/proxy/cache`);
  const cache = await cacheResp.json();
  // 第二次相同请求应命中缓存（mock 只收到 1 次新请求）
  check('响应缓存命中 (mock 仅收到 1 次新请求)', mockHits - beforeHits === 1, `mockHitsΔ=${mockHits - beforeHits}`);
  check('缓存统计 hits >= 1', cache.hits >= 1, `hits=${cache.hits}`);

  // ── P1-2 统一 /api/v1 端点 ──
  const uniResp = await fetch(`${base}/api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-lb-provider': PROV },
    body: JSON.stringify({ model: 'mock-model', messages: [{ role: 'user', content: 'uni' }] }),
  });
  const uniJson = await uniResp.json();
  check('统一 /api/v1 路由转发成功', uniResp.ok && uniJson.choices?.[0]?.message?.content === 'hi');

  // 模型名前缀路由
  const uniResp2 = await fetch(`${base}/api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: `${PROV}/mock-model`, messages: [{ role: 'user', content: 'uni2' }] }),
  });
  check('模型名 vendor/model 前缀路由', uniResp2.ok);

  // 流式调用仍正常（无回归）
  const sResp = await fetch(`${base}/api/proxy/${PROV}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'mock-model', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
  });
  const sText = await sResp.text();
  check('流式代理正常 (含 usage)', sText.includes('你好') && sText.includes('"usage"'));

  // ── P0-2 密钥加密 ──
  const statusBefore = await (await fetch(`${base}/api/crypto/status`)).json();
  check('初始未加密', statusBefore.encrypted === false);

  const initResp = await fetch(`${base}/api/crypto/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'master-pass-123' }),
  });
  check('启用加密成功 (HTTP 200)', initResp.ok);
  const statusAfter = await (await fetch(`${base}/api/crypto/status`)).json();
  check('状态变为已加密', statusAfter.encrypted === true);

  // 磁盘文件应为密文
  const cfgPath = path.join(HOME, '.llm-workbench', 'config.json');
  const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  check('配置文件为 AES-256-GCM 密文', raw.enc === 'aes-256-gcm' && Boolean(raw.ciphertext));

  // 配置仍在内存可用（同一会话已解锁）
  const cfgAfterEnc = await (await fetch(`${base}/api/proxy/config`)).json();
  check('加密后仍可读取配置 (已解锁)', cfgAfterEnc.providers[PROV]?.hasKey === true && cfgAfterEnc.locked === false);

  // 错误密码解锁失败
  const badUnlock = await fetch(`${base}/api/crypto/unlock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' }),
  });
  check('错误主密码解锁被拒 (HTTP 401)', badUnlock.status === 401);

  // 关闭加密 → 明文落盘
  const disResp = await fetch(`${base}/api/crypto/disable`, { method: 'POST' });
  check('关闭加密成功', disResp.ok);
  const raw2 = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  check('关闭后恢复明文存储', Boolean(raw2.providers) && !raw2.enc);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  srv.kill('SIGKILL');
  mock.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
