/**
 * Dataset type definitions
 */
export type FieldRole =
  | "image"
  | "url"
  | "text"
  | "category"
  | "numeric"
  | "datetime"
  | "identifier"
  | "meta"
  | "unknown";

export interface SchemaField {
  name: string;
  type: string;
  nullable: boolean;
  role: FieldRole;
  /** UI visibility */
  visible?: boolean;
}

export interface DatasetFile {
  name: string;
  split?: string;
  sizeBytes: number;
  rowsCount: number;
  schema: SchemaField[];
  rows: Record<string, unknown>[];
}

export interface LoadedDataset {
  name: string;
  description?: string;
  createdAt?: string;
  files: DatasetFile[];
}

export type ViewMode = "grid" | "table" | "detail" | "compare" | "stats";

/** Logical filter rules applied to rows */
export type FilterOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "in"
  | "not_in"
  | "is_empty"
  | "is_not_empty";

export interface FilterRule {
  id: string;
  field: string;
  op: FilterOp;
  value: string | number | (string | number)[];
  combinator: "AND" | "OR";
}

export interface SortRule {
  field: string;
  direction: "asc" | "desc";
}

export interface Bookmark {
  rowId: string;
  note?: string;
  createdAt: string;
}

export interface DecodeFailure {
  rowId: string;
  field: string;
  reason: string;
  timestamp: string;
}

export interface ImageInfo {
  format: string;
  width: number;
  height: number;
  sizeBytes: number;
  source?: string;
}
