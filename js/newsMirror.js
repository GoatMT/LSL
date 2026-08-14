import { FIREBASE_CONFIG, FIREBASE_ENABLED } from "./firebaseConfig.js";

const FIREBASE_SDK_VERSION = "12.17.1";
const PULSE_ROOT = "lslPulse";
const PULSE_ID = "main";
const MIRROR_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // only mirror articles published in the last 3 days

function hasConfig() {
  return Boolean(FIREBASE_ENABLED && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}

function articleDateValue(article) {
  const value = Date.parse(`${article.date || ""} 12:00:00`);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Mirrors recently-published articles into Firestore so a Cloud Function can
 * detect "new article" and send a push notification.
 *
 * News lives in a static JSON file, not a database, so there's no server-side
 * event to hook a Cloud Function into. Instead, this runs client-side after
 * news.html loads: it (re)writes a small doc per recent article, using the
 * article's own id as the Firestore doc id.
 *
 * setDoc(..., {merge:true}) makes this safe to call on every page load - the
 * Cloud Function's onCreate trigger only fires the FIRST time a given doc id
 * is created, so re-mirroring an already-mirrored article sends no duplicate
 * notification, it just refreshes the stored fields.
 */
export async function mirrorLatestNewsArticles(articles = []) {
  if (!hasConfig()) return;
  const cutoff = Date.now() - MIRROR_WINDOW_MS;
  const recent = articles.filter((article) => articleDateValue(article) >= cutoff);
  if (!recent.length) return;

  const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
  const firestore = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`);
  const app = appModule.getApps().length ? appModule.getApps()[0] : appModule.initializeApp(FIREBASE_CONFIG);
  const db = firestore.getFirestore(app);
  const rootDoc = firestore.doc(db, PULSE_ROOT, PULSE_ID);
  const mirrorCol = firestore.collection(rootDoc, "newsMirror");

  await Promise.all(
    recent.map((article) =>
      firestore
        .setDoc(
          firestore.doc(mirrorCol, article.id),
          {
            headline: article.headline || "LSL News",
            subtitle: article.subtitle || "",
            date: article.date || "",
            category: article.category || "",
            url: `./news.html?id=${encodeURIComponent(article.id)}`,
            mirroredAtMs: Date.now(),
          },
          { merge: true }
        )
        .catch((error) => console.warn(`Could not mirror article ${article.id}`, error))
    )
  );
}
