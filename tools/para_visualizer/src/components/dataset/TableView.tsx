"use client";
/**
 * Table view: dense rows with thumbnails + sortable columns.
 */
import { useMemo, useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema } from "@/lib/dataset/hooks";
import { Thumbnail } from "./Thumbnail";
import { Highlight } from "./Highlight";
import { formatValue } from "@/lib/dataset/filter";
import { ArrowUpDown, ArrowUp, ArrowDown, Bookmark, BookmarkCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 50;

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
  const page = useDatasetStore((s) => s.page);
  const setPage = useDatasetStore((s) => s.setPage);
  const search = useDatasetStore((s) => s.search);

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

  const start = page * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card/40 gap-2">
        <div className="text-xs text-muted-foreground">
          {filtered.length} rows ·{" "}
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
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <Button size="sm" variant="ghost" className="h-6" onClick={() => setPage(page - 1)} disabled={page === 0}>
              Prev
            </Button>
            <span className="font-mono">
              {page + 1} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto custom-scroll">
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
            {pageRows.map((r) => {
              const isSel = selectedRowId === r.id;
              const bookmarked = !!bookmarks[r.id];
              const imgValue = imageField ? r.data[imageField] : undefined;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-b hover:bg-accent/30 cursor-pointer",
                    isSel && "bg-primary/10",
                  )}
                  onClick={() => setSelectedRow(r.id)}
                >
                  <td className="px-2 py-1 text-muted-foreground font-mono text-[10px]">{r.index + 1}</td>
                  <td className="px-2 py-1">
                    <Thumbnail
                      rowId={r.id}
                      imageValue={imgValue}
                      fieldName={imageField || ""}
                      className="h-12 w-16 rounded"
                    />
                  </td>
                  {cols.map((f) => (
                    <td key={f.name} className="px-2 py-1 max-w-[280px] truncate" title={formatValue(r.data[f.name])}>
                      <Highlight text={formatValue(r.data[f.name])} query={search} />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-center">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
