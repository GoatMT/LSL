/* =========================================================
   LSL SERVICE WORKER
   Lantern Soccer League
   =========================================================

   Strategy
   ---------------------------------------------------------
   1. HTML / page navigation
      -> NETWORK FIRST
      -> Cache fallback only when offline

   2. LSL Pulse
      -> NETWORK FIRST
      -> Never allow an old Pulse version to silently win

   3. JSON / data
      -> NETWORK FIRST
      -> Cache fallback when offline

   4. CSS / JS / images / fonts
      -> STALE WHILE REVALIDATE
      -> Fast loading while still updating in background

   5. Firebase / external services
      -> NEVER intercepted if cross-origin

   6. Old service-worker caches
      -> Automatically deleted on activation
   ========================================================= */

const CACHE_NAME = "lsl-cache-v130";
const NETWORK_TIMEOUT_MS = 6_000;

/*
 * Static files that are safe to cache.
 *
 * IMPORTANT:
 * Do not put Firebase-generated/user-specific data here.
 */
const APP_SHELL = [
  "./",
  "./index.html",
  "./hall-of-fame.html",
  "./free-agents.html",
  "./record-watch.html",
  "./captaincy.html",
  "./lsl-timeline.html",
  "./player-vs-player.html",
  "./player-tiers.html",
  "./projected.html",
  "./manifest.json",

  /* Main CSS */
  "./css/main.css",
  "./css/components.css",
  "./css/responsive.css",
  "./css/modern-system.css",
  "./css/playoff-bracket.css",
  "./css/players.css",
  "./css/player-tiers.css",
  "./css/home-facts.css",
  "./css/records.css",
  "./css/hall-of-fame.css",
  "./css/free-agents.css",
  "./css/archive-pages.css",
  "./css/game-enhancements.css",
  "./css/pulse-weekly.css",
  "./js/homeFacts.js",

  /* Core JS */
  "./js/main.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/dataLoader.js",
  "./js/leagueEngine.js",
  "./js/playerVsPlayer.js",
  "./js/playerTiers.js",
  "./js/projected.js",
  "./js/animations.js",
  "./js/hallOfFame.js",
  "./js/freeAgents.js",
  "./js/recordWatch.js",
  "./js/captaincy.js",
  "./js/lslTimeline.js",

  /* Components */
  "./components/navbar.js",
  "./components/footer.js",

  /* Logo */
  "./Logos/lsl-logo.png",
  "./Logos/lantern-of-knowledge-academy.png",
  "./Logos/NoInternet.png",
];

/*
 * These pages are important to LSL Pulse.
 *
 * They are NOT precached.
 * They are fetched from the network first.
 */
const PULSE_PATHS = [
  "/lsl-pulse.html",
  "/pulse-user.html",
  "/js/lslPulse.js",
  "/js/pulseUser.js",
  "/js/pulseFirebase.js",
  "/js/pulseShared.js",
];

/*
 * Requests that should never be cached.
 *
 * This prevents the service worker from interfering with
 * authentication, Firebase/API-style requests, or other
 * dynamic resources.
 */
const NEVER_CACHE_PATHS = [
  "/api/",
  "/auth/",
  "/firestore/",
  "/firebase/",
];

/*
 * Comparison controls should show the latest page logic after a normal
 * reload, while still falling back to the cached script when offline.
 */
const NETWORK_FIRST_ASSET_PATHS = [
  "/js/playerVsPlayer.js",
  "/js/players.js",
  "/css/players.css",
];

/* =========================================================
   HELPERS
   ========================================================= */

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isPulseRequest(url) {
  const pathname = url.pathname;

  return PULSE_PATHS.some((path) => {
    return pathname.endsWith(path);
  });
}

function isNetworkFirstAsset(url) {
  return (
    NETWORK_FIRST_ASSET_PATHS.some((path) => url.pathname.endsWith(path)) ||
    /\.(?:js|css)$/i.test(url.pathname)
  );
}

function isDataRequest(url) {
  return (
    url.pathname.includes("/data/") ||
    url.pathname.endsWith(".json")
  );
}

function isMediaRequest(url) {
  return url.pathname.includes("/media/");
}

function shouldNeverCache(url) {
  return NEVER_CACHE_PATHS.some((path) =>
    url.pathname.includes(path)
  );
}

function isStaticAsset(request) {
  const destination = request.destination;

  return [
    "script",
    "style",
    "image",
    "font",
    "audio",
    "video",
  ].includes(destination);
}

/*
 * Only cache successful responses.
 */
function isCacheableResponse(response) {
  return (
    response &&
    response.ok &&
    response.type !== "opaque"
  );
}

async function fetchWithTimeout(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  if (typeof AbortController !== "function") return fetch(request);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener("install", (event) => {
  console.log("[LSL SW] Installing:", CACHE_NAME);

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        /*
         * Cache files individually instead of using cache.addAll().
         *
         * This is more reliable because one missing file will not
         * cause the entire service worker installation to fail.
         */
        for (const file of APP_SHELL) {
          try {
            await cache.add(file);
            console.log("[LSL SW] Cached:", file);
          } catch (error) {
            console.warn(
              "[LSL SW] Could not cache:",
              file,
              error
            );
          }
        }
      })
      .then(() => self.skipWaiting())
  );
});

/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener("activate", (event) => {
  console.log("[LSL SW] Activating:", CACHE_NAME);

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log(
                "[LSL SW] Deleting old cache:",
                name
              );

              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener("fetch", (event) => {
  const request = event.request;

  /*
   * Only GET requests are handled.
   */
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /*
   * Never touch external requests.
   *
   * This is especially important for Firebase, Google APIs,
   * CDNs, analytics, etc.
   */
  if (!isSameOrigin(url)) {
    return;
  }

  /*
   * Never cache explicitly dynamic paths.
   */
  if (shouldNeverCache(url)) {
    return;
  }

  /* =======================================================
     1. LSL PULSE
     =======================================================

     Pulse is dynamic and should always try the network first.

     This prevents an old service worker from returning an
     outdated Pulse page or outdated Pulse JavaScript.
  */
  if (isPulseRequest(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  /* =======================================================
     2. PAGE NAVIGATION
     =======================================================

     HTML pages should always prefer the live website.
  */
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  /* =======================================================
     3. DATA / JSON
     =======================================================

     Scores, standings, player data, etc. should prefer the
     newest available data.
  */
  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  /*
   * Uploaded media is versioned by filename. Prefer the network so a newly
   * published clip or replacement image never gets stuck behind an old cache.
   */
  if (isMediaRequest(url)) {
    event.respondWith(networkFirst(request, { cache: "no-store" }));
    return;
  }

  /* =======================================================
     4. LIVE SITE CODE
     =======================================================

     Site JavaScript and CSS should not wait for a background
     stale-while-revalidate update before showing a new fix.
  */
  if (isNetworkFirstAsset(url)) {
    event.respondWith(networkFirst(request, { cache: "no-store" }));
    return;
  }

  /* =======================================================
     5. STATIC ASSETS
     =======================================================

     CSS, normal JS, images, fonts, etc.

     Serve cache immediately, then update the cache.
  */
  if (isStaticAsset(request)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  /*
   * Everything else gets network first.
   */
  event.respondWith(networkFirst(request));
});

/* =========================================================
   WEB PUSH
   ========================================================= */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json() || {};
  } catch {
    payload = { data: { body: event.data.text() } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || "LSL Update";
  const body = notification.body || data.body || "";
  const targetUrl = data.url || notification.click_action || "/lsl-pulse.html";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/Logos/lsl-logo.png",
      badge: "/Logos/lsl-logo.png",
      data: { url: targetUrl },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/lsl-pulse.html", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => "focus" in client);
      if (existingClient) {
        existingClient.navigate(targetUrl);
        return existingClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

/* =========================================================
   NETWORK FIRST
   ========================================================= */

async function networkFirst(request, fetchOptions = {}) {
  const networkRequest = Object.keys(fetchOptions).length
    ? new Request(request, fetchOptions)
    : request;

  try {
    const response = await fetchWithTimeout(networkRequest);

    /*
     * Never replace a good cached file with an error response.
     */
    if (isCacheableResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.warn(
      "[LSL SW] Network failed:",
      request.url
    );

    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    return new Response("This LSL resource is unavailable offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=UTF-8" },
    });
  }
}

function offlinePageResponse() {
  const logoURL = new URL("./Logos/NoInternet.png", self.registration.scope).href;
  return new Response(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#111713">
        <title>LSL Offline</title>
        <style>
          :root { color-scheme: dark; font-family: Inter, "Segoe UI", system-ui, sans-serif; background: #111713; color: #f5f7f4; }
          * { box-sizing: border-box; }
          body { min-height: 100vh; margin: 0; padding: 36px 20px; display: grid; place-items: center; background: #111713; }
          main { width: min(100%, 760px); text-align: center; }
          .status { display: inline-flex; align-items: center; gap: 9px; color: #e7bd70; font-size: .78rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
          .status::before { width: 9px; height: 9px; border-radius: 50%; background: #e7bd70; content: ""; box-shadow: 0 0 0 4px rgb(231 189 112 / 14%); }
          h1 { margin: 12px 0 8px; font-size: clamp(1.8rem, 5vw, 2.6rem); line-height: 1.1; }
          .intro { max-width: 560px; margin: 0 auto 22px; color: #bbc7be; line-height: 1.65; }
          .details { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin: 0 0 22px; text-align: left; }
          .detail { min-width: 0; padding: 12px 14px; border: 1px solid #39443d; border-radius: 8px; background: #1b231e; }
          .detail dt { margin-bottom: 5px; color: #aab7ad; font-size: .68rem; font-weight: 750; text-transform: uppercase; }
          .detail dd { margin: 0; overflow-wrap: anywhere; font-size: .92rem; font-weight: 700; font-variant-numeric: tabular-nums; }
          time { color: #f4d394; font-size: 1.05rem !important; }
          .logo { display: block; width: min(250px, 62vw); max-height: 250px; margin: 0 auto 22px; object-fit: contain; }
          .copy-title { margin: 0 0 8px; color: #f4d394; font-size: 1.25rem; }
          .copy { max-width: 590px; margin: 0 auto; color: #c0cbc3; line-height: 1.65; }
          .reasons { width: fit-content; max-width: 100%; margin: 12px auto 20px; padding-left: 22px; color: #c0cbc3; text-align: left; line-height: 1.7; }
          button { min-height: 44px; padding: 10px 18px; border: 1px solid #57936a; border-radius: 7px; background: #124b29; color: white; font: inherit; font-weight: 800; cursor: pointer; }
          button:hover { background: #176137; }
          button:focus-visible { outline: 3px solid #f4d394; outline-offset: 3px; }
          @media (max-width: 560px) { body { padding: 25px 16px; } .details { grid-template-columns: repeat(2, minmax(0, 1fr)); } .detail { padding: 10px; } }
          @media (prefers-reduced-motion: no-preference) { main { animation: arrive .5s ease-out both; } @keyframes arrive { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } } }
        </style>
      </head>
      <body>
        <main>
          <div class="status">Connection unavailable</div>
          <h1>No Internet Connection</h1>
          <p class="intro">The live LSL site is not responding. These diagnostics come from this device and work offline.</p>
          <dl class="details" aria-label="Offline diagnostics">
            <div class="detail"><dt>Local time (IRL)</dt><dd><time id="local-time"></time></dd></div>
            <div class="detail"><dt>Local date</dt><dd id="local-date"></dd></div>
            <div class="detail"><dt>Time zone (EST/EDT when applicable)</dt><dd id="timezone"></dd></div>
            <div class="detail"><dt>UTC offset</dt><dd id="utc-offset"></dd></div>
            <div class="detail"><dt>Region estimate (device time zone)</dt><dd id="location"></dd></div>
            <div class="detail"><dt>Public IP</dt><dd>Not available offline</dd></div>
            <div class="detail"><dt>Browser language</dt><dd id="locale"></dd></div>
            <div class="detail"><dt>Network signal</dt><dd id="network-signal"></dd></div>
            <div class="detail"><dt>Connection type</dt><dd id="connection-type"></dd></div>
            <div class="detail"><dt>Site status</dt><dd>Could not connect</dd></div>
          </dl>
          <img class="logo" src="${logoURL}" alt="No Internet connection">
          <h2 class="copy-title">Lantern Soccer League is Offline.</h2>
          <p class="copy">The Lantern Soccer League could not connect to the live website. Check your internet connection and try again. Problem might be:</p>
          <ul class="reasons">
            <li>Your internet connection is disconnected or unstable.</li>
            <li>The LSL website or its hosting service is temporarily unavailable.</li>
            <li>A network, firewall, or DNS setting is blocking the connection.</li>
          </ul>
          <button type="button" onclick="location.reload()">Try again</button>
        </main>
        <script>
          const locale = navigator.language || "en-CA";
          const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Device local time";
          const timeFormatter = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
          const dateFormatter = new Intl.DateTimeFormat(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
          const offsetLabel = (date) => { const minutes = -date.getTimezoneOffset(); const sign = minutes >= 0 ? "+" : "-"; const absolute = Math.abs(minutes); return "UTC" + sign + String(Math.floor(absolute / 60)).padStart(2, "0") + ":" + String(absolute % 60).padStart(2, "0"); };
          const updateClock = () => { const now = new Date(); const region = zone.split("/").pop().replace(/_/g, " "); document.getElementById("local-time").dateTime = now.toISOString(); document.getElementById("local-time").textContent = timeFormatter.format(now); document.getElementById("local-date").textContent = dateFormatter.format(now); document.getElementById("timezone").textContent = zone; document.getElementById("utc-offset").textContent = offsetLabel(now); document.getElementById("location").textContent = region + " (" + zone + ")"; document.getElementById("locale").textContent = locale; document.getElementById("network-signal").textContent = navigator.onLine ? "Network detected; site unreachable" : "Offline"; document.getElementById("connection-type").textContent = navigator.connection && navigator.connection.effectiveType ? navigator.connection.effectiveType : "Not reported by browser"; };
          updateClock(); setInterval(updateClock, 1000);
        </script>
      </body>
    </html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } }
  );
}

/* =========================================================
   NAVIGATION NETWORK FIRST
   ========================================================= */

async function networkFirstNavigation(request) {
  try {
    const response = await fetchWithTimeout(request);

    if (isCacheableResponse(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.warn(
      "[LSL SW] Navigation network failed:",
      request.url
    );

    /*
     * First try the exact page.
     */
    const cachedPage = await caches.match(request);

    if (cachedPage) {
      return cachedPage;
    }

    return offlinePageResponse();
  }
}

/* =========================================================
   STALE WHILE REVALIDATE
   ========================================================= */

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const networkUpdate = fetch(request)
    .then(async (response) => {
      if (isCacheableResponse(response)) {
        const cache = await caches.open(CACHE_NAME);

        await cache.put(
          request,
          response.clone()
        );
      }

      return response;
    })
    .catch((error) => {
      console.warn(
        "[LSL SW] Background update failed:",
        request.url
      );

      return null;
    });

  /*
   * If cached, return it immediately.
   *
   * The network request continues in the background.
   */
  if (cached) {
    return cached;
  }

  /*
   * Nothing cached yet, so wait for network.
   */
  const response = await networkUpdate;

  if (response) {
    return response;
  }

  return new Response(
    "Resource unavailable.",
    {
      status: 503,
      headers: {
        "Content-Type": "text/plain",
      },
    }
  );
}

/* =========================================================
   MESSAGE HANDLING
   ========================================================= */

self.addEventListener("message", (event) => {
  if (!event.data) {
    return;
  }

  /*
   * Allows the website to force the service worker to activate.
   */
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  /*
   * Allows the website to completely clear the LSL cache.
   */
  if (event.data.type === "CLEAR_LSL_CACHE") {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log("[LSL SW] Cache cleared.");
      })
    );
  }
});

