"use client";
/**
 * Right panel: row detail info + image info + actions
 */
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema, useHiddenFields } from "@/lib/dataset/hooks";
import { formatValue, formatBytes } from "@/lib/dataset/filter";
import { Highlight } from "./Highlight";
import {
  Download,
  Copy,
  Check,
  Star,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Clock,
  Hash,
  Ruler,
  FileImage,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function RightPanel() {
  const filtered = useFilteredRows();
  const selectedRowId = useDatasetStore((s) => s.selectedRowId);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const imageField = useDatasetStore((s) => s.imageField);
  const schema = useSchema();
  const hiddenFields = useHiddenFields();
  // Only select the specific cache entry for this row, not the whole cache map.
  const cacheKey = selectedRowId && imageField ? `${selectedRowId}:${imageField}` : null;
  const cachedEntry = useDatasetStore((s) =>
    cacheKey ? s.blobCache[cacheKey] : undefined,
  );
  const bookmarks = useDatasetStore((s) => s.bookmarks);
  const toggleBookmark = useDatasetStore((s) => s.toggleBookmark);
  const toggleCompare = useDatasetStore((s) => s.toggleCompare);
  const compareRowIds = useDatasetStore((s) => s.compareRowIds);
  const setDetailPanelOpen = useDatasetStore((s) => s.setDetailPanelOpen);
  const search = useDatasetStore((s) => s.search);
  const [copied, setCopied] = useState<string | null>(null);

  const currentIdx = useMemo(
    () => (selectedRowId ? filtered.findIndex((r) => r.id === selectedRowId) : -1),
    [filtered, selectedRowId],
  );
  const row = currentIdx >= 0 ? filtered[currentIdx] : null;

  const visibleFields = useMemo(() => schema.filter((f) => !hiddenFields.has(f.name)), [schema, hiddenFields]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleSaveImage = () => {
    if (!row || !imageField) return;
    const entry = useDatasetStore.getState().blobCache[`${row.id}:${imageField}`];
    if (!entry?.url) {
      toast.error("No decoded image available");
      return;
    }
    const a = document.createElement("a");
    a.href = entry.url;
    a.download = `${row.id}.${entry.format || "png"}`;
    a.click();
    toast.success(`Saved ${a.download}`);
  };

  if (!row) {
    return (
      <div className="flex flex-col h-full bg-card/30 border-l">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detail
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => setDetailPanelOpen(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/60 p-6 text-center gap-2">
          <Info className="h-8 w-8 opacity-40" />
          <p className="text-xs">No row selected.</p>
          <p className="text-[10px] text-muted-foreground/70">
            Click any thumbnail or table row to view its detail here.
          </p>
        </div>
      </div>
    );
  }

  const cached = cachedEntry;
  const bookmarked = !!bookmarks[row.id];
  const inCompare = compareRowIds.includes(row.id);

  return (
    <div className="flex flex-col h-full bg-card/30 border-l">
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => currentIdx > 0 && setSelectedRow(filtered[currentIdx - 1].id)}
            disabled={currentIdx <= 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {currentIdx + 1}/{filtered.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => currentIdx < filtered.length - 1 && setSelectedRow(filtered[currentIdx + 1].id)}
            disabled={currentIdx >= filtered.length - 1}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => setDetailPanelOpen(false)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Image info card */}
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Image info
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <InfoRow icon={<FileImage className="h-3 w-3" />} label="Format" value={cached?.format ? cached.format.toUpperCase() : "—"} />
              <InfoRow icon={<Ruler className="h-3 w-3" />} label="Size" value={cached?.width ? `${cached.width}×${cached.height}` : "—"} />
              <InfoRow icon={<Hash className="h-3 w-3" />} label="Bytes" value={cached?.size ? formatBytes(cached.size) : "—"} />
              <InfoRow
                icon={<Clock className="h-3 w-3" />}
                label="Status"
                value={
                  cached?.error
                    ? cached.source
                      ? "URL"
                      : "Failed"
                    : cached?.url
                        ? "OK"
                        : "Pending"
                }
                valueClass={
                  cached?.error
                    ? cached.source
                      ? "text-sky-600"
                      : "text-rose-600"
                    : "text-emerald-600"
                }
              />
            </div>
            {cached?.source && (
              <a
                href={cached.source}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-sky-600 hover:underline break-all"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{cached.source}</span>
              </a>
            )}
            {cached?.error && (
              <div className="flex items-start gap-1.5 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/20 rounded p-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="break-words">{cached.error}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={handleSaveImage} disabled={!cached?.url}>
              <Download className="h-3 w-3" />
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn("h-7 text-xs", bookmarked && "text-amber-600 border-amber-300")}
              onClick={() => toggleBookmark(row.id)}
            >
              {bookmarked ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
              {bookmarked ? "Saved" : "Mark"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn("h-7 text-xs", inCompare && "text-amber-600 border-amber-300")}
              onClick={() => toggleCompare(row.id)}
            >
              <Star className="h-3 w-3" />
              Compare
            </Button>
          </div>

          <Separator />

          {/* All fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Fields · {visibleFields.length}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 text-[10px] px-1"
                onClick={() =>
                  handleCopy(JSON.stringify(row.data, null, 2), "__all__")
                }
                title="Copy all fields as JSON"
              >
                {copied === "__all__" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                All
              </Button>
            </div>
            <div className="space-y-1">
              {visibleFields.map((f) => {
                const isImg = f.name === imageField;
                const v = row.data[f.name];
                const display = formatValue(v);
                return (
                  <div key={f.name} className="group rounded-md border bg-card p-2 hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[9px] font-mono uppercase tracking-wide text-muted-foreground/80 truncate">
                          {f.name}
                        </span>
                        {isImg && (
                          <Badge variant="secondary" className="text-[9px] h-3.5 px-1 shrink-0">
                            IMG
                          </Badge>
                        )}
                        <span className="text-[9px] text-muted-foreground/50 shrink-0">[{f.type}]</span>
                      </div>
                      <button
                        onClick={() => handleCopy(typeof v === "string" ? v : JSON.stringify(v), f.name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent text-muted-foreground"
                        title="Copy value"
                      >
                        {copied === f.name ? (
                          <Check className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] leading-snug text-foreground/90 break-words whitespace-pre-wrap">
                      <Highlight text={display} query={search} />
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground/60">{icon}</span>
      <span className="text-muted-foreground/70">{label}:</span>
      <span className={cn("font-mono tabular-nums ml-auto truncate", valueClass)}>{value}</span>
    </div>
  );
}
