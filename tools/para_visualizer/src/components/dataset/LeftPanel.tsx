"use client";
/**
 * Left panel: file list + schema/fields list
 */
import { useDatasetStore } from "@/lib/dataset/store";
import { useActiveRows, useSchema } from "@/lib/dataset/hooks";
import { formatBytes, uniqueValues } from "@/lib/dataset/filter";
import {
  FileBox,
  Layers,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Type,
  Hash,
  CalendarClock,
  Link2,
  Tag,
  Database,
  RefreshCw,
  CheckCircle2,
  GitCompareArrows,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const roleIcon: Record<string, React.ReactNode> = {
  image: <ImageIcon className="h-3 w-3" />,
  url: <Link2 className="h-3 w-3" />,
  text: <Type className="h-3 w-3" />,
  category: <Tag className="h-3 w-3" />,
  numeric: <Hash className="h-3 w-3" />,
  datetime: <CalendarClock className="h-3 w-3" />,
  identifier: <Hash className="h-3 w-3" />,
  meta: <Database className="h-3 w-3" />,
  unknown: <Database className="h-3 w-3" />,
};

const roleColor: Record<string, string> = {
  image: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  url: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  text: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  category: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  numeric: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  datetime: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  identifier: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  meta: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  unknown: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

export function LeftPanel() {
  const dataset = useDatasetStore((s) => s.datasets[s.activeDatasetIndex]);
  const datasets = useDatasetStore((s) => s.datasets);
  const activeDatasetIndex = useDatasetStore((s) => s.activeDatasetIndex);
  const setActiveDatasetIndex = useDatasetStore((s) => s.setActiveDatasetIndex);
  const removeDataset = useDatasetStore((s) => s.removeDataset);
  const toggleCompareDataset = useDatasetStore((s) => s.toggleCompareDataset);
  const compareDatasetIndices = useDatasetStore((s) => s.compareDatasetIndices);
  const activeFileIndex = useDatasetStore((s) => s.activeFileIndex);
  const setActiveFileIndex = useDatasetStore((s) => s.setActiveFileIndex);
  const schema = useSchema();
  const imageField = useDatasetStore((s) => s.imageField);
  const setImageField = useDatasetStore((s) => s.setImageField);
  const hiddenFields = useDatasetStore((s) => s.hiddenFields);
  const toggleHiddenField = useDatasetStore((s) => s.toggleHiddenField);
  const maxRows = useDatasetStore((s) => s.maxRows);
  const rows = useActiveRows();

  const categoryCounts = useMemo(() => {
    const out: Record<string, { value: string; count: number }[]> = {};
    for (const f of schema) {
      if (f.role === "category") out[f.name] = uniqueValues(rows, f.name, 6);
    }
    return out;
  }, [schema, rows]);

  if (!dataset) return null;

  return (
    <div className="flex flex-col h-full bg-card/30 border-r">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Datasets section (multi-dataset switcher) */}
          {datasets.length > 1 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Database className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Datasets
                </h3>
                <Badge variant="secondary" className="ml-auto text-[9px] h-4">
                  {datasets.length}
                </Badge>
              </div>
              <div className="space-y-1">
                {datasets.map((ds, i) => {
                  const isActive = activeDatasetIndex === i;
                  const inCompare = compareDatasetIndices.includes(i);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md border text-[11px] transition-colors cursor-pointer",
                        isActive
                          ? "bg-primary/10 border-primary/40 text-foreground"
                          : "border-transparent hover:bg-accent/40",
                      )}
                      onClick={() => setActiveDatasetIndex(i)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{ds.name}</div>
                        <div className="text-[9px] text-muted-foreground">
                          {ds.files.reduce((a, f) => a + f.rowsCount, 0)} rows · {ds.files.length} files
                        </div>
                      </div>
                      {inCompare && (
                        <Badge variant="secondary" className="text-[8px] h-3 px-1 shrink-0">CMP</Badge>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompareDataset(i);
                        }}
                        className={cn(
                          "p-0.5 rounded hover:bg-accent text-[9px] shrink-0",
                          inCompare ? "text-emerald-500" : "text-muted-foreground/50",
                        )}
                        title={inCompare ? "Remove from dataset comparison" : "Add to dataset comparison"}
                      >
                        <GitCompareArrows className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remove dataset "${ds.name}"?`)) removeDataset(i);
                        }}
                        className="p-0.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-rose-500 shrink-0"
                        title="Remove dataset"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {compareDatasetIndices.length >= 2 && (
                <div className="mt-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300/40 text-[10px] text-emerald-700 dark:text-emerald-300">
                  {compareDatasetIndices.length} datasets selected for comparison — use Compare view to see them side-by-side
                </div>
              )}
            </div>
          )}

          {/* Files section */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileBox className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Files
              </h3>
              <Badge variant="secondary" className="ml-auto text-[9px] h-4">
                {dataset.files.length}
              </Badge>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setActiveFileIndex(null)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-md border text-[11px] transition-colors",
                  activeFileIndex === null
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "border-transparent hover:bg-accent/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">All files</span>
                  <span className="text-muted-foreground tabular-nums">
                    {dataset.files.reduce((a, f) => a + f.rowsCount, 0)}
                  </span>
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  Merged view{dataset.files.reduce((a, f) => a + f.rowsCount, 0) > maxRows ? ` · first ${maxRows} rows` : ""}
                </div>
              </button>
              {dataset.files.map((f, i) => {
                const active = activeFileIndex === i;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveFileIndex(i)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md border text-[11px] transition-colors",
                      active
                        ? "bg-primary/10 border-primary/40 text-foreground"
                        : "border-transparent hover:bg-accent/40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{f.name}</span>
                      <CheckCircle2
                        className={cn(
                          "h-3 w-3 shrink-0",
                          active ? "text-primary" : "text-transparent",
                        )}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-0.5 text-[9px] text-muted-foreground">
                      <span>{formatBytes(f.sizeBytes)}</span>
                      <span className="tabular-nums">{f.rowsCount} rows</span>
                    </div>
                    {f.split && (
                      <Badge variant="outline" className="mt-1 text-[9px] h-3.5 px-1">
                        {f.split}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Schema section */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Fields · {schema.length}
              </h3>
            </div>
            <div className="space-y-1">
              {schema.map((f) => {
                const hidden = hiddenFields.has(f.name);
                const isImage = f.name === imageField;
                return (
                  <div
                    key={f.name}
                    className={cn(
                      "group flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-accent/40 transition-colors",
                      hidden && "opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 p-0.5 rounded",
                        roleColor[f.role] || roleColor.unknown,
                      )}
                      title={f.role}
                    >
                      {roleIcon[f.role] || roleIcon.unknown}
                    </span>
                    <button
                      onClick={() => !hidden && setImageField(isImage ? null : f.name)}
                      className="flex-1 text-left text-[11px] truncate hover:underline"
                      title={isImage ? "Currently used as image" : `Use ${f.name} as image field`}
                    >
                      {f.name}
                    </button>
                    <span className="text-[9px] text-muted-foreground/70 font-mono shrink-0">{f.type}</span>
                    {isImage && (
                      <Badge className="text-[9px] h-3.5 px-1 shrink-0" variant="secondary">
                        IMG
                      </Badge>
                    )}
                    <button
                      onClick={() => toggleHiddenField(f.name)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent text-muted-foreground shrink-0"
                      title={hidden ? "Show field" : "Hide field"}
                    >
                      {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category distribution summary */}
          {Object.keys(categoryCounts).length > 0 && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Category counts
                  </h3>
                </div>
                <div className="space-y-2">
                  {Object.entries(categoryCounts).map(([field, vals]) => (
                    <div key={field} className="text-[10px]">
                      <div className="font-mono text-muted-foreground mb-1">{field}</div>
                      <div className="flex flex-wrap gap-1">
                        {vals.map((v) => (
                          <Badge
                            key={v.value}
                            variant="outline"
                            className="text-[9px] h-4 px-1 gap-1"
                          >
                            <span className="truncate max-w-[80px]">{v.value}</span>
                            <span className="text-muted-foreground">{v.count}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
