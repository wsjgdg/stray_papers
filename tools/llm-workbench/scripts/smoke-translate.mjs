// 翻译层冒烟测试：直接验证 translate.ts 的请求/响应/流式转换
import {
  toAnthropicRequest,
  toGeminiRequest,
  fromAnthropicJson,
  fromGeminiJson,
  buildUpstreamUrl,
  createStreamTranslator,
} from '../server/translate.ts';

let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log('✅', msg);
  else {
    failed++;
    console.error('❌ FAIL:', msg);
  }
};

const baseBody = {
  model: 'gw-model',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
  ],
  temperature: 0.7,
  stream: true,
};

// ── 1. OpenAI → Anthropic 请求转换 ──
const a = toAnthropicRequest(baseBody);
ok(a.model === 'gw-model', 'anthropic: model 透传');
ok(a.stream === true, 'anthropic: stream 透传');
ok(Array.isArray(a.messages) && a.messages.length === 1, 'anthropic: system 抽离为顶层字段');
ok(a.system === 'You are helpful.', 'anthropic: system 内容正确');
ok(a.messages[0].role === 'user' && a.messages[0].content === 'Hello', 'anthropic: user 消息保留');
ok(typeof a.temperature === 'number', 'anthropic: 其余字段保留');

// ── 2. OpenAI → Gemini 请求转换 ──
const g = toGeminiRequest(baseBody);
ok(g.contents && Array.isArray(g.contents), 'gemini: contents 数组');
ok(g.systemInstruction && g.systemInstruction.parts[0].text === 'You are helpful.', 'gemini: systemInstruction 抽离');
ok(g.contents.length === 1 && g.contents[0].role === 'user', 'gemini: user turn');
ok(g.contents[0].parts[0].text === 'Hello', 'gemini: user 文本保留');
ok(g.generationConfig && typeof g.generationConfig.temperature === 'number', 'gemini: generationConfig 透传 temp');

// ── 3. 上游 URL 构造 ──
ok(buildUpstreamUrl('anthropic', 'https://x/v1', 'm', false) === 'https://x/v1/messages', 'upstream anthropic url');
ok(
  buildUpstreamUrl('gemini', 'https://x/v1', 'm', false).endsWith('/models/m:generateContent'),
  'upstream gemini url (non-stream)',
);
ok(
  buildUpstreamUrl('gemini', 'https://x/v1', 'm', true).includes('/models/m:streamGenerateContent'),
  'upstream gemini url (stream)',
);

// ── 4. Anthropic JSON → OpenAI ──
const aJson = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'gw-model',
  content: [{ type: 'text', text: 'Hi there' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
};
const fromA = fromAnthropicJson(aJson);
ok(fromA.object === 'chat.completion', 'anthropic->openai: object 字段');
ok(fromA.choices[0].message.content === 'Hi there', 'anthropic->openai: 文本内容');
ok(fromA.choices[0].finish_reason === 'stop', 'anthropic->openai: finish_reason 映射');
ok(fromA.usage.prompt_tokens === 10 && fromA.usage.completion_tokens === 5, 'anthropic->openai: usage 映射');

// ── 5. Gemini JSON → OpenAI ──
const gJson = {
  candidates: [
    {
      content: { parts: [{ text: 'Hi there' }], role: 'model' },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
};
const fromG = fromGeminiJson(gJson);
ok(fromG.choices[0].message.content === 'Hi there', 'gemini->openai: 文本');
ok(fromG.choices[0].finish_reason === 'stop', 'gemini->openai: finish_reason 映射');
ok(fromG.usage.prompt_tokens === 10 && fromG.usage.completion_tokens === 5, 'gemini->openai: usage 映射');

// ── 6. Anthropic 流式 → OpenAI SSE ──
{
  const t = createStreamTranslator('anthropic');
  ok(t !== null, 'anthropic stream translator 已创建');
  let out = '';
  out += t.push('event: message_start\n');
  out += t.push('data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n');
  out += t.push('event: content_block_delta\n');
  out += t.push('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n');
  out += t.push('event: content_block_delta\n');
  out += t.push('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n');
  out += t.push('event: message_delta\n');
  out += t.push('data: {"type":"message_delta","usage":{"output_tokens":5}}\n\n');
  out += t.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');
  out += t.flush();
  const deltas = [...out.matchAll(/data: (\{.*?\})\n\n/g)].map((m) => m[1]).filter((s) => s !== '[DONE]').map((s) => JSON.parse(s));
  const contents = deltas.map((d) => d.choices?.[0]?.delta?.content ?? '').join('');
  ok(contents === 'Hello', `anthropic stream -> openai delta 拼接 (got "${contents}")`);
  const last = deltas[deltas.length - 1];
  const finishDelta = deltas.find((d) => d.choices?.[0]?.finish_reason) ?? last;
  const usageDelta = deltas.find((d) => d.usage) ?? last;
  ok(finishDelta.choices?.[0]?.finish_reason === 'stop' && usageDelta.usage?.prompt_tokens === 10 && usageDelta.usage?.completion_tokens === 5, 'anthropic stream -> openai usage/finish');
  ok(out.includes('[DONE]'), 'anthropic stream -> [DONE] 终止');
}

// ── 7. Gemini 流式 → OpenAI SSE ──
{
  const t = createStreamTranslator('gemini');
  ok(t !== null, 'gemini stream translator 已创建');
  let out = '';
  out += t.push('data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n');
  out += t.push('data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n\n');
  out += t.push('data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}\n\n');
  out += t.flush();
  const deltas = [...out.matchAll(/data: (\{.*?\})\n\n/g)].map((m) => m[1]).filter((s) => s !== '[DONE]').map((s) => JSON.parse(s));
  const contents = deltas.map((d) => d.choices?.[0]?.delta?.content ?? '').join('');
  ok(contents === 'Hello', `gemini stream -> openai delta 拼接 (got "${contents}")`);
  const last = deltas[deltas.length - 1];
  const finishDelta = deltas.find((d) => d.choices?.[0]?.finish_reason) ?? last;
  const usageDelta = deltas.find((d) => d.usage) ?? last;
  ok(finishDelta.choices?.[0]?.finish_reason === 'stop' && usageDelta.usage?.prompt_tokens === 10, 'gemini stream -> openai usage/finish');
}

// ── 8. openai 格式返回 null translator（透传）──
ok(createStreamTranslator('openai') === null, 'openai 格式无 translator（透传）');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
