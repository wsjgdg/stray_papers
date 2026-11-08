"use client";
/**
 * HoverPreview: shows a magnified thumbnail popup when hovering over a grid card.
 * Parent controls visibility via a delayed timer; this component just renders
 * the portal popup at the given position.
 */
import { memo } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { Thumbnail } from "./Thumbnail";
import { formatValue } from "@/lib/dataset/filter";
import { Highlight } from "./Highlight";
import type { RowRef } from "@/lib/dataset/filter";
import { createPortal } from "react-dom";

interface HoverPreviewProps {
  row: RowRef;
  imageField: string | null;
  search: string;
  labelField: string | null;
  visible: boolean;
  pos: { x: number; y: number };
}

const PREVIEW_WIDTH = 320;

function HoverPreviewImpl({ row, imageField, search, labelField, visible, pos }: HoverPreviewProps) {
  const showBboxOverlay = useDatasetStore((s) => s.showBboxOverlay);
  const bboxes = row.data["extra_input_figure_bboxes"];
  const w = row.data["image_width"];
  const h = row.data["image_height"];

  if (typeof document === "undefined") return null;
  if (!visible) return null;

  return createPortal(
    <div
      className="fixed z-50 pointer-events-none rounded-lg border bg-popover shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
      style={{
        left: pos.x,
        top: pos.y,
        width: PREVIEW_WIDTH,
      }}
    >
      <Thumbnail
        rowId={row.id}
        imageValue={imageField ? row.data[imageField] : undefined}
        fieldName={imageField || ""}
        className="w-full aspect-[3/2]"
        showBbox={showBboxOverlay}
        bboxes={Array.isArray(bboxes) ? (bboxes as number[]).slice(0, 4) : undefined}
        imgWidth={typeof w === "number" ? w : undefined}
        imgHeight={typeof h === "number" ? h : undefined}
        alt={`Preview of row ${row.index + 1}`}
      />
      <div className="p-2 border-t bg-card">
        <div className="text-[10px] font-mono text-muted-foreground mb-0.5">
          #{row.index + 1} · {row.id}
        </div>
        {labelField && (
          <p className="text-[11px] line-clamp-2 leading-tight">
            <Highlight text={formatValue(row.data[labelField])} query={search} />
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

export const HoverPreview = memo(HoverPreviewImpl);

export const PREVIEW_WIDTH_VALUE = PREVIEW_WIDTH;
export const PREVIEW_HEIGHT_VALUE = 260;
export const HOVER_DELAY = 400;
