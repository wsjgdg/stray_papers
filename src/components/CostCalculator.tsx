import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Plus, Trash2 } from 'lucide-react';
import type { LlmModel } from '../../server/types';
import { fmtCtx, fmtPrice } from '../api';
import { Card, Chip, Empty, Stat } from '../ui';

interface Props {
  models: LlmModel[];
}

interface Row {
  model: LlmModel;
  inputCost: number;
  outputCost: number;
  monthly: number;
}

const PALETTE = [
  '#4da3ff',
  '#22d3ee',
  '#f59e0b',
  '#a78bfa',
  '#34d399',
  '#fb7185',
  '#e879f9',
  '#facc15',
];

export default function CostCalculator({ models }: Props) {
  const [requests, setRequests] = useState(100_000);
  const [inTok, setInTok] = useState(2000);
  const [outTok, setOutTok] = useState(800);
  const [cacheRate, setCacheRate] = useState(50);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const suggestions = useMemo(() => {
    if (!query.trim()) {
      return [...models]
        .filter((m) => m.intelligence !== null)
        .sort((a, b) => (b.intelligence ?? 0) - (a.intelligence ?? 0))
        .slice(0, 8);
    }
    const q = query.toLowerCase();
    return models
      .filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .slice(0, 12);
  }, [models, query]);

  const selected = useMemo(
    () =>
      picked.map((id) => models.find((m) => m.id === id)).filter((m): m is LlmModel => Boolean(m)),
    [picked, models],
  );

  const rows = useMemo<Row[]>(() => {
    const cacheRatio = Math.min(100, Math.max(0, cacheRate)) / 100;
    return selected
      .map((model) => {
        const cachePrice = model.cacheReadPrice ?? model.promptPrice;
        const effInput = model.promptPrice * (1 - cacheRatio) + cachePrice * cacheRatio;
        const inputCost = (requests * inTok * effInput) / 1_000_000;
        const outputCost = (requests * outTok * model.completionPrice) / 1_000_000;
        return { model, inputCost, outputCost, monthly: inputCost + outputCost };
      })
      .sort((a, b) => a.monthly - b.monthly);
  }, [selected, requests, inTok, outTok, cacheRate]);

  const best = rows[0]?.monthly ?? 0;
  const chartData = rows.map((r) => ({
    name: r.model.name.replace(/^[^:]+:\s*/, '').slice(0, 22),
    monthly: Math.round(r.monthly * 100) / 100,
  }));

  const add = (id: string) => {
    if (picked.includes(id) || picked.length >= 8) return;
    setPicked([...picked, id]);
  };

  return (
    <div className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="月请求次数" value={requests} onChange={setRequests} step={1000} />
        <Field label="平均输入 tokens" value={inTok} onChange={setInTok} step={100} />
        <Field label="平均输出 tokens" value={outTok} onChange={setOutTok} step={100} />
        <Field
          label="缓存命中率 (%)"
          value={cacheRate}
          onChange={setCacheRate}
          step={5}
          max={100}
        />
      </div>

      <Card
        title="选择对比模型"
        subtitle="最多 8 个 · 成本按 USD / 百万 token 计算，缓存命中部分使用各家 cache-read 价格"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {selected.length === 0 && <span className="text-xs text-muted">尚未选择模型</span>}
            {selected.map((m, i) => (
              <span
                key={m.id}
                className="chip cursor-pointer"
                style={{ borderColor: PALETTE[i % PALETTE.length] }}
                onClick={() => setPicked(picked.filter((id) => id !== m.id))}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: PALETTE[i % PALETTE.length] }}
                />
                {m.name}
                <Trash2 size={11} />
              </span>
            ))}
          </div>

          <input
            className="input"
            placeholder="搜索模型名称或 id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-edge bg-[#0d1728] p-2">
            {suggestions.length === 0 && <Empty text="没有匹配的模型" />}
            {suggestions.map((m) => (
              <button
                key={m.id}
                onClick={() => add(m.id)}
                disabled={picked.includes(m.id) || picked.length >= 8}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink hover:bg-[#16233a] disabled:opacity-35"
              >
                <span className="truncate">{m.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
                  <span>{fmtCtx(m.context)}</span>
                  <span className="tabular-nums">
                    {fmtPrice(m.promptPrice)} / {fmtPrice(m.completionPrice)}
                  </span>
                  <Plus size={12} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat
              label="最低月成本"
              value={`$${best.toFixed(2)}`}
              hint={rows[0].model.name}
              tone="down"
            />
            <Stat
              label="最高月成本"
              value={`$${rows[rows.length - 1].monthly.toFixed(2)}`}
              hint={rows[rows.length - 1].model.name}
              tone="up"
            />
            <Stat
              label="极差倍数"
              value={best > 0 ? `${(rows[rows.length - 1].monthly / best).toFixed(1)}x` : '—'}
              hint="最高 / 最低"
            />
            <Stat
              label="年度最低成本"
              value={`$${(best * 12).toFixed(0)}`}
              hint="按最低方案年化"
              tone="accent"
            />
          </div>

          <Card
            title="月度成本对比"
            subtitle={`${requests.toLocaleString()} 次请求 · ${inTok} in / ${outTok} out · 缓存命中 ${cacheRate}%`}
          >
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 48, left: 8 }}>
                  <XAxis
                    dataKey="name"
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                    tick={{ fill: '#9aa7bd', fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: '#9aa7bd', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: '#111a2b',
                      border: '1px solid #1f2d44',
                      borderRadius: 8,
                    }}
                    labelStyle={{ color: '#e6edf3' }}
                    formatter={(v: number) => [`$${v.toFixed(2)}`, '月成本']}
                  />
                  <Bar dataKey="monthly" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="成本明细">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-edge">
                    {[
                      '模型',
                      '输入价',
                      '输出价',
                      '缓存价',
                      '输入成本',
                      '输出成本',
                      '月成本',
                      '年成本',
                      '倍数',
                    ].map((h) => (
                      <th key={h} className="th">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={r.model.id}
                      className="border-b border-edge/60 last:border-0 hover:bg-[#132038]"
                    >
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: PALETTE[i % PALETTE.length] }}
                          />
                          <span className="truncate">{r.model.name}</span>
                        </div>
                      </td>
                      <td className="td tabular-nums">{fmtPrice(r.model.promptPrice)}</td>
                      <td className="td tabular-nums">{fmtPrice(r.model.completionPrice)}</td>
                      <td className="td tabular-nums">{fmtPrice(r.model.cacheReadPrice)}</td>
                      <td className="td tabular-nums">${r.inputCost.toFixed(2)}</td>
                      <td className="td tabular-nums">${r.outputCost.toFixed(2)}</td>
                      <td className="td tabular-nums font-medium text-ink">
                        ${r.monthly.toFixed(2)}
                      </td>
                      <td className="td tabular-nums">${(r.monthly * 12).toFixed(0)}</td>
                      <td className="td">
                        <Chip tone={i === 0 ? 'down' : 'default'}>
                          {best > 0 ? `${(r.monthly / best).toFixed(2)}x` : '—'}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  max?: number;
}) {
  return (
    <label className="card block px-4 py-3">
      <span className="block text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <input
        type="number"
        className="mt-1 w-full bg-transparent text-lg font-semibold tabular-nums text-ink outline-none"
        value={value}
        min={0}
        step={step}
        max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}
