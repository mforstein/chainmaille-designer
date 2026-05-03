// Woven Rainbows by Erin — Service Worker
// Strategy: cache-first for assets, network-first for API/Supabase

const CACHE_NAME = "chainmaille-v1";

// App shell assets to pre-cache
const PRECACHE_URLS = ["/", "/wovenrainbowsbyerin", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Pass through Supabase, external APIs, and non-GET requests
  if (
    event.request.method !== "GET" ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("stripe.com")
  ) {
    return;
  }

  // Network-first for navigation (HTML pages — always fresh)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match("/offline.html").then((r) => r ?? new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ico)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});
