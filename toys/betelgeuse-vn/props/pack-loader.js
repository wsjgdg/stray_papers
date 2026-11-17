// pack-loader.js — async resource packs for the lite (split) build (#24).
// The lite HTML ships without voice/bgm inline; this loader fetches the two
// pack scripts, caches them in IndexedDB (second visit = instant, offline
// playable) and executes them. Both packs set window globals the engine
// already consumes dynamically (VN_VOICE / VN_AUDIO_ASSETS), so late arrival
// simply means: the very first scenes may play their synth fallbacks, every
// scene change after arrival picks up the sampled versions. Zero engine
// changes; every failure path is silent — the game runs text/synth-only.
//
// Progress reporting: window.VN_PACK_STATUS[key] = { state, loaded, total }
// (bytes; state ∈ loading|ready|cached|failed) plus a "vn-pack" DOM event per
// update — the title screen listens and renders the loading line.
(function () {
  "use strict";
  var PACKS = [
    { key: "bgm", file: "betelgeuse-bgm-pack.js", global: "VN_AUDIO_ASSETS" },
    { key: "voice", file: "betelgeuse-voice-pack.js", global: "VN_VOICE" },
    {
      key: "bgm2",
      file: "betelgeuse-bgm2-pack.js",
      global: "VN_BGM2_ASSETS",
      probe: function (g) {
        // bgm2 merges into the same assets namespace; skip only when a
        // bgm2_ key is already present (full build inlines the series)
        for (var k in g) {
          if (Object.prototype.hasOwnProperty.call(g, k) && k.indexOf("bgm2_") === 0)
            return true;
        }
        return false;
      },
    },
  ];
  var DB = "vn-packs";
  var STORE = "files";

  function status(key, state, loaded, total) {
    try {
      window.VN_PACK_STATUS = window.VN_PACK_STATUS || {};
      window.VN_PACK_STATUS[key] = {
        state: state,
        loaded: loaded || 0,
        total: total || 0,
      };
      window.dispatchEvent(new CustomEvent("vn-pack", { detail: key }));
    } catch (e) {}
  }

  function run(text) {
    // pack files are authored scripts that set their window global
    try {
      window.eval(text);
      return true;
    } catch (e) {
      return false;
    }
  }

  function idb() {
    return new Promise(function (resolve, reject) {
      var req = window.indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function idbGet(db, key) {
    return new Promise(function (resolve) {
      try {
        var req = db.transaction(STORE).objectStore(STORE).get(key);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          resolve(null);
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  function idbPut(db, key, value) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          resolve(false);
        };
      } catch (e) {
        resolve(false);
      }
    });
  }

  // Streamed fetch with byte progress (content-length when present; a UTF-8
  // decoder in stream mode keeps multi-byte characters intact across chunks).
  function fetchText(url, onProgress) {
    // no-cache: revalidate against the server so a repacked pack with the
    // same filename is never served stale from the HTTP cache
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      var total = Number(r.headers.get("content-length")) || 0;
      if (!r.body || !r.body.getReader) {
        return r.text().then(function (t) {
          onProgress(t.length, total || t.length);
          return t;
        });
      }
      var reader = r.body.getReader();
      var decoder = new TextDecoder("utf-8");
      var text = "";
      var loaded = 0;
      return new Promise(function (resolve, reject) {
        function pump() {
          reader.read().then(function (chunk) {
            if (chunk.done) {
              text += decoder.decode();
              onProgress(loaded, total || loaded);
              resolve(text);
              return;
            }
            loaded += chunk.value.length;
            text += decoder.decode(chunk.value, { stream: true });
            onProgress(loaded, total);
            pump();
          }, reject);
        }
        pump();
      });
    });
  }

  function loadPack(db, pack) {
    status(pack.key, "loading");
    return idbGet(db, pack.key).then(function (cached) {
      // cache invalidation: entries store the build stamp they were fetched
      // for; a new build stamps the page differently, so stale packs refetch
      if (cached && cached.build === window.VN_PACK_BUILD && run(cached.text)) {
        status(pack.key, "cached");
        return;
      }
      return fetchText(pack.file, function (loaded, total) {
        status(pack.key, "loading", loaded, total);
      })
        .then(function (text) {
          if (!run(text)) throw new Error("exec failed");
          status(pack.key, "ready");
          return idbPut(db, pack.key, { text: text, build: window.VN_PACK_BUILD });
        })
        .catch(function () {
          status(pack.key, "failed"); // game continues text/synth-only
        });
    });
  }

  function boot() {
    if (typeof window.indexedDB === "undefined" || typeof fetch === "undefined")
      return; // file:// or ancient browser: keep the single-file build instead
    idb().then(function (db) {
      PACKS.reduce(function (chain, pack) {
        return chain.then(function () {
          return loadPack(db, pack);
        });
      }, Promise.resolve());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
