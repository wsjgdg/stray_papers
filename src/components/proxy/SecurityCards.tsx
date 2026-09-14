import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  fetchCryptoStatus,
  initEncryption,
  disableEncryption,
  type CryptoStatus,
  fetchKeyHealth,
  probeKeyHealth,
  fmtCooldown,
  KEY_STATUS_LABEL,
  type KeyHealthResponse,
  fetchProxyTokenStatus,
  setProxyTokenAction,
  getProxyToken,
  type ProxyTokenStatus,
  fetchRouting,
  saveRouting,
  type RoutingConfig,
} from '../../api';
import { Card, Chip } from '../../ui';

// ───────── 配置加密状态 ─────────
export function EncryptionCard() {
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
        <Chip tone={status.encrypted ? 'down' : 'warn'}>
          {status.encrypted ? '已加密' : '明文存储'}
        </Chip>
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
export function UnifiedEndpointCard() {
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
            若某厂商配置了多个 Key，请求会在它们之间<b className="text-ink">轮询</b>，遇 401/403/429
            自动<b className="text-ink">切换下一个</b>兜底
          </li>
          <li>
            Prometheus 指标：<code>{`${window.location.origin}/metrics`}</code>（对接 Grafana）
          </li>
        </ul>
      </div>
    </Card>
  );
}

// ───────── Key 健康度（B3：冷却 / 坏 Key 追踪） ─────────
export function KeyHealthCard() {
  const [data, setData] = useState<KeyHealthResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchKeyHealth()
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000); // 每 3s 刷新冷却剩余
    return () => clearInterval(t);
  }, [load]);

  const revive = async () => {
    setBusy(true);
    setErr(null);
    try {
      await probeKeyHealth();
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const hasAny = data.providers.some((p) => p.keys.length > 0);
  if (!hasAny) return null; // 未配置任何 Key 时不显示本卡片

  return (
    <Card
      title="Key 健康度"
      subtitle="多 Key 轮询时：限流(429)临时冷却、鉴权失效(401/403)视为坏 Key 并退出轮询；坏 Key 由后台探针周期性复活（每 60s）"
      right={
        <button className="btn btn-ghost" onClick={revive} disabled={busy}>
          {busy ? '探测中…' : '立即复活探测'}
        </button>
      }
    >
      <div className="space-y-3">
        {data.providers.map((p) => (
          <div key={p.providerId}>
            <div className="mb-1 text-[11px] text-muted">{p.providerId}</div>
            <div className="flex flex-wrap gap-2">
              {p.keys.map((k) => (
                <Chip
                  key={k.keyMasked}
                  tone={k.status === 'ok' ? 'down' : k.status === 'dead' ? 'up' : 'warn'}
                  title={`连续失败 ${k.consecutiveFails} 次${k.dead ? ' · 坏 Key（已退出轮询）' : ''}`}
                >
                  {k.keyMasked} · {KEY_STATUS_LABEL[k.status]}
                  {k.status !== 'ok' && ` · ${fmtCooldown(k.cooldownRemainingMs)}`}
                </Chip>
              ))}
            </div>
          </div>
        ))}
        {err && <div className="text-[11px] text-up">{err}</div>}
      </div>
    </Card>
  );
}

// ───────── 代理访问令牌（B4：默认关闭 + 设置页开关启用） ─────────
export function ProxyTokenCard() {
  const [status, setStatus] = useState<ProxyTokenStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchProxyTokenStatus()
      .then(setStatus)
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  };

  const act = async (action: 'enable' | 'disable' | 'reset') => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await setProxyTokenAction(action);
      setStatus(r);
      if (action === 'reset' && r.token) {
        await copy(r.token);
        setMsg('已生成新令牌并复制到剪贴板；外部客户端须改用新令牌');
      } else if (action === 'enable') {
        setMsg('已启用代理令牌，本应用已自动复用');
      } else {
        setMsg('已关闭代理令牌，恢复零配置');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <Card
      title="代理访问令牌"
      subtitle="启用后，本机其它进程访问 /api/v1 与 /api/proxy 必须携带令牌，防止已配置 Key 被白嫖。默认关闭（零配置）。外部 OpenAI 兼容客户端须带 Authorization: Bearer <token> 或 x-proxy-token 头。"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={status.enabled ? 'down' : 'warn'}>{status.enabled ? '已启用' : '已关闭'}</Chip>
        {status.envOverridden && (
          <span className="text-[11px] text-muted">
            已通过环境变量 PROXY_TOKEN 覆盖，设置页操作不生效
          </span>
        )}
        {status.enabled && (
          <code className="rounded bg-[#0d1728] px-2 py-1 text-accent">
            {status.tokenMasked || '****'}
          </code>
        )}
        {status.enabled ? (
          <>
            <button
              className="btn btn-ghost"
              onClick={() => {
                const t = getProxyToken();
                if (t) void copy(t);
                else setErr('本地未缓存令牌，请点「重置并复制新令牌」');
              }}
              disabled={busy}
            >
              {copied ? '已复制' : '复制当前令牌'}
            </button>
            <button className="btn btn-ghost" onClick={() => act('reset')} disabled={busy}>
              {busy ? '处理中…' : '重置并复制新令牌'}
            </button>
            <button className="btn btn-ghost" onClick={() => act('disable')} disabled={busy}>
              关闭令牌
            </button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={() => act('enable')} disabled={busy}>
            {busy ? '处理中…' : '启用代理令牌'}
          </button>
        )}
        {msg && <span className="text-[11px] text-accent">{msg}</span>}
        {err && <span className="text-[11px] text-up">{err}</span>}
      </div>
    </Card>
  );
}

// ───────── 模型路由 + fallback 链（B1） ─────────
export function RoutingCard() {
  const [routing, setRouting] = useState<RoutingConfig | null>(null);
  const [defaultRows, setDefaultRows] = useState<string[]>(['']);
  const [routeRows, setRouteRows] = useState<{ pattern: string; providers: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchRouting()
      .then((r) => {
        setRouting(r.routing);
        setDefaultRows(r.routing?.default?.length ? r.routing.default : ['']);
        setRouteRows(
          r.routing?.routes
            ? Object.entries(r.routing.routes).map(([pattern, providers]) => ({
                pattern,
                providers: providers.join(', '),
              }))
            : [],
        );
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoaded(true));
  }, []);

  const setDefaultRow = (i: number, v: string) =>
    setDefaultRows((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  const addDefaultRow = () => setDefaultRows((prev) => [...prev, '']);
  const removeDefaultRow = (i: number) =>
    setDefaultRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : ['']));

  const setRoute = (i: number, patch: Partial<{ pattern: string; providers: string }>) =>
    setRouteRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addRoute = () => setRouteRows((prev) => [...prev, { pattern: '', providers: '' }]);
  const removeRoute = (i: number) => setRouteRows((prev) => prev.filter((_, idx) => idx !== i));

  const buildConfig = (): RoutingConfig => {
    const cfg: RoutingConfig = { default: [], routes: {} };
    cfg.default = defaultRows.map((s) => s.trim()).filter(Boolean);
    for (const r of routeRows) {
      const pattern = r.pattern.trim();
      const providers = r.providers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (pattern && providers.length) cfg.routes[pattern] = providers;
    }
    return cfg;
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const cfg = buildConfig();
    const empty = cfg.default.length === 0 && Object.keys(cfg.routes).length === 0;
    try {
      const res = await saveRouting(empty ? null : cfg);
      setRouting(res.routing);
      setMsg(empty ? '已清除路由配置，回退到默认（首个已启用且有 Key 的厂商）' : '路由配置已保存');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await saveRouting(null);
      setRouting(res.routing);
      setDefaultRows(['']);
      setRouteRows([]);
      setMsg('已清除路由配置');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card
      title="模型路由 + 失败切换链（B1）"
      subtitle="按模型名前缀/通配符把请求路由到指定厂商链；某厂商失败时自动切换到链中下一个。设置 x-lb-provider 头或 vendor/model 前缀可跳过路由。"
      right={
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={clear} disabled={busy}>
            清除
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? '保存中…' : '保存路由'}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-[11px]">
        {routing && (
          <div className="flex items-center gap-2 text-muted">
            <Chip tone="down">已启用路由</Chip>
            <span>当前默认链：{routing.default.join(' → ') || '（空）'}</span>
          </div>
        )}

        <div>
          <div className="mb-1 text-muted">默认链（未匹配任何规则时使用，厂商按序兜底）</div>
          <div className="space-y-1">
            {defaultRows.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1 font-mono"
                  placeholder="厂商 ID，如 openai / anthropic"
                  value={v}
                  onChange={(e) => setDefaultRow(i, e.target.value)}
                />
                <button
                  className="btn btn-ghost shrink-0"
                  title="删除"
                  onClick={() => removeDefaultRow(i)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button className="btn btn-sm" onClick={addDefaultRow}>
              <Plus size={12} />
              添加默认厂商
            </button>
          </div>
        </div>

        <div className="border-t border-edge pt-2">
          <div className="mb-1 text-muted">
            路由规则（pattern 支持通配符 *，如 gpt-* / *-mini / *；精确匹配优先于通配符；单链最多 3
            个厂商）
          </div>
          <div className="space-y-1">
            {routeRows.length === 0 && <div className="text-muted">尚未配置路由规则。</div>}
            {routeRows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input w-40 shrink-0 font-mono"
                  placeholder="pattern，如 gpt-*"
                  value={r.pattern}
                  onChange={(e) => setRoute(i, { pattern: e.target.value })}
                />
                <span className="shrink-0 text-muted">→</span>
                <input
                  className="input flex-1 font-mono"
                  placeholder="厂商链，逗号分隔，如 openai, anthropic"
                  value={r.providers}
                  onChange={(e) => setRoute(i, { providers: e.target.value })}
                />
                <button
                  className="btn btn-ghost shrink-0"
                  title="删除"
                  onClick={() => removeRoute(i)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            <button className="btn btn-sm" onClick={addRoute}>
              <Plus size={12} />
              添加路由规则
            </button>
          </div>
        </div>

        {msg && <div className="text-accent">{msg}</div>}
        {err && <div className="text-up">{err}</div>}
      </div>
    </Card>
  );
}
