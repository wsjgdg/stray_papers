import { useCallback, useEffect, useState } from 'react';
import {
  fetchPricingState,
  resetPricingOverrides,
  savePricingOverrides,
  fetchPricingTable,
  savePricingTable,
  resetPricingTable,
  type PricingState,
  type PricingTableState,
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

  // B5：基准定价表（外置文件）——版本/来源 + 导入 JSON 文件 + 恢复内置
  const [table, setTable] = useState<PricingTableState | null>(null);
  const [tableBusy, setTableBusy] = useState(false);
  const [tableMsg, setTableMsg] = useState<string | null>(null);
  const [tableErr, setTableErr] = useState<string | null>(null);

  const loadTable = useCallback(() => {
    fetchPricingTable()
      .then(setTable)
      .catch(() => {
        /* 忽略：加载失败时不显示基准表信息 */
      });
  }, []);

  useEffect(() => {
    loadTable();
  }, [loadTable]);

  const importTableFile = async (file: File) => {
    setTableBusy(true);
    setTableErr(null);
    setTableMsg(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const next = await savePricingTable(parsed);
      setTable(next);
      setTableMsg(`已导入 ${Object.keys(next.providers).length} 个厂商定价，立即生效`);
    } catch (e) {
      setTableErr((e as Error).message || 'JSON 解析失败');
    } finally {
      setTableBusy(false);
    }
  };

  const resetTable = async () => {
    if (!window.confirm('确定移除导入的基准定价表，恢复内置定价？')) return;
    setTableBusy(true);
    setTableErr(null);
    setTableMsg(null);
    try {
      setTable(await resetPricingTable());
      setTableMsg('已恢复内置基准定价表');
    } catch (e) {
      setTableErr((e as Error).message);
    } finally {
      setTableBusy(false);
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

        <div className="space-y-2 border-t border-edge pt-3">
          <div className="font-medium text-ink">基准定价表（外置文件）</div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={table?.source === 'file' ? 'warn' : 'down'}>
              {table?.source === 'file' ? '文件加载' : '内置表'}
            </Chip>
            <span className="text-muted">
              v{table?.version ?? '—'}
              {table?.updatedAt ? ` · ${table.updatedAt}` : ''}
              {table ? ` · ${Object.keys(table.providers).length} 个厂商` : ''}
            </span>
            <label className="btn btn-ghost btn-sm cursor-pointer">
              导入 JSON 文件
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void importTableFile(e.target.files[0])}
              />
            </label>
            <button
              className="btn btn-ghost btn-sm"
              onClick={resetTable}
              disabled={tableBusy || table?.source !== 'file'}
            >
              恢复内置表
            </button>
            {tableMsg && <span className="text-accent">{tableMsg}</span>}
            {tableErr && <span className="text-up">{tableErr}</span>}
          </div>
          <div className="text-muted">
            加载顺序：<code>$PRICING_FILE</code> &gt; 数据目录 <code>pricing.json</code>
            （此处导入写这里） &gt; 仓库 <code>data/pricing.json</code>
            ；都没有则用内置表。文件条目与内置表合并，同名覆盖。
          </div>
        </div>
      </div>
    </Card>
  );
}
