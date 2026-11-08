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
// Three layers; only the disk layer survives a full `npm start` restart:
//   - in-memory LRU (fast, lost on restart)
//   - on-disk generation folders under .cache/proxy/gen-<ts>-<rand>
//     Each generation folder is capped at MAX_GEN_BYTES (~500MB). When the
//     current folder fills up we roll a brand-new folder, so a write never
//     gets dropped just because one folder blew past a size limit.
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
const MAX_GEN_BYTES = (() => {
  // Env-tunable per-generation cap (default 500MB). PROXY_CACHE_GEN_MB is in MB.
  const mb = Number(process.env.PROXY_CACHE_GEN_MB);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 500 * 1024 * 1024;
})();
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry | null>>();

const DISK_BASE = path.join(process.cwd(), ".cache", "proxy");
let genDirs: string[] = []; // known generation folders, last entry is "current"
let currentGenBytes = 0;
let readyPromise: Promise<void> | null = null;

function hashKey(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  try {
    const files = await fs.readdir(dir);
    for (const f of files) {
      if (!f.endsWith(".bin")) continue;
      const st = await fs.stat(path.join(dir, f));
      total += st.size;
    }
  } catch {
    /* ignore */
  }
  return total;
}

async function newGen(): Promise<string> {
  const name = "gen-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const dir = path.join(DISK_BASE, name);
  await fs.mkdir(dir, { recursive: true });
  genDirs.push(dir);
  currentGenBytes = 0;
  return dir;
}

async function ensureGenDirs(): Promise<void> {
  try {
    const entries = await fs.readdir(DISK_BASE, { withFileTypes: true });
    genDirs = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("gen-"))
      .map((e) => path.join(DISK_BASE, e.name))
      .sort(); // oldest first (timestamp prefix)
  } catch {
    genDirs = [];
  }
  if (genDirs.length === 0) {
    await newGen();
  } else {
    currentGenBytes = await dirBytes(genDirs[genDirs.length - 1]);
  }
}

function ensureReady(): Promise<void> {
  if (!readyPromise) readyPromise = ensureGenDirs();
  return readyPromise;
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
  await ensureReady();
  const key = hashKey(url);
  // Search newest generation first.
  for (let i = genDirs.length - 1; i >= 0; i--) {
    const dir = genDirs[i];
    try {
      const meta = JSON.parse(
        await fs.readFile(path.join(dir, key + ".meta"), "utf8"),
      ) as { contentType: string; ts: number };
      if (Date.now() - meta.ts >= CACHE_TTL_MS) continue; // expired
      const buf = await fs.readFile(path.join(dir, key + ".bin"));
      return { buffer: buf, contentType: meta.contentType, ts: meta.ts, fromDisk: true };
    } catch {
      /* not present in this generation */
    }
  }
  return null;
}

async function writeDisk(url: string, entry: CacheEntry): Promise<void> {
  if (entry.buffer.length > MAX_DISK_BYTES) return; // don't bloat the disk cache
  try {
    await ensureReady();
    // Roll a new generation folder once the current one is full, so the write
    // always lands instead of overflowing a single folder.
    if (currentGenBytes + entry.buffer.length > MAX_GEN_BYTES) {
      await newGen();
    }
    const writeDir = genDirs[genDirs.length - 1];
    const key = hashKey(url);
    await fs.writeFile(path.join(writeDir, key + ".bin"), entry.buffer);
    await fs.writeFile(
      path.join(writeDir, key + ".meta"),
      JSON.stringify({ contentType: entry.contentType, ts: entry.ts }),
    );
    currentGenBytes += entry.buffer.length;
  } catch {
    /* disk unavailable — fall back to memory only */
  }
}

// --- upstream-fetch semaphore -------------------------------------------------
// The browser already caps concurrent decodes (NEXT_PUBLIC_IMAGE_CONCURRENCY),
// but every one of those hits this route and opens its own upstream socket.
// Without a server-side cap, 7000 slow-host images would open hundreds of
// sockets at once (FD + memory pressure, event-loop stalls). Bound it so the
// proxy fetches upstream a few at a time and queues the rest. Tunable via
// PROXY_MAX_CONCURRENT (default 16).
const MAX_UPSTREAM_CONCURRENT = (() => {
  const v = Number(process.env.PROXY_MAX_CONCURRENT);
  return Number.isFinite(v) && v > 0 ? Math.max(1, Math.min(128, Math.floor(v))) : 16;
})();
let upstreamActive = 0;
const upstreamWaiters: Array<() => void> = [];

function acquireUpstream(): Promise<void> {
  if (upstreamActive < MAX_UPSTREAM_CONCURRENT) {
    upstreamActive++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    upstreamWaiters.push(() => {
      upstreamActive++;
      resolve();
    });
  });
}

function releaseUpstream(): void {
  upstreamActive--;
  const next = upstreamWaiters.shift();
  if (next) next();
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
  // entry.buffer is a Node Buffer (Uint8Array); pass a fresh Uint8Array view so
  // the DOM BodyInit type accepts it regardless of the underlying ArrayBufferLike.
  return new Response(new Uint8Array(entry.buffer), { status: 200, headers: respHeaders });
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

  const p = (async () => {
    await acquireUpstream();
    try {
      return await fetchUpstream(url, headers, timeoutMs);
    } finally {
      releaseUpstream();
    }
  })()
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
