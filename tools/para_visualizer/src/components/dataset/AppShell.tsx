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
} from "lucide-react";
import { toast } from "sonner";
import { formatBytes } from "@/lib/dataset/filter";

export function AppShell() {
  const dataset = useDatasetStore((s) => s.dataset);
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
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <LandingPage />
        <StatusBar />
        <LoadDialog />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {sidebarOpen && (
            <>
              <ResizablePanel defaultSize={20} minSize={15} maxSize={32} className="min-w-[200px]">
                <LeftPanel />
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}
          {/* center */}
          <ResizablePanel defaultSize={detailPanelOpen ? 55 : 80} minSize={30}>
            <div className="flex flex-col h-full">
              <Toolbar />
              <div className="flex-1 min-h-0 overflow-hidden">
                {viewMode === "grid" && <GridView />}
                {viewMode === "table" && <TableView />}
                {viewMode === "detail" && <DetailView />}
                {viewMode === "compare" && <CompareView />}
                {viewMode === "stats" && <StatsView />}
              </div>
            </div>
          </ResizablePanel>
          {detailPanelOpen && viewMode !== "stats" && viewMode !== "compare" && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={25} minSize={18} maxSize={45} className="min-w-[260px]">
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
    </div>
  );
}

function Header() {
  const dataset = useDatasetStore((s) => s.dataset);
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const setShowFilterPanel = useDatasetStore((s) => s.setShowFilterPanel);
  const setShowExportDialog = useDatasetStore((s) => s.setShowExportDialog);
  const setShowSchemaDialog = useDatasetStore((s) => s.setShowSchemaDialog);
  const setSidebarOpen = useDatasetStore((s) => s.setSidebarOpen);
  const setDetailPanelOpen = useDatasetStore((s) => s.setDetailPanelOpen);
  const sidebarOpen = useDatasetStore((s) => s.sidebarOpen);
  const detailPanelOpen = useDatasetStore((s) => s.detailPanelOpen);

  return (
    <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-2 px-3 h-12">
        {/* logo + name */}
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white">
            <ImageIcon className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Dataset Image Browser</span>
            <span className="text-[9px] text-muted-foreground/70 -mt-0.5">Arrow · Parquet · JSON</span>
          </div>
        </div>

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
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger className="text-xs h-8 px-2">Help</MenubarTrigger>
              <MenubarContent>
                <MenubarItem onClick={() => toast.info("Drag .arrow/.json files or use the bundled demo.")}>
                  <HelpCircle className="h-3.5 w-3.5 mr-2" /> Quick start
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
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowLoadDialog(true)}>
            <FileBox className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open</span>
          </Button>
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
