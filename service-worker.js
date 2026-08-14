// LSL service worker.
// Strategy: network-first for anything under /data/ (scores, standings,
// news - this changes constantly and should never be stale-served when a
// connection is available), cache-first for everything else (CSS/JS/images
// - these rarely change and most already carry version query strings for
// busting). Cross-origin requests (Firebase/Firestore, CDN'd Firebase SDK)
// are left completely alone - this worker never touches them.

const CACHE_NAME = "lsl-cache-v5";

const APP_SHELL = [
  "./",
  "./index.html",
  "./lsl-pulse.html",
  "./manifest.json",
  "./css/main.css",
  "./css/components.css",
  "./css/responsive.css",
  "./js/main.js",
  "./js/lslPulse.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/dataLoader.js",
  "./js/leagueEngine.js",
  "./js/animations.js",
  "./components/navbar.js",
  "./components/footer.js",
  "./Logos/lsl-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => console.error("SW install: shell cache failed", error))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isDataRequest(url) {
  return url.pathname.includes("/data/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin (Firebase, CDNs)

  if (isDataRequest(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached);
    })
  );
});
