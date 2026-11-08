// 端到端集成测试（in-process）：挂载真实 proxyRouter + translate 链路，
// 验证自定义厂商 apiFormat=anthropic 与 apiFormat=gemini 时
// 「OpenAI 请求 → 上游 → OpenAI 响应」全链路转换。
// 直接调用 config.upsertProvider 注入厂商配置，绕过 RBAC（仅 config 写接口需要 admin）。
import http from 'node:http';
import express from 'express';
import { proxyRouter } from '../server/proxy.ts';
import { upsertProvider } from '../server/config.ts';

const PORT = 8897;
const UP_A = 9137;
const UP_G = 9138;

let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log('✅', msg);
  else {
    failed++;
    console.error('❌ FAIL:', msg);
  }
};

// ── mock Anthropic Messages 上游 ──
const anthropicUp = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/messages') {
      if (req.headers['x-api-key'] !== 'k-a' || req.headers['anthropic-version'] !== '2023-06-01') {
        res.writeHead(401);
        res.end('bad auth');
        return;
      }
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {}
      console.log(
        '  [anthropic upstream] messages:',
        JSON.stringify(parsed.messages),
        '| system:',
        parsed.system,
      );
      ok(parsed.system === 'Be concise.', '[anthropic] 上游收到抽离后的 system 字段');
      ok(
        Array.isArray(parsed.messages) &&
          parsed.messages.length === 1 &&
          parsed.messages[0].role === 'user',
        '[anthropic] 上游 messages 已剔除 system',
      );
      if (parsed.stream !== true) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            type: 'message',
            role: 'assistant',
            model: parsed.model,
            content: [{ type: 'text', text: 'NONSTREAM anthropic' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 3 },
          }),
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const ev = (e, d) => {
        res.write(`event: ${e}\n`);
        res.write(`data: ${JSON.stringify(d)}\n\n`);
      };
      ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 10 } } });
      ev('content_block_delta', {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hel' },
      });
      ev('content_block_delta', {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'lo from anthropic' },
      });
      ev('message_delta', { type: 'message_delta', usage: { output_tokens: 5 } });
      ev('message_stop', { type: 'message_stop' });
      res.end();
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
});

// ── mock Google Gemini 上游（generateContent / streamGenerateContent）──
const geminiUp = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = (req.url || '').toLowerCase();
    if (req.method === 'POST' && u.includes('generatecontent')) {
      if (req.headers['x-goog-api-key'] !== 'k-g') {
        res.writeHead(401);
        res.end('bad auth');
        return;
      }
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {}
      console.log(
        '  [gemini upstream] contents:',
        JSON.stringify(parsed.contents),
        '| system:',
        parsed.systemInstruction?.parts?.[0]?.text,
      );
      ok(
        parsed.systemInstruction?.parts?.[0]?.text === 'Be concise.',
        '[gemini] 上游收到 systemInstruction',
      );
      ok(
        Array.isArray(parsed.contents) &&
          parsed.contents.length === 1 &&
          parsed.contents[0].role === 'user',
        '[gemini] 上游 contents 仅含 user turn',
      );
      if (parsed.stream === false || !u.includes('streamgeneratecontent')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: 'NONSTREAM gemini' }], role: 'model' },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 },
          }),
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const sd = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      sd({ candidates: [{ content: { parts: [{ text: 'Hel' }] } }] });
      sd({ candidates: [{ content: { parts: [{ text: 'lo from gemini' }] } }] });
      sd({
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6, totalTokenCount: 18 },
      });
      res.end();
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
});

function verifyFlow(providerId, expectedContent) {
  return (async () => {
    const chatRes = await fetch(
      `http://127.0.0.1:${PORT}/api/proxy/${providerId}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test-model',
          messages: [
            { role: 'system', content: 'Be concise.' },
            { role: 'user', content: 'Hi' },
          ],
          stream: true,
        }),
      },
    );
    ok(
      chatRes.ok && (chatRes.headers.get('content-type') || '').includes('text/event-stream'),
      `[${providerId}] proxy SSE ok (HTTP ${chatRes.status})`,
    );
    let full = '';
    const reader = chatRes.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let finishReason = null;
    let lastUsage = null;
    let sawDone = false;
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
        if (p === '[DONE]') {
          sawDone = true;
          continue;
        }
        try {
          const j = JSON.parse(p);
          full += j.choices?.[0]?.delta?.content ?? '';
          if (j.choices?.[0]?.finish_reason) finishReason = j.choices[0].finish_reason;
          if (j.usage) lastUsage = j.usage;
        } catch {}
      }
    }
    ok(full === expectedContent, `[${providerId}] OpenAI SSE 内容正确拼回 (got "${full}")`);
    ok(finishReason === 'stop', `[${providerId}] finish_reason 映射为 stop (got ${finishReason})`);
    ok(
      !!lastUsage && lastUsage.prompt_tokens > 0 && lastUsage.completion_tokens > 0,
      `[${providerId}] usage 已映射 (got ${JSON.stringify(lastUsage)})`,
    );
    ok(sawDone, `[${providerId}] 收到 [DONE] 终止符`);
  })();
}

function verifyNonStream(providerId, expectedContent) {
  return (async () => {
    const chatRes = await fetch(
      `http://127.0.0.1:${PORT}/api/proxy/${providerId}/chat/completions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test-model',
          messages: [
            { role: 'system', content: 'Be concise.' },
            { role: 'user', content: 'Hi' },
          ],
          stream: false,
        }),
      },
    );
    ok(chatRes.ok, `[${providerId}] 非流式 proxy ok (HTTP ${chatRes.status})`);
    const j = await chatRes.json();
    ok(j.object === 'chat.completion', `[${providerId}] 非流式响应 object=chat.completion`);
    ok(
      j.choices?.[0]?.message?.content === expectedContent,
      `[${providerId}] 非流式内容正确 (got "${j.choices?.[0]?.message?.content}")`,
    );
    ok(j.choices?.[0]?.finish_reason === 'stop', `[${providerId}] 非流式 finish_reason=stop`);
    ok(
      j.usage && j.usage.prompt_tokens > 0 && j.usage.completion_tokens > 0,
      `[${providerId}] 非流式 usage 映射 (got ${JSON.stringify(j.usage)})`,
    );
  })();
}

async function main() {
  await new Promise((r) => anthropicUp.listen(UP_A, '127.0.0.1', r));
  await new Promise((r) => geminiUp.listen(UP_G, '127.0.0.1', r));

  // 注入两个自定义厂商
  upsertProvider('ant-gw', {
    apiKey: 'k-a',
    baseUrl: `http://127.0.0.1:${UP_A}`,
    enabled: true,
    customName: 'Anthropic 网关',
    authStyle: 'x-api-key',
    apiFormat: 'anthropic',
  });
  ok(true, 'upsertProvider 注入 ant-gw (apiFormat=anthropic)');

  upsertProvider('gem-gw', {
    apiKey: 'k-g',
    baseUrl: `http://127.0.0.1:${UP_G}`,
    enabled: true,
    customName: 'Gemini 网关',
    authStyle: 'google',
    apiFormat: 'gemini',
  });
  ok(true, 'upsertProvider 注入 gem-gw (apiFormat=gemini)');

  // 挂载真实 proxyRouter
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/proxy', proxyRouter);
  await new Promise((r) => app.listen(PORT, '127.0.0.1', r));

  await verifyFlow('ant-gw', 'Hello from anthropic');
  await verifyFlow('gem-gw', 'Hello from gemini');
  await verifyNonStream('ant-gw', 'NONSTREAM anthropic');
  await verifyNonStream('gem-gw', 'NONSTREAM gemini');

  console.log(failed === 0 ? '\nINTEGRATION ALL PASS' : `\n${failed} FAILED`);
}

main()
  .catch((e) => {
    console.error('ERROR', e);
    failed++;
  })
  .finally(() => {
    anthropicUp.close();
    geminiUp.close();
    setTimeout(() => process.exit(failed === 0 ? 0 : 1), 300);
  });
