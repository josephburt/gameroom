/* Cache the static shell. ROM bytes and Drive traffic are never stored here. */
const CACHE = "gameroom-v10";
const PRECACHE = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/js/nes.js",
  "/js/cpu.js",
  "/js/ppu.js",
  "/js/apu.js",
  "/js/mappers.js",
  "/js/rom.js",
  "/js/ejs.js",
  "/js/idb.js",
  "/js/library.js",
  "/js/folders.js",
  "/js/state.js",
  "/js/rewind.js",
  "/js/touch.js",
  "/js/netplay.js",
  "/js/drive.js",
  "/js/drive-config.js",
  "/js/demo-rom.js",
  "/js/bin.js",
  "/js/vendor/jszip.min.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE).catch(function () {});
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/drive") !== -1) return;

  if (req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match("/index.html");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
