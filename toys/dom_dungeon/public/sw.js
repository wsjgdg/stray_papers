/*
 * 标签地牢 · 离线缓存
 * 策略：network-first —— 在线时永远拿最新资源并顺手更新缓存；断网时回退到上一次的缓存。
 * 这样既保证离线可玩，又不会让玩家卡在旧版本上。
 */
const CACHE_NAME = "tab-dungeon-v1"
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
  "/favicon.svg",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone()
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined)
        }
        return response
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit || caches.match("/index.html"))
          .then((hit) => hit || caches.match("/")),
      ),
  )
})
