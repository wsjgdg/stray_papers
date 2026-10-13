"use client";
/**
 * Main app shell: header + 3-panel resizable layout + dialogs/sheets.
 */
import { useEffect } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { Toolbar } from "./Toolbar";
import { GridView } from "./GridView";
import { TableView } from "./TableView";
import { DetailView } from "./DetailView";
import { CompareView } from "./CompareView";
import { StatsView } from "./StatsView";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import { StatusBar } from "./StatusBar";
import { LoadDialog } from "./LoadDialog";
import { FilterPanel } from "./FilterPanel";
import { ExportDialog } from "./ExportDialog";
import { SchemaDialog } from "./SchemaDialog";
import { LandingPage } from "./LandingPage";
import { CommandPalette } from "./CommandPalette";
import { BookmarkPanel } from "./BookmarkPanel";
import { ThemeToggle } from "./ThemeToggle";
import { ShortcutsCheatsheet } from "./ShortcutsCheatsheet";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { RowJumpDialog } from "./RowJumpDialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Button } from "@/components/ui/button";
import {
  PanelLeft,
  PanelRight,
  Database,
  FileBox,
  Plus,
  SlidersHorizontal,
  Download,
  Layers,
  HelpCircle,
  Github,
  Image as ImageIcon,
  Clock,
  Bookmark,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "@/lib/dataset/filter";
import { motion, AnimatePresence } from "framer-motion";

export function AppShell() {
  const dataset = useDatasetStore((s) => s.dataset);
  const loading = useDatasetStore((s) => s.loading);
  const viewMode = useDatasetStore((s) => s.viewMode);
  const sidebarOpen = useDatasetStore((s) => s.sidebarOpen);
  const setSidebarOpen = useDatasetStore((s) => s.setSidebarOpen);
  const detailPanelOpen = useDatasetStore((s) => s.detailPanelOpen);
  const setDetailPanelOpen = useDatasetStore((s) => s.setDetailPanelOpen);
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const setShowFilterPanel = useDatasetStore((s) => s.setShowFilterPanel);
  const setShowExportDialog = useDatasetStore((s) => s.setShowExportDialog);
  const setShowSchemaDialog = useDatasetStore((s) => s.setShowSchemaDialog);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "o") {
        e.preventDefault();
        setShowLoadDialog(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFilterPanel(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        setShowExportDialog(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setShowLoadDialog, setShowFilterPanel, setShowExportDialog]);

  if (!dataset) {
    if (loading) {
      return <LoadingSkeleton />;
    }
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <LandingPage />
        <StatusBar />
        <LoadDialog />
        <CommandPalette />
        <BookmarkPanel />
        <ShortcutsCheatsheet />
        <RowJumpDialogWithStore />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full" autoSaveId="dib-layout">
          {sidebarOpen && (
            <>
              <ResizablePanel
                id="sidebar"
                order={1}
                defaultSize={20}
                minSize={15}
                maxSize={32}
                className="min-w-[200px]"
              >
                <LeftPanel />
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          {/* center */}
          <ResizablePanel
            id="center"
            order={2}
            defaultSize={detailPanelOpen ? 55 : 80}
            minSize={30}
          >
            <div className="flex flex-col h-full">
              <Toolbar />
              <div className="flex-1 min-h-0 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={viewMode}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="h-full"
                  >
                    {viewMode === "grid" && <GridView />}
                    {viewMode === "table" && <TableView />}
                    {viewMode === "detail" && <DetailView />}
                    {viewMode === "compare" && <CompareView />}
                    {viewMode === "stats" && <StatsView />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </ResizablePanel>
          {detailPanelOpen && viewMode !== "stats" && viewMode !== "compare" && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="detail"
                order={3}
                defaultSize={25}
                minSize={18}
                maxSize={45}
                className="min-w-[260px]"
              >
                <RightPanel />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <StatusBar />
      <LoadDialog />
      <FilterPanel />
      <ExportDialog />
      <SchemaDialog />
      <CommandPalette />
      <BookmarkPanel />
      <ShortcutsCheatsheet />
      <RowJumpDialogWithStore />
    </div>
  );
}

/** Wrapper that connects RowJumpDialog to the store */
function RowJumpDialogWithStore() {
  const open = useDatasetStore((s) => s.showRowJumpDialog);
  const setOpen = useDatasetStore((s) => s.setShowRowJumpDialog);
  return <RowJumpDialog open={open} onOpenChange={setOpen} />;
}

function Header() {
  const dataset = useDatasetStore((s) => s.dataset);
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const setShowFilterPanel = useDatasetStore((s) => s.setShowFilterPanel);
  const setShowExportDialog = useDatasetStore((s) => s.setShowExportDialog);
  const setShowSchemaDialog = useDatasetStore((s) => s.setShowSchemaDialog);
  const setShowCommandPalette = useDatasetStore((s) => s.setShowCommandPalette);
  const setShowBookmarkPanel = useDatasetStore((s) => s.setShowBookmarkPanel);
  const setSidebarOpen = useDatasetStore((s) => s.setSidebarOpen);
  const setDetailPanelOpen = useDatasetStore((s) => s.setDetailPanelOpen);
  const sidebarOpen = useDatasetStore((s) => s.sidebarOpen);
  const detailPanelOpen = useDatasetStore((s) => s.detailPanelOpen);
  const bookmarkCount = useDatasetStore((s) => Object.keys(s.bookmarks).length);

  return (
    <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-2 px-3 h-12">
        {/* logo + name */}
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-sm">
            <ImageIcon className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Dataset Image Browser</span>
            <span className="text-[9px] text-muted-foreground/70 -mt-0.5">Arrow · Parquet · JSON</span>
          </div>
        </div>

        {/* command palette trigger */}
        <button
          onClick={() => setShowCommandPalette(true)}
          className="ml-3 hidden md:inline-flex items-center gap-2 h-7 px-2.5 rounded-md border bg-muted/40 hover:bg-muted/70 text-[11px] text-muted-foreground transition-colors"
          title="Open command palette"
        >
          <Search className="h-3 w-3" />
          <span>Search commands…</span>
          <kbd className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-background/80 text-[9px] font-mono border">
            ⌘K
          </kbd>
        </button>

        {/* menu */}
        {dataset && (
          <Menubar className="ml-2 border-0 bg-transparent h-8">
            <MenubarMenu>
              <MenubarTrigger className="text-xs h-8 px-2">File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => setShowLoadDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-2" /> Open files…
                  <span className="ml-auto text-[10px] text-muted-foreground">⌘O</span>
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => setShowExportDialog(true)}>
                  <Download className="h-3.5 w-3.5 mr-2" /> Export…
                  <span className="ml-auto text-[10px] text-muted-foreground">⌘E</span>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="text-xs h-8 px-2">Edit</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => setShowFilterPanel(true)}>
                  <SlidersHorizontal className="h-3.5 w-3.5 mr-2" /> Filters…
                  <span className="ml-auto text-[10px] text-muted-foreground">⌘F</span>
                </MenubarItem>
                <MenubarItem onClick={() => setShowSchemaDialog(true)}>
                  <Layers className="h-3.5 w-3.5 mr-2" /> Field mapping…
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => setShowBookmarkPanel(true)}>
                  <Bookmark className="h-3.5 w-3.5 mr-2" /> Bookmarks
                  {bookmarkCount > 0 && (
                    <span className="ml-auto text-[10px] text-amber-500 font-mono">{bookmarkCount}</span>
                  )}
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="text-xs h-8 px-2">View</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => setSidebarOpen(!sidebarOpen)}>
                  <PanelLeft className="h-3.5 w-3.5 mr-2" />
                  {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                </MenubarItem>
                <MenubarItem onClick={() => setDetailPanelOpen(!detailPanelOpen)}>
                  <PanelRight className="h-3.5 w-3.5 mr-2" />
                  {detailPanelOpen ? "Hide detail panel" : "Show detail panel"}
                </MenubarItem>
                <MenubarSeparator />
                <MenubarItem onClick={() => setShowCommandPalette(true)}>
                  <Search className="h-3.5 w-3.5 mr-2" /> Command palette…
                  <span className="ml-auto text-[10px] text-muted-foreground">⌘K</span>
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="text-xs h-8 px-2">Help</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => toast.info("Drag .arrow/.json files or use the bundled demo.")}>
                  <HelpCircle className="h-3.5 w-3.5 mr-2" /> Quick start
                </MenubarItem>
                <MenubarItem onClick={() => toast.info("Keyboard: 1-5 views · j/k navigate · b bookmark · / search · ⌘K palette")}>
                  <HelpCircle className="h-3.5 w-3.5 mr-2" /> Keyboard shortcuts
                </MenubarItem>
                <MenubarItem onClick={() => toast.info("Source on GitHub (placeholder).")}>
                  <Github className="h-3.5 w-3.5 mr-2" /> View source
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        )}

        <div className="ml-auto flex items-center gap-1">
          {dataset && (
            <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground mr-2 px-2 py-1 rounded-md bg-muted/40">
              <Clock className="h-3 w-3" />
              <span className="font-mono">{dataset.files.reduce((a, f) => a + f.rowsCount, 0)} rows</span>
              <span className="opacity-50">·</span>
              <span className="font-mono">{formatBytes(dataset.files.reduce((a, f) => a + f.sizeBytes, 0))}</span>
            </div>
          )}
          {dataset && bookmarkCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 relative"
              onClick={() => setShowBookmarkPanel(true)}
              title="Bookmarks"
            >
              <Bookmark className="h-3.5 w-3.5 text-amber-500" />
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                {bookmarkCount}
              </span>
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowLoadDialog(true)}>
            <FileBox className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open</span>
          </Button>
          <ThemeToggle />
          {dataset && (
            <>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
                <PanelLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDetailPanelOpen(!detailPanelOpen)} title="Toggle detail panel">
                <PanelRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
