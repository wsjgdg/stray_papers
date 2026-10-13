"use client";
/**
 * Command palette (Cmd+K) for quick actions.
 */
import { useEffect, useMemo, useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema } from "@/lib/dataset/hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutGrid,
  Table2,
  Eye,
  GitCompareArrows,
  BarChart3,
  Upload,
  SlidersHorizontal,
  Download,
  Layers,
  Bookmark,
  PanelLeft,
  PanelRight,
  Box,
  Sun,
  Moon,
  Sparkles,
  Trash2,
  MousePointer2,
  Image as ImageIcon,
  Search,
} from "lucide-react";
import { toast } from "sonner";

interface CommandItemDef {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  keywords?: string;
  shortcut?: string;
  action: () => void;
  group: string;
}

export function CommandPalette() {
  const open = useDatasetStore((s) => s.showCommandPalette);
  const setOpen = useDatasetStore((s) => s.setShowCommandPalette);
  const dataset = useDatasetStore((s) => s.dataset);
  const setViewMode = useDatasetStore((s) => s.setViewMode);
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const setShowFilterPanel = useDatasetStore((s) => s.setShowFilterPanel);
  const setShowExportDialog = useDatasetStore((s) => s.setShowExportDialog);
  const setShowSchemaDialog = useDatasetStore((s) => s.setShowSchemaDialog);
  const setShowBookmarkPanel = useDatasetStore((s) => s.setShowBookmarkPanel);
  const setSidebarOpen = useDatasetStore((s) => s.setSidebarOpen);
  const setDetailPanelOpen = useDatasetStore((s) => s.setDetailPanelOpen);
  const sidebarOpen = useDatasetStore((s) => s.sidebarOpen);
  const detailPanelOpen = useDatasetStore((s) => s.detailPanelOpen);
  const setAnnotationMode = useDatasetStore((s) => s.setAnnotationMode);
  const annotationMode = useDatasetStore((s) => s.annotationMode);
  const clearSelection = useDatasetStore((s) => s.clearSelection);
  const clearCompare = useDatasetStore((s) => s.clearCompare);
  const reset = useDatasetStore((s) => s.reset);
  const selectedRowIds = useDatasetStore((s) => s.selectedRowIds);

  const filtered = useFilteredRows();
  const schema = useSchema();

  // Theme toggle
  const setTheme = (mode: "light" | "dark" | "system") => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      const isDark =
        mode === "dark" ||
        (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.classList.toggle("dark", isDark);
      localStorage.setItem("dib:theme", mode);
      toast.success(`Theme: ${mode}`);
    }
  };

  const items = useMemo<CommandItemDef[]>(() => {
    const base: CommandItemDef[] = [
      {
        id: "view-grid",
        label: "Grid view",
        icon: <LayoutGrid className="h-4 w-4" />,
        keywords: "grid thumbnail gallery",
        shortcut: "G",
        group: "Views",
        action: () => setViewMode("grid"),
      },
      {
        id: "view-table",
        label: "Table view",
        icon: <Table2 className="h-4 w-4" />,
        keywords: "table rows columns",
        shortcut: "T",
        group: "Views",
        action: () => setViewMode("table"),
      },
      {
        id: "view-detail",
        label: "Detail view",
        icon: <Eye className="h-4 w-4" />,
        keywords: "detail single large",
        shortcut: "D",
        group: "Views",
        action: () => setViewMode("detail"),
      },
      {
        id: "view-compare",
        label: "Compare view",
        icon: <GitCompareArrows className="h-4 w-4" />,
        keywords: "compare side by side",
        shortcut: "C",
        group: "Views",
        action: () => setViewMode("compare"),
      },
      {
        id: "view-stats",
        label: "Stats view",
        icon: <BarChart3 className="h-4 w-4" />,
        keywords: "stats statistics overview",
        shortcut: "S",
        group: "Views",
        action: () => setViewMode("stats"),
      },
    ];
    const actions: CommandItemDef[] = [
      {
        id: "open-files",
        label: "Open files…",
        icon: <Upload className="h-4 w-4" />,
        keywords: "open load file arrow json",
        shortcut: "⌘O",
        group: "Actions",
        action: () => setShowLoadDialog(true),
      },
      {
        id: "filters",
        label: "Open filter builder",
        icon: <SlidersHorizontal className="h-4 w-4" />,
        keywords: "filter rule search",
        shortcut: "⌘F",
        group: "Actions",
        action: () => setShowFilterPanel(true),
      },
      {
        id: "export",
        label: "Export…",
        icon: <Download className="h-4 w-4" />,
        keywords: "export download save images csv json",
        shortcut: "⌘E",
        group: "Actions",
        action: () => setShowExportDialog(true),
      },
      {
        id: "schema",
        label: "Field mapping…",
        icon: <Layers className="h-4 w-4" />,
        keywords: "schema field role mapping",
        group: "Actions",
        action: () => setShowSchemaDialog(true),
      },
      {
        id: "bookmarks",
        label: "Bookmarks panel",
        icon: <Bookmark className="h-4 w-4" />,
        keywords: "bookmark saved marked",
        group: "Actions",
        action: () => setShowBookmarkPanel(true),
      },
      {
        id: "toggle-sidebar",
        label: sidebarOpen ? "Hide sidebar" : "Show sidebar",
        icon: <PanelLeft className="h-4 w-4" />,
        keywords: "sidebar panel left toggle",
        group: "Layout",
        action: () => setSidebarOpen(!sidebarOpen),
      },
      {
        id: "toggle-detail",
        label: detailPanelOpen ? "Hide detail panel" : "Show detail panel",
        icon: <PanelRight className="h-4 w-4" />,
        keywords: "detail panel right toggle",
        group: "Layout",
        action: () => setDetailPanelOpen(!detailPanelOpen),
      },
      {
        id: "annotation-mode",
        label: annotationMode ? "Exit annotation mode" : "Enter annotation mode",
        icon: <MousePointer2 className="h-4 w-4" />,
        keywords: "annotation draw box label",
        group: "Annotation",
        action: () => setAnnotationMode(!annotationMode),
      },
      {
        id: "theme-light",
        label: "Light theme",
        icon: <Sun className="h-4 w-4" />,
        keywords: "theme light mode",
        group: "Theme",
        action: () => setTheme("light"),
      },
      {
        id: "theme-dark",
        label: "Dark theme",
        icon: <Moon className="h-4 w-4" />,
        keywords: "theme dark mode night",
        group: "Theme",
        action: () => setTheme("dark"),
      },
    ];
    const cleanup: CommandItemDef[] = [
      {
        id: "clear-selection",
        label: `Clear multi-selection (${selectedRowIds.size})`,
        icon: <Trash2 className="h-4 w-4" />,
        keywords: "clear selection reset",
        group: "Cleanup",
        action: () => {
          clearSelection();
          toast.success("Cleared selection");
        },
      },
      {
        id: "clear-compare",
        label: "Clear compare list",
        icon: <Trash2 className="h-4 w-4" />,
        keywords: "clear compare reset",
        group: "Cleanup",
        action: () => clearCompare(),
      },
      {
        id: "reset-all",
        label: "Reset everything (close dataset)",
        icon: <Sparkles className="h-4 w-4" />,
        keywords: "reset clear all start over",
        group: "Cleanup",
        action: () => {
          reset();
          toast.success("Reset complete");
        },
      },
    ];
    return [...base, ...actions, ...cleanup].filter(() => dataset);
  }, [
    dataset,
    setViewMode,
    setShowLoadDialog,
    setShowFilterPanel,
    setShowExportDialog,
    setShowSchemaDialog,
    setShowBookmarkPanel,
    setSidebarOpen,
    setDetailPanelOpen,
    sidebarOpen,
    detailPanelOpen,
    setAnnotationMode,
    annotationMode,
    clearSelection,
    clearCompare,
    reset,
    selectedRowIds.size,
  ]);

  // jump-to-row items (first 12 matches by search)
  const rowItems = useMemo<CommandItemDef[]>(() => {
    if (!dataset) return [];
    const labelField = schema.find((f) => f.role === "text" && f.name !== "image")?.name;
    const idField = schema.find((f) => f.role === "identifier")?.name || "id";
    return filtered.slice(0, 20).map((r) => ({
      id: `row-${r.id}`,
      label: String(r.data[labelField || idField] || r.id),
      hint: `#${r.index + 1} · ${r.id}`,
      icon: <ImageIcon className="h-4 w-4" />,
      keywords: r.id,
      group: "Jump to row",
      action: () => {
        useDatasetStore.getState().setSelectedRow(r.id);
        toast.success(`Jumped to row #${r.index + 1}`);
      },
    }));
  }, [dataset, filtered, schema]);

  // global ⌘K handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Group items
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItemDef[]>();
    for (const item of items) {
      const arr = map.get(item.group) || [];
      arr.push(item);
      map.set(item.group, arr);
    }
    if (rowItems.length > 0) {
      map.set("Jump to row", rowItems);
    }
    return Array.from(map.entries());
  }, [items, rowItems]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden gap-0 top-[20%] translate-y-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search and run commands</DialogDescription>
        </DialogHeader>
        <Command className="rounded-lg">
          <CommandInput placeholder="Search commands, jump to row…" />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No results found.</CommandEmpty>
            {grouped.map(([group, groupItems]) => (
              <div key={group}>
                <CommandGroup heading={group}>
                  {groupItems.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.keywords || ""} ${item.hint || ""}`}
                      onSelect={() => {
                        item.action();
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <span className="text-muted-foreground">{item.icon}</span>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm truncate">{item.label}</span>
                        {item.hint && (
                          <span className="text-[10px] text-muted-foreground/70 truncate">{item.hint}</span>
                        )}
                      </div>
                      {item.shortcut && (
                        <CommandShortcut>{item.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </div>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
