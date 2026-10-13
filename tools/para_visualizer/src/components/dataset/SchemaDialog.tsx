"use client";
/**
 * Schema dialog: confirm/override field roles and primary image field.
 */
import { useDatasetStore } from "@/lib/dataset/store";
import { useSchema } from "@/lib/dataset/hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, Image as ImageIcon, Layers, Sparkles } from "lucide-react";
import { useState } from "react";
import type { FieldRole } from "@/lib/dataset/types";

const ROLE_OPTIONS: FieldRole[] = [
  "image",
  "url",
  "text",
  "category",
  "numeric",
  "datetime",
  "identifier",
  "meta",
  "unknown",
];

export function SchemaDialog() {
  const open = useDatasetStore((s) => s.showSchemaDialog);
  const setOpen = useDatasetStore((s) => s.setShowSchemaDialog);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[680px]">
        {/* Only mount the working-copy subtree when open so initial state is computed via lazy useState initializer */}
        {open ? <SchemaDialogBody onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SchemaDialogBody({ onDone }: { onDone: () => void }) {
  const schema = useSchema();
  const imageField = useDatasetStore((s) => s.imageField);
  const dataset = useDatasetStore((s) => s.dataset);

  // Lazy initial state: snapshot the current store values once at mount.
  const [localRoles, setLocalRoles] = useState<Record<string, FieldRole>>(() => {
    const r: Record<string, FieldRole> = {};
    schema.forEach((f) => (r[f.name] = f.role));
    return r;
  });
  const [localImage, setLocalImage] = useState<string | null>(() => imageField);

  if (!dataset) return null;

  const apply = () => {
    useDatasetStore.setState((s) => ({
      fieldRoles: { ...localRoles } as typeof s.fieldRoles,
      imageField: localImage,
      // invalidate blob cache since image field may have changed
      blobCache: localImage !== imageField ? {} : s.blobCache,
    }));
    onDone();
  };

  const reset = () => {
    const r: Record<string, FieldRole> = {};
    schema.forEach((f) => (r[f.name] = f.role));
    setLocalRoles(r);
    setLocalImage(schema.find((f) => f.role === "image")?.name || schema[0]?.name || null);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Field Mapping
        </DialogTitle>
        <DialogDescription>
          Confirm which fields are images, URLs, text, categories, or numeric. The current primary image field is highlighted.
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-md border max-h-[55vh] overflow-y-auto custom-scroll">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
            <tr className="text-left text-muted-foreground border-b">
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Detected</th>
              <th className="px-3 py-2 font-medium">Override</th>
              <th className="px-3 py-2 font-medium text-center">Image</th>
            </tr>
          </thead>
          <tbody>
            {schema.map((f) => {
              const role = localRoles[f.name] || f.role;
              const isImage = localImage === f.name;
              return (
                <tr key={f.name} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-3 py-2">
                    <div className="font-mono font-medium">{f.name}</div>
                    <div className="text-[10px] text-muted-foreground/70">{f.type}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">{f.role}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={role}
                      onValueChange={(v: FieldRole) =>
                        setLocalRoles({ ...localRoles, [f.name]: v })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setLocalImage(isImage ? null : f.name)}
                      className={`inline-flex items-center justify-center h-6 w-6 rounded border transition-colors ${
                        isImage
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border hover:bg-accent"
                      }`}
                      title={isImage ? "Primary image field" : "Set as primary image"}
                    >
                      {isImage ? <Check className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={reset} className="text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          Auto-detect
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={apply}>
          <Check className="h-4 w-4" />
          Apply mapping
        </Button>
      </DialogFooter>
    </>
  );
}
