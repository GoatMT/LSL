import { escapeHTML } from "./utils.js";
import { FIREBASE_CONFIG, FIREBASE_ENABLED, FIREBASE_VAPID_KEY } from "./firebaseConfig.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, doc, setDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging.js";

// Push notifications for League News and User Pulse.
//
// How it fits together:
//   - This file: asks for permission, registers this browser/device with
//     FCM, and saves the resulting token to Firestore (collection
//     "pushTokens"). Also listens for foreground pushes (tab open + focused)
//     since Firebase does NOT run the service worker's background handler
//     in that case.
//   - service-worker.js: handles pushes that arrive while no tab is
//     focused/open (background messages) and turns them into an OS
//     notification.
//   - Cloud Functions (functions/index.js, deployed separately): watch for
//     new User Pulse posts and new League News articles, and send the
//     actual push to every token in "pushTokens".
//
// iPhone note: Safari only supports web push for a site that has been
// "Added to Home Screen" (iOS 16.4+). A normal Safari tab cannot receive
// push notifications at all - there is no way around this, it's an iOS
// platform restriction, not a bug here.

const TOKENS_COLLECTION = "pushTokens";
const PERMISSION_KEY = "lsl-push-permission-state";

let firebaseApp = null;
let db = null;
let messagingInstance = null;

function isStandaloneIOS() {
  return window.navigator.standalone === true;
}

function isIOS() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOSDevice || isIPadOS13Plus;
}

async function pushIsSupportedHere() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;
  if (isIOS() && !isStandaloneIOS()) return false; // Safari tab, not installed - can't support push at all
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

async function ensureFirebase() {
  if (!FIREBASE_ENABLED) return false;
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
    db = getFirestore(firebaseApp);
  }
  if (!messagingInstance) {
    messagingInstance = getMessaging(firebaseApp);
  }
  return true;
}

async function saveToken(token) {
  if (!db) return;
  await setDoc(
    doc(db, TOKENS_COLLECTION, token),
    {
      token,
      userAgent: navigator.userAgent || "",
      platform: isIOS() ? "ios" : /Android/i.test(navigator.userAgent || "") ? "android" : "desktop",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function forgetToken(token) {
  if (!db || !token) return;
  try {
    await setDoc(doc(db, TOKENS_COLLECTION, token), { revokedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error("Could not mark push token as revoked", error);
  }
}

export function pushPermissionState() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function enablePushNotifications() {
  const supported = await pushIsSupportedHere();
  if (!supported) {
    if (isIOS() && !isStandaloneIOS()) return { ok: false, reason: "ios-not-installed" };
    return { ok: false, reason: "unsupported" };
  }

  await ensureFirebase();

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messagingInstance, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, reason: "no-token" };

    await saveToken(token);
    localStorage.setItem(PERMISSION_KEY, token);

    onMessage(messagingInstance, (payload) => {
      // Foreground message (tab open + focused): the service worker's
      // background handler does not run in this case, so show it here.
      const title = payload.notification?.title || payload.data?.title || "LSL Update";
      const body = payload.notification?.body || payload.data?.body || "";
      const url = payload.data?.url || "./lsl-pulse.html";
      if (Notification.permission === "granted") {
        const notification = new Notification(title, { body, icon: "./Logos/lsl-logo.png" });
        notification.onclick = () => window.open(url, "_blank");
      }
    });

    return { ok: true, token };
  } catch (error) {
    console.error("Could not enable push notifications", error);
    return { ok: false, reason: "error", error };
  }
}

export async function disablePushNotifications() {
  const token = localStorage.getItem(PERMISSION_KEY);
  if (token) {
    await ensureFirebase();
    await forgetToken(token);
    localStorage.removeItem(PERMISSION_KEY);
  }
  return { ok: true };
}

function statusLabel(state) {
  return {
    default: "Notifications are off.",
    granted: "Notifications are on for this device.",
    denied: "Notifications are blocked in your browser settings.",
    unsupported: "This browser does not support push notifications.",
  }[state] || "";
}

export function renderNotificationButton() {
  const state = pushPermissionState();
  const alreadyRegistered = !!localStorage.getItem(PERMISSION_KEY);
  return `
    <div class="pulse-notify-row" data-pulse-notify-row>
      <button type="button" class="button${state === "granted" && alreadyRegistered ? " secondary" : " primary"}" data-pulse-notify-button>
        ${state === "granted" && alreadyRegistered ? "🔕 Turn Off Notifications" : "🔔 Enable Notifications"}
      </button>
      <small data-pulse-notify-status>${escapeHTML(statusLabel(state))}</small>
    </div>
  `;
}

export function initNotificationButton(root) {
  const row = root.querySelector("[data-pulse-notify-row]");
  const button = root.querySelector("[data-pulse-notify-button]");
  const status = root.querySelector("[data-pulse-notify-status]");
  if (!button) return;

  button.addEventListener("click", async () => {
    button.disabled = true;
    const alreadyRegistered = !!localStorage.getItem(PERMISSION_KEY);

    if (alreadyRegistered) {
      await disablePushNotifications();
      button.textContent = "🔔 Enable Notifications";
      button.classList.remove("secondary");
      button.classList.add("primary");
      if (status) status.textContent = "Notifications are off.";
      button.disabled = false;
      return;
    }

    const result = await enablePushNotifications();
    if (result.ok) {
      button.textContent = "🔕 Turn Off Notifications";
      button.classList.remove("primary");
      button.classList.add("secondary");
      if (status) status.textContent = "Notifications are on for this device.";
    } else if (result.reason === "ios-not-installed") {
      if (status) status.textContent = "On iPhone, add LSL to your Home Screen first (Share -> Add to Home Screen), then open it from there to enable notifications.";
    } else if (result.reason === "denied") {
      if (status) status.textContent = "Notifications are blocked. Allow them in your browser's site settings, then try again.";
    } else if (result.reason === "unsupported") {
      if (status) status.textContent = "This browser does not support push notifications.";
    } else {
      if (status) status.textContent = "Could not enable notifications. Try again in a moment.";
    }
    button.disabled = false;
  });
}
