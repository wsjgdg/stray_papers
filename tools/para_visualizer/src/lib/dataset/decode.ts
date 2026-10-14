/**
 * Image field detection & multi-strategy decoding utilities
 * (client-side, browser-friendly)
 */
import type { FieldRole, ImageInfo, SchemaField } from "./types";

/**
 * All remote image URLs are fetched through the server-side proxy
 * (/api/proxy-image) so that CORS on the origin host can't block the browser.
 * Set NEXT_PUBLIC_DISABLE_IMAGE_PROXY=1 to fetch directly (only works when the
 * origin sends permissive CORS headers).
 */
const PROXY_BASE = "/api/proxy-image";

function proxiedUrl(rawUrl: string): string {
  if (process.env.NEXT_PUBLIC_DISABLE_IMAGE_PROXY === "1") return rawUrl;
  // encodeURIComponent keeps query strings / hashes of the target intact
  return `${PROXY_BASE}?url=${encodeURIComponent(rawUrl)}`;
}

const IMAGE_KEYWORDS = ["image", "img", "figure", "picture", "photo", "thumbnail", "pic", "screenshot"];

const URL_KEYWORDS = ["url", "link", "src", "uri"];

function includesAny(s: string, keywords: string[]): boolean {
  const lower = s.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * Auto-detect field role from schema + sampled value.
 */
export function detectFieldRole(field: SchemaField, sample: unknown): FieldRole {
  const name = field.name;
  // 1. Name-based image detection
  if (includesAny(name, IMAGE_KEYWORDS)) {
    if (field.type === "bytes" || field.type === "binary") return "image";
    if (typeof sample === "string") {
      if (/^https?:\/\//i.test(sample)) return "url";
      if (isBase64Image(sample)) return "image";
    }
  }
  // 2. URL columns
  if (includesAny(name, URL_KEYWORDS)) {
    if (typeof sample === "string" && /^https?:\/\//i.test(sample)) return "url";
  }
  // 3. Type-based
  if (field.type === "bytes" || field.type === "binary" || field.type === "Image") return "image";
  // 4. Datetime
  if (field.type === "datetime" || field.type === "timestamp" || field.type === "date") return "datetime";
  // 5. Numeric
  if (field.type === "int" || field.type === "integer" || field.type === "float" || field.type === "double" || field.type === "number")
    return "numeric";
  // 6. Boolean / list of primitives
  if (field.type === "bool" || field.type === "boolean") return "meta";
  if (field.type === "string" || field.type === "utf8") {
    if (typeof sample === "string" && isBase64Image(sample)) return "image";
    if (name === "id" || name.endsWith("_id")) return "identifier";
    return "text";
  }
  // 7. List
  if (field.type.startsWith("list<")) return "meta";
  // 8. Struct/dict
  if (field.type === "struct" || field.type === "dict" || field.type === "object") {
    if (typeof sample === "object" && sample !== null && ("bytes" in sample || "path" in sample)) return "image";
    return "meta";
  }
  return "unknown";
}

export function isBase64Image(s: string): boolean {
  if (!s || s.length < 32) return false;
  // data URL
  if (s.startsWith("data:image/")) return true;
  // long base64 with image-like padding
  if (s.length > 200 && /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s.slice(0, 1000))) {
    return true;
  }
  return false;
}

/**
 * Decode a field value into a displayable image (returns a Blob URL or null).
 * Tries multiple strategies in priority order.
 */
export interface DecodeResult {
  blobUrl: string | null;
  blob: Blob | null;
  format: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  source?: string;
  error?: string;
}

export async function decodeImageField(value: unknown, fieldName: string): Promise<DecodeResult> {
  // Strategy 1: dict with bytes
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (typeof v.bytes === "string" && v.bytes.length > 0) {
      return decodeStringBytes(v.bytes as string, fieldName);
    }
    if (v.bytes instanceof Uint8Array || v.bytes instanceof ArrayBuffer) {
      return decodeBinaryBytes(new Uint8Array(v.bytes as Uint8Array), fieldName);
    }
    if (typeof v.path === "string") {
      return { blobUrl: null, blob: null, format: null, width: null, height: null, sizeBytes: 0, source: v.path, error: "Local path not resolvable in browser" };
    }
    if (typeof v.url === "string") {
      // Try fetching the URL
      return fetchUrlImage(v.url as string, fieldName);
    }
  }
  // Strategy 2: raw bytes
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return decodeBinaryBytes(new Uint8Array(value as Uint8Array), fieldName);
  }
  // Strategy 3: string
  if (typeof value === "string") {
    if (value.startsWith("data:image/")) {
      return decodeStringBytes(value, fieldName);
    }
    if (/^https?:\/\//i.test(value)) {
      // Try fetching the URL — show preview, not just link
      return fetchUrlImage(value, fieldName);
    }
    if (value.length > 0) {
      // Only try base64 decode if the string looks like valid base64
      if (isValidBase64(value)) {
        return decodeStringBytes(value, fieldName);
      }
      // Not base64 — check if it looks like a file path
      if (value.includes("/") || value.includes("\\")) {
        return { blobUrl: null, blob: null, format: null, width: null, height: null, sizeBytes: 0, source: value, error: "Local path not resolvable in browser" };
      }
      // Unknown string content
      return { blobUrl: null, blob: null, format: null, width: null, height: null, sizeBytes: 0, error: "String is not valid base64, data URL, or URL" };
    }
    return { blobUrl: null, blob: null, format: null, width: null, height: null, sizeBytes: 0, error: "Empty value" };
  }
  // Strategy 4: list (multiple images)
  if (Array.isArray(value)) {
    const first = value[0];
    if (first !== undefined) return decodeImageField(first, fieldName);
  }
  return { blobUrl: null, blob: null, format: null, width: null, height: null, sizeBytes: 0, error: "Unknown format" };
}

/**
 * Fetch an image from a URL and return a blob URL for display.
 * The request goes through the server-side proxy (/api/proxy-image) so the
 * origin host's CORS policy can't block the browser. Timeouts and network
 * errors are handled gracefully.
 */
async function fetchUrlImage(url: string, fieldName: string): Promise<DecodeResult> {
  try {
    const target = proxiedUrl(url);

    // Set up timeout. Env-tunable client side: NEXT_PUBLIC_IMAGE_TIMEOUT_MS
    // (default 8s). Shorter than the proxy hop so a slow/dead host frees its
    // queue slot quickly instead of hoarding it.
    const clientTimeout = (() => {
      const v = Number(process.env.NEXT_PUBLIC_IMAGE_TIMEOUT_MS);
      return Number.isFinite(v) && v > 0 ? v : 8000;
    })();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), clientTimeout);

    const res = await fetch(target, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        if (j && j.error) detail = ` — ${j.error}`;
      } catch {
        /* ignore */
      }
      return {
        blobUrl: null, blob: null, format: null, width: null, height: null,
        sizeBytes: 0, source: url,
        error: `Image proxy failed (HTTP ${res.status})${detail}`,
      };
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      return {
        blobUrl: null, blob: null, format: null, width: null, height: null,
        sizeBytes: 0, source: url,
        error: "Image proxy returned empty response",
      };
    }

    const blobUrl = URL.createObjectURL(blob);
    // Sniff format from blob
    const buf = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const format = sniffFormat(buf) || blob.type?.replace("image/", "") || "png";

    // Probe dimensions
    try {
      const dims = await probeImage(blobUrl);
      return {
        blobUrl, blob, format,
        width: dims.width, height: dims.height,
        sizeBytes: blob.size, source: url,
      };
    } catch {
      // Image loaded but probe failed — still return the blob URL
      return {
        blobUrl, blob, format,
        width: null, height: null,
        sizeBytes: blob.size, source: url,
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Check if it's an abort error (timeout)
    if (msg.includes("aborted")) {
      return {
        blobUrl: null, blob: null, format: null, width: null, height: null,
        sizeBytes: 0, source: url,
        error: "Image proxy timed out — remote host slow or unreachable",
      };
    }
    return {
      blobUrl: null, blob: null, format: null, width: null, height: null,
      sizeBytes: 0, source: url,
      error: `Image proxy failed: ${msg}`,
    };
  }
}

/**
 * Check if a string is valid base64.
 * Avoids calling atob on non-base64 strings which throws.
 */
function isValidBase64(s: string): boolean {
  if (!s || s.length < 4) return false;
  const cleaned = s.replace(/\s+/g, "");
  // Must only contain valid base64 characters
  if (!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(cleaned)) {
    return false;
  }
  // Length should be reasonable for an image (at least 100 bytes encoded)
  if (cleaned.length < 100) return false;
  return true;
}

async function decodeStringBytes(s: string, fieldName: string): Promise<DecodeResult> {
  try {
    let raw: Uint8Array;
    let format = "png";
    if (s.startsWith("data:image/")) {
      // data URL: data:image/png;base64,XXXX
      const m = s.match(/^data:image\/([\w.+-]+);base64,(.*)$/);
      if (!m) return fail("Malformed data URL");
      format = m[1];
      raw = base64ToBytes(m[2]);
    } else {
      raw = base64ToBytes(s);
      // sniff
      format = sniffFormat(raw) || "png";
    }
    return await finalize(raw, format, fieldName);
  } catch (e) {
    return fail((e as Error).message || "Decode failed");
  }
}

async function decodeBinaryBytes(buf: Uint8Array, fieldName: string): Promise<DecodeResult> {
  try {
    const format = sniffFormat(buf) || "bin";
    return await finalize(buf, format, fieldName);
  } catch (e) {
    return fail((e as Error).message || "Decode failed");
  }
}

async function finalize(raw: Uint8Array, format: string, fieldName: string): Promise<DecodeResult> {
  if (raw.length === 0) return fail("Empty image bytes");
  // Copy into a fresh ArrayBuffer-backed view so the BlobPart type is unambiguous.
  const bytes = new Uint8Array(raw); // new buffer, type Uint8Array<ArrayBuffer>
  const blob = new Blob([bytes], { type: `image/${format}` });
  const blobUrl = URL.createObjectURL(blob);
  const sizeBytes = raw.length;
  // Probe dimensions via Image
  try {
    const dims = await probeImage(blobUrl);
    return {
      blobUrl,
      blob,
      format,
      width: dims.width,
      height: dims.height,
      sizeBytes,
      source: fieldName,
    };
  } catch {
    // Image failed to load - might be invalid format
    URL.revokeObjectURL(blobUrl);
    return {
      blobUrl: null,
      blob,
      format,
      width: null,
      height: null,
      sizeBytes,
      source: fieldName,
      error: "Image bytes present but decode failed (format unsupported or corrupted)",
    };
  }
}

function probeImage(blobUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = blobUrl;
  });
}

function sniffFormat(buf: Uint8Array): string | null {
  if (buf.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // GIF: 47 49 46 38
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "gif";
  // WebP: RIFF ... WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "webp";
  // SVG (text)
  if (buf[0] === 0x3c && (buf[1] === 0x73 || buf[1] === 0x3f)) return "svg+xml";
  // BMP: 42 4D
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "bmp";
  return null;
}

function base64ToBytes(b64: string): Uint8Array {
  // Browser-friendly
  const cleaned = b64.replace(/\s+/g, "");
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function fail(error: string): DecodeResult {
  return { blobUrl: null, blob: null, format: null, width: null, height: null, sizeBytes: 0, error };
}

/** Get image info from a previously decoded result. */
export function toImageInfo(d: DecodeResult): ImageInfo | null {
  if (!d.blobUrl) return null;
  return {
    format: d.format || "unknown",
    width: d.width || 0,
    height: d.height || 0,
    sizeBytes: d.sizeBytes,
    source: d.source,
  };
}
