"use client";
/**
 * Thumbnail with lazy decode + Intersection Observer + cache-backed status.
 *
 * Status is *derived* from the store cache + local decode state, so no
 * setState-in-effect is needed for the cache-hit path.
 */
import { useEffect, useRef, useState, memo } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { decodeImageField, type DecodeResult } from "@/lib/dataset/decode";
import { enqueueDecode, type QueueHandle } from "@/lib/dataset/imageQueue";
import { ImageOff, Loader2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThumbnailProps {
  rowId: string;
  imageValue: unknown;
  fieldName: string;
  className?: string;
  onClick?: () => void;
  showBbox?: boolean;
  bboxes?: number[];
  imgWidth?: number;
  imgHeight?: number;
  alt?: string;
}

type Status = "idle" | "loading" | "ok" | "error" | "url";

function ThumbnailImpl({
  rowId,
  imageValue,
  fieldName,
  className,
  onClick,
  showBbox = false,
  bboxes,
  imgWidth,
  imgHeight,
  alt,
}: ThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // If IntersectionObserver is unavailable (SSR / old browser), default to visible.
  const [isVisible, setIsVisible] = useState(
    typeof IntersectionObserver === "undefined",
  );
  // Local decode state — only set by the async decode callback (not synchronously in effect body)
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSource, setLocalSource] = useState<string | null>(null);
  const decodeStartedRef = useRef(false);

  const cacheKey = `${rowId}:${fieldName}`;
  const cached = useDatasetStore((s) => s.blobCache[cacheKey]);
  const cacheBlob = useDatasetStore((s) => s.cacheBlob);
  const addFailure = useDatasetStore((s) => s.addFailure);

  // Derive status from cache + local state (no setState in effect for cache path)
  const status: Status = (() => {
    if (cached) {
      if (cached.error) return cached.source ? "url" : "error";
      return "ok";
    }
    if (localError) return localSource ? "url" : "error";
    if (isVisible) return "loading";
    return "idle";
  })();

  const errorMsg = cached?.error || localError;
  const source = cached?.source || localSource;

  // Observe visibility
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setIsVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px 200px 200px 200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Decode when visible (and not yet decoded). The decode is enqueued into a
  // global concurrency-limited queue so a burst of visible thumbnails loads a
  // few at a time (FIFO) instead of opening 40+ parallel requests at once.
  useEffect(() => {
    if (!isVisible) return;
    if (cached || decodeStartedRef.current) return;
    decodeStartedRef.current = true;

    let cancelled = false;
    const handle: QueueHandle = enqueueDecode(
      async () => {
      if (cancelled) return;
      const res: DecodeResult = await decodeImageField(imageValue, fieldName);
      if (cancelled) return;
      cacheBlob(cacheKey, {
        url: res.blobUrl || "",
        format: res.format || "",
        width: res.width || 0,
        height: res.height || 0,
        size: res.sizeBytes,
        source: res.source,
        error: res.error,
      });
      if (res.error) {
        setLocalError(res.error);
        if (res.source) setLocalSource(res.source);
        if (!res.source) {
          addFailure({ rowId, field: fieldName, reason: res.error, timestamp: new Date().toISOString() });
        }
      }
    },
      cacheKey,
    );
    return () => {
      cancelled = true;
      handle.cancel();
    };
    // We intentionally depend on visibility + cache presence + the decode inputs.
    // imageValue/fieldName are stable per row+field; cacheBlob/addFailure are stable store actions.
  }, [isVisible, cached, cacheKey, imageValue, fieldName, cacheBlob, addFailure, rowId]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex items-center justify-center bg-muted/30 overflow-hidden",
        onClick && "cursor-pointer",
        className,
      )}
      onClick={onClick}
      title={alt}
    >
      {!isVisible || status === "idle" || status === "loading" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/60 gap-1.5">
          {/* Shimmer background */}
          <div className="absolute inset-0 bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40 animate-pulse" />
          <div
            className="absolute inset-0 opacity-50"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s infinite",
            }}
          />
          <Loader2 className="h-4 w-4 animate-spin relative z-10" />
        </div>
      ) : status === "ok" && cached?.url ? (
        <img
          src={cached.url}
          alt={alt || `row ${rowId}`}
          className="w-full h-full object-contain"
          loading="lazy"
          draggable={false}
        />
      ) : status === "url" && source ? (
        <a
          href={source}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/80 p-3 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="h-4 w-4" />
          <span className="text-[10px] leading-tight">Click to open URL</span>
          <span className="text-[9px] truncate max-w-full opacity-60">{source.replace(/^https?:\/\//, "").slice(0, 40)}</span>
        </a>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground/50 p-3 text-center">
          <ImageOff className="h-5 w-5" />
          <span className="text-[10px] leading-tight">{errorMsg || "No image"}</span>
        </div>
      )}
      {/* bbox overlay */}
      {showBbox && status === "ok" && cached?.url && bboxes && bboxes.length >= 4 && (
        <BboxOverlay bboxes={bboxes} imgWidth={imgWidth || cached.width || 1} imgHeight={imgHeight || cached.height || 1} />
      )}
    </div>
  );
}

function BboxOverlay({
  bboxes,
  imgWidth,
  imgHeight,
}: {
  bboxes: number[];
  imgWidth: number;
  imgHeight: number;
}) {
  // bboxes is flat [x,y,w,h, x,y,w,h, ...] in original image coordinates.
  // Coords may arrive as strings (parsed JSON / Arrow), so coerce to numbers.
  const groups: number[][] = [];
  for (let i = 0; i + 3 < bboxes.length; i += 4) {
    groups.push([
      Number(bboxes[i]),
      Number(bboxes[i + 1]),
      Number(bboxes[i + 2]),
      Number(bboxes[i + 3]),
    ]);
  }
  // The <img> uses object-contain; using % of intrinsic dimensions works
  // when the container matches the image's aspect ratio (we use aspect-[3/2]
  // matching the demo's 480x320). For other aspect ratios, the overlay is
  // still approximately correct.
  return (
    <div className="absolute inset-0 pointer-events-none">
      {groups.map((b, i) => {
        const left = (b[0] / imgWidth) * 100;
        const top = (b[1] / imgHeight) * 100;
        const w = (b[2] / imgWidth) * 100;
        const h = (b[3] / imgHeight) * 100;
        return (
          <div
            key={i}
            className="absolute border-2 border-rose-500 bg-rose-500/15 rounded-sm"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${w}%`,
              height: `${h}%`,
            }}
            title={`bbox ${i + 1}: ${b[0].toFixed(0)},${b[1].toFixed(0)} ${b[2].toFixed(0)}x${b[3].toFixed(0)}`}
          />
        );
      })}
    </div>
  );
}

export const Thumbnail = memo(ThumbnailImpl);
