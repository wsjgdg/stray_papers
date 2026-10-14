import { NextRequest } from "next/server";

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

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const forbid = proxyForbidden(url);
  if (forbid) {
    return new Response(JSON.stringify({ error: forbid }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Forward a few safe headers; never forward cookies/auth from the server.
  const headers = new Headers();
  const ua = req.headers.get("user-agent");
  if (ua) headers.set("user-agent", ua);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers,
      // Browsers don't revalidate cached proxied responses; allow shared cache.
      cache: "no-store",
      redirect: "follow",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream fetch failed";
    return new Response(JSON.stringify({ error: `Proxy fetch failed: ${msg}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => "");
    return new Response(body || JSON.stringify({ error: `Upstream returned ${upstream.status}` }), {
      status: upstream.status === 0 ? 502 : upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") || "text/plain" },
    });
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const size = upstream.headers.get("content-length");

  const respHeaders = new Headers();
  respHeaders.set("content-type", contentType);
  if (size) respHeaders.set("content-length", size);
  // Cache proxied images for 1 hour; vary by upstream URL.
  respHeaders.set("cache-control", "public, max-age=3600");
  respHeaders.set("access-control-allow-origin", "*");

  return new Response(upstream.body, { status: 200, headers: respHeaders });
}
