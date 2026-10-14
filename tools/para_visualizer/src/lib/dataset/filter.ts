/**
 * Filtering, sorting, and search utilities
 */
import type { FilterRule, SchemaField, SortRule } from "./types";

export interface RowRef {
  /** global row index in the merged dataset */
  index: number;
  /** row id (from id field or fallback to index) */
  id: string;
  fileIndex: number;
  rowIndex: number;
  data: Record<string, unknown>;
}

/** Merge all files' rows into a flat list with row refs. */
export function flattenRows(files: { name: string; rows: Record<string, unknown>[] }[]): RowRef[] {
  const out: RowRef[] = [];
  let idx = 0;
  files.forEach((f, fi) => {
    f.rows.forEach((r, ri) => {
      const id = String(r.id ?? r._id ?? `row_${fi}_${ri}`);
      out.push({ index: idx++, id, fileIndex: fi, rowIndex: ri, data: r });
    });
  });
  return out;
}

function getField(row: Record<string, unknown>, field: string): unknown {
  return row[field];
}

function compareValues(a: unknown, op: FilterRule["op"], value: FilterRule["value"]): boolean {
  switch (op) {
    case "eq":
      return String(a) === String(value);
    case "neq":
      return String(a) !== String(value);
    case "contains":
      return String(a ?? "").toLowerCase().includes(String(value).toLowerCase());
    case "not_contains":
      return !String(a ?? "").toLowerCase().includes(String(value).toLowerCase());
    case "gt":
      return Number(a) > Number(value);
    case "lt":
      return Number(a) < Number(value);
    case "gte":
      return Number(a) >= Number(value);
    case "lte":
      return Number(a) <= Number(value);
    case "in":
      return Array.isArray(value) && value.some((v) => String(a) === String(v));
    case "not_in":
      return Array.isArray(value) && !value.some((v) => String(a) === String(v));
    case "is_empty":
      return a === null || a === undefined || a === "" || (Array.isArray(a) && a.length === 0);
    case "is_not_empty":
      return !(a === null || a === undefined || a === "" || (Array.isArray(a) && a.length === 0));
    default:
      return true;
  }
}

/** Apply filter rules to a list of rows. Rules combine via AND/OR. */
export function applyFilters(rows: RowRef[], rules: FilterRule[]): RowRef[] {
  if (rules.length === 0) return rows;
  return rows.filter((r) => {
    let result = compareValues(getField(r.data, rules[0].field), rules[0].op, rules[0].value);
    for (let i = 1; i < rules.length; i++) {
      const cur = compareValues(getField(r.data, rules[i].field), rules[i].op, rules[i].value);
      result = rules[i].combinator === "AND" ? result && cur : result || cur;
    }
    return result;
  });
}

/** Full-text search across visible text fields. */
export function applySearch(rows: RowRef[], query: string, fields: SchemaField[]): RowRef[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const textFields = fields.filter((f) => ["text", "category", "identifier", "meta", "url"].includes(f.role));
  return rows.filter((r) => {
    return textFields.some((f) => {
      const v = r.data[f.name];
      return v != null && String(v).toLowerCase().includes(q);
    });
  });
}

export function applySort(rows: RowRef[], sort: SortRule | null): RowRef[] {
  if (!sort) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a.data[sort.field];
    const bv = b.data[sort.field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1 * dir;
    if (bv == null) return -1 * dir;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

/** Get unique values for a categorical field (top N). */
export function uniqueValues(rows: RowRef[], field: string, limit = 200): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = r.data[field];
    if (v == null) continue;
    const key = String(v);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (counts.size > limit * 2) break;
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Compute numeric range. */
export function numericRange(rows: RowRef[], field: string): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  let found = false;
  for (const r of rows) {
    const v = Number(r.data[field]);
    if (Number.isFinite(v)) {
      found = true;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return found ? { min, max } : null;
}

/** Format bytes to human-readable. */
export function formatBytes(b: number): string {
  if (!b) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Format value for display. */
export function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 80 ? s.slice(0, 80) + "…" : s;
    } catch {
      return "{…}";
    }
  }
  const s = String(v);
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}
