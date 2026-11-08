// 自定义厂商 API 格式转换层。
// 代理对客户端暴露统一的 OpenAI 兼容接口（chat/completions、OpenAI 风格的请求/响应），
// 但当自定义厂商的真实上游是 Anthropic Messages 或 Google Gemini 时，需要在此把
// OpenAI 风格的请求/响应 与 上游格式 互转，使「任意上游」都能通过统一的 OpenAI 接口调用。
//
// 支持格式：openai（透传）/ anthropic（Messages API）/ gemini（generateContent）。
// 范围：文本对话（messages 中 content 为字符串或 [{type:'text'}]）。
// 暂不支持：tool/function calling、多模态图片、reasoning 等高级字段——这些字段会被忽略或丢弃。

export type ApiFormat = 'openai' | 'anthropic' | 'gemini';

type Json = Record<string, unknown>;

function contentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        p && typeof p === 'object' && typeof (p as Json).text === 'string' ? (p as Json).text : '',
      )
      .join('');
  }
  return '';
}

function splitMessages(messages: unknown): { system: string; conv: Json[] } {
  const systemParts: string[] = [];
  const conv: Json[] = [];
  if (Array.isArray(messages)) {
    for (const m of messages as Json[]) {
      const role = String(m.role ?? 'user');
      if (role === 'system') {
        systemParts.push(contentToString(m.content));
      } else {
        conv.push(m);
      }
    }
  }
  return { system: systemParts.join('\n'), conv };
}

function mapAnthropicStop(reason: unknown): string {
  if (reason === 'max_tokens') return 'length';
  if (reason === 'tool_use') return 'tool_calls';
  return 'stop';
}

function mapGeminiFinish(reason: unknown): string {
  if (reason === 'MAX_TOKENS') return 'length';
  if (reason === 'SAFETY' || reason === 'RECITATION') return 'content_filter';
  return 'stop';
}

// ───────── 请求转换：OpenAI → 上游 ─────────

export function toAnthropicRequest(body: Json): Json {
  const { system, conv } = splitMessages(body.messages);
  const messages = conv.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: contentToString(m.content),
  }));
  const out: Json = {
    model: body.model,
    messages,
    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 4096,
  };
  if (system) out.system = system;
  if (typeof body.temperature === 'number') out.temperature = body.temperature;
  if (typeof body.top_p === 'number') out.top_p = body.top_p;
  if (body.stop != null) out.stop_sequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  if (body.stream === true) out.stream = true;
  return out;
}

export function toGeminiRequest(body: Json): Json {
  const { system, conv } = splitMessages(body.messages);
  const contents = conv.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: contentToString(m.content) }],
  }));
  const genConfig: Json = {};
  if (typeof body.temperature === 'number') genConfig.temperature = body.temperature;
  if (typeof body.top_p === 'number') genConfig.topP = body.top_p;
  if (typeof body.max_tokens === 'number') genConfig.maxOutputTokens = body.max_tokens;
  if (body.stop != null)
    genConfig.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  const out: Json = { contents };
  if (system) out.systemInstruction = { parts: [{ text: system }] };
  if (Object.keys(genConfig).length > 0) out.generationConfig = genConfig;
  return out;
}

// 上游 URL（baseUrl 已规范化为无尾斜杠）
export function buildUpstreamUrl(
  format: ApiFormat,
  baseUrl: string,
  model: string,
  stream: boolean,
): string {
  const b = baseUrl.replace(/\/+$/, '');
  if (format === 'anthropic') return `${b}/messages`;
  if (format === 'gemini') {
    const m = encodeURIComponent(model || 'unknown');
    return `${b}/models/${m}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  }
  return b; // openai 透传由调用方拼接 wildcard
}

// ───────── 响应转换：上游 → OpenAI（非流式 JSON） ─────────

export function fromAnthropicJson(json: Json): Json {
  const content = Array.isArray(json.content)
    ? (json.content as Json[]).map((c) => (c.type === 'text' ? String(c.text ?? '') : '')).join('')
    : '';
  const usage = (json.usage as Json) ?? {};
  const inT = Number(usage.input_tokens ?? 0);
  const outT = Number(usage.output_tokens ?? 0);
  return {
    id: json.id ?? 'cmpl-anthropic',
    object: 'chat.completion',
    model: json.model ?? '',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: mapAnthropicStop(json.stop_reason),
      },
    ],
    usage: { prompt_tokens: inT, completion_tokens: outT, total_tokens: inT + outT },
  };
}

export function fromGeminiJson(json: Json): Json {
  const cand = (json.candidates as Json[] | undefined)?.[0] ?? {};
  const parts = Array.isArray((cand.content as Json)?.parts)
    ? ((cand.content as Json).parts as Json[]).map((p) => String(p.text ?? '')).join('')
    : '';
  const um = (json.usageMetadata as Json) ?? {};
  const inT = Number(um.promptTokenCount ?? 0);
  const outT = Number(um.candidatesTokenCount ?? 0);
  return {
    id: `gemini-${(json as Json).model ?? 'x'}`,
    object: 'chat.completion',
    model: String((json as Json).model ?? ''),
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: parts },
        finish_reason: mapGeminiFinish(cand.finishReason),
      },
    ],
    usage: { prompt_tokens: inT, completion_tokens: outT, total_tokens: inT + outT },
  };
}

// ───────── 响应转换：上游 → OpenAI（流式 SSE） ─────────
// 上游 SSE 文本逐块喂入 push()，返回应写给客户端的 OpenAI SSE 文本；
// 流结束时调用 flush() 补发 finish_reason / usage / [DONE]。

export interface StreamTranslator {
  push(chunk: string): string;
  flush(): string;
}

function openaiDelta(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`;
}
function openaiDone(finish: string, inT: number, outT: number): string {
  return (
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\n\n` +
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: inT, completion_tokens: outT, total_tokens: inT + outT } })}\n\n` +
    `data: [DONE]\n\n`
  );
}

// 解析 SSE 文本缓冲区，按双换行切分出完整事件，逐个交给 handler
function drainEvents(
  buf: string,
  handler: (event: string, data: string) => string,
): { out: string; rest: string } {
  let out = '';
  let rest = buf;
  let idx: number;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event = '';
    let data = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data = line.slice(5).trim();
    }
    if (data) out += handler(event, data);
  }
  return { out, rest };
}

export class AnthropicStreamTranslator implements StreamTranslator {
  private buf = '';
  private inputTokens = 0;
  private outputTokens = 0;

  push(chunk: string): string {
    this.buf += chunk;
    const { out, rest } = drainEvents(this.buf, (event, data) => {
      let j: Json;
      try {
        j = JSON.parse(data);
      } catch {
        return '';
      }
      if (event === 'message_start') {
        this.inputTokens = Number(
          (j as Record<string, any>)?.message?.usage?.input_tokens ?? this.inputTokens,
        );
        return '';
      }
      if (event === 'content_block_delta') {
        const dt = j?.delta as Json;
        if (dt?.type === 'text_delta' && typeof dt.text === 'string') return openaiDelta(dt.text);
        return '';
      }
      if (event === 'message_delta') {
        this.outputTokens = Number(
          (j as Record<string, any>)?.usage?.output_tokens ?? this.outputTokens,
        );
        return '';
      }
      if (event === 'message_stop') {
        return openaiDone('stop', this.inputTokens, this.outputTokens);
      }
      return '';
    });
    this.buf = rest;
    return out;
  }

  flush(): string {
    if (!this.buf) return '';
    const out = this.push(this.buf + '\n\n');
    this.buf = '';
    return out;
  }
}

export class GeminiStreamTranslator implements StreamTranslator {
  private buf = '';
  private finish = 'stop';
  private inputTokens = 0;
  private outputTokens = 0;

  push(chunk: string): string {
    this.buf += chunk;
    const { out, rest } = drainEvents(this.buf, (_event, data) => {
      let j: Json;
      try {
        j = JSON.parse(data);
      } catch {
        return '';
      }
      const cand = (j.candidates as Json[] | undefined)?.[0] ?? {};
      if (cand.finishReason) this.finish = mapGeminiFinish(cand.finishReason);
      const um = j.usageMetadata as Json | undefined;
      if (um) {
        this.inputTokens = Number(um.promptTokenCount ?? this.inputTokens);
        this.outputTokens = Number(um.candidatesTokenCount ?? this.outputTokens);
      }
      const parts = Array.isArray((cand.content as Json)?.parts)
        ? ((cand.content as Json).parts as Json[]).map((p) => String(p.text ?? '')).join('')
        : '';
      return parts ? openaiDelta(parts) : '';
    });
    this.buf = rest;
    return out;
  }

  flush(): string {
    let out = '';
    if (this.buf) {
      out += this.push(this.buf + '\n\n');
      this.buf = '';
    }
    out += openaiDone(this.finish, this.inputTokens, this.outputTokens);
    return out;
  }
}

export function createStreamTranslator(format: ApiFormat): StreamTranslator | null {
  if (format === 'anthropic') return new AnthropicStreamTranslator();
  if (format === 'gemini') return new GeminiStreamTranslator();
  return null;
}
