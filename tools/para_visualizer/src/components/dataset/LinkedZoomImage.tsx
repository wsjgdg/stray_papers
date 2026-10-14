"use client";
/**
 * LinkedZoomContainer: manages shared zoom/pan state across multiple images.
 * When one image is zoomed/panned, all others follow.
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { ZoomableImage } from "./ZoomableImage";
import { AnnotationOverlay } from "./AnnotationOverlay";
import { cn } from "@/lib/utils";
import { ZoomIn, ZoomOut, Maximize, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface LinkedZoomState {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

interface LinkedZoomImageProps {
  src: string;
  alt: string;
  naturalWidth?: number;
  naturalHeight?: number;
  /** shared state — controlled */
  state: LinkedZoomState;
  onStateChange: (s: LinkedZoomState) => void;
  /** whether this image participates in linked zoom */
  linked: boolean;
  rowId: string;
}

export function LinkedZoomImage({
  src,
  alt,
  naturalWidth,
  naturalHeight,
  state,
  onStateChange,
  linked,
  rowId,
}: LinkedZoomImageProps) {
  // When linked, we use the shared state. When unlinked, we use local state.
  const [localState, setLocalState] = useState<LinkedZoomState>(state);
  const effectiveState = linked ? state : localState;
  const setEffective = linked ? onStateChange : setLocalState;

  return (
    <div className="relative w-full aspect-[3/2] bg-muted/20 overflow-hidden rounded-lg border">
      <LinkedImageInner
        src={src}
        alt={alt}
        naturalWidth={naturalWidth}
        naturalHeight={naturalHeight}
        state={effectiveState}
        setState={setEffective}
        rowId={rowId}
      />
      {/* Annotation overlay */}
      <AnnotationOverlay
        rowId={rowId}
        imgWidth={naturalWidth || 480}
        imgHeight={naturalHeight || 320}
      />
    </div>
  );
}

function LinkedImageInner({
  src,
  alt,
  naturalWidth,
  naturalHeight,
  state,
  setState,
  rowId,
}: {
  src: string;
  alt: string;
  naturalWidth?: number;
  naturalHeight?: number;
  state: LinkedZoomState;
  setState: (s: LinkedZoomState) => void;
  rowId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nw = naturalWidth || 1;
  const nh = naturalHeight || 1;
  const fitZoom = containerSize.w && containerSize.h
    ? Math.min(containerSize.w / nw, containerSize.h / nh, 1)
    : 1;

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
    const newZoom = Math.max(0.1, Math.min(20, state.zoom * factor));
    const ratio = newZoom / state.zoom;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const imgX = cursorX - centerX - state.offsetX;
    const imgY = cursorY - centerY - state.offsetY;
    setState({
      ...state,
      zoom: newZoom,
      offsetX: state.offsetX - imgX * (ratio - 1),
      offsetY: state.offsetY - imgY * (ratio - 1),
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imgLoaded || e.button !== 0) return;
    if (state.zoom <= fitZoom * 1.01 && state.offsetX === 0 && state.offsetY === 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, offsetX: state.offsetX, offsetY: state.offsetY };
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setState({
      ...state,
      offsetX: dragStart.current.offsetX + dx,
      offsetY: dragStart.current.offsetY + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const reset = () => {
    setState({ zoom: fitZoom, offsetX: 0, offsetY: 0, rotation: 0 });
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 overflow-hidden select-none",
        isDragging ? "cursor-grabbing" : state.zoom > fitZoom * 1.01 ? "cursor-grab" : "cursor-default",
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={reset}
    >
      {src && (
        <div
          style={{
            transform: `translate(calc(-50% + ${state.offsetX}px), calc(-50% + ${state.offsetY}px)) rotate(${state.rotation}deg) scale(${state.zoom})`,
            transformOrigin: "center center",
            position: "absolute",
            left: "50%",
            top: "50%",
          }}
        >
          <img
            src={src}
            alt={alt}
            className="max-w-none pointer-events-none select-none"
            style={{ imageRendering: state.zoom > 2 ? "pixelated" : "auto" }}
            onLoad={(e) => {
              setImgLoaded(true);
              void e;
            }}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}

/**
 * LinkedZoomControls: shared zoom controls for linked images.
 */
export function LinkedZoomControls({
  state,
  setState,
  linked,
  setLinked,
  fitZoom,
}: {
  state: LinkedZoomState;
  setState: (s: LinkedZoomState) => void;
  linked: boolean;
  setLinked: (v: boolean) => void;
  fitZoom: number;
}) {
  const zoomPct = Math.round((state.zoom / fitZoom) * 100);
  const zoomIn = () => setState({ ...state, zoom: Math.min(20, state.zoom * 1.3) });
  const zoomOut = () => setState({ ...state, zoom: Math.max(0.1, state.zoom / 1.3) });
  const reset = () => setState({ zoom: fitZoom, offsetX: 0, offsetY: 0, rotation: 0 });

  return (
    <div className="flex items-center gap-1 bg-popover/95 backdrop-blur border rounded-full shadow-lg p-1">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full" onClick={zoomOut}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Zoom out</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="text-[10px] font-mono tabular-nums px-1 min-w-[42px] text-center">{zoomPct}%</span>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full" onClick={zoomIn}>
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
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full" onClick={reset}>
              <Maximize className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Reset</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="w-px h-4 bg-border" />
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant={linked ? "secondary" : "ghost"}
              className="h-7 px-2 rounded-full text-[10px] gap-1"
              onClick={() => setLinked(!linked)}
            >
              {linked ? <Link2 className="h-3 w-3 text-emerald-500" /> : <Link2Off className="h-3 w-3" />}
              {linked ? "Linked" : "Unlinked"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {linked ? "Images zoom together (click to unlink)" : "Images zoom independently (click to link)"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
