/**
 * File parsers for the dataset browser.
 *
 * Supported formats:
 *  - .json (our demo format: { name, files: [{ name, schema, rows }] })
 *  - .arrow / .feather / .ipc  (Apache Arrow IPC, parsed client-side via apache-arrow)
 *  - .csv / .tsv  (parsed via PapaParse)
 *  - .parquet (parsed via parquet-wasm, browser-side)
 */
import * as arrow from "apache-arrow";
import Papa from "papaparse";
import type { DatasetFile, LoadedDataset, SchemaField } from "./types";
import { detectFieldRole } from "./decode";

function inferArrowType(type: arrow.DataType): string {
  if (type instanceof arrow.Int32 || type instanceof arrow.Int) return "int";
  if (type instanceof arrow.Int64) return "int";
  if (type instanceof arrow.Uint32 || type instanceof arrow.Uint8 || type instanceof arrow.Uint16 || type instanceof arrow.Uint64) return "int";
  if (type instanceof arrow.Float || type instanceof arrow.Float32 || type instanceof arrow.Float64) return "float";
  if (type instanceof arrow.Utf8) return "string";
  if (type instanceof arrow.Binary) return "bytes";
  if (type instanceof arrow.Bool) return "bool";
  if (type instanceof arrow.DateDay || type instanceof arrow.DateMillisecond) return "datetime";
  if (type instanceof arrow.List) return `list<${inferArrowType(type.valueType)}>`;
  if (type instanceof arrow.Struct) return "struct";
  if (type instanceof arrow.Dictionary) return inferArrowType(type.dictionary);
  return "unknown";
}

function arrowValueToJS(v: unknown): unknown {
  // apache-arrow returns Vector wrappers for nested types; unwrap to plain JS
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    if (Array.isArray(v)) return v.map(arrowValueToJS);
    // Vector-like
    if ("toArray" in v && typeof (v as { toArray: () => unknown[] }).toArray === "function") {
      try {
        return (v as { toArray: () => unknown[] }).toArray().map(arrowValueToJS);
      } catch {
        return v;
      }
    }
  }
  return v;
}

async function parseArrowFile(file: File): Promise<DatasetFile> {
  const buf = await file.arrayBuffer();
  const table = arrow.tableFromIPC(new Uint8Array(buf));
  const schema: SchemaField[] = [];
  for (const f of table.schema.fields) {
    const typeStr = inferArrowType(f.type);
    schema.push({
      name: f.name,
      type: typeStr,
      nullable: f.nullable,
      role: "unknown", // will refine below
    });
  }
  // Convert rows to plain objects
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const row: Record<string, unknown> = {};
    for (let j = 0; j < table.numCols; j++) {
      const col = table.getChildAt(j);
      const v = col?.get(i);
      row[schema[j].name] = arrowValueToJS(v);
    }
    rows.push(row);
  }
  // refine roles with sample
  for (let j = 0; j < schema.length; j++) {
    const sample = rows[0]?.[schema[j].name];
    schema[j].role = detectFieldRole(schema[j], sample);
  }
  return {
    name: file.name,
    sizeBytes: file.size,
    rowsCount: table.numRows,
    schema,
    rows,
  };
}

async function parseJsonFile(file: File): Promise<LoadedDataset> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  // Format 1: our demo format
  if (parsed.files && Array.isArray(parsed.files)) {
    return {
      name: parsed.name || file.name,
      description: parsed.description,
      createdAt: parsed.created_at,
      files: parsed.files.map((f: any) => ({
        name: f.name,
        split: f.split,
        sizeBytes: f.size_bytes || file.size,
        rowsCount: f.rows_count ?? f.rows?.length ?? 0,
        schema: f.schema,
        rows: f.rows || [],
      })),
    };
  }
  // Format 2: plain array of rows
  if (Array.isArray(parsed)) {
    const sample = parsed[0] || {};
    const schema: SchemaField[] = Object.keys(sample).map((k) => {
      const v = sample[k];
      const f: SchemaField = {
        name: k,
        type: typeof v === "number" ? "number" : typeof v === "boolean" ? "bool" : Array.isArray(v) ? "list" : "string",
        nullable: true,
        role: "unknown",
      };
      f.role = detectFieldRole(f, v);
      return f;
    });
    return {
      name: file.name,
      files: [
        {
          name: file.name,
          sizeBytes: file.size,
          rowsCount: parsed.length,
          schema,
          rows: parsed,
        },
      ],
    };
  }
  // Format 3: object with schema + data
  if (parsed.schema && parsed.data) {
    return {
      name: file.name,
      files: [
        {
          name: file.name,
          sizeBytes: file.size,
          rowsCount: parsed.data.length,
          schema: parsed.schema,
          rows: parsed.data,
        },
      ],
    };
  }
  throw new Error("Unrecognized JSON structure");
}

async function parseCsvFile(file: File): Promise<DatasetFile> {
  const text = await file.text();
  const lower = file.name.toLowerCase();
  const delimiter = lower.endsWith(".tsv") ? "\t" : undefined; // auto-detect for .csv
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    delimiter,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields || [];
  const rows = (result.data || []).map((r, i) => {
    const row: Record<string, unknown> = {};
    for (const h of headers) {
      row[h] = (r as Record<string, unknown>)[h];
    }
    if (!("id" in row)) row.id = `row_${i}`;
    return row;
  });

  // build schema from first row sample
  const sample = rows[0] || {};
  const schema: SchemaField[] = headers.map((h) => {
    const v = sample[h];
    let type = "string";
    if (typeof v === "number") type = Number.isInteger(v) ? "int" : "float";
    else if (typeof v === "boolean") type = "bool";
    const f: SchemaField = { name: h, type, nullable: true, role: "unknown" };
    f.role = detectFieldRole(f, v);
    return f;
  });

  return {
    name: file.name,
    sizeBytes: file.size,
    rowsCount: rows.length,
    schema,
    rows,
  };
}

/**
 * Parse a Parquet file using parquet-wasm (browser-side WASM).
 * parquet-wasm's readParquet returns a wasm Table; we convert to IPC stream
 * then use apache-arrow's tableFromIPC to get a proper Arrow Table.
 */
async function parseParquetFile(file: File): Promise<DatasetFile> {
  // Dynamic import — parquet-wasm's default export is initWasm
  const parquetWasm = await import("parquet-wasm");
  const initWasm = parquetWasm.default as unknown as (() => Promise<void> | void) | undefined;
  const readParquet = parquetWasm.readParquet;

  if (typeof readParquet !== "function") {
    throw new Error("parquet-wasm: readParquet function not found");
  }

  // Initialize WASM (default export is the init function)
  if (typeof initWasm === "function") {
    await initWasm();
  }

  const buf = await file.arrayBuffer();
  const uint8 = new Uint8Array(buf);

  // readParquet returns a parquet-wasm Table (NOT an apache-arrow Table)
  // We convert it to IPC stream bytes, then use apache-arrow's tableFromIPC
  let table: arrow.Table;
  try {
    const wasmTable = readParquet(uint8);
    // intoIPCStream returns a Uint8Array of Arrow IPC stream data
    const ipcBytes = wasmTable.intoIPCStream();
    table = arrow.tableFromIPC(ipcBytes);
    // Free the WASM table to avoid memory leak
    wasmTable.free();
  } catch (e) {
    throw new Error(`Parquet parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Reuse arrow parsing logic
  const schema: SchemaField[] = [];
  for (const f of table.schema.fields) {
    schema.push({
      name: f.name,
      type: inferArrowType(f.type),
      nullable: f.nullable,
      role: "unknown",
    });
  }
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < table.numRows; i++) {
    const row: Record<string, unknown> = {};
    for (let j = 0; j < table.numCols; j++) {
      const col = table.getChildAt(j);
      row[schema[j].name] = arrowValueToJS(col?.get(i));
    }
    rows.push(row);
  }
  for (let j = 0; j < schema.length; j++) {
    const sample = rows[0]?.[schema[j].name];
    schema[j].role = detectFieldRole(schema[j], sample);
  }

  return {
    name: file.name,
    sizeBytes: file.size,
    rowsCount: table.numRows,
    schema,
    rows,
  };
}

export async function parseFiles(files: File[]): Promise<LoadedDataset> {
  const outFiles: DatasetFile[] = [];
  let datasetName = files.length === 1 ? files[0].name : `${files.length} files`;
  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".arrow") || lower.endsWith(".feather") || lower.endsWith(".ipc")) {
      outFiles.push(await parseArrowFile(file));
    } else if (lower.endsWith(".json")) {
      const ds = await parseJsonFile(file);
      outFiles.push(...ds.files);
      if (files.length === 1) datasetName = ds.name;
    } else if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
      outFiles.push(await parseCsvFile(file));
    } else if (lower.endsWith(".parquet")) {
      outFiles.push(await parseParquetFile(file));
    } else {
      throw new Error(`Unsupported file type: ${file.name}`);
    }
  }
  return {
    name: datasetName,
    files: outFiles,
  };
}

/** Fetch the demo dataset bundled at /demo/demo-dataset.json */
export async function fetchDemoDataset(): Promise<LoadedDataset> {
  const res = await fetch("/demo/demo-dataset.json");
  if (!res.ok) throw new Error("Failed to load demo dataset");
  const parsed = await res.json();
  return {
    name: parsed.name,
    description: parsed.description,
    createdAt: parsed.created_at,
    files: parsed.files.map((f: any) => ({
      name: f.name,
      split: f.split,
      sizeBytes: f.size_bytes || 0,
      rowsCount: f.rows_count ?? f.rows?.length ?? 0,
      schema: f.schema,
      rows: f.rows || [],
    })),
  };
}
