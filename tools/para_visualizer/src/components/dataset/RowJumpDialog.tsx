"use client";
/**
 * Row jump dialog (Cmd+G): jump to a specific row number.
 */
import { useEffect, useState } from "react";
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows } from "@/lib/dataset/hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRightToLine } from "lucide-react";
import { toast } from "sonner";

export function RowJumpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const filtered = useFilteredRows();
  const setSelectedRow = useDatasetStore((s) => s.setSelectedRow);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        onOpenChange(true);
      }
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const handleJump = () => {
    const num = parseInt(value, 10);
    if (Number.isNaN(num) || num < 1 || num > filtered.length) {
      toast.error(`Invalid row number (1–${filtered.length})`);
      return;
    }
    const row = filtered[num - 1];
    if (row) {
      setSelectedRow(row.id);
      toast.success(`Jumped to row #${num}`);
      onOpenChange(false);
      setValue("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ArrowRightToLine className="h-4 w-4" />
            Jump to row
          </DialogTitle>
          <DialogDescription className="text-xs">
            Enter a row number (1–{filtered.length}) to jump to.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            type="number"
            min={1}
            max={filtered.length}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJump();
            }}
            placeholder={`1–${filtered.length}`}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleJump} disabled={!value}>
            Go
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Tip: press <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">⌘G</kbd> anytime to open this dialog.
        </p>
      </DialogContent>
    </Dialog>
  );
}
