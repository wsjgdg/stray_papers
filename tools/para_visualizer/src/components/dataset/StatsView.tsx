"use client";
/**
 * Stats view: dataset overview with charts (recharts).
 */
import { useMemo } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useActiveRows, useSchema } from "@/lib/dataset/hooks";
import { formatBytes, uniqueValues, numericRange } from "@/lib/dataset/filter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { Database, Image as ImageIcon, Columns3, CheckCircle2, XCircle, AlertTriangle, Hash, X } from "lucide-react";
import { HtmlReportExport } from "./HtmlReportExport";

const PIE_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#6366f1", "#a855f7", "#ec4899", "#14b8a6", "#84cc16"];

export function StatsView() {
  const dataset = useDatasetStore((s) => s.dataset);
  const rows = useActiveRows();
  const schema = useSchema();
  const failures = useDatasetStore((s) => s.failures);
  const imageField = useDatasetStore((s) => s.imageField);
  const cache = useDatasetStore((s) => s.blobCache);

  const stats = useMemo(() => {
    const categoryFields = schema.filter((f) => f.role === "category");
    const numericFields = schema.filter((f) => f.role === "numeric");
    const total = rows.length;

    const byCategory: Record<string, { value: string; count: number }[]> = {};
    for (const f of categoryFields) {
      byCategory[f.name] = uniqueValues(rows, f.name, 50);
    }
    const byNumeric: Record<string, { min: number; max: number; avg: number; count: number }> = {};
    for (const f of numericFields) {
      const range = numericRange(rows, f.name);
      let sum = 0;
      let n = 0;
      for (const r of rows) {
        const v = Number(r.data[f.name]);
        if (Number.isFinite(v)) {
          sum += v;
          n++;
        }
      }
      byNumeric[f.name] = {
        min: range?.min ?? 0,
        max: range?.max ?? 0,
        avg: n > 0 ? sum / n : 0,
        count: n,
      };
    }

    // image decode stats
    let okCount = 0;
    let errCount = failures.length;
    let urlCount = 0;
    let nullCount = 0;
    if (imageField) {
      for (const r of rows) {
        const v = r.data[imageField];
        if (v == null || v === "") {
          nullCount++;
          continue;
        }
        const cached = cache[`${r.id}:${imageField}`];
        if (cached?.error && !cached.source) errCount++;
        else if (cached?.error && cached.source) urlCount++;
        else if (cached?.url) okCount++;
      }
    }

    return { total, byCategory, byNumeric, okCount, errCount, urlCount, nullCount, categoryFields, numericFields };
  }, [rows, schema, failures, imageField, cache]);

  if (!dataset) {
    return <div className="p-8 text-muted-foreground">No dataset loaded.</div>;
  }

  return (
    <div className="h-full overflow-y-auto custom-scroll p-4 space-y-4">
      {/* Header with export */}
      <div className="flex items-center justify-end">
        <HtmlReportExport />
      </div>
      {/* Top KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Database className="h-4 w-4" />}
          label="Total rows"
          value={stats.total.toLocaleString()}
          accent="text-emerald-600"
        />
        <StatCard
          icon={<Columns3 className="h-4 w-4" />}
          label="Fields"
          value={String(schema.length)}
          accent="text-sky-600"
        />
        <StatCard
          icon={<ImageIcon className="h-4 w-4" />}
          label="Files"
          value={String(dataset.files.length)}
          accent="text-violet-600"
        />
        <StatCard
          icon={<Hash className="h-4 w-4" />}
          label="Total size"
          value={formatBytes(dataset.files.reduce((a, f) => a + f.sizeBytes, 0))}
          accent="text-amber-600"
        />
      </div>

      {/* Image decode status */}
      {imageField && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Image decode status · <span className="font-mono text-muted-foreground">{imageField}</span></h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Decoded OK" value={stats.okCount} color="text-emerald-600" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
            <MiniStat label="URL refs" value={stats.urlCount} color="text-sky-600" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
            <MiniStat label="Failed" value={stats.errCount} color="text-rose-600" icon={<XCircle className="h-3.5 w-3.5" />} />
            <MiniStat label="Empty/missing" value={stats.nullCount} color="text-muted-foreground" icon={<X className="h-3.5 w-3.5" />} />
          </div>
          {/* progress bar */}
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden flex">
            <div className="bg-emerald-500" style={{ width: `${(stats.okCount / Math.max(1, stats.total)) * 100}%` }} />
            <div className="bg-sky-500" style={{ width: `${(stats.urlCount / Math.max(1, stats.total)) * 100}%` }} />
            <div className="bg-rose-500" style={{ width: `${(stats.errCount / Math.max(1, stats.total)) * 100}%` }} />
            <div className="bg-muted-foreground/40" style={{ width: `${(stats.nullCount / Math.max(1, stats.total)) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Category distributions */}
      {stats.categoryFields.length > 0 && (
        <div className="grid md:grid-cols-2 gap-3">
          {stats.categoryFields.slice(0, 6).map((f) => {
            const data = stats.byCategory[f.name];
            if (!data || data.length === 0) return null;
            const isPie = data.length <= 6;
            return (
              <div key={f.name} className="rounded-lg border bg-card p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {f.name} distribution
                </h4>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    {isPie ? (
                      <PieChart>
                        <Pie
                          data={data}
                          dataKey="count"
                          nameKey="value"
                          cx="50%"
                          cy="50%"
                          outerRadius={75}
                          innerRadius={30}
                          label={(e) => `${e.value}`}
                          labelLine={false}
                        >
                          {data.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RTooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    ) : (
                      <BarChart data={data} layout="vertical" margin={{ left: 30, right: 10, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="value" tick={{ fontSize: 9 }} width={70} />
                        <RTooltip />
                        <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Numeric ranges */}
      {stats.numericFields.length > 0 && (
        <div className="rounded-lg border bg-card p-3">
          <h3 className="text-sm font-semibold mb-3">Numeric field statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5 pr-4 font-medium">Field</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Min</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Max</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Avg</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Non-null</th>
                </tr>
              </thead>
              <tbody>
                {stats.numericFields.map((f) => {
                  const s = stats.byNumeric[f.name];
                  return (
                    <tr key={f.name} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="py-1.5 pr-4 font-mono">{f.name}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{s.min.toFixed(1)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{s.max.toFixed(1)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{s.avg.toFixed(2)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{s.count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Numeric scatter plot (first 2 numeric fields) */}
      {stats.numericFields.length >= 2 && (() => {
        const xField = stats.numericFields[0];
        const yField = stats.numericFields[1];
        const scatterData = rows
          .map((r) => ({
            x: Number(r.data[xField.name]),
            y: Number(r.data[yField.name]),
            id: r.id,
          }))
          .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y))
          .slice(0, 500);
        if (scatterData.length === 0) return null;
        return (
          <div className="rounded-lg border bg-card p-3">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Hash className="h-4 w-4 text-cyan-500" />
              Numeric scatter: <span className="font-mono text-xs text-muted-foreground">{xField.name}</span> vs <span className="font-mono text-xs text-muted-foreground">{yField.name}</span>
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">{scatterData.length} points</span>
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ left: 20, right: 20, top: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={xField.name}
                    tick={{ fontSize: 10 }}
                    label={{ value: xField.name, position: "bottom", offset: 10, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={yField.name}
                    tick={{ fontSize: 10 }}
                    label={{ value: yField.name, angle: -90, position: "insideLeft", fontSize: 11 }}
                  />
                  <ZAxis range={[40, 40]} />
                  <RTooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  />
                  <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* Histogram for first numeric field */}
      {stats.numericFields.length >= 1 && (() => {
        const field = stats.numericFields[0];
        const values = rows
          .map((r) => Number(r.data[field.name]))
          .filter((v) => Number.isFinite(v));
        if (values.length === 0) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const bins = 12;
        const binSize = (max - min) / bins || 1;
        const histogram = Array.from({ length: bins }, (_, i) => {
          const binStart = min + i * binSize;
          const binEnd = min + (i + 1) * binSize;
          const count = values.filter((v) => v >= binStart && (v < binEnd || (i === bins - 1 && v <= binEnd))).length;
          return {
            bin: `${binStart.toFixed(0)}–${binEnd.toFixed(0)}`,
            count,
          };
        });
        return (
          <div className="rounded-lg border bg-card p-3">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Hash className="h-4 w-4 text-amber-500" />
              Histogram: <span className="font-mono text-xs text-muted-foreground">{field.name}</span>
              <span className="ml-auto text-[10px] font-normal text-muted-foreground">{values.length} values · {bins} bins</span>
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogram} margin={{ left: 10, right: 10, top: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="bin" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* Schema table */}
      <div className="rounded-lg border bg-card p-3">
        <h3 className="text-sm font-semibold mb-2">Schema</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-1.5 pr-4 font-medium">Field</th>
                <th className="py-1.5 pr-4 font-medium">Type</th>
                <th className="py-1.5 pr-4 font-medium">Role</th>
                <th className="py-1.5 pr-4 font-medium">Nullable</th>
              </tr>
            </thead>
            <tbody>
              {schema.map((f) => (
                <tr key={f.name} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="py-1.5 pr-4 font-mono">{f.name}</td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{f.type}</td>
                  <td className="py-1.5 pr-4">
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">{f.role}</span>
                  </td>
                  <td className="py-1.5 pr-4 text-muted-foreground">{f.nullable ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <div className={`p-2 rounded-md bg-muted/40 ${accent || ""}`}>{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className={`flex items-center gap-1 ${color}`}>
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
