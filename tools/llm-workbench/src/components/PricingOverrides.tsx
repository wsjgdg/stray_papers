import { useCallback, useEffect, useState } from 'react';
import {
  fetchPricingState,
  resetPricingOverrides,
  savePricingOverrides,
  type PricingState,
} from '../api';
import { Card, Chip } from '../ui';

const EXAMPLE =
  '{"models":{"gpt-4o":{"input":2.5,"output":10,"cacheRead":1.25}},"providers":{"my-gateway":{"input":1,"output":2}}}';

// D1 收尾：模型价格过期或自定义厂商缺价时，粘贴 JSON 覆盖内置定价，
// 保存后立即对代理计费与成本计算生效（后端持久化于数据目录 pricing-overrides.json）。
export function PricingOverridesCard() {
  const [state, setState] = useState<PricingState | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPricingState()
      .then(setState)
      .catch(() => {
        /* 加载失败显示为内置定价空态 */
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const parsed: unknown = JSON.parse(text); // 先本地校验 JSON 合法性，报错更快
      const next = await savePricingOverrides(parsed);
      setState(next);
      setText('');
      const n =
        Object.keys(next.overrides.providers ?? {}).length +
        Object.keys(next.overrides.models ?? {}).length;
      setMsg(`已应用 ${n} 条覆盖，立即生效`);
    } catch (e) {
      setErr((e as Error).message || 'JSON 解析失败');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('确定清除全部定价覆盖，恢复内置定价？')) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      setState(await resetPricingOverrides());
      setMsg('已恢复内置定价');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const providerKeys = Object.keys(state?.overrides.providers ?? {});
  const modelKeys = Object.keys(state?.overrides.models ?? {});

  return (
    <Card
      title="定价覆盖"
      subtitle="价格过期或自定义厂商缺价时，粘贴 JSON 覆盖内置定价（USD / 1M tokens），对代理计费与成本计算立即生效"
    >
      <div className="space-y-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={state?.source === 'user' ? 'warn' : 'down'}>
            {state?.source === 'user' ? '用户覆盖生效中' : '内置定价'}
          </Chip>
          {providerKeys.length > 0 && (
            <span className="text-muted">
              厂商：
              {providerKeys.map((k) => (
                <code key={k} className="mr-1 rounded bg-[#0d1728] px-1 text-accent">
                  {k}
                </code>
              ))}
            </span>
          )}
          {modelKeys.length > 0 && (
            <span className="text-muted">
              模型：
              {modelKeys.map((k) => (
                <code key={k} className="mr-1 rounded bg-[#0d1728] px-1 text-accent">
                  {k}
                </code>
              ))}
            </span>
          )}
        </div>
        <textarea
          className="input h-28 w-full font-mono text-[11px]"
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={apply} disabled={busy || !text.trim()}>
            应用覆盖
          </button>
          <button
            className="btn btn-ghost"
            onClick={reset}
            disabled={busy || state?.source !== 'user'}
          >
            重置为内置定价
          </button>
          {msg && <span className="text-accent">{msg}</span>}
          {err && <span className="text-up">{err}</span>}
        </div>
        <div className="text-muted">
          格式：
          <code>
            {
              '{"models":{"<模型id>":{"input":2.5,"output":10,"cacheRead":1.25}},"providers":{"<厂商id>":{…}}}'
            }
          </code>
          ；cacheRead 缺省与 input 同价；重置需在应用过覆盖后可用。
        </div>
      </div>
    </Card>
  );
}
