"use client";
/**
 * Table view: dense rows with thumbnails + sortable columns.
 * Uses @tanstack/react-virtual for row virtualization.
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema } from "@/lib/dataset/hooks";
import { Thumbnail } from "./Thumbnail";
import { Highlight } from "./Highlight";
import { formatValue } from "@/lib/dataset/filter";
import { ArrowUpDown, ArrowUp, ArrowDown, Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROW_HEIGHT = 52;

export function TableView() {
  const filtered = useFilteredRows();
  const schema = useSchema();
  const imageField = useDatasetStore((s) => s.imageField);
  const sort = useDatasetStore((s) => s.sort);
  const setSort = useDatasetStore((s) => s.setSort);
  const hiddenFields = useDatasetStore((s) => s.hiddenFields);
  const selectedRowId = useDatasetStore((s) => s.selectedRowId);
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const bookmarks = useDatasetStore((s) => s.bookmarks);
  const toggleBookmark = useDatasetStore((s) => s.toggleBookmark);
  const search = useDatasetStore((s) => s.search);

  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleFields = useMemo(() => {
    return schema.filter((f) => !hiddenFields.has(f.name) && f.name !== imageField);
  }, [schema, hiddenFields, imageField]);

  const [columnMode, setColumnMode] = useState<"all" | "smart">("smart");
  const smartFields = useMemo(() => {
    const priorityRoles = ["identifier", "category", "numeric", "text"];
    const picked: typeof visibleFields = [];
    for (const r of priorityRoles) {
      for (const f of visibleFields) {
        if (f.role === r && !picked.find((p) => p.name === f.name)) {
          picked.push(f);
          if (picked.length >= 5) break;
        }
      }
      if (picked.length >= 5) break;
    }
    return picked.length > 0 ? picked : visibleFields.slice(0, 5);
  }, [visibleFields]);

  const cols = columnMode === "smart" ? smartFields : visibleFields.slice(0, 8);

  const toggleSort = (field: string) => {
    if (sort?.field !== field) setSort({ field, direction: "asc" });
    else if (sort.direction === "asc") setSort({ field, direction: "desc" });
    else setSort(null);
  };

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card/40 gap-2">
        <div className="text-xs text-muted-foreground">
          {filtered.length} rows · virtual scroll ·{" "}
          <Select value={columnMode} onValueChange={(v: "all" | "smart") => setColumnMode(v)}>
            <SelectTrigger className="inline-flex h-6 w-auto text-xs ml-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="smart">Smart columns</SelectItem>
              <SelectItem value="all">All visible columns</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto custom-scroll">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
            <tr>
              <th className="text-left px-2 py-1.5 border-b font-medium text-muted-foreground w-12">#</th>
              <th className="text-left px-2 py-1.5 border-b font-medium text-muted-foreground w-24">Image</th>
              {cols.map((f) => (
                <th
                  key={f.name}
                  className="text-left px-2 py-1.5 border-b font-medium text-muted-foreground cursor-pointer hover:bg-accent/40 whitespace-nowrap"
                  onClick={() => toggleSort(f.name)}
                >
                  <div className="flex items-center gap-1">
                    {f.name}
                    {sort?.field === f.name ? (
                      sort.direction === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </div>
                </th>
              ))}
              <th className="text-left px-2 py-1.5 border-b font-medium text-muted-foreground w-10">★</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 3} className="text-center py-12 text-muted-foreground">
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              <tr style={{ height: rowVirtualizer.getTotalSize() }}>
                <td colSpan={cols.length + 3} style={{ padding: 0, border: "none", position: "relative" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: "100%" }}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const r = filtered[virtualRow.index];
                      const isSel = selectedRowId === r.id;
                      const bookmarked = !!bookmarks[r.id];
                      const imgValue = imageField ? r.data[imageField] : undefined;
                      return (
                        <div
                          key={r.id}
                          className={cn(
                            "flex items-center border-b hover:bg-accent/30 cursor-pointer transition-colors",
                            isSel && "bg-primary/10",
                          )}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: `${ROW_HEIGHT}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          onClick={() => setSelectedRow(r.id)}
                        >
                          <div className="px-2 py-1 text-muted-foreground font-mono text-[10px] w-12 shrink-0">
                            {r.index + 1}
                          </div>
                          <div className="px-2 py-1 w-24 shrink-0">
                            <Thumbnail
                              rowId={r.id}
                              imageValue={imgValue}
                              fieldName={imageField || ""}
                              className="h-9 w-12 rounded"
                            />
                          </div>
                          {cols.map((f) => (
                            <div
                              key={f.name}
                              className="px-2 py-1 max-w-[280px] truncate text-xs"
                              title={formatValue(r.data[f.name])}
                            >
                              <Highlight text={formatValue(r.data[f.name])} query={search} />
                            </div>
                          ))}
                          <div className="px-2 py-1 text-center w-10 shrink-0 ml-auto">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBookmark(r.id);
                              }}
                              className={cn(
                                "p-1 rounded hover:bg-accent inline-flex",
                                bookmarked ? "text-amber-500" : "text-muted-foreground/50",
                              )}
                            >
                              {bookmarked ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
