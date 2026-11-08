"use client";
/**
 * ZoomableImage: wraps an <img> with wheel-zoom, drag-pan, and fit/reset controls.
 *
 * - Wheel: zoom in/out toward cursor
 * - Drag: pan the image
 * - Double-click: reset to fit
 * - Buttons: zoom in / out / reset / fit
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, Maximize, Minimize, Expand, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ZoomableImageProps {
  src: string;
  alt: string;
  className?: string;
  /** native image dimensions, used to compute fit */
  naturalWidth?: number;
  naturalHeight?: number;
  children?: React.ReactNode;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;

export function ZoomableImage({
  src,
  alt,
  className,
  naturalWidth,
  naturalHeight,
  children,
}: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // userZoom is null when "auto-fit" is active; when user zooms, it becomes a number
  const [userZoom, setUserZoom] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 });
  const dragStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  // Observe container size to compute "fit" zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute fit zoom from state (no ref access during render)
  const nw = naturalWidth || imgNaturalSize.w || 1;
  const nh = naturalHeight || imgNaturalSize.h || 1;
  const fitZoom = containerSize.w && containerSize.h
    ? Math.min(containerSize.w / nw, containerSize.h / nh, 1)
    : 1;
  // effective zoom: user override if set, else auto-fit
  const zoom = userZoom ?? fitZoom;

  const reset = useCallback(() => {
    setUserZoom(null);
    setOffset({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

  const handleWheel = (e: React.WheelEvent) => {
    if (!imgLoaded) return;
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const direction = e.deltaY < 0 ? 1 : -1;
    const factor = 1 + direction * 0.15;
    const newZoom = clampZoom(zoom * factor);
    const ratio = newZoom / zoom;
    // zoom toward cursor: offset so that the point under cursor stays fixed
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const imgX = cursorX - centerX - offset.x;
    const imgY = cursorY - centerY - offset.y;
    setOffset({
      x: offset.x - imgX * (ratio - 1),
      y: offset.y - imgY * (ratio - 1),
    });
    setUserZoom(newZoom);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imgLoaded) return;
    // Only pan with left button when zoomed in beyond fit
    if (e.button !== 0) return;
    if (zoom <= fitZoom * 1.01 && offset.x === 0 && offset.y === 0) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({
      x: dragStart.current.offsetX + dx,
      y: dragStart.current.offsetY + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleDoubleClick = () => reset();

  const zoomIn = () => setUserZoom((z) => clampZoom((z ?? fitZoom) * 1.3));
  const zoomOut = () => setUserZoom((z) => clampZoom((z ?? fitZoom) / 1.3));
  const rotate = () => setRotation((r) => (r + 90) % 360);

  const zoomPct = Math.round((zoom / fitZoom) * 100);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden bg-muted/20 flex items-center justify-center select-none",
        isDragging ? "cursor-grabbing" : zoom > fitZoom * 1.01 ? "cursor-grab" : "cursor-default",
        className,
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      {src && (
        <div
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${rotation}deg) scale(${zoom})`,
            transformOrigin: "center center",
            position: "absolute",
            left: "50%",
            top: "50%",
            transition: isDragging ? "none" : "transform 0.15s ease-out",
          }}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="max-w-none pointer-events-none select-none"
            style={{
              imageRendering: zoom > 2 ? "pixelated" : "auto",
            }}
            onLoad={(e) => {
              setImgLoaded(true);
              const t = e.currentTarget;
              if (t.naturalWidth && t.naturalHeight) {
                setImgNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
              }
            }}
            draggable={false}
          />
          {/* Children overlays (bbox, annotation) — they inherit the same transform.
              The overlay container is sized to the image's natural dimensions,
              so percentage-positioned bboxes scale correctly with zoom. */}
          <div
            className="absolute inset-0"
            style={{
              width: nw,
              height: nh,
            }}
          >
            {children}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      {imgLoaded && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-popover/95 backdrop-blur border rounded-full shadow-lg p-1 z-10">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Zoom out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-[10px] font-mono tabular-nums px-1 min-w-[42px] text-center">
            {zoomPct}%
          </span>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Zoom in</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="w-px h-4 bg-border" />
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full" onClick={rotate}>
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Rotate 90°</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full" onClick={reset}>
                  <Maximize className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Fit / reset ( dbl-click )</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* hint */}
      {imgLoaded && zoom <= fitZoom * 1.01 && offset.x === 0 && offset.y === 0 && (
        <div className="absolute bottom-3 left-3 text-[9px] text-muted-foreground/60 bg-popover/80 backdrop-blur px-2 py-1 rounded-full pointer-events-none">
          Scroll to zoom · drag to pan · double-click to reset
        </div>
      )}
    </div>
  );
}
