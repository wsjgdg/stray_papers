"use client";
/**
 * Compare view: side-by-side comparison of 2-4 rows.
 * Features linked zoom (synchronized pan/zoom across images).
 */
import { useMemo, useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema, useHiddenFields } from "@/lib/dataset/hooks";
import { Thumbnail } from "./Thumbnail";
import { Highlight } from "./Highlight";
import { LinkedZoomImage, LinkedZoomControls, type LinkedZoomState } from "./LinkedZoomImage";
import { formatValue } from "@/lib/dataset/filter";
import { decodeImageField } from "@/lib/dataset/decode";
import { X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export function CompareView() {
  const filtered = useFilteredRows();
  const compareRowIds = useDatasetStore((s) => s.compareRowIds);
  const toggleCompare = useDatasetStore((s) => s.toggleCompare);
  const clearCompare = useDatasetStore((s) => s.clearCompare);
  const imageField = useDatasetStore((s) => s.imageField);
  const schema = useSchema();
  const showBboxOverlay = useDatasetStore((s) => s.showBboxOverlay);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const search = useDatasetStore((s) => s.search);
  const blobCache = useDatasetStore((s) => s.blobCache);

  // Linked zoom state — shared across all compared images
  const [linkedZoom, setLinkedZoom] = useState<LinkedZoomState>({
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  });
  const [linked, setLinked] = useState(true);

  // Decode all compared images
  const [decodedUrls, setDecodedUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const decode = async () => {
      const urls: Record<string, string> = {};
      for (const id of compareRowIds) {
        const cached = blobCache[`${id}:${imageField}`];
        if (cached?.url) {
          urls[id] = cached.url;
        } else if (imageField) {
          const row = filtered.find((r) => r.id === id);
          if (row) {
            const v = row.data[imageField];
            try {
              const res = await decodeImageField(v, imageField);
              if (res.blobUrl) urls[id] = res.blobUrl;
            } catch {
              // ignore
            }
          }
        }
      }
      setDecodedUrls(urls);
    };
    if (compareRowIds.length > 0) decode();
  }, [compareRowIds, imageField, blobCache, filtered]);

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
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-dashed border-muted-foreground/30 flex items-center justify-center">
            <Layers className="h-7 w-7 opacity-40" />
          </div>
          <div className="absolute -inset-2 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 rounded-3xl blur-xl" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Compare mode lets you place 2–4 rows side by side</p>
          <p className="text-xs text-muted-foreground/70">
            Click the ★ icon on a thumbnail in grid view, or pick rows from the table, to add them here.
          </p>
        </div>
        {compareRowIds.length > 0 && (
          <Button size="sm" variant="outline" onClick={clearCompare}>
            Clear selection ({compareRowIds.length})
          </Button>
        )}
      </div>
    );
  }

  const compareFields = visibleFields.slice(0, 10);
  const fitZoom = 1; // simplification — actual fit computed per-image

  return (
    <div className="h-full overflow-y-auto custom-scroll">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b bg-card/60 backdrop-blur">
        <span className="text-xs text-muted-foreground">
          Comparing <span className="font-mono tabular-nums font-medium text-foreground">{rows.length}</span> rows · click ★ on any other row to add (max 4)
        </span>
        <div className="flex items-center gap-2">
          <LinkedZoomControls
            state={linkedZoom}
            setState={setLinkedZoom}
            linked={linked}
            setLinked={setLinked}
            fitZoom={fitZoom}
          />
          <Button size="sm" variant="ghost" onClick={clearCompare}>
            <X className="h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>
      {/* Images row */}
      <div
        className="grid gap-3 p-3"
        style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
      >
        {rows.map((r) => {
          if (!r) return null;
          const imgValue = imageField ? r.data[imageField] : undefined;
          const bboxes = r.data["extra_input_figure_bboxes"];
          const decodedUrl = decodedUrls[r.id];
          return (
            <div key={r.id} className="flex flex-col gap-1.5 rounded-lg border bg-card overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
                <span className="text-[10px] font-mono text-muted-foreground">#{r.index + 1} · {r.id}</span>
                <button
                  onClick={() => toggleCompare(r.id)}
                  className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-rose-500"
                  title="Remove from compare"
                  aria-label={`Remove ${r.id} from compare`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {decodedUrl ? (
                <LinkedZoomImage
                  src={decodedUrl}
                  alt={`Compare image ${r.id}`}
                  naturalWidth={typeof r.data["image_width"] === "number" ? (r.data["image_width"] as number) : 480}
                  naturalHeight={typeof r.data["image_height"] === "number" ? (r.data["image_height"] as number) : 320}
                  state={linkedZoom}
                  onStateChange={setLinkedZoom}
                  linked={linked}
                  rowId={r.id}
                />
              ) : (
                <Thumbnail
                  rowId={r.id}
                  imageValue={imgValue}
                  fieldName={imageField || ""}
                  className="aspect-[3/2] w-full"
                  onClick={() => setSelectedRow(r.id)}
                  showBbox={showBboxOverlay}
                  bboxes={Array.isArray(bboxes) ? (bboxes as number[]) : undefined}
                  imgWidth={typeof r.data["image_width"] === "number" ? (r.data["image_width"] as number) : undefined}
                  imgHeight={typeof r.data["image_height"] === "number" ? (r.data["image_height"] as number) : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Aligned fields table */}
      <div className="p-3 pt-0">
        <table className="w-full text-xs border-collapse">
          <tbody>
            {compareFields.map((f, fieldIdx) => (
              <tr key={f.name} className={fieldIdx % 2 === 0 ? "bg-muted/20" : ""}>
                <td className="px-2 py-1.5 border-b font-mono text-[9px] uppercase tracking-wide text-muted-foreground/70 w-32 align-top sticky left-0 bg-card/80 backdrop-blur">
                  {f.name}
                </td>
                {rows.map((r) => {
                  if (!r) return <td key="empty" />;
                  return (
                    <td key={r.id} className="px-2 py-1.5 border-b align-top text-[11px] leading-tight text-foreground/90 break-words whitespace-pre-wrap">
                      <Highlight text={formatValue(r.data[f.name])} query={search} />
                    </td>
                  );
                })}
              </tr>
            ))}
            {visibleFields.length > 10 && (
              <tr>
                <td colSpan={rows.length + 1} className="px-2 py-1 text-[10px] text-muted-foreground/60 text-center">
                  +{visibleFields.length - 10} more fields (switch to Detail view to see all)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
