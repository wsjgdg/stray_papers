"use client";
/**
 * Export dialog: batch download images + metadata CSV/JSON.
 */
import { useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema } from "@/lib/dataset/hooks";
import { formatValue } from "@/lib/dataset/filter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Download, FileJson, FileSpreadsheet, ImageDown, Loader2, CheckCircle2, FolderArchive } from "lucide-react";
import { toast } from "sonner";
import { decodeImageField } from "@/lib/dataset/decode";

type ExportType = "images" | "metadata_csv" | "metadata_json" | "both" | "annotations_coco" | "annotations_yolo";

export function ExportDialog() {
  const open = useDatasetStore((s) => s.showExportDialog);
  const setOpen = useDatasetStore((s) => s.setShowExportDialog);
  const filtered = useFilteredRows();
  const schema = useSchema();
  const imageField = useDatasetStore((s) => s.imageField);
  const hiddenFields = useDatasetStore((s) => s.hiddenFields);
  const annotationsMap = useDatasetStore((s) => s.annotations);

  const [type, setType] = useState<ExportType>("both");
  const [format, setFormat] = useState<"png" | "jpeg" | "webp" | "original">("original");
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const [onlyWithImage, setOnlyWithImage] = useState(true);
  const [namePattern, setNamePattern] = useState("{index}_{id}");
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);

  const visibleFields = schema.filter((f) => !hiddenFields.has(f.name));

  const handleExport = async () => {
    setRunning(true);
    setProgress(0);
    setDone(0);
    try {
      const bookmarks = useDatasetStore.getState().bookmarks;
      let rows = filtered;
      if (onlyBookmarked) rows = rows.filter((r) => bookmarks[r.id]);
      if (onlyWithImage && imageField) {
        rows = rows.filter((r) => {
          const v = r.data[imageField];
          return v != null && v !== "";
        });
      }
      if (rows.length === 0) {
        toast.warning("No rows to export");
        return;
      }
      const total = rows.length;

      // metadata export
      if (type === "metadata_csv" || type === "both") {
        const cols = visibleFields.filter((f) => f.name !== imageField).map((f) => f.name);
        const escape = (v: unknown) => {
          const s = typeof v === "string" ? v : Array.isArray(v) ? JSON.stringify(v) : v == null ? "" : String(v);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const header = ["row_index", ...cols].join(",");
        const lines = rows.map((r, i) =>
          [r.index, ...cols.map((c) => escape(r.data[c]))].join(","),
        );
        const csv = [header, ...lines].join("\n");
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "export_metadata.csv");
      }
      if (type === "metadata_json" || type === "both") {
        const data = rows.map((r, i) => {
          const obj: Record<string, unknown> = { _row_index: r.index, _file_index: r.fileIndex, _row_in_file: r.rowIndex };
          for (const f of visibleFields) {
            if (f.name === imageField) continue;
            obj[f.name] = r.data[f.name];
          }
          return obj;
        });
        downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "export_metadata.json");
      }

      // images export
      if ((type === "images" || type === "both") && imageField) {
        let ok = 0;
        let failed = 0;
        const toastId = toast.loading(`Exporting images... 0 / ${total}`, { duration: Infinity });
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const v = r.data[imageField];
          try {
            const res = await decodeImageField(v, imageField);
            if (res.blobUrl) {
              const fname = (namePattern || "{index}_{id}")
                .replace(/\{index\}/g, String(r.index + 1))
                .replace(/\{id\}/g, sanitize(r.id))
                .replace(/\{field\}/g, imageField);
              const ext = format === "original" ? (res.format || "png") : format;
              await downloadBlobUrl(res.blobUrl, `${fname}.${ext === "svg+xml" ? "svg" : ext}`);
              ok++;
            } else if (res.source) {
              failed++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
          setProgress(((i + 1) / total) * 100);
          setDone(i + 1);
          // Update toast every 5 items or on last item
          if ((i + 1) % 5 === 0 || i === rows.length - 1) {
            toast.loading(`Exporting images... ${i + 1} / ${total} (${ok} ok, ${failed} failed)`, { id: toastId, duration: Infinity });
          }
          // throttle to avoid browser download dialog overwhelming
          await new Promise((res) => setTimeout(res, 60));
        }
        toast.success(`Exported ${ok} images (${failed} skipped/failed)`, { id: toastId, duration: 4000 });
      }

      // annotations export (COCO JSON)
      if (type === "annotations_coco") {
        const coco = buildCocoExport(rows, annotationsMap, imageField);
        if (coco.annotations.length === 0) {
          toast.warning("No annotations to export");
        } else {
          downloadBlob(
            new Blob([JSON.stringify(coco, null, 2)], { type: "application/json" }),
            "annotations_coco.json",
          );
          toast.success(`Exported ${coco.annotations.length} annotations (COCO)`);
        }
      }

      // annotations export (YOLO txt) — one file per image, combined into a single txt
      if (type === "annotations_yolo") {
        const lines = buildYoloExport(rows, annotationsMap);
        if (lines.length === 0) {
          toast.warning("No annotations to export");
        } else {
          downloadBlob(
            new Blob([lines.join("\n")], { type: "text/plain" }),
            "annotations_yolo.txt",
          );
          toast.success(`Exported ${lines.length} annotation lines (YOLO)`);
        }
      }

      toast.success("Export complete");
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderArchive className="h-5 w-5" />
            Export Selection
          </DialogTitle>
          <DialogDescription>
            Export {filtered.length} filtered rows. Files download to your browser's download folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
              Export type
            </Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as ExportType)} className="grid grid-cols-2 gap-2">
              <ExportOption value="images" label="Images only" icon={<ImageDown className="h-4 w-4" />} />
              <ExportOption value="metadata_csv" label="Metadata CSV" icon={<FileSpreadsheet className="h-4 w-4" />} />
              <ExportOption value="metadata_json" label="Metadata JSON" icon={<FileJson className="h-4 w-4" />} />
              <ExportOption value="both" label="Images + CSV" icon={<FolderArchive className="h-4 w-4" />} />
              <ExportOption value="annotations_coco" label="Annotations (COCO)" icon={<FileJson className="h-4 w-4" />} />
              <ExportOption value="annotations_yolo" label="Annotations (YOLO)" icon={<FileJson className="h-4 w-4" />} />
            </RadioGroup>
          </div>

          {(type === "annotations_coco" || type === "annotations_yolo") && (
            <div className="rounded-md bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
              {type === "annotations_coco" ? (
                <span>Exports all user-drawn annotations as a COCO-format JSON file (images + annotations + categories). Useful for object detection training pipelines.</span>
              ) : (
                <span>Exports all annotations as YOLO-format lines (class center_x center_y width height, all normalized 0–1). Class mapping included as header comments.</span>
              )}
            </div>
          )}

          {(type === "images" || type === "both") && (
            <>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
                  Image format
                </Label>
                <RadioGroup value={format} onValueChange={(v) => setFormat(v as typeof format)} className="flex gap-2 flex-wrap">
                  {(["original", "png", "jpeg", "webp"] as const).map((f) => (
                    <label key={f} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border cursor-pointer hover:bg-accent">
                      <RadioGroupItem value={f} className="h-3 w-3" />
                      {f}
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <div>
                <Label htmlFor="name-pattern" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                  Naming pattern
                </Label>
                <Input
                  id="name-pattern"
                  value={namePattern}
                  onChange={(e) => setNamePattern(e.target.value)}
                  className="h-8 text-xs font-mono"
                  placeholder="{index}_{id}"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Tokens: <code>{"{index}"}</code> (1-based), <code>{"{id}"}</code>, <code>{"{field}"}</code>
                </p>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={onlyBookmarked} onCheckedChange={(v) => setOnlyBookmarked(v === true)} />
                  Only bookmarked rows
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={onlyWithImage} onCheckedChange={(v) => setOnlyWithImage(v === true)} />
                  Skip rows without image bytes
                </label>
              </div>
            </>
          )}

          {(type === "metadata_csv" || type === "metadata_json" || type === "both") && (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={includeMetadata} onCheckedChange={(v) => setIncludeMetadata(v === true)} />
              Include {visibleFields.length} visible fields in metadata
            </label>
          )}

          {running && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Exporting images…
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {done} / {Math.max(1, filtered.length)}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"
                  style={{ backgroundSize: "200% 100%" }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{progress.toFixed(0)}% complete</span>
                <span>
                  {filtered.length - done > 0 ? `${filtered.length - done} remaining` : "finishing…"}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {running ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportOption({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer hover:bg-accent text-xs">
      <RadioGroupItem value={value} className="h-3.5 w-3.5" />
      {icon}
      <span>{label}</span>
    </label>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadBlobUrl(blobUrl: string, filename: string) {
  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
  } catch {
    // ignore
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-.]/g, "_").slice(0, 60);
}

// Unused helper removed
void formatValue;

// --- Annotation export helpers ---

interface CocoExport {
  info: { description: string; version: string; year: number };
  licenses: unknown[];
  images: { id: number; file_name: string; width: number; height: number }[];
  annotations: {
    id: number;
    image_id: number;
    category_id: number;
    bbox: [number, number, number, number]; // x, y, w, h (absolute pixels)
    area: number;
    iscrowd: 0;
    segmentation: number[][];
  }[];
  categories: { id: number; name: string; supercategory: string }[];
}

function buildCocoExport(
  rows: ReturnType<typeof useFilteredRows>,
  annotationsMap: Record<string, import("@/lib/dataset/persist").Annotation[]>,
  _imageField: string | null,
): CocoExport {
  // Build category list from all annotation labels
  const labelToCat = new Map<string, number>();
  let catId = 1;
  for (const row of rows) {
    const anns = annotationsMap[row.id] || [];
    for (const a of anns) {
      if (!labelToCat.has(a.label)) {
        labelToCat.set(a.label, catId++);
      }
    }
  }
  const categories = Array.from(labelToCat.entries()).map(([name, id]) => ({
    id,
    name,
    supercategory: "object",
  }));

  const images: CocoExport["images"] = [];
  const annotations: CocoExport["annotations"] = [];
  let annId = 1;
  rows.forEach((row, i) => {
    const anns = annotationsMap[row.id] || [];
    if (anns.length === 0) return;
    const imgId = i + 1;
    const w = (row.data["image_width"] as number) || 480;
    const h = (row.data["image_height"] as number) || 320;
    images.push({ id: imgId, file_name: `${row.id}.png`, width: w, height: h });
    for (const a of anns) {
      annotations.push({
        id: annId++,
        image_id: imgId,
        category_id: labelToCat.get(a.label) || 1,
        bbox: [a.x * w, a.y * h, a.w * w, a.h * h],
        area: a.w * w * a.h * h,
        iscrowd: 0,
        segmentation: [],
      });
    }
  });

  return {
    info: { description: "Dataset Image Browser annotations export", version: "1.0", year: new Date().getFullYear() },
    licenses: [],
    images,
    annotations,
    categories,
  };
}

function buildYoloExport(
  rows: ReturnType<typeof useFilteredRows>,
  annotationsMap: Record<string, import("@/lib/dataset/persist").Annotation[]>,
): string[] {
  // YOLO format: one line per annotation: class x y w h (all normalized 0-1)
  // We prefix with image id for combined file
  const labelToClass = new Map<string, number>();
  let clsId = 0;
  for (const row of rows) {
    const anns = annotationsMap[row.id] || [];
    for (const a of anns) {
      if (!labelToClass.has(a.label)) {
        labelToClass.set(a.label, clsId++);
      }
    }
  }
  const lines: string[] = [];
  // classes file header (commented)
  lines.push(`# YOLO annotations export — ${new Date().toISOString()}`);
  lines.push(`# classes: ${Array.from(labelToClass.entries()).map(([n, i]) => `${i}=${n}`).join(", ")}`);
  lines.push("");
  for (const row of rows) {
    const anns = annotationsMap[row.id] || [];
    if (anns.length === 0) continue;
    lines.push(`# ${row.id}`);
    for (const a of anns) {
      const cls = labelToClass.get(a.label) ?? 0;
      // YOLO uses center x/y
      const cx = a.x + a.w / 2;
      const cy = a.y + a.h / 2;
      lines.push(`${cls} ${cx.toFixed(6)} ${cy.toFixed(6)} ${a.w.toFixed(6)} ${a.h.toFixed(6)}`);
    }
  }
  return lines;
}
