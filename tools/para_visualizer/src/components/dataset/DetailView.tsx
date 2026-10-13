"use client";
/**
 * Detail view: single large image + full field grid.
 */
import { useMemo } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema, useHiddenFields } from "@/lib/dataset/hooks";
import { Thumbnail } from "./Thumbnail";
import { AnnotationOverlay } from "./AnnotationOverlay";
import { ZoomableImage } from "./ZoomableImage";
import { formatValue } from "@/lib/dataset/filter";
import { ChevronLeft, ChevronRight, Bookmark, BookmarkCheck, Download, AlertTriangle, Copy, Check, MousePointer2, PenLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/lib/dataset/persist";

// Stable empty array to avoid reference changes causing re-renders
const EMPTY_ANNOTATIONS: Annotation[] = [];

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
  // Only select the specific cache entry for this row, not the whole cache map.
  // This prevents re-renders when other rows' thumbnails decode.
  const cacheKey = selectedRowId && imageField ? `${selectedRowId}:${imageField}` : null;
  const cachedEntry = useDatasetStore((s) =>
    cacheKey ? s.blobCache[cacheKey] : undefined,
  );
  const annotationMode = useDatasetStore((s) => s.annotationMode);
  const setAnnotationMode = useDatasetStore((s) => s.setAnnotationMode);
  // Use the stable annotations map reference; derive the per-row list via useMemo
  const annotationsMap = useDatasetStore((s) => s.annotations);
  const annotations = useMemo(
    () => (selectedRowId ? annotationsMap[selectedRowId] || EMPTY_ANNOTATIONS : EMPTY_ANNOTATIONS),
    [annotationsMap, selectedRowId],
  );
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
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <p className="text-sm">Select a row to view its detail.</p>
      </div>
    );
  }

  const imgValue = imageField ? row.data[imageField] : undefined;
  const cached = cachedEntry;
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
            variant={annotationMode ? "secondary" : "ghost"}
            onClick={() => setAnnotationMode(!annotationMode)}
            className={cn(annotationMode && "ring-2 ring-cyan-400")}
            title="Toggle annotation mode (draw boxes on the image)"
          >
            <PenLine className="h-4 w-4" />
            <span className="hidden sm:inline">Annotate</span>
            {annotations.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-cyan-500 text-white text-[9px] font-bold">
                {annotations.length}
              </span>
            )}
          </Button>
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
            <div className="relative rounded-lg border bg-muted/20 overflow-hidden flex items-center justify-center min-h-[400px]">
              {cached?.url ? (
                <ZoomableImage
                  src={cached.url}
                  alt={`Detail of row ${row.index + 1}`}
                  className="w-full h-full min-h-[400px]"
                  naturalWidth={cached.width || 480}
                  naturalHeight={cached.height || 320}
                >
                  {/* bbox overlay (always rendered, positioned absolute) */}
                  {showBboxOverlay && Array.isArray(bboxes) && (
                    <BboxAbsoluteOverlay
                      bboxes={bboxes as number[]}
                      imgWidth={typeof row.data["image_width"] === "number" ? (row.data["image_width"] as number) : cached.width || 1}
                      imgHeight={typeof row.data["image_height"] === "number" ? (row.data["image_height"] as number) : cached.height || 1}
                    />
                  )}
                  {/* Annotation overlay (only when image is decoded) */}
                  <AnnotationOverlay
                    rowId={row.id}
                    imgWidth={cached.width || 480}
                    imgHeight={cached.height || 320}
                  />
                </ZoomableImage>
              ) : (
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
              )}
            </div>
            {/* annotation hint */}
            {annotationMode && (
              <div className="flex items-center gap-2 text-[11px] text-cyan-700 dark:text-cyan-300 bg-cyan-50/60 dark:bg-cyan-950/20 border border-cyan-300/40 rounded-md px-2 py-1.5">
                <MousePointer2 className="h-3 w-3 shrink-0" />
                <span>Click and drag on the image to draw a labeled box. Annotations persist across reloads.</span>
              </div>
            )}
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

/**
 * BboxAbsoluteOverlay: renders bbox rectangles positioned absolutely over the
 * ZoomableImage container. Uses intrinsic image dimensions to compute % positions.
 * Note: this overlay does NOT scale with zoom — it's meant to be a child of
 * ZoomableImage so it sits on top. For zoom-aware bbox, the bboxes would need
 * to be transformed along with the image. For now we keep it simple.
 */
function BboxAbsoluteOverlay({
  bboxes,
  imgWidth,
  imgHeight,
}: {
  bboxes: number[];
  imgWidth: number;
  imgHeight: number;
}) {
  const groups: number[][] = [];
  for (let i = 0; i + 3 < bboxes.length; i += 4) {
    groups.push([bboxes[i], bboxes[i + 1], bboxes[i + 2], bboxes[i + 3]]);
  }
  return (
    <div className="absolute inset-0 pointer-events-none">
      {groups.map((b, i) => {
        const left = (b[0] / imgWidth) * 100;
        const top = (b[1] / imgHeight) * 100;
        const w = (b[2] / imgWidth) * 100;
        const h = (b[3] / imgHeight) * 100;
        return (
          <div
            key={i}
            className="absolute border-2 border-rose-500 bg-rose-500/15 rounded-sm"
            style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%` }}
            title={`bbox ${i + 1}: ${b[0].toFixed(0)},${b[1].toFixed(0)} ${b[2].toFixed(0)}x${b[3].toFixed(0)}`}
          />
        );
      })}
    </div>
  );
}
