"use client";
/**
 * Loading skeleton shown while a dataset is being parsed/loaded.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, FileBox } from "lucide-react";

export function LoadingSkeleton() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* header skeleton */}
      <div className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="flex items-center gap-2 px-3 h-12">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-violet-500/60 to-fuchsia-500/60 animate-pulse" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2 w-24" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </div>
      </div>

      {/* main loading area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white mx-auto shadow-lg">
              <FileBox className="h-8 w-8" />
            </div>
            <Loader2 className="absolute -bottom-1 -right-1 h-6 w-6 animate-spin text-primary bg-card rounded-full p-0.5" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Loading dataset…</p>
            <p className="text-xs text-muted-foreground">Parsing schema and preparing rows</p>
          </div>
        </div>
      </div>

      {/* status bar skeleton */}
      <div className="border-t bg-card/40 px-3 py-1.5 flex items-center gap-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

/**
 * Grid skeleton — shown inside the grid view area while rows are being prepared.
 */
export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid gap-3 p-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card overflow-hidden">
          <Skeleton className="aspect-[3/2] w-full" />
          <div className="p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-2 w-8" />
              <Skeleton className="h-3 w-3" />
            </div>
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
