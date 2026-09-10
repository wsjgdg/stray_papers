import { useEffect, useState } from 'react';
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

  const load = () => {
    fetchKeyHealth()
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000); // 每 3s 刷新冷却剩余
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
