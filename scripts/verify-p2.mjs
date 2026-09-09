// P2 验证：多 key 轮询 + 失败切换（兜底） + Prometheus /metrics 导出。
// 使用临时 HOME 隔离真实配置；自带 mock 上游（按 Authorization 头判定响应），随机端口。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NODE = 'C:/Users/sibop/.workbuddy/binaries/node/versions/22.22.2-2/node.exe';
const TSX = path.resolve('node_modules/tsx/dist/cli.mjs');
const ROOT = process.cwd();

const API = 8981 + Math.floor(Math.random() * 50);
const MOCK = API + 100;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lwb-p2-'));
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

// mock 上游：按 Authorization 头决定响应
const seen = []; // 记录每次收到的 key
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const auth = (
      req.headers['authorization'] ||
      req.headers['x-api-key'] ||
      req.headers['x-goog-api-key'] ||
      ''
    ).toString();
    seen.push(auth);
    if (auth.includes('fo-bad')) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid key' }));
      return;
    }
    let keyLabel = 'UNKNOWN';
    if (auth.includes('rr-A')) keyLabel = 'A';
    else if (auth.includes('rr-B')) keyLabel = 'B';
    else if (auth.includes('fo-good')) keyLabel = 'GOOD';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        key: keyLabel,
        choices: [{ message: { content: 'ok-' + keyLabel } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
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

  const ok = await waitHealth();
  if (!ok) {
    console.log('服务器未启动，终止');
    srv.kill('SIGKILL');
    mock.close();
    process.exit(1);
  }
  console.log(`服务器就绪 ${base} · mock ${MOCK}`);

  const MOCK_URL = `http://127.0.0.1:${MOCK}`;
  const RR = 'rr-prov';
  const FO = 'fo-prov';

  // 配置多 key 厂商（轮询）
  await fetch(`${base}/api/proxy/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      providerId: RR,
      apiKey: 'sk-rr-A',
      apiKeys: ['sk-rr-A', 'sk-rr-B'],
      baseUrl: MOCK_URL,
      enabled: true,
      authStyle: 'bearer',
    }),
  });
  // 配置多 key 厂商（失败切换：第一个无效，第二个有效）
  await fetch(`${base}/api/proxy/config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      providerId: FO,
      apiKey: 'sk-fo-bad',
      apiKeys: ['sk-fo-bad', 'sk-fo-good'],
      baseUrl: MOCK_URL,
      enabled: true,
      authStyle: 'bearer',
    }),
  });
  const cfgResp = await (await fetch(`${base}/api/proxy/config`)).json();
  check(
    '轮询厂商 apiKeyCount = 2',
    cfgResp.providers[RR]?.apiKeyCount === 2,
    `count=${cfgResp.providers[RR]?.apiKeyCount}`,
  );
  check(
    '兜底厂商 apiKeyCount = 2',
    cfgResp.providers[FO]?.apiKeyCount === 2,
    `count=${cfgResp.providers[FO]?.apiKeyCount}`,
  );

  // ── P2-a(1) 轮询：4 次不同请求，应分布在 A/B 两个 key ──
  seen.length = 0;
  for (let i = 0; i < 4; i++) {
    await fetch(`${base}/api/proxy/${RR}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: `rr-${i}` }] }),
    });
  }
  const rrKeys = seen.map((a) => (a.includes('rr-A') ? 'A' : a.includes('rr-B') ? 'B' : '?'));
  const distinct = [...new Set(rrKeys)];
  check(
    '轮询覆盖多个 key (A 与 B 都出现)',
    distinct.includes('A') && distinct.includes('B'),
    `seen=${rrKeys.join(',')}`,
  );

  // ── P2-a(2) 失败切换：第一个 key 401 → 自动切到第二个 key 成功 ──
  seen.length = 0;
  const foResp = await fetch(`${base}/api/proxy/${FO}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'fo' }] }),
  });
  const foJson = await foResp.json();
  check(
    '失败切换后最终成功',
    foResp.ok && foJson.choices?.[0]?.message?.content === 'ok-GOOD',
    `body=${JSON.stringify(foJson).slice(0, 80)}`,
  );
  check(
    '上游收到的是兜底 key (GOOD 而非 BAD)',
    seen.some((a) => a.includes('fo-good')) && !seen[0]?.includes('fo-good'),
    `seen=${seen.join(',')}`,
  );

  // 指标应记录 1 次 key 切换
  const metrics = (await (await fetch(`${base}/api/proxy/metrics`)).json()).metrics;
  const foMetric = metrics.find((m) => m.provider === FO);
  check(
    '指标记录 key 切换次数 >= 1',
    foMetric && foMetric.totalKeySwitches >= 1,
    `switches=${foMetric?.totalKeySwitches}`,
  );

  // ── P2-b Prometheus /metrics ──
  const mResp = await fetch(`${base}/metrics`);
  const mText = await mResp.text();
  const ctype = mResp.headers.get('content-type') || '';
  check('/metrics 返回 text/plain', ctype.includes('text/plain'));
  check('/metrics 含存活指标', mText.includes('llmworkbench_up 1'));
  check('/metrics 含请求计数', mText.includes('llmworkbench_requests_total'));
  check('/metrics 含成本计数', mText.includes('llmworkbench_cost_usd_total'));
  check('/metrics 含 key 切换计数', mText.includes('llmworkbench_key_switches_total'));
  check(
    '/metrics 含缓存命中（含厂商 label）',
    mText.includes('llmworkbench_requests_total{provider="fo_prov"}') ||
      mText.includes('llmworkbench_requests_total{provider="rr_prov"}'),
  );
  check('/metrics 含全局输入速率 gauge', mText.includes('llmworkbench_input_rate_tok_s'));
  check('/metrics 含全局输出速率 gauge', mText.includes('llmworkbench_output_rate_tok_s'));

  // ── 浮窗汇总接口 ──
  await sleep(2200); // 等待至少一个 2s 速率历史采样周期
  const sum = await (await fetch(`${base}/api/proxy/metrics/summary`)).json();
  check('汇总接口返回当日输入 tokens > 0', sum.todayInputTokens > 0, `in=${sum.todayInputTokens}`);
  check(
    '汇总接口返回当日输出 tokens > 0',
    sum.todayOutputTokens > 0,
    `out=${sum.todayOutputTokens}`,
  );
  check(
    '汇总接口含最近模型列表',
    Array.isArray(sum.recentModels) && sum.recentModels.length > 0,
    `n=${sum.recentModels?.length}`,
  );
  check(
    '汇总接口含聚合速率字段',
    typeof sum.inputRateTokS === 'number' && typeof sum.outputRateTokS === 'number',
  );
  check('汇总接口含当日成本', typeof sum.todayCostUsd === 'number' && sum.todayCostUsd > 0);
  check(
    '汇总接口含速率历史 rateHistory 数组',
    Array.isArray(sum.rateHistory) && sum.rateHistory.length >= 2,
    `len=${sum.rateHistory?.length}`,
  );
  const rhOk =
    Array.isArray(sum.rateHistory) &&
    sum.rateHistory.every(
      (s) =>
        typeof s.t === 'number' && typeof s.inRate === 'number' && typeof s.outRate === 'number',
    );
  check('rateHistory 每项含数值字段 t/inRate/outRate', rhOk);
  check('rateHistoryMax = 180', sum.rateHistoryMax === 180, `max=${sum.rateHistoryMax}`);

  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
  srv.kill('SIGKILL');
  mock.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
