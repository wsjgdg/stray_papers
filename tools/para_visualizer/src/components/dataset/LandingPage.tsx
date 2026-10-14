"use client";
/**
 * Landing page shown when no dataset is loaded.
 */
import { useDatasetStore } from "@/lib/dataset/store";
import { fetchDemoDataset } from "@/lib/dataset/parsers";
import { saveSession, clearSession } from "@/lib/dataset/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Upload,
  Sparkles,
  Database,
  Image as ImageIcon,
  Layers,
  Filter,
  Download,
  GitCompareArrows,
  BarChart3,
  Box,
  Zap,
  ShieldCheck,
  Clock,
  MousePointer2,
  History,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/dataset/filter";

const FEATURES = [
  { icon: ImageIcon, title: "Multi-strategy image decode", desc: "Bytes, base64, data-URL, URL refs, nested structs — auto-detected with graceful fallbacks." },
  { icon: Layers, title: "Lazy schema loading", desc: "Only the schema and visible page of rows are loaded. Decoded images are cached by rowId+field." },
  { icon: Filter, title: "Dynamic filter builder", desc: "Per-field operators with AND/OR combinators and live result counts." },
  { icon: GitCompareArrows, title: "Side-by-side compare", desc: "Stack 2–4 rows to compare charts, questions, and answers at a glance." },
  { icon: BarChart3, title: "Statistics & overview", desc: "Category distributions, numeric ranges, decode health, and schema at a glance." },
  { icon: Download, title: "Flexible export", desc: "Save single images, batch-export filtered sets, or dump metadata as CSV/JSON." },
];

const STEPS = [
  { icon: Upload, title: "Load", desc: "Drag in .arrow / .feather / .json files, or try the demo dataset." },
  { icon: MousePointer2, title: "Browse", desc: "Switch between Grid, Table, Detail, Compare, and Stats views." },
  { icon: Zap, title: "Filter & Export", desc: "Refine to the rows you need, then export images + metadata." },
];

export function LandingPage() {
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const setDataset = useDatasetStore((s) => s.setDataset);
  const setLoading = useDatasetStore((s) => s.setLoading);
  const setLoadError = useDatasetStore((s) => s.setLoadError);
  const sessionFiles = useDatasetStore((s) => s.sessionFiles);
  const setSessionFiles = useDatasetStore((s) => s.setSessionFiles);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const restoreSession = async () => {
    if (!sessionFiles || sessionFiles.length === 0) return;
    setBusy(true);
    setLoading(true);
    setLoadError(null);
    try {
      const { parseFiles } = await import("@/lib/dataset/parsers");
      const ds = await parseFiles(sessionFiles);
      setDataset(ds);
      setSessionFiles(null);
      toast.success(`Restored ${ds.files.length} file(s) with ${ds.files.reduce((a, f) => a + f.rowsCount, 0)} rows`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      toast.error(`Restore failed: ${msg}`);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  };

  const handleDemo = async () => {
    setBusy(true);
    setLoading(true);
    setLoadError(null);
    try {
      const ds = await fetchDemoDataset();
      setDataset(ds);
      // demo is re-fetched remotely; don't persist it as a restore-able session
      clearSession().catch(() => {});
      toast.success(`Loaded ${ds.name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      toast.error(`Demo load failed: ${msg}`);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setBusy(true);
    setLoading(true);
    setLoadError(null);
    try {
      const { parseFiles } = await import("@/lib/dataset/parsers");
      const ds = await parseFiles(arr);
      setDataset(ds);
      // Persist uploaded files so they survive a reload (IndexedDB)
      saveSession(arr, ds.name).catch(() => {});
      toast.success(`Loaded ${ds.files.length} file(s) with ${ds.files.reduce((a, f) => a + f.rowsCount, 0)} rows`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      toast.error(`Load failed: ${msg}`);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  };

  return (
    <main
      className="flex-1 overflow-y-auto custom-scroll relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // only clear when leaving the main container (not entering a child)
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-primary rounded-2xl px-12 py-10 bg-card/90 shadow-2xl text-center">
            <Upload className="h-10 w-10 text-primary mx-auto mb-3 animate-bounce" />
            <p className="text-lg font-semibold">Drop files to load</p>
            <p className="text-xs text-muted-foreground mt-1">.arrow · .feather · .csv · .tsv · .json</p>
          </div>
        </div>
      )}
      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-transparent pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border bg-card/60 backdrop-blur text-[11px] text-muted-foreground mb-6">
            <Sparkles className="h-3 w-3 text-violet-500" />
            Lightweight · Local-first · Browser-native
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
            Browse images inside
            <br />
            <span className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 bg-clip-text text-transparent">.arrow &amp; .parquet</span> datasets
          </h1>
          <p className="max-w-2xl mx-auto text-base md:text-lg text-muted-foreground mb-8">
            A fast, in-browser tool for browsing, filtering, comparing, and exporting images
            embedded in research datasets — without uploading anything to a server.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={handleDemo} disabled={busy} className="h-11">
              <Sparkles className="h-4 w-4" />
              {busy ? "Loading demo…" : "Try the demo dataset"}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setShowLoadDialog(true)} className="h-11">
              <Upload className="h-4 w-4" />
              Open your files
            </Button>
          </div>
          <div className="mt-8 flex items-center justify-center gap-6 text-[11px] text-muted-foreground/70">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> 100% client-side
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Box className="h-3.5 w-3.5" /> No upload to server
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Lazy decode + LRU cache
            </span>
          </div>
        </div>
      </section>

      {/* restore previous session */}
      {sessionFiles && sessionFiles.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 pb-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-wrap items-center gap-3">
            <History className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Restore previous files</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {sessionFiles.map((f) => f.name).slice(0, 3).join(", ")}
                {sessionFiles.length > 3 ? ` +${sessionFiles.length - 3} more` : ""}
                {" · "}
                {formatBytes(sessionFiles.reduce((a, f) => a + f.size, 0))}
              </p>
            </div>
            <Button size="sm" onClick={restoreSession} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
              Restore
            </Button>
          </div>
        </section>
      )}

      {/* steps */}
      <section className="max-w-5xl mx-auto px-6 pb-8">
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((s, i) => (
            <Card key={i} className="relative overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-md bg-violet-500/10 text-violet-600">
                    <s.icon className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">Step {i + 1}</span>
                </div>
                <CardTitle className="text-base mt-2">{s.title}</CardTitle>
                <CardDescription className="text-xs">{s.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold text-center mb-2">Everything you need to explore image datasets</h2>
        <p className="text-center text-sm text-muted-foreground mb-8">
          Built to solve the &ldquo;downloaded a dataset but can&rsquo;t see the pictures&rdquo; pain.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <Card key={i} className={cn("hover:shadow-md transition-shadow")}>
              <CardHeader>
                <div className="p-2 rounded-md bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 text-violet-600 w-fit mb-2">
                  <f.icon className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm">{f.title}</CardTitle>
                <CardDescription className="text-xs leading-relaxed">{f.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* sample preview */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-violet-500" />
              Demo dataset preview
            </CardTitle>
            <CardDescription className="text-xs">
              The bundled demo simulates an InfoChartQA-style dataset with 96 rows of synthetic
              chart images (bar, line, pie, area, grouped) and question/answer metadata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/2] rounded-md bg-gradient-to-br from-muted/60 to-muted/20 border flex items-center justify-center hover:border-primary/30 hover:shadow-sm transition-all"
                  style={{
                    animationDelay: `${i * 50}ms`,
                  }}
                >
                  <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-[11px] text-muted-foreground">
                <span className="font-mono">96</span> rows · <span className="font-mono">5</span> chart types · <span className="font-mono">6</span> question types
              </div>
              <Button size="sm" variant="outline" onClick={handleDemo} disabled={busy}>
                <Sparkles className="h-3.5 w-3.5" />
                Load demo
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* footer */}
      <footer className="border-t mt-8 py-6 text-center text-[11px] text-muted-foreground/60">
        Built with Next.js 16 · Apache Arrow · parquet-wasm · shadcn/ui · Recharts · framer-motion
      </footer>
    </main>
  );
}
