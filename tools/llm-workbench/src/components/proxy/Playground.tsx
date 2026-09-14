import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Play, Settings2, Download } from 'lucide-react';
import {
  authFetch,
  fetchProviderModels,
  saveProxyConfig,
  fetchProxyLogs,
  type ProxyLog,
  type MaskedProviderConfig,
} from '../../api';
import { Card, Empty } from '../../ui';
import { mergeModels, computeEnabledModels } from '../../lib/modelMerge';
import { Stat } from './shared';

// ───────── 试用 Playground ─────────
export function Playground({
  cfg,
  onSaved,
}: {
  cfg: Record<string, MaskedProviderConfig>;
  onSaved: () => void;
}) {
  const configured = Object.entries(cfg)
    .filter(([, c]) => c.enabled)
    .map(([id, c]) => ({
      id,
      name: c.name,
      models: c.enabledModels && c.enabledModels.length > 0 ? c.enabledModels : null,
    }));
  const [provider, setProvider] = useState(configured[0]?.id ?? '');
  const [model, setModel] = useState('');
  const [message, setMessage] = useState('你好，用一句话介绍你自己。');
  const [reply, setReply] = useState('');
  const [stream, setStream] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<ProxyLog | null>(null);

  // 仅在厂商真正切换时重置模型：避免每次渲染清空自由文本输入
  const lastProviderRef = useRef<string | null>(null);
  useEffect(() => {
    if (!provider && configured[0]) {
      setProvider(configured[0].id);
      return;
    }
    if (lastProviderRef.current === provider) return;
    lastProviderRef.current = provider;
    const p = configured.find((x) => x.id === provider);
    if (p?.models && p.models.length) {
      setModel((m) => (p.models!.includes(m) ? m : p.models![0]));
    } else {
      setModel(''); // 切到无清单厂商：清空，避免沿用上一个厂商的模型名
    }
  }, [configured, provider]);

  // 多轮对话历史 / 最近输入 / 模型管理面板
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  // ── 内联模型管理（无需回配置页）──
  const refreshModels = async (id: string) => {
    if (!id) return;
    setModelLoading(true);
    setModelError('');
    try {
      const fetched = await fetchProviderModels(id);
      if (fetched.length === 0) {
        // 空列表不覆盖已有配置：保留手动添加的模型
        setModelError(
          '上游返回空列表，已保留你手动添加的模型；请确认 baseUrl / Key 是否正确，或该厂商不支持 /models',
        );
        return;
      }
      // 合并：保留手动添加的模型，避免重新拉取时覆盖用户已录入的清单
      const merged = mergeModels(cfg[id]?.models, fetched);
      const enabled = computeEnabledModels(merged, cfg[id]?.enabledModels);
      await saveProxyConfig(id, { models: merged, enabledModels: enabled });
      void onSaved();
    } catch (e) {
      setModelError(`获取失败: ${(e as Error).message}`);
    } finally {
      setModelLoading(false);
    }
  };
  const toggleModelInline = async (id: string, m: string, on: boolean) => {
    const cur = new Set(cfg[id]?.enabledModels ?? []);
    if (on) cur.add(m);
    else cur.delete(m);
    try {
      await saveProxyConfig(id, { enabledModels: [...cur] });
      void onSaved();
    } catch (e) {
      setModelError(`保存失败: ${(e as Error).message}`);
    }
  };
  const addManualModel = async (id: string, name: string) => {
    const name2 = name.trim();
    if (!id || !name2) return;
    const existing = cfg[id]?.models ?? [];
    const models = existing.includes(name2) ? existing : [...existing, name2];
    const enabled = new Set(cfg[id]?.enabledModels ?? []);
    enabled.add(name2);
    try {
      await saveProxyConfig(id, { models, enabledModels: [...enabled] });
      void onSaved();
      setManualModel('');
    } catch (e) {
      setModelError(`保存失败: ${(e as Error).message}`);
    }
  };

  const send = async () => {
    const userMsg = message.trim();
    if (!provider || !model || !userMsg) return;
    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: userMsg },
    ];
    setReply('');
    setStats(null);
    setBusy(true);
    setHistory((h) => [...h, { role: 'user', content: userMsg }]);
    setRecent((r) => [userMsg, ...r.filter((x) => x !== userMsg)].slice(0, 5));
    setMessage('');
    let full = '';
    try {
      const res = await authFetch(`/api/proxy/${provider}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream }),
      });
      if (!res.ok) {
        setReply(`错误 HTTP ${res.status}: ${await res.text()}`);
        return;
      }
      if (!stream || !res.body) {
        const j = await res.json();
        full = j.choices?.[0]?.message?.content ?? JSON.stringify(j);
        setReply(full);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const mm = line.match(/^data:\s*(.*)$/);
          if (!mm) continue;
          const payload = mm[1].trim();
          if (payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
            if (delta) {
              full += delta;
              setReply(full);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      setReply(`请求失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      // 把最终回复写入历史（仅在有实质内容时）；错误信息不进历史
      if (full) setHistory((h) => [...h, { role: 'assistant', content: full }]);
      setReply('');
      // 取最近一条该 provider 日志作为本次统计
      try {
        const { logs } = await fetchProxyLogs({ provider, limit: 1 });
        if (logs[0]) setStats(logs[0]);
      } catch {
        /* ignore */
      }
    }
  };

  if (configured.length === 0) {
    return <Empty text="尚未启用任何厂商，请先到「配置 / 导入」页添加并勾选「启用」。" />;
  }

  const cur = configured.find((p) => p.id === provider);
  const provModels = cfg[provider]?.models ?? [];
  const provEnabled = cfg[provider]?.enabledModels ?? [];

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="请求" subtitle="经本地代理转发，多轮对话自动带上历史">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {configured.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {cur?.models ? (
              <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                {cur.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                placeholder="模型名，如 gpt-4o（该厂商未配置清单，可手动输入）"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            )}
          </div>

          <button className="btn btn-sm self-start" onClick={() => setModelPanelOpen((o) => !o)}>
            <Settings2 size={12} />
            模型清单 ({provModels.length}
            {provEnabled.length !== provModels.length ? ` / 启用 ${provEnabled.length}` : ''})
          </button>

          {modelPanelOpen && (
            <div className="space-y-2 rounded-lg border border-edge bg-[#0d1728] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-muted">勾选 = 启用（仅启用项出现在上方下拉）</div>
                <button
                  className="btn btn-sm shrink-0"
                  onClick={() => refreshModels(provider)}
                  disabled={modelLoading || !provider}
                >
                  <Download size={12} />
                  {modelLoading ? '获取中…' : '刷新拉取'}
                </button>
              </div>
              {modelError && <div className="text-[11px] text-up">{modelError}</div>}
              {provModels.length > 0 ? (
                <div className="max-h-40 space-y-0.5 overflow-auto rounded-md border border-edge">
                  {provModels.map((m) => {
                    const on = provEnabled.includes(m);
                    return (
                      <label
                        key={m}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-[#16223a]"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => toggleModelInline(provider, m, e.target.checked)}
                        />
                        <span className={on ? 'text-ink' : 'text-muted'}>{m}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[11px] text-muted">
                  尚未拉取。点「刷新拉取」从上游获取；若上游不支持 /models，可在下方手动添加。
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder="手动添加模型名（如 gpt-4o）"
                  value={manualModel}
                  onChange={(e) => setManualModel(e.target.value)}
                />
                <button
                  className="btn btn-sm"
                  onClick={() => addManualModel(provider, manualModel)}
                  disabled={!manualModel.trim()}
                >
                  添加
                </button>
              </div>
            </div>
          )}

          <textarea
            className="input h-32 w-full"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="输入消息发送（多轮对话自动保留历史）"
          />

          {recent.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recent.map((r, i) => (
                <button
                  key={i}
                  className="max-w-[160px] truncate rounded-full border border-edge px-2 py-0.5 text-[10px] text-muted hover:text-ink"
                  onClick={() => setMessage(r)}
                  title="重发"
                >
                  {r.length > 14 ? r.slice(0, 14) + '…' : r}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={stream}
                onChange={(e) => setStream(e.target.checked)}
              />
              SSE 流式
            </label>
            <button className="btn btn-primary" onClick={send} disabled={busy || !model}>
              <Play size={12} />
              {busy ? '请求中…' : '发送'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setHistory([]);
                setReply('');
                setStats(null);
              }}
            >
              清空对话
            </button>
          </div>
        </div>
      </Card>

      <Card title="对话 + 本次统计">
        <div className="max-h-72 space-y-2 overflow-auto">
          {history.length === 0 && !busy && (
            <div className="text-[11px] text-muted">（发送一条消息开始对话）</div>
          )}
          {history.map((m, i) => (
            <div
              key={i}
              className={clsx(
                'rounded-lg px-3 py-2 text-xs',
                m.role === 'user' ? 'bg-accent/10 text-ink' : 'bg-[#0d1728] text-ink',
              )}
            >
              <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">
                {m.role === 'user' ? '你' : '助手'}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          ))}
          {busy && reply && (
            <div className="rounded-lg bg-[#0d1728] px-3 py-2 text-xs text-ink">
              <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted">
                助手（生成中…）
              </div>
              <div className="whitespace-pre-wrap break-words">{reply}</div>
            </div>
          )}
        </div>
        {stats && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-edge pt-3 text-[11px]">
            <Stat label="状态" value={stats.status ?? '网络错误'} />
            <Stat label="延迟" value={`${stats.latencyMs}ms`} />
            <Stat label="首字延迟" value={stats.ttftMs != null ? `${stats.ttftMs}ms` : '—'} />
            <Stat label="输入 tokens" value={stats.inputTokens ?? '—'} />
            <Stat label="输出 tokens" value={stats.outputTokens ?? '—'} />
            <Stat
              label="缓存命中"
              value={stats.cacheHitRate != null ? `${(stats.cacheHitRate * 100).toFixed(1)}%` : '—'}
            />
            {stats.error && <div className="col-span-2 text-up">错误: {stats.error}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}
