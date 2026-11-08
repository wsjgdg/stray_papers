"use client";
/**
 * Bookmarks side panel: lists saved bookmarks with quick-jump.
 */
import { useMemo, useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useActiveRows, useSchema } from "@/lib/dataset/hooks";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bookmark, BookmarkX, Search, ExternalLink, ArrowRight, Trash2 } from "lucide-react";
import { formatValue } from "@/lib/dataset/filter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function BookmarkPanel() {
  const open = useDatasetStore((s) => s.showBookmarkPanel);
  const setOpen = useDatasetStore((s) => s.setShowBookmarkPanel);
  const bookmarks = useDatasetStore((s) => s.bookmarks);
  const removeBookmark = useDatasetStore((s) => s.removeBookmark);
  const toggleBookmark = useDatasetStore((s) => s.toggleBookmark);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const rows = useActiveRows();
  const schema = useSchema();
  const [search, setSearch] = useState("");

  const labelField = useMemo(
    () => schema.find((f) => f.role === "text" && f.name !== "image")?.name,
    [schema],
  );

  const bookmarkRows = useMemo(() => {
    const map = new Map(rows.map((r) => [r.id, r]));
    return Object.values(bookmarks)
      .map((b) => ({ bookmark: b, row: map.get(b.rowId) }))
      .filter((x) => x.row)
      .filter((x) => {
        if (!search) return true;
        const q = search.toLowerCase();
        const r = x.row!;
        return (
          r.id.toLowerCase().includes(q) ||
          String(r.data[labelField || ""] || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.bookmark.createdAt.localeCompare(a.bookmark.createdAt));
  }, [bookmarks, rows, labelField, search]);

  const handleJump = (id: string) => {
    setSelectedRow(id);
    setOpen(false);
    toast.success("Jumped to bookmarked row");
  };

  const handleClearAll = () => {
    if (!confirm(`Remove all ${Object.keys(bookmarks).length} bookmarks?`)) return;
    Object.keys(bookmarks).forEach((id) => toggleBookmark(id));
    toast.success("All bookmarks cleared");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-full sm:w-[420px] sm:max-w-[420px] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Bookmark className="h-4 w-4 text-amber-500" />
            Bookmarks
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">
              {Object.keys(bookmarks).length}
            </span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Saved rows for quick access. Bookmarks persist across reloads.
          </SheetDescription>
        </SheetHeader>

        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bookmarks…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll">
          {bookmarkRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              <BookmarkX className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No bookmarks yet.</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Click the bookmark icon on any row to save it here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {bookmarkRows.map(({ bookmark, row }) => (
                <div
                  key={bookmark.rowId}
                  className="group px-3 py-2 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleJump(bookmark.rowId)}
                      className="flex-1 flex flex-col items-start min-w-0 text-left"
                    >
                      <span className="text-xs font-medium truncate">
                        {formatValue(row!.data[labelField || "id"])}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70 font-mono truncate">
                        #{row!.index + 1} · {row!.id}
                      </span>
                      {bookmark.note && (
                        <span className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 line-clamp-2">
                          {bookmark.note}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handleJump(bookmark.rowId)}
                      className="p-1 rounded hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Jump to row"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeBookmark(bookmark.rowId)}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove bookmark"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {Object.keys(bookmarks).length > 0 && (
          <SheetFooter className="border-t p-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearAll}
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
            >
              <Trash2 className="h-3 w-3" />
              Clear all bookmarks
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
