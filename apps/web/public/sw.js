const CACHE = "kort-shell-v3";
const SHELL = ["/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isPersonal(pathname) {
  return pathname.startsWith("/api");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (isPersonal(url.pathname)) return;

  if (url.pathname.startsWith("/_next/static") || url.pathname.endsWith(".png") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(event.request).then((hit) => {
        if (hit) return hit;
        return fetch(event.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const path = url.pathname;
          if (res.ok && !res.redirected && (path === "/login" || path === "/register" || path === "/offline.html")) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(path, copy));
          }
          return res;
        })
        .catch(async () => {
          if (url.pathname === "/login" || url.pathname === "/register") {
            const page = await caches.match(url.pathname);
            if (page) return page;
          }
          const offline = await caches.match("/offline.html");
          return offline || new Response("Çevrimdışısın", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
        }),
    );
  }
});
