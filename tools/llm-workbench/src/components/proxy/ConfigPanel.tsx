import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, Download, Plus, Search, Trash2, Upload, CircleDot } from 'lucide-react';
import type { ProviderConsole, ProbeResult } from '../../../server/types';
import {
  fetchProviderModels,
  importProxyConfig,
  runProxyConnectivity,
  saveProxyConfig,
  type AuthStyle,
  type MaskedProviderConfig,
  type ProxyConfigPatch,
  type ApiFormat,
} from '../../api';
import { Card, Chip, Empty, Spinner } from '../../ui';
import { mergeModels, computeEnabledModels } from '../../lib/modelMerge';
import {
  EncryptionCard,
  UnifiedEndpointCard,
  KeyHealthCard,
  ProxyTokenCard,
  RoutingCard,
} from './SecurityCards';
import { BackupCard } from './BackupCard';

// ───────── 配置 / 导入 ─────────
export function ConfigPanel({
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
  setSaveState: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSaved: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<
    Record<
      string,
      {
        key: string;
        extraKeys: string;
        baseUrl: string;
        enabled: boolean;
        customName: string;
        authStyle: AuthStyle;
        apiFormat: ApiFormat;
        id: string;
        maxRps: string;
        dailyKeyBudgetUsd: string;
      }
    >
  >({});
  const [menuMode, setMenuMode] = useState<'list' | 'add'>('list');
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [connect, setConnect] = useState<ProbeResult[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [modelsLoading, setModelsLoading] = useState<string | null>(null);
  const [modelsError, setModelsError] = useState<Record<string, string>>({});
  const [manualModel, setManualModel] = useState('');
  // 模型映射草稿：{ 厂商: [{ from, to }] }。配置加载后按厂商播种一次，用户编辑后不再覆盖
  const [mappingRows, setMappingRows] = useState<Record<string, { from: string; to: string }[]>>(
    {},
  );

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
      maxRps: c?.maxRps ? String(c.maxRps) : '',
      dailyKeyBudgetUsd: c?.dailyKeyBudgetUsd ? String(c.dailyKeyBudgetUsd) : '',
    };
  };

  const update = (
    id: string,
    patch: Partial<{
      key: string;
      extraKeys: string;
      baseUrl: string;
      enabled: boolean;
      customName: string;
      authStyle: AuthStyle;
      apiFormat: ApiFormat;
      id: string;
      maxRps: string;
      dailyKeyBudgetUsd: string;
    }>,
  ) => {
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
    // B3：配额字段——空/0 表示不限制；非数字或负数直接拦下
    const maxRpsNum = f.maxRps.trim() === '' ? 0 : Number(f.maxRps);
    const budgetNum = f.dailyKeyBudgetUsd.trim() === '' ? 0 : Number(f.dailyKeyBudgetUsd);
    if (
      !Number.isFinite(maxRpsNum) ||
      maxRpsNum < 0 ||
      !Number.isFinite(budgetNum) ||
      budgetNum < 0
    ) {
      setSaveState((s) => ({ ...s, [id]: '配额需为非负数字（0 = 不限）' }));
      return;
    }
    patch.maxRps = maxRpsNum;
    patch.dailyKeyBudgetUsd = budgetNum;
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

  // 选中厂商且配置就绪后，用已存映射播种草稿（用户已编辑过则保留其输入）
  useEffect(() => {
    if (!selected || !cfg[selected]) return;
    setMappingRows((prev) =>
      prev[selected]
        ? prev
        : {
            ...prev,
            [selected]: Object.entries(cfg[selected].modelMapping ?? {}).map(([from, to]) => ({
              from,
              to,
            })),
          },
    );
  }, [selected, cfg]);

  const updateMappingRow = (
    id: string,
    index: number,
    patch: Partial<{ from: string; to: string }>,
  ) => {
    setMappingRows((prev) => ({
      ...prev,
      [id]: (prev[id] ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  };

  // 保存映射：丢弃空键/空值的行（等价于「未配置」，转发时原样透传）
  const saveMapping = async (id: string) => {
    const mapping: Record<string, string> = {};
    for (const r of mappingRows[id] ?? []) {
      const from = r.from.trim();
      const to = r.to.trim();
      if (from && to) mapping[from] = to;
    }
    setSaveState((s) => ({ ...s, [id]: 'saving' }));
    try {
      await saveProxyConfig(id, { modelMapping: mapping });
      setSaveState((s) => ({ ...s, [id]: '映射已保存' }));
      await onSaved();
      setTimeout(() => setSaveState((s) => ({ ...s, [id]: '' })), 2000);
    } catch (e) {
      setSaveState((s) => ({ ...s, [id]: `映射保存失败: ${(e as Error).message}` }));
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

  // 从上游自动拉取模型清单；首次全部启用，后续重新拉取保留用户已手动启用的子集
  const fetchModels = async (id: string) => {
    setModelsLoading(id);
    setModelsError((e) => ({ ...e, [id]: '' }));
    try {
      const fetched = await fetchProviderModels(id);
      if (fetched.length === 0) {
        // 空列表不覆盖已有配置：保留用户手动添加的模型，避免自动获取失败时把清单清空
        setModelsError((e) => ({
          ...e,
          [id]: '上游返回空列表，已保留你手动添加的模型；请确认 baseUrl / Key 是否正确，或该厂商不支持 /models',
        }));
        return;
      }
      // 合并：保留手动添加的模型，避免重新拉取时覆盖用户已录入的清单
      const merged = mergeModels(cfg[id]?.models, fetched);
      const enabled = computeEnabledModels(merged, cfg[id]?.enabledModels);
      await saveProxyConfig(id, { models: merged, enabledModels: enabled });
      void onSaved();
    } catch (e) {
      setModelsError((er) => ({ ...er, [id]: `获取失败: ${(e as Error).message}` }));
    } finally {
      setModelsLoading(null);
    }
  };

  // 手动启用 / 禁用某个模型
  const toggleModel = async (id: string, model: string, on: boolean) => {
    const cur = new Set(cfg[id]?.enabledModels ?? []);
    if (on) cur.add(model);
    else cur.delete(model);
    try {
      await saveProxyConfig(id, { enabledModels: [...cur] });
      void onSaved();
    } catch (e) {
      setModelsError((er) => ({ ...er, [id]: `保存失败: ${(e as Error).message}` }));
    }
  };

  // 手动添加模型名（自动拉取失败 / 上游无 /models 时的兜底），同时写入 models + enabledModels
  const addManualModelCfg = async (id: string, name: string) => {
    const name2 = name.trim();
    if (!id || !name2) return;
    const existing = cfg[id]?.models ?? [];
    const models = existing.includes(name2) ? existing : [...existing, name2];
    const enabled = new Set(cfg[id]?.enabledModels ?? []);
    enabled.add(name2);
    try {
      await saveProxyConfig(id, { models, enabledModels: [...enabled] });
      setManualModel('');
      void onSaved();
    } catch (e) {
      setModelsError((er) => ({ ...er, [id]: `保存失败: ${(e as Error).message}` }));
    }
  };

  // 「启用」开关即时落盘：避免用户勾选后忘了点保存，导致厂商不生效/不出现在试用下拉
  const setEnabled = async (id: string, val: boolean) => {
    update(id, { enabled: val });
    try {
      await saveProxyConfig(id, { enabled: val });
      void onSaved();
    } catch (e) {
      setSaveState((s) => ({ ...s, [id]: `启用保存失败: ${(e as Error).message}` }));
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
  // 默认仅显示「已启用」厂商（含自定义）；仅「添加」模式才展开全部主流厂商目录
  const enabledList = Object.entries(cfg)
    .filter(([, c]) => c.enabled)
    .map(([id, c]) => ({ id, name: c.name }));

  const f = selected ? getEntry(selected) : null;
  // '__new__' 是「新建自定义厂商」哨兵，应视同自定义上下文，否则 id/名称/baseUrl/鉴权 字段会被整体隐藏
  const selCustom = selected === '__new__' || (selected != null && isCustom(selected));
  // 模型清单区可见条件：已选中，且（已是已存配置，或是主流厂商目录中的一项）——二者皆支持自动获取/手动启用
  const modelSectionVisible =
    selected != null && (cfg[selected] != null || providers.some((p) => p.id === selected));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card
        title="API Key 管理（仅本机存储）"
        subtitle="Key 保存在本机 home/.llm-workbench/config.json，不进仓库；代理仅监听 127.0.0.1。响应中 Key 始终脱敏显示。默认只列出已启用厂商（含自定义）；点「＋ 添加厂商」才展开全部主流厂商目录。"
        right={
          <div className="flex items-center gap-2">
            <button
              className="btn"
              onClick={() => setMenuMode((m) => (m === 'add' ? 'list' : 'add'))}
            >
              {menuMode === 'add' ? (
                <>
                  <ChevronLeft size={14} />
                  返回
                </>
              ) : (
                <>
                  <Plus size={14} />
                  添加厂商
                </>
              )}
            </button>
            <button className="btn" onClick={testConn} disabled={connecting}>
              <CircleDot size={12} />
              {connecting ? '检测中' : '检测连接'}
            </button>
          </div>
        }
      >
        <div className="flex gap-3">
          <div className="w-56 shrink-0 space-y-2 rounded-lg border border-edge bg-sunken p-2">
            {menuMode === 'add' && (
              <div className="flex items-center gap-1 rounded-md border border-edge bg-raised px-2">
                <Search size={12} className="text-muted" />
                <input
                  className="w-full bg-transparent py-1 text-xs text-ink outline-none placeholder:text-muted/60"
                  placeholder="搜索主流厂商"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
            {menuMode === 'add' ? (
              <>
                <button
                  className="flex w-full items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-xs text-accent"
                  onClick={() => {
                    setSelected('__new__');
                    setMenuMode('list');
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
                        setMenuMode('list');
                      }}
                      className={clsx(
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs',
                        selected === p.id ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-hover',
                      )}
                    >
                      <span className="truncate">{p.nameCn || p.name}</span>
                      {cfg[p.id]?.hasKey && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-down" />
                      )}
                    </button>
                  ))}
                  {customList.length > 0 && (
                    <div className="pt-1 text-[10px] uppercase tracking-wider text-muted">
                      已添加自定义
                    </div>
                  )}
                  {customList.map(([id, c]) => (
                    <button
                      key={id}
                      onClick={() => {
                        setSelected(id);
                        setMenuMode('list');
                      }}
                      className={clsx(
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs',
                        selected === id ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-hover',
                      )}
                    >
                      <span className="truncate">{c.name}</span>
                      {c.hasKey && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-down" />}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="max-h-72 space-y-0.5 overflow-auto">
                {enabledList.length === 0 && (
                  <div className="px-2 py-3 text-[11px] leading-relaxed text-muted">
                    尚未启用任何厂商。点右上「＋ 添加厂商」选择主流厂商或添加自定义 URL
                    厂商，保存并勾选「启用」。
                  </div>
                )}
                {enabledList.map(({ id, name }) => (
                  <button
                    key={id}
                    onClick={() => setSelected(id)}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs',
                      selected === id ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-hover',
                    )}
                  >
                    <span className="truncate">{name}</span>
                    {cfg[id]?.hasKey && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-down" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {!selected || !f ? (
              <Empty text="点右上「＋ 添加厂商」选择主流厂商，或「添加自定义厂商」填写任意网关 URL，保存并启用后会出现在左侧列表。" />
            ) : (
              <div className="max-w-xl space-y-2">
                <div className="truncate text-sm font-medium text-ink">
                  {selCustom
                    ? f.customName || f.id || '新自定义厂商'
                    : providers.find((p) => p.id === selected)?.nameCn}
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
                  placeholder={
                    cfg[selected]?.hasKey ? `已存: ${cfg[selected].apiKeyMasked}` : '粘贴 API Key'
                  }
                  value={f.key}
                  onChange={(e) => update(selected, { key: e.target.value })}
                />
                <textarea
                  className="input h-20 w-full font-mono text-[11px]"
                  placeholder={
                    '额外 API Key（每行一个，启用负载均衡/失败切换）\n例如多 key 轮询绕过限流'
                  }
                  value={f.extraKeys}
                  onChange={(e) => update(selected, { extraKeys: e.target.value })}
                />
                {cfg[selected]?.apiKeyCount > 1 && (
                  <div className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] text-accent">
                    已配置 {cfg[selected].apiKeyCount} 个 Key · 请求将在它们之间轮询，遇 401/403/429
                    自动切换下一个
                  </div>
                )}
                <input
                  className="input"
                  placeholder={
                    selCustom
                      ? 'API Base URL（必填，如 https://my.gateway/v1）'
                      : (providers.find((p) => p.id === selected)?.apiBase ??
                        'base URL（可选覆盖）')
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
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                  <label className="flex items-center gap-1" title="令牌桶限流，超限返回 429">
                    速率上限
                    <input
                      className="input w-20"
                      placeholder="0"
                      value={f.maxRps}
                      onChange={(e) => update(selected, { maxRps: e.target.value })}
                    />
                    req/s
                  </label>
                  <label
                    className="flex items-center gap-1"
                    title="单个 Key 当日累计成本超限后，该 Key 当日退出轮询"
                  >
                    单 Key 日成本上限 $
                    <input
                      className="input w-24"
                      placeholder="0"
                      value={f.dailyKeyBudgetUsd}
                      onChange={(e) => update(selected, { dailyKeyBudgetUsd: e.target.value })}
                    />
                  </label>
                  <span className="text-muted/70">（0 或留空 = 不限制）</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1 text-[11px] text-muted">
                    <input
                      type="checkbox"
                      checked={f.enabled}
                      onChange={(e) => setEnabled(selected, e.target.checked)}
                    />
                    启用
                  </label>
                  <button className="btn btn-primary" onClick={() => save(selected)}>
                    保存
                  </button>
                  {modelSectionVisible && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => onDelete(selected)}
                      title="删除配置"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  {saveState[selected] && (
                    <span className="text-[11px] text-accent">{saveState[selected]}</span>
                  )}
                </div>

                {modelSectionVisible && (
                  <div className="space-y-2 rounded-lg border border-edge bg-sunken p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-muted">
                        模型清单 · 自动获取后手动启用（仅启用项出现在「试用」下拉）
                      </div>
                      <button
                        className="btn btn-sm shrink-0"
                        onClick={() => fetchModels(selected)}
                        disabled={modelsLoading === selected}
                      >
                        <Download size={12} />
                        {modelsLoading === selected ? '获取中…' : '自动获取模型列表'}
                      </button>
                    </div>
                    {modelsError[selected] && (
                      <div className="text-[11px] text-up">{modelsError[selected]}</div>
                    )}
                    {cfg[selected]?.models && cfg[selected].models.length > 0 ? (
                      <div className="max-h-52 space-y-0.5 overflow-auto rounded-md border border-edge">
                        {cfg[selected].models.map((m) => {
                          const on = (cfg[selected]?.enabledModels ?? []).includes(m);
                          return (
                            <label
                              key={m}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-hover"
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={(e) => toggleModel(selected, m, e.target.checked)}
                              />
                              <span className={on ? 'text-ink' : 'text-muted'}>{m}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted">
                        尚未获取模型列表，点「自动获取」从上游拉取（需已填正确 baseUrl 与 Key
                        并保存）；拉取失败可手动添加下方模型名。
                      </div>
                    )}
                    <div className="flex items-center gap-2 border-t border-edge pt-2">
                      <input
                        className="input flex-1"
                        placeholder="手动添加模型名（如 gpt-4o，拉取失败兜底）"
                        value={manualModel}
                        onChange={(e) => setManualModel(e.target.value)}
                      />
                      <button
                        className="btn btn-sm"
                        onClick={() => addManualModelCfg(selected, manualModel)}
                        disabled={!manualModel.trim()}
                      >
                        添加
                      </button>
                    </div>
                  </div>
                )}

                {modelSectionVisible && (
                  <div className="space-y-2 rounded-lg border border-edge bg-sunken p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-muted">
                        模型映射 · 请求模型名 → 上游实际模型名（未命中原样透传；计量按上游模型计价）
                      </div>
                      <button className="btn btn-sm shrink-0" onClick={() => saveMapping(selected)}>
                        保存映射
                      </button>
                    </div>
                    {(mappingRows[selected] ?? []).length === 0 && (
                      <div className="text-[11px] text-muted">
                        尚未配置映射。适用于中转站改名（如 gpt-4o →
                        oai/gpt-4o）或统一入口按别名路由的场景。
                      </div>
                    )}
                    {(mappingRows[selected] ?? []).map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          className="input flex-1"
                          placeholder="请求模型名，如 gpt-4o"
                          value={r.from}
                          onChange={(e) => updateMappingRow(selected, i, { from: e.target.value })}
                        />
                        <span className="shrink-0 text-muted">→</span>
                        <input
                          className="input flex-1"
                          placeholder="上游模型名，如 oai/gpt-4o"
                          value={r.to}
                          onChange={(e) => updateMappingRow(selected, i, { to: e.target.value })}
                        />
                        <button
                          className="btn btn-ghost shrink-0"
                          title="删除该映射"
                          onClick={() =>
                            setMappingRows((prev) => ({
                              ...prev,
                              [selected]: (prev[selected] ?? []).filter((_, idx) => idx !== i),
                            }))
                          }
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        setMappingRows((prev) => ({
                          ...prev,
                          [selected]: [...(prev[selected] ?? []), { from: '', to: '' }],
                        }))
                      }
                    >
                      <Plus size={12} />
                      添加映射
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <EncryptionCard />
      <UnifiedEndpointCard />
      <RoutingCard />
      <ProxyTokenCard />
      <KeyHealthCard />
      <BackupCard />

      {connect && (
        <Card title="连通性检测结果">
          <div className="space-y-1">
            {connect.map((c) => (
              <div key={c.providerId} className="flex items-center gap-2 text-xs">
                <Chip tone={c.ok ? 'down' : c.state === 'auth-required' ? 'warn' : 'up'}>
                  {c.state}
                </Chip>
                <span className="text-ink">{c.providerId}</span>
                <span className="text-muted">{c.message}</span>
                {c.latencyMs != null && <span className="ml-auto text-muted">{c.latencyMs}ms</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        title="批量导入"
        subtitle='支持粘贴 JSON：{ "providers": { "openai": { "apiKey": "sk-...", "baseUrl": "可选" } } }'
      >
        <div className="space-y-2">
          <textarea
            className="input h-32 w-full font-mono text-[11px]"
            placeholder='{"providers":{"openai":{"apiKey":"sk-...","models":["gpt-4o","gpt-4o-mini"],"enabledModels":["gpt-4o"]},"anthropic":{"apiKey":"sk-ant-..."},"my-gateway":{"apiKey":"x","baseUrl":"https://gw/v1","authStyle":"bearer","models":["m1"],"enabledModels":["m1"]}}}'
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="text-[11px] text-muted">
            可选字段 <code className="text-accent">models</code> /{' '}
            <code className="text-accent">enabledModels</code>
            （模型清单 / 启用子集；不填则运行时由「自动获取模型列表」按钮拉取后手动勾选）。
          </div>
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
