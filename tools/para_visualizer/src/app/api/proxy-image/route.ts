import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side image proxy.
 *
 * The browser calls /api/proxy-image?url=<remote> and we fetch the image on the
 * server (no CORS restriction) and stream the bytes back with the original
 * content-type. This also lets the browser cache via the normal HTTP cache and
 * avoids 40+ simultaneous cross-origin requests when many thumbnails are visible.
 *
 * Two server-side accelerators on top of that:
 *  1. In-memory cache keyed by the upstream URL (LRU, TTL). A proxied image is
 *     fetched once and reused for every later request — across clients, across
 *     reloads, and across the virtualizer remounting the same row.
 *  2. In-flight coalescing: concurrent identical requests share a single
 *     upstream fetch instead of each opening their own.
 *
 * SECURITY: by default we allow http(s) proxying of any host (the app's whole
 * purpose is browsing third-party dataset image URLs). To prevent this from
 * being abused as an open SSRF/proxy, set PROXY_STRICT=1 — that blocks
 * requests to private/loopback/link-local IPs and non-http(s) schemes.
 */

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

// RFC1918 / loopback / link-local / unspecified ranges we refuse when strict.
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  if (h.includes(":")) {
    // IPv6 — block loopback/link-local/unique-local
    if (h === "::1" || h === "::" || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) {
      return true;
    }
    return false;
  }
  const parts = h.split(".").map((n) => parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function proxyForbidden(urlStr: string): string | null {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return "Invalid URL";
  }
  if (!ALLOWED_SCHEMES.has(u.protocol)) return `Scheme not allowed: ${u.protocol}`;
  if (process.env.PROXY_STRICT === "1" || process.env.PROXY_STRICT === "true") {
    // Block numeric IP hosts and private ranges directly.
    const rawHost = u.hostname;
    if (rawHost.includes(":")) {
      if (isPrivateHost(rawHost)) return "Private host blocked (strict mode)";
    } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rawHost)) {
      if (isPrivateHost(rawHost)) return "Private IP blocked (strict mode)";
    } else if (isPrivateHost(rawHost)) {
      return "Private host blocked (strict mode)";
    }
  }
  return null;
}

// --- server-side cache + in-flight coalescing ---------------------------------
//
// Two layers, both survive a hot reload but only the disk layer survives a full
// `npm start` restart:
//   - in-memory LRU (fast, lost on restart)
//   - on-disk files under .cache/proxy (persists across restarts)
// Failures are NEVER cached (in memory or on disk) so "retry" re-fetches.

interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  ts: number;
  fromDisk?: boolean;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_ENTRIES = 300; // ~bounded memory for a local single-user tool
const MAX_DISK_BYTES = 8 * 1024 * 1024; // skip disk cache for very large images
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry | null>>();
const diskDir = path.join(process.cwd(), ".cache", "proxy");

function fileFor(url: string): string {
  const key = createHash("sha1").update(url).digest("hex");
  return path.join(diskDir, key + ".bin");
}

function evictIfNeeded() {
  // Map keeps insertion order; drop the oldest entries when over budget.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function readDisk(url: string): Promise<CacheEntry | null> {
  try {
    const meta = JSON.parse(await fs.readFile(fileFor(url) + ".meta", "utf8")) as {
      contentType: string;
      ts: number;
    };
    if (Date.now() - meta.ts >= CACHE_TTL_MS) return null;
    const buf = await fs.readFile(fileFor(url));
    return { buffer: buf, contentType: meta.contentType, ts: meta.ts, fromDisk: true };
  } catch {
    return null;
  }
}

async function writeDisk(url: string, entry: CacheEntry): Promise<void> {
  try {
    if (entry.buffer.length > MAX_DISK_BYTES) return; // don't bloat the disk cache
    await fs.mkdir(diskDir, { recursive: true });
    await fs.writeFile(fileFor(url), entry.buffer);
    await fs.writeFile(
      fileFor(url) + ".meta",
      JSON.stringify({ contentType: entry.contentType, ts: entry.ts }),
    );
  } catch {
    /* disk unavailable — fall back to memory only */
  }
}

async function fetchUpstream(
  url: string,
  headers: Headers,
  timeoutMs: number,
): Promise<CacheEntry | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetch(url, {
      headers,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!upstream.ok || !upstream.body) {
      return null;
    }
    const ab = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    return { buffer: Buffer.from(ab), contentType, ts: Date.now() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function bufferedResponse(entry: CacheEntry, cacheTag: "HIT-MEM" | "HIT-DISK" | "MISS") {
  const respHeaders = new Headers();
  respHeaders.set("content-type", entry.contentType);
  respHeaders.set("content-length", String(entry.buffer.length));
  respHeaders.set("cache-control", "public, max-age=3600");
  respHeaders.set("access-control-allow-origin", "*");
  respHeaders.set("x-cache", cacheTag);
  return new Response(entry.buffer, { status: 200, headers: respHeaders });
}

function jsonError(status: number, detail: string) {
  return new Response(JSON.stringify({ error: detail }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return jsonError(400, "Missing 'url' query parameter");
  }

  const forbid = proxyForbidden(url);
  if (forbid) {
    return jsonError(400, forbid);
  }

  // Bound the upstream fetch so a slow/unreachable host can't hang a queue slot
  // (and the user's tab) for too long. Env-tunable: PROXY_TIMEOUT_MS (default 12s).
  // Keep this shorter than the client per-image timeout so failures surface fast.
  const timeoutMs = (() => {
    const v = Number(process.env.PROXY_TIMEOUT_MS);
    return Number.isFinite(v) && v > 0 ? v : 12000;
  })();

  // 1) hot memory cache (within TTL)
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return bufferedResponse(cached, "HIT-MEM");
  }

  // 2) cold disk cache (survives `npm start` restart)
  const onDisk = await readDisk(url);
  if (onDisk) {
    cache.set(url, onDisk); // promote to hot memory
    return bufferedResponse(onDisk, "HIT-DISK");
  }

  // 3) in-flight coalescing
  const existing = inflight.get(url);
  if (existing) {
    const entry = await existing;
    return entry ? bufferedResponse(entry, entry.fromDisk ? "HIT-DISK" : "HIT-MEM") : jsonError(502, "Proxy fetch failed (upstream unreachable)");
  }

  // 4) fetch, cache on success (memory + disk), never cache failures (so "retry" can refetch)
  const headers = new Headers();
  const ua = req.headers.get("user-agent");
  if (ua) headers.set("user-agent", ua);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  const p = fetchUpstream(url, headers, timeoutMs)
    .then((entry) => {
      if (entry) {
        cache.set(url, entry);
        evictIfNeeded();
        void writeDisk(url, entry);
      }
      return entry;
    })
    .finally(() => {
      inflight.delete(url);
    });
  inflight.set(url, p);

  const entry = await p;
  if (!entry) {
    return jsonError(502, `Proxy fetch failed (timed out after ${Math.round(timeoutMs / 1000)}s or host unreachable)`);
  }
  return bufferedResponse(entry, "MISS");
}
