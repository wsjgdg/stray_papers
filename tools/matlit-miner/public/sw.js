/**
 * MatLit Miner — Service Worker (T3)
 *
 * A small, dependency-free SW that makes the app load instantly on repeat
 * visits and keeps working through brief network drops.
 *
 * Strategies:
 *
 *   ── App shell (HTML / CSS / JS / fonts / images) ──
 *      Stale-while-revalidate. The cached version is served immediately; a
 *      fresh copy is fetched in the background and swapped in for next time.
 *      This is the right trade-off for a research tool where the shell is
 *      stable but the data underneath changes.
 *
 *   ── API GET requests (/api/...) ──
 *      Network-first with cache fallback. We always try the network so the
 *      user sees fresh data when online. If the network fails (offline,
 *      flaky train Wi-Fi), we fall back to the most recent cached response.
 *      Mutations (POST / PUT / DELETE / PATCH) are NEVER cached — they are
 *      passed straight through to the network and fail loudly if offline.
 *
 *   ── Everything else ──
 *      Cache-first (with a background refresh) for same-origin GETs that
 *      match a cached entry; otherwise passthrough to the network.
 *
 * The cache is intentionally versioned (CACHE_VERSION). Bumping the version
 * in a future deploy activates the new SW in `skipWaiting` and clears the
 * old cache in `activate`, so users never get a half-updated shell.
 */

var CACHE_VERSION = 'matlit-v1';
var APP_SHELL_CACHE = CACHE_VERSION + '-shell';
var API_CACHE = CACHE_VERSION + '-api';

// Resources that make up the "app shell" — the static chrome of the app
// that loads before any data is rendered. Caching these makes repeat
// visits paint almost instantly even on a slow connection.
var APP_SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/logo.svg',
  '/robots.txt',
];

// Same-origin asset extensions to cache on the fly (SWR). Anything that
// matches these gets cached as it passes through; everything else is left
// for the network.
var ASSET_URL_PATTERN =
  /\.(?:js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|gif|webp|ico)$/i;

// ---------------------------------------------------------------------------
// install — pre-warm the app-shell cache, then activate immediately.
// ---------------------------------------------------------------------------
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then(function (cache) {
        // `addAll` is atomic: if any single request fails, none are cached.
        // We use individual `cache.add` calls so a missing file (e.g. an
        // icon that doesn't exist yet) doesn't abort the whole install.
        return Promise.all(
          APP_SHELL_URLS.map(function (url) {
            return cache.add(url).catch(function () {
              /* ignore individual failures */
            });
          }),
        );
      })
      .then(function () {
        // Take over from the previous SW right away so the new shell is
        // used on the next navigation rather than waiting for every tab
        // to be closed.
        return self.skipWaiting();
      }),
  );
});

// ---------------------------------------------------------------------------
// activate — drop caches from previous versions, then claim all clients.
// ---------------------------------------------------------------------------
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              // Keep only caches for the current version. Old versions
              // (from prior deploys) are evicted.
              return key.indexOf(CACHE_VERSION) !== 0;
            })
            .map(function (key) {
              return caches.delete(key);
            }),
        );
      })
      .then(function () {
        // Claim every open client so the SW takes effect immediately
        // without requiring a reload.
        return self.clients.claim();
      }),
  );
});

// ---------------------------------------------------------------------------
// fetch — route every request through the right strategy.
// ---------------------------------------------------------------------------
self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Only handle GET. Mutations (POST / PUT / DELETE / PATCH) and other
  // methods are passed straight to the network — caching them would risk
  // replaying stale writes or hiding real failures.
  if (request.method !== 'GET') {
    return;
  }

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // Same-origin only. Cross-origin requests (analytics, fonts from a CDN,
  // external image proxies, etc.) are left to the browser's default
  // handling — we never want to cache third-party responses opaquely.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip Next.js dev-only HMR / telemetry endpoints so we don't interfere
  // with hot module replacement while developing.
  if (
    url.pathname.indexOf('/_next/webpack-hmr') === 0 ||
    url.pathname.indexOf('/__nextjs') === 0 ||
    url.pathname.indexOf('/_next/data') === 0
  ) {
    return;
  }

  // 1) API GET requests — network-first with cache fallback.
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // 2) Navigation requests (HTML documents) — network-first so users see
  //    fresh content when online, but fall back to the cached shell when
  //    offline (this is what makes the app a real PWA — it opens without
  //    a network).
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE, '/'));
    return;
  }

  // 3) Static assets (JS / CSS / fonts / images) — stale-while-revalidate.
  if (ASSET_URL_PATTERN.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
    return;
  }

  // 4) Default — try cache first, then network, for anything else GET.
  event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
});

// ---------------------------------------------------------------------------
// Strategy: network-first.
//
// Try the network. On success, cache a clone and return it. If the network
// fails (offline, timeout, 5xx), fall back to the most recent cached
// response. If there's no cached copy either, return a 504 so the caller
// can show a proper error UI.
//
// `fallbackPath` (optional) is served from `cacheName` when both the network
// and the exact URL cache miss — used for navigations to deep routes that
// have never been visited, where we'd rather show the cached app shell
// than a blank page.
// ---------------------------------------------------------------------------
function networkFirst(request, cacheName, fallbackPath) {
  return fetch(request)
    .then(function (response) {
      // Only cache successful, basic (same-origin) responses. Opaque
      // responses (CORS-no-cors) are safe to pass through but not to cache.
      if (
        response &&
        response.status === 200 &&
        response.type === 'basic'
      ) {
        var clone = response.clone();
        caches.open(cacheName).then(function (cache) {
          cache.put(request, clone).catch(function () {
            /* storage quota / etc — ignore */
          });
        });
      }
      return response;
    })
    .catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        if (fallbackPath) {
          return caches.match(fallbackPath);
        }
        // No cached fallback — return a 504 Gateway Timeout so the
        // client code can react to the failure (e.g. show "offline").
        return new Response('Offline — no cached response available', {
          status: 504,
          statusText: 'Gateway Timeout',
          headers: { 'Content-Type': 'text/plain' },
        });
      });
    });
}

// ---------------------------------------------------------------------------
// Strategy: stale-while-revalidate.
//
// Serve the cached response immediately if present, then fetch a fresh copy
// in the background and update the cache for next time. If there's no
// cached copy, just go to the network.
// ---------------------------------------------------------------------------
function staleWhileRevalidate(request, cacheName) {
  return caches.match(request).then(function (cached) {
    var fetchPromise = fetch(request)
      .then(function (response) {
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic'
        ) {
          var clone = response.clone();
          caches.open(cacheName).then(function (cache) {
            cache.put(request, clone).catch(function () {
              /* ignore */
            });
          });
        }
        return response;
      })
      .catch(function () {
        // Network failed — if we have a cached copy we've already
        // returned it; otherwise let the caller see the error by
        // returning undefined (the browser will surface a network
        // error to the page).
        return cached || Response.error();
      });
    // Return cached immediately if we have it; otherwise wait for the
    // network response.
    return cached || fetchPromise;
  });
}
