/* 奶蛙大学 · 离线可玩 Service Worker
 * 纯静态站，没有后端接口：除了同源 GET 之外全部放行。
 * 策略：
 * - 页面导航：网络优先，成功即缓存；断网回落缓存（先精确 URL，再站点根）——打开过一次就能离线玩
 * - 同源静态资源（JS/CSS/字体/图）：缓存优先，未命中走网络并回填
 * - 非 GET / 跨域请求：完全不拦截
 * - 版本换代：CACHE 名递增，activate 时清掉旧缓存
 */
var CACHE = "naiwa-univ-offline-v2";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(request, copy);
          });
          return response;
        })
        .catch(function () {
          return caches.open(CACHE).then(function (cache) {
            return cache.match(request).then(function (hit) {
              if (hit) return hit;
              /* 精确 URL 没缓存过 → 回落站点根（SW 注册作用域），前端路由自己接管 */
              var scopeUrl = new URL(self.registration.scope);
              return cache.match(scopeUrl.href).then(function (root) {
                if (root) return root;
                return new Response("离线中——先联网打开一次游戏，之后断网也能玩。", {
                  status: 503,
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
              });
            });
          });
        }),
    );
    return;
  }

  /* 静态资源：缓存优先 */
  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request)
        .then(function (response) {
          if (response.ok) {
            var copy = response.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return new Response("", { status: 504 });
        });
    }),
  );
});
