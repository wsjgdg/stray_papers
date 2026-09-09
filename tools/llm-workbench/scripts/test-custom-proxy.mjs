// 端到端测试：自定义厂商经本地代理转发到 mock 上游
const BASE = process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:8787';
const CUSTOM_ID = 'my-gateway';

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('✅', msg);
  }
}

async function main() {
  // 1. 写自定义厂商配置
  const saveRes = await fetch(`${BASE}/api/proxy/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: CUSTOM_ID,
      apiKey: 'test-key-123',
      baseUrl: 'http://127.0.0.1:9123/v1',
      enabled: true,
      customName: '我的网关',
      authStyle: 'bearer',
    }),
  });
  assert(saveRes.ok, `save custom provider -> HTTP ${saveRes.status}`);

  // 2. 读取配置，确认 custom:true 与名称
  const cfgRes = await fetch(`${BASE}/api/proxy/config`);
  const cfg = await cfgRes.json();
  const entry = cfg.providers[CUSTOM_ID];
  assert(entry && entry.custom === true, 'custom flag true in masked config');
  assert(entry.name === '我的网关', `custom name = 我的网关 (got ${entry?.name})`);
  assert(
    entry.hasKey === true && entry.apiKeyMasked.endsWith('123'),
    `key masked (got ${entry?.apiKeyMasked})`,
  );

  // 3. 经代理发 chat/completions（自定义厂商）
  const chatRes = await fetch(`${BASE}/api/proxy/${CUSTOM_ID}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gw-model',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    }),
  });
  assert(
    chatRes.ok && chatRes.headers.get('content-type').includes('text/event-stream'),
    `proxy SSE ok (HTTP ${chatRes.status})`,
  );
  let full = '';
  const reader = chatRes.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const m = line.match(/^data:\s*(.*)$/);
      if (!m) continue;
      const p = m[1].trim();
      if (p === '[DONE]') continue;
      try {
        const j = JSON.parse(p);
        full += j.choices?.[0]?.delta?.content ?? '';
      } catch {}
    }
  }
  assert(full === '你好，我是自定义网关', `SSE content assembled (got "${full}")`);

  // 4. metrics
  const mRes = await fetch(`${BASE}/api/proxy/metrics`);
  const metrics = (await mRes.json()).metrics;
  const m = metrics.find((x) => x.provider === CUSTOM_ID);
  assert(
    m && m.totalRequests >= 1,
    `metrics recorded for custom provider (total=${m?.totalRequests})`,
  );
  assert(
    m.totalInputTokens === 10 && m.totalOutputTokens === 5,
    `usage extracted (in=${m?.totalInputTokens}, out=${m?.totalOutputTokens})`,
  );
  assert(m.totalCacheReadTokens === 8, `cache tokens extracted (${m?.totalCacheReadTokens})`);

  // 5. logs
  const lRes = await fetch(`${BASE}/api/proxy/logs?provider=${CUSTOM_ID}&limit=5`);
  const logs = (await lRes.json()).logs;
  assert(Array.isArray(logs) && logs.length >= 1, `logs recorded (${logs.length})`);
  assert(logs[0].provider === CUSTOM_ID, 'log provider matches custom id');

  console.log('\nDONE. exitCode=', process.exitCode || 0);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
