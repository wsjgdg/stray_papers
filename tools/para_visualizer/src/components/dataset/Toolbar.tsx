"use client";
/**
 * Toolbar: search, filter toggle, sort, view switcher, thumbnail size.
 */
import { useRef, useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useActiveRows, useFilteredRows } from "@/lib/dataset/hooks";
import { LayoutGrid, Table2, Eye, GitCompareArrows, BarChart3, Search, SlidersHorizontal, Download, Plus, Files, Database, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/lib/dataset/types";
import { formatBytes } from "@/lib/dataset/filter";

const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: "grid", label: "Grid", icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "table", label: "Table", icon: <Table2 className="h-4 w-4" /> },
  { id: "detail", label: "Detail", icon: <Eye className="h-4 w-4" /> },
  { id: "compare", label: "Compare", icon: <GitCompareArrows className="h-4 w-4" /> },
  { id: "stats", label: "Stats", icon: <BarChart3 className="h-4 w-4" /> },
];

export function Toolbar() {
  const dataset = useDatasetStore((s) => s.dataset);
  const viewMode = useDatasetStore((s) => s.viewMode);
  const setViewMode = useDatasetStore((s) => s.setViewMode);
  const search = useDatasetStore((s) => s.search);
  const setSearch = useDatasetStore((s) => s.setSearch);
  const setShowFilterPanel = useDatasetStore((s) => s.setShowFilterPanel);
  const setShowExportDialog = useDatasetStore((s) => s.setShowExportDialog);
  const setShowLoadDialog = useDatasetStore((s) => s.setShowLoadDialog);
  const filterRules = useDatasetStore((s) => s.filterRules);
  const thumbnailSize = useDatasetStore((s) => s.thumbnailSize);
  const setThumbnailSize = useDatasetStore((s) => s.setThumbnailSize);
  const showBboxOverlay = useDatasetStore((s) => s.showBboxOverlay);
  const setShowBboxOverlay = useDatasetStore((s) => s.setShowBboxOverlay);
  const filtered = useFilteredRows();
  const total = useActiveRows();
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("dib:search-history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Save search to history when search becomes non-empty and input loses focus or Enter pressed
  const saveSearchToHistory = (term: string) => {
    const q = term.trim();
    if (!q) return;
    setSearchHistory((prev) => {
      const next = [q, ...prev.filter((s) => s !== q)].slice(0, 8);
      try {
        localStorage.setItem("dib:search-history", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  return (
    <div className="border-b bg-card/60 backdrop-blur px-3 py-2 flex flex-wrap items-center gap-2">
      {/* view switcher */}
      <div className="inline-flex rounded-md border bg-background p-0.5">
        {VIEWS.map((v) => (
          <TooltipProvider key={v.id} delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setViewMode(v.id)}
                  aria-label={`${v.label} view`}
                  aria-pressed={viewMode === v.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors",
                    viewMode === v.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  {v.icon}
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{v.label} view</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>

      <div className="h-6 w-px bg-border" />

      {/* search with history dropdown */}
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 z-10" />
        <Input
          ref={searchInputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setShowSearchHistory(true)}
          aria-label="Search rows across text fields"
          aria-expanded={showSearchHistory}
          onBlur={() => {
            setShowSearchHistory(false);
            saveSearchToHistory(search);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              saveSearchToHistory(search);
              setShowSearchHistory(false);
              searchInputRef.current?.blur();
            }
            if (e.key === "Escape") {
              setShowSearchHistory(false);
              searchInputRef.current?.blur();
            }
          }}
          placeholder="Search rows across text fields…"
          className="h-8 pl-7 pr-7 text-xs"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground z-10"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        {/* Search history dropdown */}
        {showSearchHistory && searchHistory.length > 0 && !search && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto custom-scroll">
            <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
              Recent searches
            </div>
            {searchHistory.map((term, i) => (
              <div
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSearch(term);
                  setShowSearchHistory(false);
                  searchInputRef.current?.blur();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent text-left cursor-pointer"
              >
                <Search className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                <span className="truncate flex-1">{term}</span>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearchHistory((prev) => {
                      const next = prev.filter((_, j) => j !== i);
                      try {
                        localStorage.setItem("dib:search-history", JSON.stringify(next));
                      } catch {
                        // ignore
                      }
                      return next;
                    });
                  }}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground/60 hover:text-rose-500"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                setSearchHistory([]);
                try {
                  localStorage.removeItem("dib:search-history");
                } catch {
                  // ignore
                }
              }}
              className="w-full px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-rose-500 border-t"
            >
              Clear all history
            </button>
          </div>
        )}
      </div>

      {/* filter button */}
      <Button
        size="sm"
        variant={filterRules.length > 0 ? "secondary" : "outline"}
        className="h-8"
        onClick={() => setShowFilterPanel(true)}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Filter</span>
        {filterRules.length > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] leading-none">
            {filterRules.length}
          </span>
        )}
      </Button>

      {/* export */}
      <Button size="sm" variant="outline" className="h-8" onClick={() => setShowExportDialog(true)}>
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Export</span>
      </Button>

      {/* load more */}
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowLoadDialog(true)}>
        <Plus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Open</span>
      </Button>

      {/* thumbnail size (grid only) */}
      {viewMode === "grid" && (
        <div className="hidden md:flex items-center gap-2 ml-2 pl-2 border-l">
          <Label className="text-[10px] uppercase text-muted-foreground">Thumb</Label>
          <Slider
            value={[thumbnailSize]}
            onValueChange={(v) => setThumbnailSize(v[0])}
            min={100}
            max={320}
            step={20}
            className="w-24"
          />
          <span className="text-[10px] font-mono w-9 tabular-nums">{thumbnailSize}px</span>
        </div>
      )}

      {/* bbox overlay toggle */}
      <div className="hidden lg:flex items-center gap-2 ml-1">
        <Switch
          id="bbox-toggle"
          checked={showBboxOverlay}
          onCheckedChange={setShowBboxOverlay}
        />
        <Label htmlFor="bbox-toggle" className="text-[10px] uppercase text-muted-foreground cursor-pointer">
          BBox
        </Label>
      </div>

      {/* dataset info badge */}
      {dataset && (
        <div className="ml-auto hidden md:flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground/80">{dataset.name}</span>
          <span className="text-muted-foreground/60">
            · {dataset.files.length} files · {formatBytes(dataset.files.reduce((a, f) => a + f.sizeBytes, 0))}
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span>
            {filtered.length}
            <span className="text-muted-foreground/40"> / {total.length} rows</span>
          </span>
        </div>
      )}
    </div>
  );
}
