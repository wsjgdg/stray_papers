import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { FlaskConical, Play, Plus, Save, Square, Trash2, Download } from 'lucide-react';
import { Card, Chip, Empty, Spinner } from '../../ui';
import { Stat, fmtCost } from './shared';
import { useVisibilityPolling } from '../../hooks/useVisibilityPolling';
import {
  fetchEvalSets,
  fetchEvalSet,
  saveEvalSet,
  deleteEvalSet,
  runEvalSet,
  fetchEvalRuns,
  fetchEvalRun,
  stopEvalRun,
  evalRunCsvUrl,
  type EvalSet,
  type EvalSetSummary,
  type EvalRun,
  type EvalRunSummaryRow,
  type EvalSummary,
  type EvalRow,
} from '../../api';

const TEMPLATE: EvalSet = {
  name: '新评测集',
  description: '',
  models: [],
  temperature: 0,
  maxTokens: 256,
  cases: [{ input: '把这句话翻译成英文：今天天气很好。', expect: 'weather', judge: 'contains' }],
};

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

/** C1 + C2 + C3：评测集管理 / 跑批 / 结果矩阵 */
export function Evals({ providers }: { providers: string[] }) {
  const [sets, setSets] = useState<EvalSetSummary[]>([]);
  const [resultsDir, setResultsDir] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [set, setSet] = useState<EvalSet | null>(null);
  const [runs, setRuns] = useState<EvalRunSummaryRow[]>([]);
  const [run, setRun] = useState<EvalRun | null>(null);
  const [summary, setSummary] = useState<EvalSummary | null>(null);
  const [sel, setSel] = useState<{ model: string; caseIndex: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [newId, setNewId] = useState('');

  const loadSets = useCallback(async () => {
    try {
      const r = await fetchEvalSets();
      setSets(r.sets);
      setResultsDir(r.resultsDir);
      setActiveId((cur) => cur ?? r.sets[0]?.id ?? null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await fetchEvalRuns(20));
    } catch {
      /* 忽略：历史列表不可用不影响主流程 */
    }
  }, []);

  useEffect(() => {
    void loadSets();
    void loadRuns();
  }, [loadSets, loadRuns]);

  // 选中的集合
  useEffect(() => {
    if (!activeId) {
      setSet(null);
      return;
    }
    let alive = true;
    fetchEvalSet(activeId)
      .then((s) => {
        if (!alive) return;
        setSet(s);
        setDraft(JSON.stringify(s, null, 2));
      })
      .catch((e: Error) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, [activeId]);

  // 跑批进度轮询（仅在 running 时真正发请求）
  useVisibilityPolling(
    1500,
    () => {
      if (!run || run.status !== 'running') return;
      fetchEvalRun(run.id)
        .then((r) => {
          setRun(r.run);
          setSummary(r.summary);
          if (r.run.status !== 'running') void loadRuns();
        })
        .catch(() => undefined);
    },
    [run?.id, run?.status],
  );

  const doRun = async () => {
    if (!activeId) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    setSel(null);
    try {
      const r = await runEvalSet(activeId);
      setRun(r);
      setSummary(null);
      setMsg(`已开始跑批：${r.models.length} 模型 × ${r.caseCount} 用例 = ${r.total} 次调用`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doStop = async () => {
    if (!run) return;
    await stopEvalRun(run.id).catch(() => undefined);
    const r = await fetchEvalRun(run.id).catch(() => null);
    if (r) {
      setRun(r.run);
      setSummary(r.summary);
    }
    void loadRuns();
  };

  const doSave = async () => {
    if (!activeId) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const parsed = JSON.parse(draft) as EvalSet;
      const saved = await saveEvalSet(activeId, parsed);
      setSet(saved);
      setDraft(JSON.stringify(saved, null, 2));
      setEditing(false);
      setMsg('已保存到用户目录（同名仓库示例被覆盖，仓库文件未改动）');
      await loadSets();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doCreate = async () => {
    const id = newId.trim();
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      await saveEvalSet(id, { ...TEMPLATE, models: providers.slice(0, 1).map((p) => p) });
      setNewId('');
      setActiveId(id);
      await loadSets();
      setMsg(`已创建 ${id}.json（请补 models 与 cases）`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!activeId || !window.confirm(`删除用户目录下的 ${activeId}.json？`)) return;
    setBusy(true);
    try {
      await deleteEvalSet(activeId);
      setActiveId(null);
      await loadSets();
      setMsg('已删除');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // case × model 查找表
  const grid = useMemo(() => {
    const m = new Map<string, Map<number, EvalRow>>();
    for (const r of run?.rows ?? []) {
      const inner = m.get(r.model) ?? new Map<number, EvalRow>();
      inner.set(r.caseIndex, r);
      m.set(r.model, inner);
    }
    return m;
  }, [run]);

  const selRow = sel ? (grid.get(sel.model)?.get(sel.caseIndex) ?? null) : null;
  const running = run?.status === 'running';

  return (
    <div className="space-y-3">
      {/* D6：外壳常驻（live region 必须预先存在于 DOM），内层才做条件渲染 */}
      <div role="alert">
        {err && <div className="mb-2 rounded-lg bg-up/10 px-3 py-2 text-xs text-up">{err}</div>}
      </div>
      <div role="status" aria-live="polite">
        {msg && <div className="rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent">{msg}</div>}
      </div>

      <Card
        title="评测集"
        subtitle="跑批走本地代理（自动获得路由 / 缓存 / 重试 / 记账），逐条串行、结果可复现"
        right={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              className="input input-sm"
              value={activeId ?? ''}
              onChange={(e) => setActiveId(e.target.value || null)}
            >
              {sets.length === 0 && <option value="">（无评测集）</option>}
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.name}（{s.caseCount} 例 / {s.models.length} 模型
                  {s.source === 'repo' ? ' · 仓库示例' : ''}）
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={doRun}
              disabled={busy || !set || running}
            >
              <Play size={12} />
              运行
            </button>
            {running && (
              <button className="btn btn-ghost btn-sm" onClick={doStop}>
                <Square size={12} />
                停止
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing((v) => !v)}
              disabled={!set}
            >
              {editing ? '收起编辑器' : '编辑 JSON'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={doDelete} disabled={busy || !set}>
              <Trash2 size={12} />
              删除
            </button>
          </div>
        }
      >
        {!set ? (
          <Empty text="还没有评测集。可在下方「新建」一个，或直接编辑仓库里的 evals/smoke.json。" />
        ) : (
          <div className="space-y-2 text-[11px]">
            {set.description && <div className="text-muted">{set.description}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="accent">{set.models.length} 个模型</Chip>
              {set.models.map((m) => (
                <span
                  key={m}
                  className="rounded bg-panel px-1.5 py-0.5 font-mono text-[10px] text-ink"
                >
                  {m}
                </span>
              ))}
              {set.judgeModel && <Chip tone="warn">判官 {set.judgeModel}</Chip>}
              <span className="text-muted">
                {set.cases.length} 用例 · {set.models.length * set.cases.length} 次调用 · 温度{' '}
                {set.temperature ?? '默认'}
              </span>
            </div>
            {resultsDir && <div className="text-muted">结果目录：{resultsDir}</div>}

            {editing && (
              <div className="space-y-2 border-t border-edge pt-2">
                <textarea
                  className="h-64 w-full rounded-md border border-edge bg-sunken p-2 font-mono text-[10px] text-ink"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn btn-primary btn-sm" onClick={doSave} disabled={busy}>
                    <Save size={12} />
                    保存并生效
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDraft(JSON.stringify(set, null, 2))}
                  >
                    还原
                  </button>
                  <span className="text-muted">
                    判分：exact（全等）/ contains（包含）/ llm（判官 1-5 分，≥3 通过）；有 expect
                    未写 judge 时默认 contains。
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-2">
              <input
                className="input input-sm w-40"
                placeholder="新集合 id（英文）"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={doCreate}
                disabled={busy || !newId.trim()}
              >
                <Plus size={12} />
                新建
              </button>
              <span className="text-muted">
                新建会写入用户目录（数据目录/evals），仓库示例不受影响。
              </span>
            </div>
          </div>
        )}
      </Card>

      {(run || summary) && (
        <Card
          title="结果矩阵（C2）"
          subtitle="行 = 用例，列 = 模型；点单元格看完整输出"
          right={
            <div className="flex items-center gap-2 text-xs">
              {run && (
                <>
                  <Chip tone={running ? 'warn' : run.status === 'done' ? 'down' : 'up'}>
                    {running
                      ? `跑批中 ${run.rows.length}/${run.total}`
                      : run.status === 'done'
                        ? '完成'
                        : run.status === 'stopped'
                          ? '已停止'
                          : '出错'}
                  </Chip>
                  <a className="btn btn-ghost btn-sm" href={evalRunCsvUrl(run.id)} download>
                    <Download size={12} />
                    导出 CSV
                  </a>
                </>
              )}
            </div>
          }
        >
          {summary && (
            <div className="mb-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Stat label="总通过率" value={pct(summary.passRate)} />
              <Stat label="通过 / 判分" value={`${summary.passed} / ${summary.graded}`} />
              <Stat label="平均延迟" value={`${summary.avgLatencyMs}ms`} />
              <Stat label="总成本" value={fmtCost(summary.costUsd, 'USD')} />
            </div>
          )}
          {run?.error && <div className="mb-2 text-[11px] text-up">{run.error}</div>}

          {summary && summary.models.length > 0 && (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-muted">
                    <th className="px-2 py-1.5 text-left">模型</th>
                    <th className="px-2 py-1.5 text-right">通过率</th>
                    <th className="px-2 py-1.5 text-right">通过</th>
                    <th className="px-2 py-1.5 text-right">平均延迟</th>
                    <th className="px-2 py-1.5 text-right">平均分</th>
                    <th className="px-2 py-1.5 text-right">成本</th>
                    <th className="px-2 py-1.5 text-right">缓存命中</th>
                    <th className="px-2 py-1.5 text-right">错误</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.models.map((m) => (
                    <tr key={m.model} className="border-t border-edge">
                      <td
                        className="max-w-[220px] truncate px-2 py-1 font-mono text-ink"
                        title={m.model}
                      >
                        {m.model}
                      </td>
                      <td
                        className={clsx(
                          'px-2 py-1 text-right font-semibold',
                          m.passRate === null
                            ? 'text-muted'
                            : m.passRate >= 0.8
                              ? 'text-down'
                              : m.passRate >= 0.5
                                ? 'text-warn'
                                : 'text-up',
                        )}
                      >
                        {pct(m.passRate)}
                      </td>
                      <td className="px-2 py-1 text-right text-ink">
                        {m.passed}/{m.graded}
                      </td>
                      <td className="px-2 py-1 text-right text-ink">{m.avgLatencyMs}ms</td>
                      <td className="px-2 py-1 text-right text-muted">
                        {m.avgScore === null ? '—' : m.avgScore.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right text-ink">{fmtCost(m.costUsd, 'USD')}</td>
                      <td className="px-2 py-1 text-right text-muted">{m.cacheHits}</td>
                      <td
                        className={clsx(
                          'px-2 py-1 text-right',
                          m.errorCount ? 'text-up' : 'text-muted',
                        )}
                      >
                        {m.errorCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {run && run.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-muted">
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">用例</th>
                    {run.models.map((m) => (
                      <th key={m} className="px-2 py-1.5 text-center font-mono" title={m}>
                        {m.length > 22 ? `${m.slice(0, 21)}…` : m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: run.caseCount }, (_, i) => i).map((i) => (
                    <tr key={i} className="border-t border-edge">
                      <td className="px-2 py-1 text-muted">{i + 1}</td>
                      <td
                        className="max-w-[280px] truncate px-2 py-1 text-ink"
                        title={set?.cases[i]?.input ?? ''}
                      >
                        {set?.cases[i]?.input ?? '（用例已在集合中变更）'}
                      </td>
                      {run.models.map((m) => {
                        const cell = grid.get(m)?.get(i);
                        if (!cell)
                          return (
                            <td key={m} className="px-2 py-1 text-center text-muted">
                              ·
                            </td>
                          );
                        return (
                          <td key={m} className="px-2 py-1 text-center">
                            <button
                              onClick={() => setSel({ model: m, caseIndex: i })}
                              className={clsx(
                                'rounded px-1.5 py-0.5 transition-colors',
                                cell.error
                                  ? 'bg-up/15 text-up hover:bg-up/25'
                                  : cell.pass === true
                                    ? 'bg-down/15 text-down hover:bg-down/25'
                                    : cell.pass === false
                                      ? 'bg-up/15 text-up hover:bg-up/25'
                                      : 'bg-panel text-muted hover:bg-hover',
                              )}
                              title={`${cell.pass === null ? '未判分' : cell.pass ? '通过' : '未通过'} · ${cell.latencyMs}ms${cell.score ? ` · ${cell.score}/5` : ''}`}
                            >
                              {cell.error
                                ? 'ERR'
                                : cell.pass === true
                                  ? '✓'
                                  : cell.pass === false
                                    ? '✗'
                                    : '—'}
                              <span className="ml-1 text-[9px] text-muted">{cell.latencyMs}ms</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            running && <Spinner label="跑批中…（逐条串行执行，页面隐藏时暂停刷新）" />
          )}

          {selRow && (
            <div className="mt-3 space-y-1 border-t border-edge pt-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">
                  #{sel!.caseIndex + 1} · {sel!.model}
                </span>
                <Chip
                  tone={
                    selRow.error
                      ? 'up'
                      : selRow.pass === true
                        ? 'down'
                        : selRow.pass === false
                          ? 'up'
                          : 'default'
                  }
                >
                  {selRow.error
                    ? `HTTP ${selRow.status}`
                    : selRow.pass === true
                      ? '通过'
                      : selRow.pass === false
                        ? '未通过'
                        : '未判分'}
                </Chip>
                <span className="text-muted">
                  {selRow.latencyMs}ms · {fmtCost(selRow.costUsd, 'USD')}
                  {selRow.fromCache ? ' · 缓存命中' : ''}
                  {selRow.judgeNote ? ` · ${selRow.judgeNote}` : ''}
                </span>
                {selRow.requestId && (
                  <span
                    className="font-mono text-[10px] text-muted"
                    title="可在「调用日志」中检索该 requestId"
                  >
                    {selRow.requestId.slice(0, 8)}…
                  </span>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>
                  关闭
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-muted">期望</div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-sunken p-2 font-mono text-[10px] text-ink">
                    {set?.cases[sel!.caseIndex]?.expect ?? '（无参考答案）'}
                  </pre>
                </div>
                <div>
                  <div className="text-muted">模型输出</div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-edge bg-sunken p-2 font-mono text-[10px] text-ink">
                    {selRow.error ?? selRow.output}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title="跑批历史" subtitle="结果落盘在数据目录的 eval-results/，重启后仍可查看与导出">
        {runs.length === 0 ? (
          <Empty text="还没有跑批记录。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-muted">
                  <th className="px-2 py-1.5 text-left">集合</th>
                  <th className="px-2 py-1.5 text-left">开始时间</th>
                  <th className="px-2 py-1.5 text-right">模型</th>
                  <th className="px-2 py-1.5 text-right">进度</th>
                  <th className="px-2 py-1.5 text-left">状态</th>
                  <th className="px-2 py-1.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-edge">
                    <td className="px-2 py-1 text-ink">{r.setId}</td>
                    <td className="px-2 py-1 text-muted">
                      {new Date(r.startedAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-2 py-1 text-right text-muted">{r.models.length}</td>
                    <td className="px-2 py-1 text-right text-ink">
                      {r.status === 'running' ? `${r.rowCount}/${r.total}` : r.rowCount || '—'}
                    </td>
                    <td className="px-2 py-1">
                      <Chip
                        tone={r.status === 'done' ? 'down' : r.status === 'running' ? 'warn' : 'up'}
                      >
                        {r.status}
                      </Chip>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          fetchEvalRun(r.id)
                            .then((x) => {
                              setRun(x.run);
                              setSummary(x.summary);
                              setActiveId(x.run.setId);
                            })
                            .catch((e: Error) => setErr(e.message))
                        }
                      >
                        <FlaskConical size={11} />
                        查看
                      </button>
                      <a className="btn btn-ghost btn-sm" href={evalRunCsvUrl(r.id)} download>
                        CSV
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
