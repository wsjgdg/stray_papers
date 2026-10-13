"use client";
/**
 * Keyboard shortcuts cheatsheet overlay.
 * Press `?` to toggle.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

interface ShortcutGroup {
  group: string;
  items: { keys: string[]; label: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    group: "Navigation",
    items: [
      { keys: ["j", "/"], label: "Next row" },
      { keys: ["k", "/"], label: "Previous row" },
      { keys: ["↑", "↓"], label: "Navigate rows (arrow keys)" },
      { keys: ["1"], label: "Grid view" },
      { keys: ["2"], label: "Table view" },
      { keys: ["3"], label: "Detail view" },
      { keys: ["4"], label: "Compare view" },
      { keys: ["5"], label: "Stats view" },
      { keys: ["⌘", "K"], label: "Command palette" },
      { keys: ["⌘", "G"], label: "Jump to row number" },
    ],
  },
  {
    group: "Actions",
    items: [
      { keys: ["⌘", "O"], label: "Open files" },
      { keys: ["⌘", "F"], label: "Open filter builder" },
      { keys: ["⌘", "E"], label: "Export" },
      { keys: ["⌘", "A"], label: "Select all filtered rows" },
      { keys: ["b"], label: "Toggle bookmark on current row" },
      { keys: ["x"], label: "Clear multi-selection" },
      { keys: ["/"], label: "Focus search box" },
    ],
  },
  {
    group: "Detail view (image)",
    items: [
      { keys: ["scroll"], label: "Zoom in/out (toward cursor)" },
      { keys: ["drag"], label: "Pan the image" },
      { keys: ["dbl-click"], label: "Fit / reset zoom" },
    ],
  },
  {
    group: "Global",
    items: [
      { keys: ["Esc"], label: "Close dialog / deselect row (layered)" },
      { keys: ["?"], label: "Toggle this cheatsheet" },
    ],
  },
];

export function ShortcutsCheatsheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't trigger when typing
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (isTyping) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">?</kbd> anytime to toggle this panel.
          </DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4 mt-2">
          {GROUPS.map((g) => (
            <div key={g.group}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {g.group}
              </h3>
              <div className="space-y-1.5">
                {g.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground/80">{item.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border bg-muted/60 text-[10px] font-mono text-foreground/70"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
