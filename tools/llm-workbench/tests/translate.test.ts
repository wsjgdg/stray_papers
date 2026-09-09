import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  toAnthropicRequest,
  toGeminiRequest,
  buildUpstreamUrl,
  fromAnthropicJson,
  fromGeminiJson,
  AnthropicStreamTranslator,
  GeminiStreamTranslator,
  createStreamTranslator,
} from '../server/translate.ts';

const openaiBody = (over: Record<string, unknown> = {}) => ({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
  ],
  max_tokens: 100,
  temperature: 0.7,
  ...over,
});

describe('toAnthropicRequest', () => {
  it('splits system, maps roles, carries max_tokens + temperature', () => {
    const r = toAnthropicRequest(openaiBody()) as Record<string, unknown>;
    assert.equal(r.system, 'You are helpful.');
    assert.equal((r.messages as unknown[]).length, 1);
    assert.equal((r.messages as any[])[0].role, 'user');
    assert.equal((r.messages as any[])[0].content, 'Hello');
    assert.equal(r.max_tokens, 100);
    assert.equal(r.temperature, 0.7);
  });

  it('defaults max_tokens to 4096 when absent', () => {
    const r = toAnthropicRequest(openaiBody({ max_tokens: undefined })) as Record<string, unknown>;
    assert.equal(r.max_tokens, 4096);
  });
});

describe('toGeminiRequest', () => {
  it('maps to contents + generationConfig + systemInstruction', () => {
    const r = toGeminiRequest(openaiBody()) as Record<string, unknown>;
    assert.equal((r.contents as unknown[]).length, 1);
    assert.equal((r.contents as any[])[0].role, 'user');
    assert.equal((r.contents as any[])[0].parts[0].text, 'Hello');
    assert.equal((r.generationConfig as Record<string, unknown>).maxOutputTokens, 100);
    assert.equal((r.systemInstruction as any).parts[0].text, 'You are helpful.');
  });
});

describe('buildUpstreamUrl', () => {
  it('anthropic -> /messages', () => {
    assert.equal(
      buildUpstreamUrl('anthropic', 'https://api.anthropic.com/v1', 'claude', false),
      'https://api.anthropic.com/v1/messages',
    );
  });
  it('gemini non-stream -> generateContent', () => {
    assert.equal(
      buildUpstreamUrl('gemini', 'https://genai.googleapis.com/v1beta', 'gemini-1.5', false),
      'https://genai.googleapis.com/v1beta/models/gemini-1.5:generateContent',
    );
  });
  it('gemini stream -> streamGenerateContent?alt=sse', () => {
    assert.ok(
      buildUpstreamUrl('gemini', 'https://x/v1', 'm', true).includes(
        'streamGenerateContent?alt=sse',
      ),
    );
  });
  it('openai -> base url unchanged (caller appends wildcard)', () => {
    assert.equal(
      buildUpstreamUrl('openai', 'https://api.openai.com/v1', 'gpt', false),
      'https://api.openai.com/v1',
    );
  });
});

describe('fromAnthropicJson', () => {
  it('maps content + usage + finish_reason', () => {
    const r = fromAnthropicJson({
      id: 'msg_1',
      model: 'claude',
      content: [{ type: 'text', text: 'Hi' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 3 },
    }) as Record<string, any>;
    assert.equal(r.choices[0].message.content, 'Hi');
    assert.equal(r.choices[0].finish_reason, 'stop');
    assert.equal(r.usage.total_tokens, 8);
  });
  it('max_tokens -> length', () => {
    const r = fromAnthropicJson({ stop_reason: 'max_tokens', usage: {} }) as Record<string, any>;
    assert.equal(r.choices[0].finish_reason, 'length');
  });
});

describe('fromGeminiJson', () => {
  it('maps candidates + usageMetadata', () => {
    const r = fromGeminiJson({
      model: 'gemini-1.5',
      candidates: [{ content: { parts: [{ text: 'Yo' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 4 },
    }) as Record<string, any>;
    assert.equal(r.choices[0].message.content, 'Yo');
    assert.equal(r.choices[0].finish_reason, 'stop');
    assert.equal(r.usage.total_tokens, 6);
  });
  it('MAX_TOKENS -> length', () => {
    const r = fromGeminiJson({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) as Record<
      string,
      any
    >;
    assert.equal(r.choices[0].finish_reason, 'length');
  });
});

describe('AnthropicStreamTranslator', () => {
  it('streams text deltas and emits [DONE] with usage', () => {
    const t = new AnthropicStreamTranslator();
    const a = t.push('event: message_start\ndata: {"message":{"usage":{"input_tokens":4}}}\n\n');
    const b = t.push(
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"Hel"}}\n\n',
    );
    const c = t.push(
      'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":"lo"}}\n\n',
    );
    const d = t.push('event: message_delta\ndata: {"usage":{"output_tokens":2}}\n\n');
    const e = t.push('event: message_stop\ndata: {}\n\n');
    assert.equal(a, '');
    assert.ok(b.includes('Hel'));
    assert.ok(c.includes('lo'));
    assert.equal(d, '');
    assert.ok(e.includes('[DONE]'));
    assert.ok(e.includes('"total_tokens":6'));
  });
});

describe('GeminiStreamTranslator', () => {
  it('streams parts and emits [DONE] with usage', () => {
    const t = new GeminiStreamTranslator();
    const a = t.push('data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n');
    const b = t.push(
      'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":2}}\n\n',
    );
    const c = t.flush();
    assert.ok(a.includes('Hi'));
    assert.equal(b, '');
    assert.ok(c.includes('[DONE]'));
    assert.ok(c.includes('"total_tokens":3'));
  });
});

describe('createStreamTranslator', () => {
  it('null for openai (pass-through), instances for anthropic/gemini', () => {
    assert.equal(createStreamTranslator('openai'), null);
    assert.ok(createStreamTranslator('anthropic'));
    assert.ok(createStreamTranslator('gemini'));
  });
});
