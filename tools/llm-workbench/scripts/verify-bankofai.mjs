// 验证 bankofai 空列表修复：非标准 200 响应现在抛出带原始响应预览的错误；
// 同时确认标准 {data:[{id}]} 仍正常解析（无回归）。
import http from 'node:http';
import { spawn } from 'node:child_process';

const API_PORT = 8799;
const BAD_PORT = 9143;
const GOOD_PORT = 9144;
const EMPTY_PORT = 9145;
const BASE = `http://127.0.0.1:${API_PORT}`;
const BAD_BASE = `http://127.0.0.1:${BAD_PORT}/v1`;
const GOOD_BASE = `http://127.0.0.1:${GOOD_PORT}/v1`;
const EMPTY_BASE = `http://127.0.0.1:${EMPTY_PORT}/v1`;

// ---- mock upstream: 非标准 envelope（bankofai 风格）----
const mockBad = http.createServer((req, res) => {
  if (req.url.startsWith('/v1/models')) {
    // 200，但结构是 {status, items:[{id}]} —— 既不是 data 也不是 models 数组
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', items: [{ id: 'gpt-4o' }, { id: 'claude-3' }] }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
// ---- mock upstream: 标准 OpenAI 兼容 + 完整 bankofai 文档结构 ----
const mockGood = http.createServer((req, res) => {
  if (req.url.startsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        object: 'list',
        success: true,
        data: [
          { id: 'gpt-5.2', object: 'model', owned_by: 'openai' },
          { id: 'claude-3-5', object: 'model', owned_by: 'anthropic' },
        ],
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end('not found');
});
// ---- mock upstream: 识别到 data 数组但为空（Key 无模型权限）----
const mockEmpty = http.createServer((req, res) => {
  if (req.url.startsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', success: true, data: [] }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('✅', msg);
  }
}

async function waitHealth(timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  await new Promise((r) => mockBad.listen(BAD_PORT, '127.0.0.1', r));
  await new Promise((r) => mockGood.listen(GOOD_PORT, '127.0.0.1', r));
  await new Promise((r) => mockEmpty.listen(EMPTY_PORT, '127.0.0.1', r));
  console.log(`mock-upstream bad@${BAD_PORT} good@${GOOD_PORT} empty@${EMPTY_PORT}`);

  // 启动真实 server（隔离端口，不打开浏览器）
  const srv = spawn(
    'npx',
    ['tsx', 'server/index.ts'],
    {
      cwd: process.cwd(),
      env: { ...process.env, API_PORT: String(API_PORT), NO_OPEN: '1', NO_REUSE: '1', WEB_DIR: 'dist' },
      stdio: 'ignore',
      shell: true,
    },
  );

  const ok = await waitHealth();
  if (!ok) {
    console.error('❌ FAIL: server did not become healthy');
    srv.kill('SIGKILL');
    process.exit(1);
  }
  console.log('server healthy');

  const BAD_ID = 'verify-bankofai-bad';
  const GOOD_ID = 'verify-bankofai-good';
  const EMPTY_ID = 'verify-bankofai-empty';

  // 写三个自定义厂商
  const saveBad = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: BAD_ID, apiKey: 'k', baseUrl: BAD_BASE, enabled: true }),
  });
  assert(saveBad.ok, `save bad provider -> ${saveBad.status}`);
  const saveGood = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: GOOD_ID, apiKey: 'k', baseUrl: GOOD_BASE, enabled: true }),
  });
  assert(saveGood.ok, `save good provider -> ${saveGood.status}`);
  const saveEmpty = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: EMPTY_ID, apiKey: 'k', baseUrl: EMPTY_BASE, enabled: true }),
  });
  assert(saveEmpty.ok, `save empty provider -> ${saveEmpty.status}`);

  // 1) 完整 bankofai 文档结构：应正常返回去重排序后的模型
  const goodRes = await fetch(`${BASE}/api/proxy/${GOOD_ID}/models`);
  const goodJson = await goodRes.json();
  assert(goodRes.ok && Array.isArray(goodJson.models), `good models 200 + array (got ${goodRes.status})`);
  assert(
    JSON.stringify(goodJson.models) === JSON.stringify(['claude-3-5', 'gpt-5.2']),
    `good models dedup+sorted = [claude-3-5,gpt-5.2] (got ${JSON.stringify(goodJson.models)})`,
  );

  // 2) 非标准结构：应 502 且错误信息含「原始响应」预览
  const badRes = await fetch(`${BASE}/api/proxy/${BAD_ID}/models`);
  const badJson = await badRes.json();
  assert(badRes.status === 502, `bad models -> 502 (got ${badRes.status})`);
  assert(
    typeof badJson.error === 'string' && badJson.error.includes('原始响应'),
    `bad error mentions 原始响应 (got "${badJson.error}")`,
  );
  assert(
    typeof badJson.error === 'string' && badJson.error.includes('"status":"ok"') && badJson.error.includes('items'),
    `bad error previews raw JSON so user can see real format (got "${badJson.error}")`,
  );

  // 3) 识别到 data 数组但为空（Key 无模型权限）：应 502 且提示「data/models 为空数组」
  const emptyRes = await fetch(`${BASE}/api/proxy/${EMPTY_ID}/models`);
  const emptyJson = await emptyRes.json();
  assert(emptyRes.status === 502, `empty models -> 502 (got ${emptyRes.status})`);
  assert(
    typeof emptyJson.error === 'string' && emptyJson.error.includes('data/models 为空数组') && emptyJson.error.includes('未开通模型访问权限'),
    `empty-data error hints Key has no model access (got "${emptyJson.error}")`,
  );

  // 清理 test 厂商，避免污染真实 config
  await fetch(`${BASE}/api/proxy/config/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: BAD_ID }),
  });
  await fetch(`${BASE}/api/proxy/config/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: GOOD_ID }),
  });
  await fetch(`${BASE}/api/proxy/config/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: EMPTY_ID }),
  });
  console.log('cleaned up test providers');

  srv.kill('SIGKILL');
  mockBad.close();
  mockGood.close();
  mockEmpty.close();
  console.log('\nDONE. exitCode =', process.exitCode || 0);
  process.exit(process.exitCode || 0);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
