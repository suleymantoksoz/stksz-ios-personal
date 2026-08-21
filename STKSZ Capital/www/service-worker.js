const CACHE_NAME = "stksz-shell-v123-20260820-auth-v2";
const OFFLINE_URL = "./offline.html";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./offline.html",
  "./manifest.json",
  "./api-client.js",
  "./stksz-chart.js",
  "./market-view-model.js",
  "./virtual-wallet.js",
  "./sync-client.js",
  "./broker-adapter.js",
  "./native-bridge.js",
  "./stksz-ai-engine.js",
  "./assets/icons/stksz-logo.png",
  "./assets/icons/favicon.ico",
  "./assets/icons/icon-32.png",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/maskable-512.png",
  "./legal/privacy.html",
  "./legal/support.html",
];

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_VERSION") event.source?.postMessage({ type: "STKSZ_SW_VERSION", cacheName: CACHE_NAME });
  if (event.data?.type === "CLEAR_RUNTIME") event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
});

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("stksz-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

function offlineApiResponse() {
  return new Response(JSON.stringify({ ok: false, error: { type: "offline", message: "Çevrimdışı: provider verisi alınamıyor." } }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(new Request(event.request, { cache: "no-store" })).catch(offlineApiResponse));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(new Request(event.request, { cache: "no-store" }));
        if (response.ok) {
          const copy = response.clone();
          const cacheKey = url.pathname === "/" || url.pathname.endsWith("/index.html") ? "./index.html" : event.request;
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, copy)));
        }
        return response;
      } catch {
        return (await caches.match(event.request)) || (await caches.match("./index.html")) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const network = fetch(new Request(event.request, { cache: "no-store" })).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
      }
      return response;
    }).catch(() => null);
    return cached || (await network) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  })());
});
