import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import clsx from 'clsx';
import {
  Activity,
  Key,
  Menu,
  Play,
  Plus,
  ScrollText,
  Search,
  Settings2,
  Trash2,
  Upload,
  CircleDot,
} from 'lucide-react';
import type { ProviderConsole, ProbeResult } from '../../server/types';
import {
  deleteProxyConfig,
  fetchProxyConfig,
  fetchProxyLogs,
  fetchProxyMetrics,
  importProxyConfig,
  runProxyConnectivity,
  saveProxyConfig,
  fetchCacheStats,
  clearResponseCache,
  fetchCryptoStatus,
  initEncryption,
  disableEncryption,
  fmtTime,
  type AuthStyle,
  type MaskedProviderConfig,
  type ProxyConfigPatch,
  type ProxyLog,
  type ProxyMetrics,
  type CryptoStatus,
  type ApiFormat,
} from '../api';
import { Card, Chip, Empty, Spinner } from '../ui';

type SubTab = 'config' | 'play' | 'metrics' | 'logs';

// USD → CNY 近似汇率（仅用于展示换算，非实时）
const CNY_PER_USD = 7.2;

type Currency = 'USD' | 'CNY';

function fmtCost(usd: number, currency: Currency): string {
  if (!Number.isFinite(usd) || usd === 0) return currency === 'USD' ? '$0.00' : '¥0.00';
  const v = currency === 'USD' ? usd : usd * CNY_PER_USD;
  const sym = currency === 'USD' ? '$' : '¥';
  if (v < 0.01) return `${sym}${v.toFixed(4)}`;
  return `${sym}${v.toFixed(2)}`;
}

export default function Proxy({ providers }: { providers: ProviderConsole[] }) {
  const [sub, setSub] = useState<SubTab>('config');
  const [cfg, setCfg] = useState<Record<string, MaskedProviderConfig>>({});
  const [cfgLoading, setCfgLoading] = useState(false);
  const [saveState, setSaveState] = useState<Record<string, string>>({});

  const loadConfig = useCallback(async () => {
    setCfgLoading(true);
    try {
      const r = await fetchProxyConfig();
      setCfg(r.providers);
    } finally {
      setCfgLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const SUBTABS: { id: SubTab; label: string; icon: typeof Settings2 }[] = [
    { id: 'config', label: '配置 / 导入', icon: Settings2 },
    { id: 'play', label: '试用', icon: Play },
    { id: 'metrics', label: '实时指标', icon: Activity },
    { id: 'logs', label: '调用日志', icon: ScrollText },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-edge px-4 py-2">
        {SUBTABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={clsx(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors',
              sub === id ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-[#16223a] hover:text-ink',
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {sub === 'config' && (
          <ConfigPanel
            providers={providers}
            cfg={cfg}
            cfgLoading={cfgLoading}
            saveState={saveState}
            setSaveState={setSaveState}
            onSaved={loadConfig}
            onDelete={async (id) => {
              await deleteProxyConfig(id);
              await loadConfig();
            }}
          />
        )}
        {sub === 'play' && <Playground cfg={cfg} />}
        {sub === 'metrics' && <MetricsPanel />}
        {sub === 'logs' && <LogsPanel providers={providers} cfg={cfg} />}
      </div>
    </div>
  );
}

// ───────── 配置 / 导入 ─────────
function ConfigPanel({
  providers,
  cfg,
  cfgLoading,
  saveState,
  setSaveState,
  onSaved,
  onDelete,
}: {
  providers: ProviderConsole[];
  cfg: Record<string, MaskedProviderConfig>;
  cfgLoading: boolean;
  saveState: Record<string, string>;
  setSaveState: Dispatch<SetStateAction<Record<string, string>>>;
  onSaved: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<
    Record<string, { key: string; extraKeys: string; baseUrl: string; enabled: boolean; customName: string; authStyle: AuthStyle; apiFormat: ApiFormat; id: string }>
  >({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [connect, setConnect] = useState<ProbeResult[] | null>(null);
  const [connecting, setConnecting] = useState(false);

  const isCustom = (id: string) => id !== '__new__' && !providers.some((p) => p.id === id);
  const knownIds = new Set(providers.map((p) => p.id));

  const getEntry = (id: string) => {
    const f = form[id];
    if (f) return f;
    const c = cfg[id];
    return {
      key: '',
      extraKeys: '',
      baseUrl: c?.baseUrl ?? '',
      enabled: c?.enabled ?? false,
      customName: c?.customName ?? '',
      authStyle: c?.authStyle ?? 'bearer',
      apiFormat: c?.apiFormat ?? 'openai',
      id: id === '__new__' ? '' : id,
    };
  };

  const update = (id: string, patch: Partial<{ key: string; extraKeys: string; baseUrl: string; enabled: boolean; customName: string; authStyle: AuthStyle; apiFormat: ApiFormat; id: string }>) => {
    setForm((prev) => ({ ...prev, [id]: { ...getEntry(id), ...patch } }));
  };

  const save = async (id: string) => {
    const realId = id === '__new__' ? (form['__new__']?.id ?? '').trim().toLowerCase() : id;
    if (!realId) {
      setSaveState((s) => ({ ...s, [id]: '请填写厂商 ID' }));
      return;
    }
    if (id === '__new__' && knownIds.has(realId)) {
      setSaveState((s) => ({ ...s, [id]: '该 ID 与主流厂商冲突' }));
      return;
    }
    const f = getEntry(id);
    const patch: ProxyConfigPatch = { baseUrl: f.baseUrl || undefined, enabled: f.enabled };
    if (f.key) patch.apiKey = f.key;
    // 多 key 池：主 key + 额外 key（逐行），去重交由后端；空数组表示不修改
    const keys: string[] = [];
    if (f.key) keys.push(f.key);
    for (const ln of f.extraKeys.split('\n')) {
      const t = ln.trim();
      if (t) keys.push(t);
    }
    if (keys.length > 0) patch.apiKeys = keys;
    if (isCustom(realId)) {
      patch.customName = f.customName || f.baseUrl || realId;
      patch.authStyle = f.authStyle;
      patch.apiFormat = f.apiFormat;
    }
    setSaveState((s) => ({ ...s, [id]: 'saving' }));
    try {
      await saveProxyConfig(realId, patch);
      setForm((prev) => ({ ...prev, [id]: { ...getEntry(id), key: '' } }));
      setSaveState((s) => ({ ...s, [realId]: '已保存' }));
      await onSaved();
      if (id === '__new__') setSelected(realId);
      setTimeout(() => setSaveState((s) => ({ ...s, [realId]: '' })), 2000);
    } catch (e) {
      setSaveState((s) => ({ ...s, [id]: `失败: ${(e as Error).message}` }));
    }
  };

  const doImport = async () => {
    setImportMsg(null);
    try {
      const parsed = JSON.parse(importText);
      await importProxyConfig(parsed);
      void onSaved();
      setImportMsg('导入成功');
    } catch (e) {
      setImportMsg(`导入失败: ${(e as Error).message}`);
    }
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setImportText(text);
    try {
      const parsed = JSON.parse(text);
      await importProxyConfig(parsed);
      void onSaved();
      setImportMsg(`已导入文件: ${file.name}`);
    } catch (e) {
      setImportMsg(`文件解析失败: ${(e as Error).message}`);
    }
  };

  const testConn = async () => {
    setConnecting(true);
    setConnect(null);
    try {
      const ids = Object.keys(cfg);
      if (ids.length === 0) {
        setConnect([
          {
            providerId: '—',
            ok: false,
            httpStatus: null,
            latencyMs: null,
            state: 'error',
            modelCount: null,
            message: '尚未添加任何厂商，请先在左侧「添加自定义厂商」或选择主流厂商并保存',
            checkedAt: Date.now(),
          },
        ]);
        return;
      }
      setConnect(await runProxyConnectivity(ids));
    } finally {
      setConnecting(false);
    }
  };

  if (cfgLoading) return <Spinner label="加载配置…" />;

  const mainList = providers.filter(
    (p) => !search || p.nameCn.includes(search) || p.name.includes(search) || p.id.includes(search),
  );
  const customList = Object.entries(cfg).filter(([id]) => cfg[id].custom);

  const f = selected ? getEntry(selected) : null;
  // '__new__' 是「新建自定义厂商」哨兵，应视同自定义上下文，否则 id/名称/baseUrl/鉴权 字段会被整体隐藏
  const selCustom = selected === '__new__' || (selected != null && isCustom(selected));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card
        title="API Key 管理（仅本机存储）"
        subtitle="Key 保存在本机 home/.llm-workbench/config.json，不进仓库；代理仅监听 127.0.0.1。响应中 Key 始终脱敏显示。主流厂商用 ☰ 菜单选择，也可添加任意自定义 URL 厂商。"
        right={
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => setMenuOpen((o) => !o)}>
              <Menu size={14} />
              厂商
            </button>
            <button className="btn" onClick={testConn} disabled={connecting}>
              <CircleDot size={12} />
              {connecting ? '检测中' : '检测连接'}
            </button>
          </div>
        }
      >
        <div className="flex gap-3">
          {menuOpen && (
            <div className="w-56 shrink-0 space-y-2 rounded-lg border border-edge bg-[#0d1728] p-2">
              <div className="flex items-center gap-1 rounded-md border border-edge bg-[#0e1728] px-2">
                <Search size={12} className="text-muted" />
                <input
                  className="w-full bg-transparent py-1 text-xs text-ink outline-none placeholder:text-muted/60"
                  placeholder="搜索主流厂商"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button
                className="flex w-full items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-xs text-accent"
                onClick={() => {
                  setSelected('__new__');
                  setMenuOpen(false);
                }}
              >
                <Plus size={12} />
                添加自定义厂商
              </button>
              <div className="max-h-72 space-y-0.5 overflow-auto">
                {mainList.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelected(p.id);
                      setMenuOpen(false);
                    }}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs',
                      selected === p.id ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-[#16223a]',
                    )}
                  >
                    <span className="truncate">{p.nameCn || p.name}</span>
                    {cfg[p.id]?.hasKey && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
                  </button>
                ))}
                {customList.length > 0 && (
                  <div className="pt-1 text-[10px] uppercase tracking-wider text-muted">自定义</div>
                )}
                {customList.map(([id, c]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setSelected(id);
                      setMenuOpen(false);
                    }}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs',
                      selected === id ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-[#16223a]',
                    )}
                  >
                    <span className="truncate">{c.name}</span>
                    {c.hasKey && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="min-w-0 flex-1">
            {!selected || !f ? (
              <Empty text="点击 ☰ 选择主流厂商，或「添加自定义厂商」填写任意网关 URL。" />
            ) : (
              <div className="max-w-xl space-y-2">
                <div className="truncate text-sm font-medium text-ink">
                  {selCustom ? f.customName || f.id || '新自定义厂商' : providers.find((p) => p.id === selected)?.nameCn}
                </div>
                {selCustom && selected === '__new__' && (
                  <input
                    className="input"
                    placeholder="厂商 ID（字母/数字/连字符，如 my-gateway）"
                    value={f.id}
                    onChange={(e) => update('__new__', { id: e.target.value.toLowerCase() })}
                  />
                )}
                {selCustom && selected !== '__new__' && (
                  <div className="text-[11px] text-muted">厂商 ID: {selected}</div>
                )}
                {selCustom && (
                  <input
                    className="input"
                    placeholder="显示名（可选）"
                    value={f.customName}
                    onChange={(e) => update(selected, { customName: e.target.value })}
                  />
                )}
                <input
                  type="password"
                  className="input"
                  placeholder={cfg[selected]?.hasKey ? `已存: ${cfg[selected].apiKeyMasked}` : '粘贴 API Key'}
                  value={f.key}
                  onChange={(e) => update(selected, { key: e.target.value })}
                />
                <textarea
                  className="input h-20 w-full font-mono text-[11px]"
                  placeholder={'额外 API Key（每行一个，启用负载均衡/失败切换）\n例如多 key 轮询绕过限流'}
                  value={f.extraKeys}
                  onChange={(e) => update(selected, { extraKeys: e.target.value })}
                />
                {cfg[selected]?.apiKeyCount > 1 && (
                  <div className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent">
                    已配置 {cfg[selected].apiKeyCount} 个 Key · 请求将在它们之间轮询，遇 401/403/429 自动切换下一个
                  </div>
                )}
                <input
                  className="input"
                  placeholder={
                    selCustom
                      ? 'API Base URL（必填，如 https://my.gateway/v1）'
                      : providers.find((p) => p.id === selected)?.apiBase ?? 'base URL（可选覆盖）'
                  }
                  value={f.baseUrl}
                  onChange={(e) => update(selected, { baseUrl: e.target.value })}
                />
                {selCustom && (
                  <select
                    className="input"
                    value={f.authStyle}
                    onChange={(e) => update(selected, { authStyle: e.target.value as AuthStyle })}
                  >
                    <option value="bearer">Bearer (Authorization)</option>
                    <option value="x-api-key">x-api-key (+anthropic-version)</option>
                    <option value="google">x-goog-api-key</option>
                  </select>
                )}
                {selCustom && (
                  <select
                    className="input"
                    value={f.apiFormat}
                    onChange={(e) => update(selected, { apiFormat: e.target.value as ApiFormat })}
                  >
                    <option value="openai">OpenAI 兼容 (chat/completions)</option>
                    <option value="anthropic">Anthropic Messages API</option>
                    <option value="gemini">Google Gemini (generateContent)</option>
                  </select>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1 text-[11px] text-muted">
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      onChange={(e) => update(selected, { enabled: e.target.checked })}
                    />
                    启用
                  </label>
                  <button className="btn btn-primary" onClick={() => save(selected)}>
                    保存
                  </button>
                  {cfg[selected]?.hasKey && (
                    <button className="btn btn-ghost" onClick={() => onDelete(selected)} title="删除配置">
                      <Trash2 size={12} />
                    </button>
                  )}
                  {saveState[selected] && <span className="text-[11px] text-accent">{saveState[selected]}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <EncryptionCard />
      <UnifiedEndpointCard />

      {connect && (
        <Card title="连通性检测结果">
          <div className="space-y-1">
            {connect.map((c) => (
              <div key={c.providerId} className="flex items-center gap-2 text-xs">
                <Chip tone={c.ok ? 'down' : c.state === 'auth-required' ? 'warn' : 'up'}>{c.state}</Chip>
                <span className="text-ink">{c.providerId}</span>
                <span className="text-muted">{c.message}</span>
                {c.latencyMs != null && <span className="ml-auto text-muted">{c.latencyMs}ms</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="批量导入" subtitle='支持粘贴 JSON：{ "providers": { "openai": { "apiKey": "sk-...", "baseUrl": "可选" } } }'>
        <div className="space-y-2">
          <textarea
            className="input h-32 w-full font-mono text-[11px]"
            placeholder='{"providers":{"openai":{"apiKey":"sk-..."},"anthropic":{"apiKey":"sk-ant-..."},"my-gateway":{"apiKey":"x","baseUrl":"https://gw/v1","authStyle":"bearer"}}}'
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={doImport}>
              <Upload size={12} />
              导入 JSON
            </button>
            <label className="btn btn-ghost cursor-pointer">
              选择文件
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              />
            </label>
            {importMsg && <span className="text-[11px] text-accent">{importMsg}</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ───────── 试用 Playground ─────────
function Playground({ cfg }: { cfg: Record<string, MaskedProviderConfig> }) {
  const configured = Object.entries(cfg)
    .filter(([, c]) => c.hasKey && c.enabled)
    .map(([id, c]) => ({ id, name: c.name }));
  const [provider, setProvider] = useState(configured[0]?.id ?? '');
  const [model, setModel] = useState('');
  const [message, setMessage] = useState('你好，用一句话介绍你自己。');
  const [reply, setReply] = useState('');
  const [stream, setStream] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<ProxyLog | null>(null);

  useEffect(() => {
    if (!provider && configured[0]) setProvider(configured[0].id);
  }, [configured, provider]);

  const send = async () => {
    if (!provider || !model || !message.trim()) return;
    setReply('');
    setStats(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/proxy/${provider}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: message }],
          stream,
        }),
      });
      if (!res.ok) {
        setReply(`错误 HTTP ${res.status}: ${await res.text()}`);
        return;
      }
      if (!stream || !res.body) {
        const j = await res.json();
        setReply(j.choices?.[0]?.message?.content ?? JSON.stringify(j));
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
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          const payload = m[1].trim();
          if (payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
            if (delta) setReply((prev) => prev + delta);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      setReply(`请求失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      // 取最近一条该 provider 日志作为本次统计
      try {
        const logs = await fetchProxyLogs({ provider, limit: 1 });
        if (logs[0]) setStats(logs[0]);
      } catch {
        /* ignore */
      }
    }
  };

  if (configured.length === 0) {
    return (
      <Empty text="尚未配置任何已启用的厂商 Key，请先到「配置 / 导入」页添加。" />
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="请求" subtitle="经本地代理转发，实时统计见右侧">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {configured.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="模型名，如 gpt-4o / claude-3-5-sonnet"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <textarea
            className="input h-40 w-full"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-[11px] text-muted">
              <input type="checkbox" checked={stream} onChange={(e) => setStream(e.target.checked)} />
              SSE 流式
            </label>
            <button className="btn btn-primary" onClick={send} disabled={busy || !model}>
              <Play size={12} />
              {busy ? '请求中…' : '发送'}
            </button>
          </div>
        </div>
      </Card>

      <Card title="响应 + 本次统计">
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-ink">{reply || '（等待发送）'}</pre>
        {stats && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-edge pt-3 text-[11px]">
            <Stat label="状态" value={stats.status ?? '网络错误'} />
            <Stat label="延迟" value={`${stats.latencyMs}ms`} />
            <Stat label="首字延迟" value={stats.ttftMs != null ? `${stats.ttftMs}ms` : '—'} />
            <Stat label="输入 tokens" value={stats.inputTokens ?? '—'} />
            <Stat label="输出 tokens" value={stats.outputTokens ?? '—'} />
            <Stat label="缓存命中" value={stats.cacheHitRate != null ? `${(stats.cacheHitRate * 100).toFixed(1)}%` : '—'} />
            {stats.error && <div className="col-span-2 text-up">错误: {stats.error}</div>}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}

// ───────── 实时指标 ─────────
function MetricsPanel() {
  const [metrics, setMetrics] = useState<ProxyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<Currency>('USD');

  const load = useCallback(async () => {
    try {
      setMetrics(await fetchProxyMetrics());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const totalCost = metrics.reduce((s, m) => s + (m.totalCostUsd ?? 0), 0);

  if (loading) return <Spinner label="加载指标…" />;
  if (metrics.length === 0)
    return (
      <div className="mx-auto max-w-6xl space-y-3">
        <CachePanel />
        <Empty text="暂无调用记录。去「试用」页发一条请求即可看到指标。" />
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <CachePanel />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>累计成本估算</span>
          <span className="text-base font-semibold text-ink">{fmtCost(totalCost, currency)}</span>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-edge">
          {(['USD', 'CNY'] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={clsx(
                'px-3 py-1 text-[11px]',
                currency === c ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-[#16223a]',
              )}
            >
              {c === 'USD' ? '$ USD' : '¥ CNY'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <Card key={m.provider} title={m.provider}>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Stat label="总请求" value={m.totalRequests} />
              <Stat label="成功/失败" value={`${m.successRequests}/${m.errorRequests}`} />
              <Stat label="平均延迟" value={`${m.avgLatencyMs}ms`} />
              <Stat label="请求速率" value={`${m.reqRate}/s`} />
              <Stat label="输入速率" value={`${m.inputRateTokS} tok/s`} />
              <Stat label="输出速率" value={`${m.outputRateTokS} tok/s`} />
              <Stat label="累计输入 tok" value={m.totalInputTokens.toLocaleString()} />
              <Stat label="累计输出 tok" value={m.totalOutputTokens.toLocaleString()} />
              <Stat label="缓存命中 tok" value={m.totalCacheReadTokens.toLocaleString()} />
              <Stat label="累计成本" value={fmtCost(m.totalCostUsd ?? 0, currency)} />
              <Stat label="Key 切换" value={m.totalKeySwitches ?? 0} />
              <Stat label="最近状态" value={m.lastStatus ?? '—'} />
            </div>
            {m.lastError && <div className="mt-2 text-[11px] text-up">最近错误: {m.lastError}</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

// 响应缓存统计：命中 / 未命中 / 条目数 + 清空
function CachePanel() {
  const [stats, setStats] = useState<{ enabled: boolean; ttlMs: number; size: number; hits: number; misses: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await fetchCacheStats());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const clear = async () => {
    setBusy(true);
    try {
      await clearResponseCache();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!stats) return null;
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? Math.round((stats.hits / total) * 100) : 0;

  return (
    <Card
      title="响应缓存"
      subtitle="相同请求（方法+路径+请求体，不含密钥）命中后直接回放，省去上游调用与 token 消耗"
      right={
        <button className="btn btn-ghost" onClick={clear} disabled={busy || stats.size === 0}>
          清空 ({stats.size})
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-4 text-[11px]">
        <span className={stats.enabled ? 'text-emerald-400' : 'text-muted'}>
          状态: {stats.enabled ? '启用' : '关闭'}
        </span>
        <span className="text-muted">TTL: {Math.round(stats.ttlMs / 1000)}s</span>
        <span className="text-muted">条目: {stats.size}</span>
        <span className="text-accent">命中: {stats.hits}</span>
        <span className="text-muted">未命中: {stats.misses}</span>
        <span className="text-ink">命中率: {hitRate}%</span>
      </div>
    </Card>
  );
}

// ───────── 日志 ─────────
function LogsPanel({
  providers,
  cfg,
}: {
  providers: ProviderConsole[];
  cfg: Record<string, MaskedProviderConfig>;
}) {
  const [logs, setLogs] = useState<ProxyLog[]>([]);
  const [filterProvider, setFilterProvider] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ok' | 'error' | ''>('');
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 合并主流厂商 + 自定义厂商（来自 cfg）作为筛选下拉项
  const providerOptions = [
    ...providers.map((p) => ({ id: p.id, name: p.nameCn || p.name })),
    ...Object.entries(cfg)
      .filter(([, c]) => c.custom)
      .map(([id, c]) => ({ id, name: c.name || id })),
  ];

  const load = useCallback(async () => {
    try {
      setLogs(
        await fetchProxyLogs({
          provider: filterProvider || undefined,
          status: (filterStatus || undefined) as 'ok' | 'error' | undefined,
          limit: 200,
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [filterProvider, filterStatus]);

  useEffect(() => {
    void load();
    timerRef.current = setInterval(load, 3000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  if (loading) return <Spinner label="加载日志…" />;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Key size={13} className="text-muted" />
        <select className="input w-auto" value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)}>
          <option value="">全部厂商</option>
          {providerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'ok' | 'error' | '')}>
          <option value="">全部状态</option>
          <option value="ok">成功</option>
          <option value="error">错误</option>
        </select>
      </div>
      {logs.length === 0 ? (
        <Empty text="暂无日志" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge">
          <table className="w-full text-[11px]">
            <thead className="bg-[#0e1728] text-muted">
              <tr>
                <th className="px-2 py-1.5 text-left">时间</th>
                <th className="px-2 py-1.5 text-left">厂商</th>
                <th className="px-2 py-1.5 text-left">模型</th>
                <th className="px-2 py-1.5 text-left">路径</th>
                <th className="px-2 py-1.5 text-left">状态</th>
                <th className="px-2 py-1.5 text-right">延迟</th>
                <th className="px-2 py-1.5 text-right">in/out</th>
                <th className="px-2 py-1.5 text-right">缓存</th>
                <th className="px-2 py-1.5 text-right">成本</th>
                <th className="px-2 py-1.5 text-left">错误</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-edge">
                  <td className="px-2 py-1 text-muted">{fmtTime(l.ts)}</td>
                  <td className="px-2 py-1 text-ink">
                    <span className="flex items-center gap-1">
                      {l.provider}
                      {l.fromCache && (
                        <span className="rounded bg-accent/15 px-1 text-[9px] text-accent">CACHE</span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-ink">{l.model}</td>
                  <td className="px-2 py-1 text-muted">{l.method} {l.path}</td>
                  <td className="px-2 py-1">
                    <Chip tone={l.status != null && l.status < 400 ? 'down' : 'up'}>{l.status ?? 'ERR'}</Chip>
                  </td>
                  <td className="px-2 py-1 text-right text-ink">
                    {l.latencyMs}ms{l.ttftMs != null ? ` · TT ${l.ttftMs}` : ''}
                  </td>
                  <td className="px-2 py-1 text-right text-ink">
                    {l.inputTokens ?? '—'}/{l.outputTokens ?? '—'}
                  </td>
                  <td className="px-2 py-1 text-right text-accent">
                    {l.cacheHitRate != null ? `${(l.cacheHitRate * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-ink">${l.costUsd.toFixed(4)}</td>
                  <td className="max-w-[200px] truncate px-2 py-1 text-up" title={l.error ?? ''}>
                    {l.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ───────── 配置加密状态 ─────────
function EncryptionCard() {
  const [status, setStatus] = useState<CryptoStatus | null>(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchCryptoStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const enable = async () => {
    if (!pw) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      setStatus(await initEncryption(pw));
      setMsg('已启用 AES-256-GCM 加密，主密码用于解锁');
      setPw('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      setStatus(await disableEncryption());
      setMsg('已关闭加密，配置恢复明文存储');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <Card
      title="配置加密"
      subtitle="API Key 以 AES-256-GCM 加密存储于本机，主密码仅在本地用于加解密，不会上传"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={status.encrypted ? 'down' : 'warn'}>{status.encrypted ? '已加密' : '明文存储'}</Chip>
        {!status.encrypted ? (
          <>
            <input
              type="password"
              className="input w-48"
              placeholder="设置主密码"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <button className="btn btn-primary" onClick={enable} disabled={busy || !pw}>
              启用加密
            </button>
          </>
        ) : (
          <button className="btn btn-ghost" onClick={disable} disabled={busy}>
            关闭加密（转明文）
          </button>
        )}
        {msg && <span className="text-[11px] text-accent">{msg}</span>}
        {err && <span className="text-[11px] text-up">{err}</span>}
      </div>
    </Card>
  );
}

// ───────── 统一 OpenAI 兼容端点 ─────────
function UnifiedEndpointCard() {
  const endpoint = `${window.location.origin}/api/v1`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  };

  return (
    <Card
      title="统一 OpenAI 兼容端点"
      subtitle="第三方 OpenAI 兼容客户端可直接挂载此 base_url，由请求头或模型名前缀指定厂商"
    >
      <div className="space-y-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-[#0d1728] px-2 py-1 text-accent">{endpoint}</code>
          <button className="btn btn-ghost" onClick={copy}>
            {copied ? '已复制' : '复制'}
          </button>
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-muted">
          <li>
            设置请求头 <code>x-lb-provider: openai</code> 选择厂商
          </li>
          <li>
            或在模型名使用前缀 <code>openai/gpt-4o</code>（按 <code>/</code> 前部分路由）
          </li>
          <li>省略时默认使用第一个已启用且有 Key 的厂商</li>
          <li>
            若某厂商配置了多个 Key，请求会在它们之间<b className="text-ink">轮询</b>，遇 401/403/429 自动<b className="text-ink">切换下一个</b>兜底
          </li>
          <li>
            Prometheus 指标：<code>{`${window.location.origin}/metrics`}</code>（对接 Grafana）
          </li>
        </ul>
      </div>
    </Card>
  );
}
