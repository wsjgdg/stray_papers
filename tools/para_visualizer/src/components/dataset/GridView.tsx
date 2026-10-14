"use client";
/**
 * Grid view: virtualized thumbnail grid using @tanstack/react-virtual.
 * Renders rows of cards (each row = N cards based on container width).
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema } from "@/lib/dataset/hooks";
import { Thumbnail } from "./Thumbnail";
import { formatValue } from "@/lib/dataset/filter";
import { Bookmark, BookmarkCheck, Star, Check, Download, X, ListChecks, Copy, Eye, GitCompareArrows, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { decodeImageField } from "@/lib/dataset/decode";
import { Highlight } from "./Highlight";
import { HoverPreview, HOVER_DELAY, PREVIEW_WIDTH_VALUE, PREVIEW_HEIGHT_VALUE } from "./HoverPreview";
import { motion } from "framer-motion";

// Gap between cards
const GAP = 12;

export function GridView() {
  const filtered = useFilteredRows();
  const schema = useSchema();
  const thumbnailSize = useDatasetStore((s) => s.thumbnailSize);
  const imageField = useDatasetStore((s) => s.imageField);
  const selectedRowId = useDatasetStore((s) => s.selectedRowId);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const toggleCompare = useDatasetStore((s) => s.toggleCompare);
  const compareRowIds = useDatasetStore((s) => s.compareRowIds);
  const bookmarks = useDatasetStore((s) => s.bookmarks);
  const toggleBookmark = useDatasetStore((s) => s.toggleBookmark);
  const showBboxOverlay = useDatasetStore((s) => s.showBboxOverlay);
  const selectedRowIds = useDatasetStore((s) => s.selectedRowIds);
  const toggleSelectedRow = useDatasetStore((s) => s.toggleSelectedRow);
  const clearSelection = useDatasetStore((s) => s.clearSelection);
  const selectAllFiltered = useDatasetStore((s) => s.selectAllFiltered);
  const setShowExportDialog = useDatasetStore((s) => s.setShowExportDialog);
  const search = useDatasetStore((s) => s.search);
  const failures = useDatasetStore((s) => s.failures);
  const bumpRetryEpoch = useDatasetStore((s) => s.bumpRetryEpoch);
  const lastShiftIndex = useRef<number | null>(null);
  // hover preview state
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCardMouseEnter = (r: typeof filtered[0]) => {
    hoverTimer.current = setTimeout(() => {
      setHoverRowId(r.id);
    }, HOVER_DELAY);
  };
  const handleCardMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHoverRowId(null);
  };
  const handleCardMouseMove = (e: React.MouseEvent) => {
    if (!hoverRowId) return;
    const x = e.clientX;
    const y = e.clientY;
    const flipX = x + PREVIEW_WIDTH_VALUE + 20 > window.innerWidth;
    const flipY = y + PREVIEW_HEIGHT_VALUE + 40 > window.innerHeight;
    setHoverPos({
      x: flipX ? x - PREVIEW_WIDTH_VALUE - 16 : x + 16,
      y: flipY ? y - PREVIEW_HEIGHT_VALUE - 16 : y + 16,
    });
  };

  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    };
  }, []);

  // Container ref + width tracking for responsive columns
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth - 24); // minus padding
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute columns count + card height
  const colsPerRow = Math.max(1, Math.floor((containerWidth + GAP) / (thumbnailSize + GAP)));
  const cardHeight = Math.round((thumbnailSize * 2) / 3) + 56; // aspect 3/2 + caption
  const rowCount = Math.ceil(filtered.length / colsPerRow);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => cardHeight + GAP,
    overscan: 4,
  });

  const hoverLabelField = useMemo(() => {
    return (
      schema.find((f) => f.role === "text" && f.name !== imageField)?.name ||
      schema.find((f) => f.role === "category")?.name ||
      null
    );
  }, [schema, imageField]);

  const captionField2 = useMemo(() => {
    return schema.find((f) => f.role === "category" && f.name !== hoverLabelField)?.name || null;
  }, [schema, hoverLabelField]);

  const handleCardClick = (r: typeof filtered[0], e: React.MouseEvent) => {
    if (e.shiftKey && lastShiftIndex.current !== null) {
      const from = Math.min(lastShiftIndex.current, r.index);
      const to = Math.max(lastShiftIndex.current, r.index);
      const toSelect = filtered.slice(from, to + 1).map((x) => x.id);
      useDatasetStore.setState((s) => {
        const next = new Set(s.selectedRowIds);
        toSelect.forEach((id) => next.add(id));
        return { selectedRowIds: next };
      });
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      toggleSelectedRow(r.id);
      lastShiftIndex.current = r.index;
      e.preventDefault();
      return;
    }
    setSelectedRow(r.id);
    lastShiftIndex.current = r.index;
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scroll p-3 relative">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-20">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-dashed border-muted-foreground/30 flex items-center justify-center">
                <Star className="h-7 w-7 opacity-40" />
              </div>
              <div className="absolute -inset-2 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 rounded-3xl blur-xl" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">No rows match the current filters</p>
              <p className="text-xs text-muted-foreground/70">Try adjusting your filters or clearing the search.</p>
            </div>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const rowIdx = virtualRow.index;
              const startCard = rowIdx * colsPerRow;
              const rowCards = filtered.slice(startCard, startCard + colsPerRow);
              return (
                <div
                  key={rowIdx}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    display: "grid",
                    gridTemplateColumns: `repeat(${colsPerRow}, minmax(0, 1fr))`,
                    gap: `${GAP}px`,
                    paddingBottom: `${GAP}px`,
                  }}
                >
                  {rowCards.map((r) => {
              const isSel = selectedRowId === r.id;
              const inCompare = compareRowIds.includes(r.id);
              const bookmarked = !!bookmarks[r.id];
              const inMultiSelect = selectedRowIds.has(r.id);
              const imgValue = imageField ? r.data[imageField] : undefined;
              const bboxes = r.data["extra_input_figure_bboxes"];
              const w = r.data["image_width"];
              const h = r.data["image_height"];

              return (
                <ContextMenu key={r.id}>
                  <ContextMenuTrigger asChild>
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min((rowIdx % colsPerRow) * 0.03, 0.15) }}
                      className={cn(
                        "group relative rounded-lg border bg-card overflow-hidden transition-[box-shadow,border-color] hover:shadow-lg hover:shadow-violet-500/10 hover:border-primary/40 cursor-pointer",
                        isSel ? "ring-2 ring-primary border-primary" : "",
                        inCompare ? "ring-2 ring-amber-400" : "",
                        inMultiSelect ? "ring-2 ring-emerald-500 border-emerald-400" : "",
                      )}
                      onClick={(e) => handleCardClick(r, e)}
                      onMouseEnter={() => handleCardMouseEnter(r)}
                      onMouseLeave={handleCardMouseLeave}
                      onMouseMove={handleCardMouseMove}
                      whileHover={{ y: -4, transition: { duration: 0.15 } }}
                    >
                      {/* multi-select checkbox */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectedRow(r.id);
                          lastShiftIndex.current = r.index;
                        }}
                        aria-label={`Select row ${r.index + 1} for bulk actions`}
                        aria-pressed={inMultiSelect}
                        className={cn(
                          "absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                          inMultiSelect
                            ? "bg-emerald-500 border-emerald-500 text-white opacity-100"
                            : "bg-card/80 backdrop-blur border-foreground/30 text-transparent opacity-0 group-hover:opacity-100 hover:border-primary",
                        )}
                        title="Toggle selection (Cmd+click for multi)"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <Thumbnail
                        rowId={r.id}
                        imageValue={imgValue}
                        fieldName={imageField || ""}
                        className="aspect-[3/2] w-full"
                        showBbox={showBboxOverlay}
                        bboxes={Array.isArray(bboxes) ? bboxes as number[] : undefined}
                        imgWidth={typeof w === "number" ? w : undefined}
                        imgHeight={typeof h === "number" ? h : undefined}
                        alt={`Row ${r.index + 1}: ${formatValue(r.data[hoverLabelField || ""])}`}
                      />
                      <div className="p-2 border-t bg-card/60">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-[10px] font-mono text-muted-foreground">#{r.index + 1}</span>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBookmark(r.id);
                              }}
                              className={cn(
                                "p-1 rounded hover:bg-accent",
                                bookmarked ? "text-amber-500" : "text-muted-foreground/50",
                              )}
                              title={bookmarked ? "Remove bookmark" : "Add bookmark"}
                            >
                              {bookmarked ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCompare(r.id);
                              }}
                              className={cn(
                                "p-1 rounded hover:bg-accent",
                                inCompare ? "text-amber-500" : "text-muted-foreground/50",
                              )}
                              title="Toggle compare"
                            >
                              <Star className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        {hoverLabelField && (
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-[11px] line-clamp-2 leading-tight text-foreground/80">
                                  <Highlight text={formatValue(r.data[hoverLabelField])} query={search} />
                                </p>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">{formatValue(r.data[hoverLabelField])}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {captionField2 && (
                          <p className="text-[10px] mt-0.5 text-muted-foreground/70 line-clamp-1">
                            <Highlight text={formatValue(r.data[captionField2])} query={search} />
                          </p>
                        )}
                      </div>
                    </motion.div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-52">
                    <ContextMenuItem onClick={() => setSelectedRow(r.id)}>
                      <Eye className="h-3.5 w-3.5 mr-2" />
                      View detail
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => toggleBookmark(r.id)}>
                      {bookmarked ? <BookmarkCheck className="h-3.5 w-3.5 mr-2 text-amber-500" /> : <Bookmark className="h-3.5 w-3.5 mr-2" />}
                      {bookmarked ? "Remove bookmark" : "Add bookmark"}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => toggleCompare(r.id)}>
                      <GitCompareArrows className="h-3.5 w-3.5 mr-2" />
                      {inCompare ? "Remove from compare" : "Add to compare"}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => { toggleSelectedRow(r.id); lastShiftIndex.current = r.index; }}>
                      <Check className="h-3.5 w-3.5 mr-2" />
                      {inMultiSelect ? "Deselect" : "Select"}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={async () => {
                        if (!imageField) return;
                        const v = r.data[imageField];
                        try {
                          const res = await decodeImageField(v, imageField);
                          if (res.blobUrl) {
                            const a = document.createElement("a");
                            a.href = res.blobUrl;
                            a.download = `${r.id}.${res.format || "png"}`;
                            a.click();
                            toast.success(`Saved ${a.download}`);
                          } else {
                            toast.error("No image to save");
                          }
                        } catch {
                          toast.error("Failed to save image");
                        }
                      }}
                    >
                      <Download className="h-3.5 w-3.5 mr-2" />
                      Save image
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => {
                      navigator.clipboard.writeText(r.id);
                      toast.success(`Copied id: ${r.id}`);
                    }}>
                      <Copy className="h-3.5 w-3.5 mr-2" />
                      Copy row id
                    </ContextMenuItem>
                    {hoverLabelField && (
                      <ContextMenuItem onClick={() => {
                        const v = String(r.data[hoverLabelField!] || "");
                        navigator.clipboard.writeText(v);
                        toast.success("Copied value");
                      }}>
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        Copy {hoverLabelField}
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Hover preview popup — rendered once for the hovered row */}
      {hoverRowId && (() => {
        const hr = filtered.find((r) => r.id === hoverRowId);
        if (!hr) return null;
        return (
          <HoverPreview
            row={hr}
            imageField={imageField}
            search={search}
            labelField={hoverLabelField}
            visible={true}
            pos={hoverPos}
          />
        );
      })()}
      {/* Bulk action bar (visible when rows are multi-selected) */}
      {selectedRowIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-t bg-emerald-50/60 dark:bg-emerald-950/20 text-xs">
          <ListChecks className="h-4 w-4 text-emerald-600" />
          <span className="font-medium text-emerald-700 dark:text-emerald-300">
            {selectedRowIds.size} selected
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => selectAllFiltered()}
            title="Select all filtered rows"
          >
            Select all ({filtered.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowExportDialog(true)}
          >
            <Download className="h-3 w-3" />
            Export selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground"
            onClick={clearSelection}
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        </div>
      )}
      {/* Footer with count */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t bg-card/40 text-xs text-muted-foreground">
        <span>{filtered.length} rows · virtual scroll</span>
        <div className="flex items-center gap-3">
          {failures.length > 0 && (
            <button
              onClick={() => bumpRetryEpoch()}
              className="inline-flex items-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              title="Re-attempt all thumbnails that failed to load"
            >
              <RotateCw className="h-3 w-3" />
              Retry {failures.length} failed
            </button>
          )}
          <span className="font-mono">{colsPerRow} cols · {thumbnailSize}px</span>
        </div>
      </div>
    </div>
  );
}
