"use client";
/**
 * HTML overview report generator.
 * Builds a standalone, self-contained HTML file with KPI cards,
 * distribution tables, schema, and sample thumbnails.
 */
import { useDatasetStore } from "@/lib/dataset/store";
import { useActiveRows, useSchema } from "@/lib/dataset/hooks";
import { uniqueValues, numericRange, formatBytes } from "@/lib/dataset/filter";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { toast } from "sonner";

export function HtmlReportExport() {
  const dataset = useDatasetStore((s) => s.datasets[s.activeDatasetIndex]);
  const rows = useActiveRows();
  const schema = useSchema();
  const imageField = useDatasetStore((s) => s.imageField);
  const cache = useDatasetStore((s) => s.blobCache);
  const annotationsMap = useDatasetStore((s) => s.annotations);

  const handleExport = () => {
    if (!dataset) return;
    const html = buildHtml(dataset, rows, schema, imageField, cache, annotationsMap);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset.name.replace(/[^a-zA-Z0-9_\-]/g, "_")}_report.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success("HTML report exported");
  };

  if (!dataset) return null;

  return (
    <Button size="sm" variant="outline" onClick={handleExport} className="h-8 text-xs">
      <FileDown className="h-3.5 w-3.5" />
      Export HTML report
    </Button>
  );
}

function buildHtml(
  dataset: NonNullable<ReturnType<typeof useDatasetStore.getState>["dataset"]>,
  rows: ReturnType<typeof useActiveRows>,
  schema: ReturnType<typeof useSchema>,
  imageField: string | null,
  cache: ReturnType<typeof useDatasetStore.getState>["blobCache"],
  annotationsMap: ReturnType<typeof useDatasetStore.getState>["annotations"],
): string {
  const totalRows = rows.length;
  const totalSize = dataset.files.reduce((a, f) => a + f.sizeBytes, 0);
  const categoryFields = schema.filter((f) => f.role === "category");
  const numericFields = schema.filter((f) => f.role === "numeric");

  // gather sample thumbnails (first 12 with decoded images)
  const samples: { row: (typeof rows)[0]; blobUrl: string }[] = [];
  for (const r of rows) {
    if (samples.length >= 12) break;
    const key = `${r.id}:${imageField}`;
    const c = cache[key];
    if (c?.url) samples.push({ row: r, blobUrl: c.url });
  }

  // KPI cards
  const kpiCards = [
    { label: "Total rows", value: totalRows.toLocaleString(), color: "#10b981" },
    { label: "Fields", value: String(schema.length), color: "#06b6d4" },
    { label: "Files", value: String(dataset.files.length), color: "#8b5cf6" },
    { label: "Total size", value: formatBytes(totalSize), color: "#f59e0b" },
  ]
    .map(
      (k) => `
    <div class="kpi-card" style="border-top: 3px solid ${k.color}">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.value}</div>
    </div>`,
    )
    .join("");

  // category distributions
  const catSections = categoryFields
    .slice(0, 6)
    .map((f) => {
      const data = uniqueValues(rows, f.name, 30);
      if (data.length === 0) return "";
      const max = Math.max(...data.map((d) => d.count));
      const bars = data
        .map((d) => {
          const pct = (d.count / max) * 100;
          return `
        <div class="bar-row">
          <span class="bar-label">${escapeHtml(d.value)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="bar-count">${d.count}</span>
        </div>`;
        })
        .join("");
      return `
      <div class="dist-card">
        <h3>${escapeHtml(f.name)} distribution</h3>
        <div class="bar-list">${bars}</div>
      </div>`;
    })
    .join("");

  // numeric stats table
  const numRows = numericFields
    .map((f) => {
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
      const avg = n > 0 ? sum / n : 0;
      return `<tr><td>${escapeHtml(f.name)}</td><td>${range?.min ?? 0}</td><td>${range?.max ?? 0}</td><td>${avg.toFixed(2)}</td><td>${n}</td></tr>`;
    })
    .join("");

  // schema table
  const schemaRows = schema
    .map(
      (f) =>
        `<tr><td><code>${escapeHtml(f.name)}</code></td><td>${escapeHtml(f.type)}</td><td><span class="role-badge">${f.role}</span></td><td>${f.nullable ? "Yes" : "No"}</td></tr>`,
    )
    .join("");

  // files table
  const filesRows = dataset.files
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.name)}</td><td>${f.split || "—"}</td><td>${formatBytes(f.sizeBytes)}</td><td>${f.rowsCount}</td><td>${f.schema.length}</td></tr>`,
    )
    .join("");

  // sample images
  const sampleGrid = samples
    .map(
      (s) =>
        `<div class="sample-card"><img src="${s.blobUrl}" alt="${escapeHtml(s.row.id)}" /><div class="sample-meta">#${s.row.index + 1} · ${escapeHtml(s.row.id)}</div></div>`,
    )
    .join("");

  // annotation count
  let annCount = 0;
  for (const id in annotationsMap) annCount += annotationsMap[id]?.length || 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(dataset.name)} — Dataset Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.6; padding: 24px; }
  .header { background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; padding: 32px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(139,92,246,0.2); }
  .header h1 { font-size: 28px; margin-bottom: 8px; }
  .header .meta { font-size: 13px; opacity: 0.9; }
  .section { background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .section h2 { font-size: 16px; margin-bottom: 16px; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .kpi-card { background: white; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .kpi-label { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
  .kpi-value { font-size: 24px; font-weight: 700; margin-top: 4px; color: #0f172a; }
  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
  .dist-card { background: #f8fafc; border-radius: 8px; padding: 14px; }
  .dist-card h3 { font-size: 12px; margin-bottom: 10px; color: #475569; text-transform: uppercase; }
  .bar-list { display: flex; flex-direction: column; gap: 4px; }
  .bar-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .bar-label { width: 90px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #475569; }
  .bar-track { flex: 1; height: 16px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, #8b5cf6, #ec4899); border-radius: 4px; transition: width 0.3s; }
  .bar-count { width: 36px; font-weight: 600; color: #0f172a; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; background: #f1f5f9; color: #475569; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
  tr:hover td { background: #f8fafc; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Monaco, monospace; font-size: 12px; color: #8b5cf6; }
  .role-badge { background: #ede9fe; color: #6d28d9; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .sample-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .sample-card { background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
  .sample-card img { width: 100%; height: 120px; object-fit: contain; background: #f8fafc; display: block; }
  .sample-meta { padding: 6px 8px; font-size: 10px; color: #64748b; font-family: monospace; }
  .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; padding: 16px; }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(dataset.name)}</h1>
    <div class="meta">Dataset overview report · Generated ${new Date().toLocaleString()} · ${totalRows} rows · ${dataset.files.length} files · ${annCount} annotations</div>
    ${dataset.description ? `<div class="meta" style="margin-top:6px">${escapeHtml(dataset.description)}</div>` : ""}
  </div>

  <div class="kpi-grid">${kpiCards}</div>

  <div class="section">
    <h2>Files</h2>
    <table>
      <thead><tr><th>Name</th><th>Split</th><th>Size</th><th>Rows</th><th>Fields</th></tr></thead>
      <tbody>${filesRows}</tbody>
    </table>
  </div>

  ${catSections ? `<div class="section"><h2>Category distributions</h2><div class="grid-2">${catSections}</div></div>` : ""}

  ${numRows ? `<div class="section"><h2>Numeric field statistics</h2><table><thead><tr><th>Field</th><th>Min</th><th>Max</th><th>Avg</th><th>Non-null</th></tr></thead><tbody>${numRows}</tbody></table></div>` : ""}

  <div class="section">
    <h2>Schema (${schema.length} fields)</h2>
    <table>
      <thead><tr><th>Field</th><th>Type</th><th>Role</th><th>Nullable</th></tr></thead>
      <tbody>${schemaRows}</tbody>
    </table>
  </div>

  ${sampleGrid ? `<div class="section"><h2>Sample images (first 12 decoded)</h2><div class="sample-grid">${sampleGrid}</div></div>` : ""}

  <div class="footer">Generated by Dataset Image Browser</div>
</body>
</html>`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
