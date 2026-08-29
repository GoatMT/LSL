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

const CACHE_NAME = "lsl-cache-v25";

/*
 * Static files that are safe to cache.
 *
 * IMPORTANT:
 * Do not put Firebase-generated/user-specific data here.
 */
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",

  /* Main CSS */
  "./css/main.css",
  "./css/components.css",
  "./css/responsive.css",

  /* Core JS */
  "./js/main.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/dataLoader.js",
  "./js/leagueEngine.js",
  "./js/animations.js",

  /* Components */
  "./components/navbar.js",
  "./components/footer.js",

  /* Logo */
  "./Logos/lsl-logo.png",
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

function isDataRequest(url) {
  return (
    url.pathname.includes("/data/") ||
    url.pathname.endsWith(".json")
  );
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

  /* =======================================================
     4. STATIC ASSETS
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
   NETWORK FIRST
   ========================================================= */

async function networkFirst(request) {
  try {
    const response = await fetch(request);

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

    /*
     * Return a clean offline response instead of throwing.
     */
    return new Response(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>LSL Offline</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0b120d;
            color: white;
            font-family: Arial, sans-serif;
            text-align: center;
          }

          .box {
            max-width: 500px;
            padding: 32px;
          }

          h1 {
            margin-bottom: 12px;
          }

          p {
            opacity: .75;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>LSL is Offline</h1>
          <p>
            The Lantern Soccer League could not connect
            to the live website.
          </p>
          <p>
            Check your internet connection and try again.
          </p>
        </div>
      </body>
      </html>
      `,
      {
        status: 503,
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
        },
      }
    );
  }
}

/* =========================================================
   NAVIGATION NETWORK FIRST
   ========================================================= */

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);

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

    /*
     * Then try the index page.
     */
    const index = await caches.match("./index.html");

    if (index) {
      return index;
    }

    return new Response(
      "LSL is currently offline.",
      {
        status: 503,
        headers: {
          "Content-Type": "text/plain",
        },
      }
    );
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
