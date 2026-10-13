"use client";
/**
 * Filter panel: build dynamic filter rules with AND/OR combinators.
 */
import { useDatasetStore } from "@/lib/dataset/store";
import { useFilteredRows, useSchema, useActiveRows } from "@/lib/dataset/hooks";
import { uniqueValues, numericRange } from "@/lib/dataset/filter";
import type { FilterOp, FilterRule } from "@/lib/dataset/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, FilterX, Sparkles, Equal, EqualNot, ArrowDownWideNarrow, ArrowUpWideNarrow, Search } from "lucide-react";
import { useMemo } from "react";

const OPS_BY_ROLE: Record<string, { op: FilterOp; label: string; icon?: React.ReactNode }[]> = {
  text: [
    { op: "contains", label: "contains", icon: <Search className="h-3 w-3" /> },
    { op: "not_contains", label: "not contains" },
    { op: "eq", label: "equals", icon: <Equal className="h-3 w-3" /> },
    { op: "neq", label: "not equals", icon: <EqualNot className="h-3 w-3" /> },
    { op: "is_empty", label: "is empty" },
    { op: "is_not_empty", label: "is not empty" },
  ],
  category: [
    { op: "eq", label: "is", icon: <Equal className="h-3 w-3" /> },
    { op: "neq", label: "is not", icon: <EqualNot className="h-3 w-3" /> },
    { op: "in", label: "in set" },
    { op: "not_in", label: "not in set" },
    { op: "is_empty", label: "is empty" },
    { op: "is_not_empty", label: "is not empty" },
  ],
  numeric: [
    { op: "eq", label: "=", icon: <Equal className="h-3 w-3" /> },
    { op: "neq", label: "≠", icon: <EqualNot className="h-3 w-3" /> },
    { op: "gt", label: ">", icon: <ArrowUpWideNarrow className="h-3 w-3" /> },
    { op: "gte", label: "≥" },
    { op: "lt", label: "<", icon: <ArrowDownWideNarrow className="h-3 w-3" /> },
    { op: "lte", label: "≤" },
    { op: "is_empty", label: "is empty" },
  ],
  identifier: [
    { op: "eq", label: "equals", icon: <Equal className="h-3 w-3" /> },
    { op: "contains", label: "contains" },
  ],
  url: [
    { op: "contains", label: "contains" },
    { op: "is_empty", label: "is empty" },
    { op: "is_not_empty", label: "is not empty" },
  ],
  datetime: [
    { op: "eq", label: "on" },
    { op: "gt", label: "after" },
    { op: "lt", label: "before" },
    { op: "is_empty", label: "is empty" },
  ],
};

export function FilterPanel() {
  const open = useDatasetStore((s) => s.showFilterPanel);
  const setOpen = useDatasetStore((s) => s.setShowFilterPanel);
  const schema = useSchema();
  const rules = useDatasetStore((s) => s.filterRules);
  const setFilterRules = useDatasetStore((s) => s.setFilterRules);
  const rows = useActiveRows();
  const filtered = useFilteredRows();

  const filterableFields = useMemo(
    () => schema.filter((f) => !["image", "meta"].includes(f.role)),
    [schema],
  );

  const addRule = (field?: string) => {
    const f = field || filterableFields[0]?.name || "";
    const role = schema.find((s) => s.name === f)?.role || "text";
    const ops = OPS_BY_ROLE[role] || OPS_BY_ROLE.text;
    const newRule: FilterRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      field: f,
      op: ops[0].op,
      value: "",
      combinator: rules.length === 0 ? "AND" : "AND",
    };
    setFilterRules([...rules, newRule]);
  };

  const updateRule = (id: string, patch: Partial<FilterRule>) => {
    setFilterRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRule = (id: string) => {
    setFilterRules(rules.filter((r) => r.id !== id));
  };

  const clearAll = () => setFilterRules([]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:w-[480px] sm:max-w-[480px] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4" />
            Filter Builder
          </SheetTitle>
          <SheetDescription className="text-xs">
            Combine rules with AND/OR. <strong>{filtered.length}</strong> of {rows.length} rows match.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto custom-scroll p-3 space-y-2">
          {rules.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">
              <FilterX className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>No filter rules yet.</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Add a rule below to start filtering.
              </p>
            </div>
          )}

          {rules.map((r, i) => {
            const field = schema.find((s) => s.name === r.field);
            const role = field?.role || "text";
            const ops = OPS_BY_ROLE[role] || OPS_BY_ROLE.text;
            const isUnary = r.op === "is_empty" || r.op === "is_not_empty";
            const cats = role === "category" ? uniqueValues(rows, r.field, 100) : [];
            const range = role === "numeric" ? numericRange(rows, r.field) : null;

            return (
              <div key={r.id} className="rounded-md border bg-card p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-muted-foreground">
                    #{i + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    {i > 0 && (
                      <Select
                        value={r.combinator}
                        onValueChange={(v: "AND" | "OR") => updateRule(r.id, { combinator: v })}
                      >
                        <SelectTrigger className="h-6 w-16 text-[10px] px-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">AND</SelectItem>
                          <SelectItem value="OR">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <button
                      onClick={() => removeRule(r.id)}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-rose-500"
                      title="Remove rule"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Select value={r.field} onValueChange={(v) => updateRule(r.id, { field: v, op: OPS_BY_ROLE[schema.find((s) => s.name === v)?.role || "text"][0].op })}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                      {filterableFields.map((f) => (
                        <SelectItem key={f.name} value={f.name}>
                          {f.name} <span className="text-muted-foreground/60 ml-1">[{f.role}]</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={r.op} onValueChange={(v: FilterOp) => updateRule(r.id, { op: v })}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Op" />
                    </SelectTrigger>
                    <SelectContent>
                      {ops.map((o) => (
                        <SelectItem key={o.op} value={o.op}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!isUnary && (
                  role === "category" && cats.length > 0 ? (
                    <Select
                      value={String(r.value)}
                      onValueChange={(v) => updateRule(r.id, { value: v })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Pick value" />
                      </SelectTrigger>
                      <SelectContent>
                        {cats.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.value} <span className="text-muted-foreground/60 ml-1">({c.count})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : role === "numeric" && range ? (
                    <Input
                      type="number"
                      value={r.value === "" ? "" : String(r.value)}
                      onChange={(e) => updateRule(r.id, { value: e.target.value ? Number(e.target.value) : "" })}
                      placeholder={`${range.min} ~ ${range.max}`}
                      className="h-7 text-xs"
                    />
                  ) : (
                    <Input
                      value={String(r.value)}
                      onChange={(e) => updateRule(r.id, { value: e.target.value })}
                      placeholder="Value…"
                      className="h-7 text-xs"
                    />
                  )
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              <Search className="inline h-3 w-3 mr-1" />
              {filtered.length} / {rows.length} rows match
            </span>
            {rules.length > 0 && (
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => addRule()}>
              <Plus className="h-3.5 w-3.5" />
              Add rule
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
