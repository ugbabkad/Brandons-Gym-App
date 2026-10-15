// Service worker: caches the app shell so the tracker works fully offline.
// Bump CACHE_NAME whenever any cached file changes so clients pick up the update.
const CACHE_NAME = "brandons-gym-app-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./js/cloud.js",
  "./js/db.js",
  "./js/store.js",
  "./js/routine.js",
  "./js/progression.js",
  "./js/chat.js",
  "./js/formGuidance.js",
  "./js/app.js",
  "./js/warmup.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Cache-first for the app shell; network falls back to cache for everything
// else same-origin. Cross-origin requests (e.g. a future Claude API call)
// are left to the network untouched — never cached.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
