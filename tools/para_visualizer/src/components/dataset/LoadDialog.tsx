"use client";
/**
 * Load dialog: drag-drop file upload + demo dataset + recent history.
 */
import { useState, useCallback } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { parseFiles, fetchDemoDataset } from "@/lib/dataset/parsers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileBox, Sparkles, FileJson, FileText, X, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/dataset/filter";

export function LoadDialog() {
  const open = useDatasetStore((s) => s.showLoadDialog);
  const setOpen = useDatasetStore((s) => s.setShowLoadDialog);
  const setDataset = useDatasetStore((s) => s.setDataset);
  const setLoading = useDatasetStore((s) => s.setLoading);
  const setLoadError = useDatasetStore((s) => s.setLoadError);
  const loading = useDatasetStore((s) => s.loading);
  const recent = useDatasetStore((s) => s.recent);
  const [dragging, setDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setPendingFiles(arr);
  }, []);

  const handleLoad = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    setLoading(true);
    setLoadError(null);
    try {
      const ds = await parseFiles(pendingFiles);
      setDataset(ds);
      toast.success(`Loaded ${ds.files.length} file(s) with ${ds.files.reduce((a, f) => a + f.rowsCount, 0)} rows`);
      setPendingFiles([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      toast.error(`Load failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [pendingFiles, setDataset, setLoading, setLoadError]);

  const handleDemo = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const ds = await fetchDemoDataset();
      setDataset(ds);
      toast.success(`Loaded demo dataset: ${ds.name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      toast.error(`Demo load failed: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [setDataset, setLoading, setLoadError]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileBox className="h-5 w-5" />
            Open Dataset
          </DialogTitle>
          <DialogDescription>
            Load <code className="text-xs px-1 py-0.5 rounded bg-muted">.arrow</code>,
            <code className="text-xs px-1 py-0.5 rounded bg-muted mx-1">.feather</code>,
            <code className="text-xs px-1 py-0.5 rounded bg-muted">.json</code> files, or try the bundled demo dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-accent/30",
            )}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              multiple
              accept=".arrow,.feather,.ipc,.json,.parquet,.csv,.tsv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
              }}
            />
            <Upload className={cn("h-7 w-7 mx-auto mb-2", dragging ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-medium">
              {dragging ? "Drop files here" : "Drag & drop files, or click to select"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Supports multi-file selection across folders
            </p>
          </div>

          {/* Pending files */}
          {pendingFiles.length > 0 && (
            <div className="rounded-md border bg-muted/20 p-2 space-y-1">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileJson className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground text-[10px]">{formatBytes(f.size)}</span>
                    <button
                      onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))}
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent */}
          {recent.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recently opened
                </span>
              </div>
              <div className="space-y-0.5">
                {recent.slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] px-2 py-1 rounded hover:bg-accent/40">
                    <span className="truncate">{r.name}</span>
                    <span className="text-muted-foreground text-[10px] shrink-0">
                      {r.rows} rows · {formatBytes(r.size)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Format help */}
          <div className="rounded-md bg-muted/30 p-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1 mb-1 font-medium text-foreground/70">
              <FileText className="h-3 w-3" />
              Supported formats
            </div>
            <ul className="space-y-0.5 list-disc list-inside">
              <li><code>.arrow</code> / <code>.feather</code> / <code>.ipc</code> — Apache Arrow IPC (parsed in-browser via apache-arrow)</li>
              <li><code>.csv</code> / <code>.tsv</code> — Comma/tab-separated values (parsed via PapaParse)</li>
              <li><code>.json</code> — Bundled demo format or {`{schema, data}`} or array of rows</li>
              <li><code>.parquet</code> — Convert to .arrow first; direct in-browser parsing is limited</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleDemo} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Try Demo Dataset
          </Button>
          <Button onClick={handleLoad} disabled={pendingFiles.length === 0 || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Load {pendingFiles.length > 0 && `(${pendingFiles.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
