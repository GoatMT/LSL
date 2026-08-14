// LSL service worker.
// Strategy: network-first for page navigations (the actual HTML pages people
// load - these should never be stale-served when a connection is available)
// and for anything under /data/ (scores, standings, news - same reasoning).
// Cache-first for everything else (CSS/JS/images - these rarely change and
// most already carry version query strings for busting). Cross-origin
// requests (Firebase/Firestore, CDN'd Firebase SDK) are left completely
// alone - this worker never touches them.

const CACHE_NAME = "lsl-cache-v8";

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
  "./js/pulseFirebase.js",
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

// ---------- Push notifications (Firebase Cloud Messaging) ----------
// This has to be a classic (non-module) service worker for the widest
// browser support - notably Safari on iOS, which is the whole point of
// this feature. That means firebaseConfig.js (an ES module) can't be
// imported here directly, so the same values are duplicated below. If the
// Firebase project or its web app config ever changes, update both
// js/firebaseConfig.js and this block.
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBfof4zVfIuZreJZUDaw2AOzGTpggQwXcY",
  authDomain: "lsl-pulse1.firebaseapp.com",
  projectId: "lsl-pulse1",
  storageBucket: "lsl-pulse1.firebasestorage.app",
  messagingSenderId: "161853176873",
  appId: "1:161853176873:web:a5ce7392bad9c59ecc3038",
});

const messaging = firebase.messaging();

// Fires when a push arrives while no LSL tab is focused/open. (If a tab IS
// open and focused, Firebase delivers the message to that page's JS instead
// via onMessage(), not here - see lslPulse.js / news.js.)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "LSL Update";
  const body = payload.notification?.body || payload.data?.body || "";
  const url = payload.data?.url || "./lsl-pulse.html";

  self.registration.showNotification(title, {
    body,
    icon: "./Logos/lsl-logo.png",
    badge: "./Logos/lsl-logo.png",
    data: { url },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./lsl-pulse.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
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
