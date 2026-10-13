"use client";
/**
 * Annotation overlay: allows users to draw labeled bounding boxes on images.
 * Used in DetailView. Boxes are stored normalized (0-1) to be resolution-independent.
 */
import { useMemo, useRef, useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import type { Annotation } from "@/lib/dataset/persist";
import { Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COLORS = ["#22d3ee", "#ef4444", "#10b981", "#f59e0b", "#a855f7", "#ec4899"];
// Stable empty array to avoid reference changes causing re-renders
const EMPTY: Annotation[] = [];

interface DrawingState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  active: boolean;
}

export function AnnotationOverlay({
  rowId,
  imgWidth,
  imgHeight,
  className,
}: {
  rowId: string;
  imgWidth: number;
  imgHeight: number;
  className?: string;
}) {
  // Select the stable annotations map, then derive the per-row list via useMemo
  // to avoid returning a new [] reference on every render (which causes
  // useSyncExternalStore infinite loops).
  const annotationsMap = useDatasetStore((s) => s.annotations);
  const annotations = useMemo(
    () => annotationsMap[rowId] || EMPTY,
    [annotationsMap, rowId],
  );
  const annotationMode = useDatasetStore((s) => s.annotationMode);
  const annotationColor = useDatasetStore((s) => s.annotationColor);
  const setAnnotationColor = useDatasetStore((s) => s.setAnnotationColor);
  const addAnnotation = useDatasetStore((s) => s.addAnnotation);
  const removeAnnotation = useDatasetStore((s) => s.removeAnnotation);
  const clearAnnotations = useDatasetStore((s) => s.clearAnnotations);
  const showAnnotations = useDatasetStore((s) => s.showAnnotations);

  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [pendingLabel, setPendingLabel] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
  } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!annotationMode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDrawing({ startX: x, startY: y, endX: x, endY: y, active: true });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing?.active || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDrawing({ ...drawing, endX: x, endY: y });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drawing?.active) return;
    const x = Math.min(drawing.startX, drawing.endX);
    const y = Math.min(drawing.startY, drawing.endY);
    const w = Math.abs(drawing.endX - drawing.startX);
    const h = Math.abs(drawing.endY - drawing.startY);
    setDrawing(null);
    if (w < 0.01 || h < 0.01) return; // ignore tiny clicks
    setPendingLabel({
      x,
      y,
      w,
      h,
      label: "",
    });
    void e;
  };

  const commitAnnotation = () => {
    if (!pendingLabel) return;
    const ann: Annotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      rowId,
      x: pendingLabel.x,
      y: pendingLabel.y,
      w: pendingLabel.w,
      h: pendingLabel.h,
      label: pendingLabel.label || "unnamed",
      color: annotationColor,
      createdAt: new Date().toISOString(),
    };
    addAnnotation(ann);
    setPendingLabel(null);
  };

  if (!showAnnotations && !annotationMode) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute inset-0 pointer-events-none",
        annotationMode && "pointer-events-auto cursor-crosshair",
        className,
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => drawing && setDrawing(null)}
    >
      {/* existing annotations */}
      {annotations.map((a) => (
        <div
          key={a.id}
          className="absolute group/ann pointer-events-auto"
          style={{
            left: `${a.x * 100}%`,
            top: `${a.y * 100}%`,
            width: `${a.w * 100}%`,
            height: `${a.h * 100}%`,
          }}
        >
          <div
            className="w-full h-full border-2 rounded-sm"
            style={{
              borderColor: a.color,
              backgroundColor: `${a.color}22`,
            }}
          />
          <div
            className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-medium text-white whitespace-nowrap"
            style={{ backgroundColor: a.color }}
          >
            {a.label}
          </div>
          {annotationMode && (
            <button
              onClick={() => removeAnnotation(rowId, a.id)}
              className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover/ann:opacity-100 transition-opacity"
              title="Delete annotation"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      ))}

      {/* in-progress drawing */}
      {drawing?.active && (
        <div
          className="absolute border-2 border-dashed border-cyan-500 bg-cyan-500/15 rounded-sm pointer-events-none"
          style={{
            left: `${Math.min(drawing.startX, drawing.endX) * 100}%`,
            top: `${Math.min(drawing.startY, drawing.endY) * 100}%`,
            width: `${Math.abs(drawing.endX - drawing.startX) * 100}%`,
            height: `${Math.abs(drawing.endY - drawing.startY) * 100}%`,
          }}
        />
      )}

      {/* pending label popover */}
      {pendingLabel && (
        <div
          className="absolute z-50 pointer-events-auto"
          style={{
            left: `${(pendingLabel.x + pendingLabel.w) * 100}%`,
            top: `${pendingLabel.y * 100}%`,
          }}
        >
          <div className="bg-popover border rounded-md shadow-lg p-2 w-56 -translate-y-full mt-[-8px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              New annotation
            </div>
            <Input
              autoFocus
              value={pendingLabel.label}
              onChange={(e) => setPendingLabel({ ...pendingLabel, label: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAnnotation();
                if (e.key === "Escape") setPendingLabel(null);
              }}
              placeholder="Label (e.g. 'title bar')"
              className="h-7 text-xs mb-2"
            />
            <div className="flex items-center gap-1 mb-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setAnnotationColor(c)}
                  className={cn(
                    "w-4 h-4 rounded-full border-2",
                    annotationColor === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center justify-end gap-1">
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setPendingLabel(null)}>
                Cancel
              </Button>
              <Button size="sm" className="h-6 text-xs" onClick={commitAnnotation}>
                <Check className="h-3 w-3" />
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* annotation mode toolbar */}
      {annotationMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-popover/95 backdrop-blur border rounded-full shadow-md px-2 py-1 pointer-events-auto">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
            Annotate
          </span>
          <div className="flex items-center gap-0.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setAnnotationColor(c)}
                className={cn(
                  "w-4 h-4 rounded-full border-2 transition-transform hover:scale-110",
                  annotationColor === c ? "border-foreground scale-110" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="w-px h-4 bg-border" />
          <span className="text-[10px] text-muted-foreground px-1">
            {annotations.length} ann
          </span>
          {annotations.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[10px] text-rose-600 hover:text-rose-700"
              onClick={() => clearAnnotations(rowId)}
              title="Clear all annotations on this row"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
