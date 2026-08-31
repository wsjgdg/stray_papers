// 验证 config 合并安全性（server/config.ts upsertProvider 的 per-field 合并语义）：
// 1. 仅 PATCH {models, enabledModels}（前端自动获取模型的真实载荷）不得清掉 apiKey/baseUrl/authStyle/enabled/customName；
// 2. 仅 PATCH {enabledModels}（前端启用开关的真实载荷）不得清掉 models/apiKey；
// 3. 端到端：自定义厂商指向 bankofai 形状 mock upstream，/api/proxy/:id/models 真实解析，
//    随后用解析结果做一次 fetchModels 风格保存，确认 apiKey 仍保留。
// 隔离临时 HOME，不污染真实配置。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 8900 + Math.floor(Math.random() * 80);
const MOCK = API + 100;
const BASE = `http://127.0.0.1:${API}`;
const MOCK_BASE = `http://127.0.0.1:${MOCK}/v1`;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-merge-'));
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

// ── mock upstream：bankofai 文档形状 ──
const mock = http.createServer((req, res) => {
  if (req.url.startsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        object: 'list',
        success: true,
        data: [
          { id: 'gpt-5.2', owned_by: 'openai' },
          { id: 'claude-3-5', owned_by: 'anthropic' },
        ],
      }),
    );
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

async function waitHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
}
async function getCfg(id) {
  const r = await fetch(`${BASE}/api/proxy/config`);
  const j = await r.json();
  return j.providers?.[id];
}

async function main() {
  await new Promise((r) => mock.listen(MOCK, '127.0.0.1', r));
  console.log(`mock-upstream @${MOCK}`);

  const srv = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, HOME, API_PORT: String(API), NO_OPEN: '1', NO_REUSE: '1', WEB_DIR: 'dist' },
    stdio: 'ignore',
    shell: true,
  });

  const ok = await waitHealth();
  if (!ok) {
    console.error('❌ FAIL: server did not become healthy');
    srv.kill('SIGKILL');
    process.exit(1);
  }
  console.log('server healthy');

  const ID = 'verify-merge';

  // 1) 创建含全部字段的厂商
  const create = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: ID,
      apiKey: 'SECRET-KEY',
      baseUrl: 'https://example.com/v1',
      enabled: true,
      customName: 'My Provider',
      authStyle: 'bearer',
      models: ['a', 'b'],
      enabledModels: ['a'],
    }),
  });
  check('create provider 200', create.ok, `status ${create.status}`);
  let cfg = await getCfg(ID);
  const keyMaskedBefore = cfg?.apiKeyMasked;
  // GET 端点返回的是脱敏字段 apiKeyMasked（仅末4位），不返回明文 apiKey（设计如此）
  check('created apiKey present (masked)', cfg?.hasKey === true && typeof keyMaskedBefore === 'string' && keyMaskedBefore.startsWith('****'), `masked=${keyMaskedBefore}`);
  check('created baseUrl preserved', cfg?.baseUrl === 'https://example.com/v1');
  check('created models preserved', JSON.stringify(cfg?.models) === JSON.stringify(['a', 'b']));

  // 2) PATCH 仅 {models, enabledModels}（前端 fetchModels 真实载荷）→ 不得清掉其它字段
  const patch1 = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: ID, models: ['b', 'c', 'd'], enabledModels: ['b', 'c'] }),
  });
  check('patch models 200', patch1.ok, `status ${patch1.status}`);
  cfg = await getCfg(ID);
  check('apiKey NOT wiped by models patch', cfg?.apiKeyMasked === keyMaskedBefore && cfg?.hasKey === true, `masked=${cfg?.apiKeyMasked}`);
  check('baseUrl NOT wiped by models patch', cfg?.baseUrl === 'https://example.com/v1');
  check('authStyle NOT wiped by models patch', cfg?.authStyle === 'bearer');
  check('enabled NOT wiped by models patch', cfg?.enabled === true);
  check('customName NOT wiped by models patch', cfg?.customName === 'My Provider');
  check('models replaced by patch', JSON.stringify(cfg?.models) === JSON.stringify(['b', 'c', 'd']), `models=${JSON.stringify(cfg?.models)}`);
  check('enabledModels replaced by patch', JSON.stringify(cfg?.enabledModels) === JSON.stringify(['b', 'c']));

  // 3) PATCH 仅 {enabledModels}（前端 toggleModel 真实载荷）→ 不得清掉 models/apiKey
  const patch2 = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: ID, enabledModels: ['c'] }),
  });
  check('patch enabledModels 200', patch2.ok, `status ${patch2.status}`);
  cfg = await getCfg(ID);
  check('apiKey NOT wiped by enabledModels patch', cfg?.apiKeyMasked === keyMaskedBefore && cfg?.hasKey === true, `masked=${cfg?.apiKeyMasked}`);
  check('models NOT wiped by enabledModels patch', JSON.stringify(cfg?.models) === JSON.stringify(['b', 'c', 'd']), `models=${JSON.stringify(cfg?.models)}`);

  // 4) 端到端：指向 bankofai 形状 mock，真实解析 /models，再保存，确认 key 仍保留
  const point = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: ID, baseUrl: MOCK_BASE }),
  });
  check('repoint baseUrl 200', point.ok, `status ${point.status}`);
  const modelsRes = await fetch(`${BASE}/api/proxy/${ID}/models`);
  const modelsJson = await modelsRes.json();
  check('bankofai-style /models 200', modelsRes.ok, `status ${modelsRes.status}`);
  check(
    'bankofai-style parsed models',
    JSON.stringify(modelsJson.models) === JSON.stringify(['claude-3-5', 'gpt-5.2']),
    `models=${JSON.stringify(modelsJson.models)}`,
  );
  // 模拟 fetchModels：把解析结果与现有 models 合并后保存（真实前端会 mergeModels）
  const existing = cfg?.models ?? [];
  const merged = Array.from(new Set([...existing, ...modelsJson.models]));
  const save = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: ID, models: merged, enabledModels: merged }),
  });
  check('fetchModels-style save 200', save.ok, `status ${save.status}`);
  cfg = await getCfg(ID);
  check('apiKey SURVIVES real fetchModels save', cfg?.apiKeyMasked === keyMaskedBefore && cfg?.hasKey === true, `masked=${cfg?.apiKeyMasked}`);
  check(
    'merged models include both manual + fetched',
    JSON.stringify(cfg?.models) === JSON.stringify(['b', 'c', 'd', 'claude-3-5', 'gpt-5.2']),
    `models=${JSON.stringify(cfg?.models)}`,
  );

  srv.kill('SIGKILL');
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
