// LSL service worker.
// Strategy: network-first for page navigations (the actual HTML pages people
// load - these should never be stale-served when a connection is available)
// and for anything under /data/ (scores, standings, news - same reasoning).
// Cache-first for everything else (CSS/JS/images - these rarely change and
// most already carry version query strings for busting). Cross-origin
// requests (Firebase/Firestore, CDN'd Firebase SDK) are left completely
// alone - this worker never touches them.

const CACHE_NAME = "lsl-cache-v10";

const APP_SHELL = [
  "./",
  "./index.html",
  "./lsl-pulse.html",
  "./pulse-user.html",
  "./manifest.json",
  "./css/main.css",
  "./css/components.css",
  "./css/responsive.css",
  "./js/main.js",
  "./js/lslPulse.js",
  "./js/pulseUser.js",
  "./js/pulseFirebase.js",
  "./js/pulseShared.js",
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

function isFreshConfigRequest(url) {
  return url.pathname.endsWith("/js/firebaseConfig.js");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin (Firebase, CDNs)

  // Page navigations (typing a URL, clicking a link, a normal refresh) always go network-first.
  // These are the actual pages people look at, so a stale cached copy should never win over a live
  // network response when one is available - only fall back to cache if the network fails (offline).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  if (isDataRequest(url) || isFreshConfigRequest(url)) {
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

  // Everything else (CSS/JS/images): stale-while-revalidate. Serve the
  // cached copy immediately if there is one (fast, and works offline), but
  // always also fetch a fresh copy in the background and update the cache
  // for next time. This is deliberately NOT pure cache-first - a plain
  // cache-first strategy means once a file is cached it is served forever
  // until CACHE_NAME changes, which silently serves stale JS/CSS to
  // returning visitors (including on phones, where there's no easy
  // hard-refresh gesture) every time this file gets edited.
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
