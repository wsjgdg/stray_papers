"use client";
/**
 * Compare view: side-by-side comparison of 2-4 rows.
 */
import { useMemo } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema, useHiddenFields } from "@/lib/dataset/hooks";
import { Thumbnail } from "./Thumbnail";
import { formatValue } from "@/lib/dataset/filter";
import { X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CompareView() {
  const filtered = useFilteredRows();
  const compareRowIds = useDatasetStore((s) => s.compareRowIds);
  const toggleCompare = useDatasetStore((s) => s.toggleCompare);
  const clearCompare = useDatasetStore((s) => s.clearCompare);
  const imageField = useDatasetStore((s) => s.imageField);
  const schema = useSchema();
  const showBboxOverlay = useDatasetStore((s) => s.showBboxOverlay);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);

  const rows = useMemo(
    () => compareRowIds.map((id) => filtered.find((r) => r.id === id)).filter(Boolean),
    [compareRowIds, filtered],
  );

  const hiddenFields = useHiddenFields();
  const visibleFields = useMemo(() => {
    return schema.filter((f) => !hiddenFields.has(f.name) && f.name !== imageField);
  }, [schema, hiddenFields, imageField]);

  if (rows.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-8">
        <Layers className="h-10 w-10 opacity-40" />
        <p className="text-sm">Compare mode lets you place 2–4 rows side by side.</p>
        <p className="text-xs text-muted-foreground/70">
          Click the ★ icon on a thumbnail in grid view, or pick rows from the table, to add them here.
        </p>
        {compareRowIds.length > 0 && (
          <Button size="sm" variant="outline" onClick={clearCompare}>
            Clear selection ({compareRowIds.length})
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scroll">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b bg-card/60 backdrop-blur">
        <span className="text-xs text-muted-foreground">
          Comparing {rows.length} rows · click ★ on any other row to add (max 4)
        </span>
        <Button size="sm" variant="ghost" onClick={clearCompare}>
          <X className="h-3 w-3" />
          Clear
        </Button>
      </div>
      <div
        className="grid gap-3 p-3"
        style={{
          gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
        }}
      >
        {rows.map((r) => {
          if (!r) return null;
          const imgValue = imageField ? r.data[imageField] : undefined;
          const bboxes = r.data["extra_input_figure_bboxes"];
          return (
            <div key={r.id} className="flex flex-col gap-2 rounded-lg border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
                <span className="text-[10px] font-mono text-muted-foreground">#{r.index + 1}</span>
                <button
                  onClick={() => toggleCompare(r.id)}
                  className="p-1 rounded hover:bg-accent text-muted-foreground"
                  title="Remove from compare"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <Thumbnail
                rowId={r.id}
                imageValue={imgValue}
                fieldName={imageField || ""}
                className="aspect-[3/2] w-full border-b"
                onClick={() => setSelectedRow(r.id)}
                showBbox={showBboxOverlay}
                bboxes={Array.isArray(bboxes) ? (bboxes as number[]) : undefined}
                imgWidth={typeof r.data["image_width"] === "number" ? (r.data["image_width"] as number) : undefined}
                imgHeight={typeof r.data["image_height"] === "number" ? (r.data["image_height"] as number) : undefined}
              />
              <div className="divide-y">
                {visibleFields.slice(0, 10).map((f) => (
                  <div key={f.name} className="px-2 py-1.5">
                    <div className="text-[9px] font-mono uppercase tracking-wide text-muted-foreground/70">
                      {f.name}
                    </div>
                    <div className="text-[11px] leading-tight text-foreground/90 break-words whitespace-pre-wrap">
                      {formatValue(r.data[f.name])}
                    </div>
                  </div>
                ))}
                {visibleFields.length > 10 && (
                  <div className="px-2 py-1 text-[10px] text-muted-foreground/60">
                    +{visibleFields.length - 10} more fields
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
