import { useMemo, useState } from 'react';
import { Check, Copy, Download, Play, Scale, Trash2 } from 'lucide-react';
import {
  authFetch,
  fetchLogByRequestId,
  type MaskedProviderConfig,
  type ProxyLog,
} from '../../api';
import { Card, Chip, Empty } from '../../ui';
import { fmtCost, type Currency } from './shared';

// 多模型对比：同一 prompt 并发打到多个「厂商 × 模型」，并排比较输出与实测指标。
// 指标来源优先级：响应头 x-request-id 反查调用日志（含服务端成本估算 / TTFT）→ 响应体 usage 兜底。
// 统一走非流式，避免多个 SSE 流互相抢占带宽导致延迟失真；延迟为客户端实测端到端耗时。

const MAX_TARGETS = 6;

interface Target {
  provider: string;
  model: string;
}

interface CompareResult extends Target {
  status: number | null;
  latencyMs: number;
  text: string;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  ttftMs: number | null;
  fromCache: boolean;
}

const key = (t: Target) => `${t.provider}::${t.model}`;

function download(filename: string, text: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  content?: { text?: string }[]; // Anthropic 形态（代理已翻译，仅作兜底）
  text?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: unknown;
}

async function runOne(t: Target, body: Record<string, unknown>): Promise<CompareResult> {
  const t0 = performance.now();
  const base: CompareResult = {
    ...t,
    status: null,
    latencyMs: 0,
    text: '',
    error: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    ttftMs: null,
    fromCache: false,
  };
  try {
    const res = await authFetch(`/api/proxy/${encodeURIComponent(t.provider)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const requestId = res.headers.get('x-request-id') ?? '';
    const json = (await res.json().catch(() => null)) as ChatResponse | null;
    base.latencyMs = Math.round(performance.now() - t0);
    base.status = res.status;
    if (!res.ok) {
      const e = json?.error;
      const detail =
        typeof e === 'string'
          ? e
          : ((e as { message?: string } | undefined)?.message ?? res.statusText);
      base.error = `HTTP ${res.status} ${detail}`;
      return base;
    }
    base.text =
      json?.choices?.[0]?.message?.content ?? json?.content?.[0]?.text ?? json?.text ?? '';
    const usage = json?.usage ?? null;
    if (usage) {
      base.inputTokens = usage.prompt_tokens ?? null;
      base.outputTokens = usage.completion_tokens ?? null;
    }
    // 服务端日志含成本估算与 TTFT：按 requestId 精确匹配，取不到则保留响应体 usage
    const log: ProxyLog | null = await fetchLogByRequestId(requestId);
    if (log) {
      base.inputTokens = log.inputTokens ?? base.inputTokens;
      base.outputTokens = log.outputTokens ?? base.outputTokens;
      base.costUsd = log.costUsd;
      base.ttftMs = log.ttftMs;
      base.fromCache = Boolean(log.fromCache);
    }
  } catch (e) {
    base.error = (e as Error).message;
    base.latencyMs = Math.round(performance.now() - t0);
  }
  return base;
}

export function Compare({ cfg }: { cfg: Record<string, MaskedProviderConfig> }) {
  const [prompt, setPrompt] = useState('用一句话介绍你自己，并说明你最擅长的一类任务。');
  const [system, setSystem] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [copied, setCopied] = useState<string | null>(null);

  // 可选目标：已启用厂商 × 其启用模型（未配置启用子集时退回完整清单）
  const targets = useMemo<Target[]>(() => {
    const out: Target[] = [];
    for (const [id, c] of Object.entries(cfg)) {
      if (!c.enabled) continue;
      const models =
        c.enabledModels && c.enabledModels.length > 0 ? c.enabledModels : (c.models ?? []);
      for (const m of models) out.push({ provider: id, model: m });
    }
    return out;
  }, [cfg]);

  const selected = targets.filter((t) => picked.includes(key(t)));

  const toggle = (k: string) => {
    setPicked((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k);
      if (prev.length >= MAX_TARGETS) return prev; // 超上限忽略，避免一次打太多
      return [...prev, k];
    });
  };

  const run = async () => {
    if (selected.length === 0 || !prompt.trim()) return;
    setBusy(true);
    const body: Record<string, unknown> = {
      messages: [
        ...(system.trim() ? [{ role: 'system', content: system.trim() }] : []),
        { role: 'user', content: prompt.trim() },
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false,
    };
    const list = await Promise.all(selected.map((t) => runOne(t, { ...body, model: t.model })));
    setResults(list);
    setBusy(false);
  };

  const ok = results.filter((r) => !r.error);
  const fastest = ok.reduce<CompareResult | null>(
    (a, b) => (a === null || b.latencyMs < a.latencyMs ? b : a),
    null,
  );
  const cheapest = ok.reduce<CompareResult | null>(
    (a, b) => (a === null || (b.costUsd ?? Infinity) < (a.costUsd ?? Infinity) ? b : a),
    null,
  );

  const copy = async (text: string, id: string) => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
  };

  const exportMd = () => {
    const lines = [`# 多模型对比`, ``, `> Prompt: ${prompt.trim()}`, ``];
    for (const r of results) {
      lines.push(`## ${r.provider} / ${r.model}`);
      lines.push(
        `- 状态 ${r.status ?? '—'} · 延迟 ${r.latencyMs}ms · tokens ${r.inputTokens ?? '—'}/${r.outputTokens ?? '—'} · 成本 ${r.costUsd != null ? fmtCost(r.costUsd, currency) : '—'}`,
      );
      if (r.error) lines.push(`- 错误：${r.error}`);
      lines.push('', r.text || '_(空)_', '');
    }
    download(`compare-${Date.now()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  };

  const exportJson = () => {
    download(
      `compare-${Date.now()}.json`,
      JSON.stringify({ prompt, system, temperature, maxTokens, results }, null, 2),
      'application/json',
    );
  };

  if (targets.length === 0) {
    return (
      <Empty text="尚无可用目标：请先在「配置 / 导入」启用至少一个厂商，并拉取或手动添加模型。" />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-3">
        <Card title="对比设置">
          <div className="space-y-2">
            <textarea
              className="input h-24 w-full"
              placeholder="Prompt（所有目标使用同一条）"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <input
              className="input"
              placeholder="System 提示（可选）"
              value={system}
              onChange={(e) => setSystem(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px] text-muted">
                温度 {temperature}
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted">
                max_tokens
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={8192}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(Number(e.target.value) || 512)}
                />
              </label>
            </div>
          </div>
        </Card>

        <Card
          title={`选择目标（已选 ${picked.length}/${MAX_TARGETS}）`}
          subtitle="并发发送同一 prompt；建议一次不超过 6 个，避免限流影响延迟对比"
        >
          <div className="max-h-64 space-y-0.5 overflow-auto rounded-md border border-edge">
            {targets.map((t) => {
              const k = key(t);
              const on = picked.includes(k);
              return (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-[#16223a]"
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(k)} />
                  <span className={on ? 'text-ink' : 'text-muted'}>{t.provider}</span>
                  <span className="truncate text-[11px] text-muted">{t.model}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-primary"
              onClick={() => void run()}
              disabled={busy || selected.length === 0 || !prompt.trim()}
            >
              <Play size={12} />
              {busy ? '对比中…' : `开始对比 (${selected.length})`}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPicked([]);
                setResults([]);
              }}
              disabled={busy}
            >
              <Trash2 size={12} />
              清空
            </button>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        {results.length === 0 ? (
          <Card title="对比结果">
            <Empty text="选择目标后点「开始对比」" />
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="accent">
                <Scale size={11} />
                {results.length} 个结果
              </Chip>
              {fastest && (
                <Chip tone="down">
                  最快：{fastest.model} · {fastest.latencyMs}ms
                </Chip>
              )}
              {cheapest?.costUsd != null && (
                <Chip tone="ok">
                  最省：{cheapest.model} · {fmtCost(cheapest.costUsd, currency)}
                </Chip>
              )}
              <button
                className="btn btn-sm"
                onClick={() => setCurrency((c) => (c === 'USD' ? 'CNY' : 'USD'))}
              >
                {currency === 'USD' ? '切 ¥' : '切 $'}
              </button>
              <button className="btn btn-sm" onClick={exportMd} disabled={busy}>
                <Download size={12} />
                Markdown
              </button>
              <button className="btn btn-sm" onClick={exportJson} disabled={busy}>
                <Download size={12} />
                JSON
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
              {results.map((r) => (
                <Card
                  key={key(r)}
                  title={`${r.provider} · ${r.model}`}
                  right={
                    <div className="flex items-center gap-1">
                      {r.fromCache && <Chip tone="warn">缓存</Chip>}
                      <Chip tone={r.error ? 'up' : 'down'}>{r.error ? '失败' : r.status}</Chip>
                    </div>
                  }
                >
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted sm:grid-cols-4">
                    <div>
                      延迟
                      <div className="font-semibold text-ink">{r.latencyMs} ms</div>
                    </div>
                    <div>
                      TTFT
                      <div className="font-semibold text-ink">
                        {r.ttftMs != null ? `${r.ttftMs} ms` : '—'}
                      </div>
                    </div>
                    <div>
                      tokens
                      <div className="font-semibold text-ink">
                        {r.inputTokens ?? '—'} / {r.outputTokens ?? '—'}
                      </div>
                    </div>
                    <div>
                      成本
                      <div className="font-semibold text-ink">
                        {r.costUsd != null ? fmtCost(r.costUsd, currency) : '—'}
                      </div>
                    </div>
                  </div>
                  {r.error ? (
                    <div className="mt-2 break-words text-[11px] text-up">{r.error}</div>
                  ) : (
                    <>
                      <div className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-edge bg-[#0d1728] p-2 text-xs text-ink">
                        {r.text || '（空响应）'}
                      </div>
                      <button className="btn btn-sm mt-2" onClick={() => void copy(r.text, key(r))}>
                        {copied === key(r) ? <Check size={12} /> : <Copy size={12} />}
                        {copied === key(r) ? '已复制' : '复制输出'}
                      </button>
                    </>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
