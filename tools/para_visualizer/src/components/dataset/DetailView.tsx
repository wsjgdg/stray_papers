"use client";
/**
 * Detail view: single large image + full field grid.
 */
import { useMemo } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema, useHiddenFields } from "@/lib/dataset/hooks";
import { Thumbnail } from "./Thumbnail";
import { formatValue } from "@/lib/dataset/filter";
import { ChevronLeft, ChevronRight, Bookmark, BookmarkCheck, Download, AlertTriangle, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function DetailView() {
  const filtered = useFilteredRows();
  const selectedRowId = useDatasetStore((s) => s.selectedRowId);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const imageField = useDatasetStore((s) => s.imageField);
  const schema = useSchema();
  const showBboxOverlay = useDatasetStore((s) => s.showBboxOverlay);
  const setShowBboxOverlay = useDatasetStore((s) => s.setShowBboxOverlay);
  const bookmarks = useDatasetStore((s) => s.bookmarks);
  const toggleBookmark = useDatasetStore((s) => s.toggleBookmark);
  const cache = useDatasetStore((s) => s.blobCache);
  const [copied, setCopied] = useState<string | null>(null);

  const currentIdx = useMemo(() => {
    if (!selectedRowId) return -1;
    return filtered.findIndex((r) => r.id === selectedRowId);
  }, [filtered, selectedRowId]);

  const row = currentIdx >= 0 ? filtered[currentIdx] : null;

  const hiddenFields = useHiddenFields();
  const visibleFields = useMemo(() => {
    return schema.filter((f) => !hiddenFields.has(f.name));
  }, [schema, hiddenFields]);

  const handlePrev = () => {
    if (currentIdx > 0) setSelectedRow(filtered[currentIdx - 1].id);
  };
  const handleNext = () => {
    if (currentIdx >= 0 && currentIdx < filtered.length - 1) setSelectedRow(filtered[currentIdx + 1].id);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleSaveImage = () => {
    if (!row || !imageField) return;
    const cached = cache[`${row.id}:${imageField}`];
    if (!cached?.url) {
      toast.error("No decoded image available");
      return;
    }
    const a = document.createElement("a");
    a.href = cached.url;
    a.download = `${row.id}.${cached.format || "png"}`;
    a.click();
    toast.success(`Saved ${a.download}`);
  };

  if (!row) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <p className="text-sm">Select a row to view its detail.</p>
      </div>
    );
  }

  const imgValue = imageField ? row.data[imageField] : undefined;
  const cached = cache[`${row.id}:${imageField}`];
  const bookmarked = !!bookmarks[row.id];
  const bboxes = row.data["extra_input_figure_bboxes"];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b bg-card/40">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={handlePrev} disabled={currentIdx <= 0}>
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground font-mono px-2">
            {currentIdx + 1} / {filtered.length}
          </span>
          <Button size="sm" variant="ghost" onClick={handleNext} disabled={currentIdx >= filtered.length - 1}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => toggleBookmark(row.id)}
            className={cn(bookmarked && "text-amber-500")}
          >
            {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            {bookmarked ? "Bookmarked" : "Bookmark"}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleSaveImage}>
            <Download className="h-4 w-4" />
            Save Image
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll">
        <div className="grid lg:grid-cols-[1fr_360px] gap-3 p-3">
          {/* Image */}
          <div className="flex flex-col gap-2">
            <div className="relative rounded-lg border bg-muted/20 overflow-hidden flex items-center justify-center min-h-[300px]">
              <Thumbnail
                rowId={row.id}
                imageValue={imgValue}
                fieldName={imageField || ""}
                className="w-full aspect-[3/2]"
                showBbox={showBboxOverlay}
                bboxes={Array.isArray(bboxes) ? (bboxes as number[]) : undefined}
                imgWidth={typeof row.data["image_width"] === "number" ? (row.data["image_width"] as number) : undefined}
                imgHeight={typeof row.data["image_height"] === "number" ? (row.data["image_height"] as number) : undefined}
                alt={`Detail of row ${row.index + 1}`}
              />
            </div>
            {/* bbox toggle */}
            {Array.isArray(bboxes) && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showBboxOverlay}
                  onChange={(e) => setShowBboxOverlay(e.target.checked)}
                  className="accent-rose-500"
                />
                Show figure bounding boxes ({(bboxes as number[]).length / 4} boxes)
              </label>
            )}
            {cached?.error && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-50/40 dark:bg-amber-950/20 p-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold mb-0.5">Decode note</div>
                  <div>{cached.error}</div>
                  {cached.source && (
                    <a
                      href={cached.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline mt-1 inline-block"
                    >
                      Try opening source: {cached.source.replace(/^https?:\/\//, "").slice(0, 60)}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Fields */}
          <div className="rounded-lg border bg-card">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Fields
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">id: {row.id}</span>
            </div>
            <div className="divide-y max-h-[60vh] overflow-y-auto custom-scroll">
              {visibleFields.map((f) => {
                const v = row.data[f.name];
                const isImage = f.name === imageField;
                if (isImage) return null;
                const display = formatValue(v);
                return (
                  <div key={f.name} className="px-3 py-2 group hover:bg-accent/40 transition-colors">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/80">
                        {f.name}
                        <span className="ml-1.5 text-muted-foreground/50">[{f.type}]</span>
                      </span>
                      <button
                        onClick={() => handleCopy(typeof v === "string" ? v : JSON.stringify(v), f.name)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent text-muted-foreground"
                        title="Copy value"
                      >
                        {copied === f.name ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                    <p className="text-xs break-words whitespace-pre-wrap text-foreground/90 leading-relaxed">
                      {display}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
