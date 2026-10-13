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

type ExportType = "images" | "metadata_csv" | "metadata_json" | "both";

export function ExportDialog() {
  const open = useDatasetStore((s) => s.showExportDialog);
  const setOpen = useDatasetStore((s) => s.setShowExportDialog);
  const filtered = useFilteredRows();
  const schema = useSchema();
  const imageField = useDatasetStore((s) => s.imageField);
  const hiddenFields = useDatasetStore((s) => s.hiddenFields);

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
          // throttle to avoid browser download dialog overwhelming
          await new Promise((res) => setTimeout(res, 60));
        }
        toast.success(`Exported ${ok} images (${failed} skipped/failed)`);
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
            </RadioGroup>
          </div>

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
            <div className="space-y-1.5">
              <Progress value={progress} className="h-2" />
              <p className="text-[10px] text-muted-foreground text-center">
                {done} / {Math.max(1, filtered.length)} done · {progress.toFixed(0)}%
              </p>
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
