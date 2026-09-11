const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");

setGlobalOptions({ maxInstances: 5 });

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

function truncate(text = "", max = 120) {
  const trimmed = String(text).trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}\u2026` : trimmed;
}

/**
 * Sends a notification to every registered device (collection "pushTokens",
 * written by js/pulseNotifications.js) and cleans up any tokens that come
 * back invalid (uninstalled app, revoked permission, expired token, etc.)
 * so future sends stay fast and don't keep retrying dead devices.
 */
async function sendToAllTokens({ title, body, url }) {
  const tokensSnap = await db.collection("pushTokens").get();
  const tokenDocs = tokensSnap.docs.filter((docSnap) => !docSnap.data().revokedAt);
  const tokens = tokenDocs.map((docSnap) => docSnap.id);
  if (!tokens.length) return;

  const link = url || "./lsl-pulse.html";
  const message = {
    notification: { title, body },
    data: { url: link, title, body },
    tokens,
    webpush: {
      fcmOptions: { link },
      notification: { icon: "/Logos/lsl-logo.png" },
    },
  };

  const response = await messaging.sendEachForMulticast(message);

  const deletions = [];
  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code || "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
      deletions.push(db.collection("pushTokens").doc(tokens[index]).delete());
    }
  });
  if (deletions.length) await Promise.all(deletions);
}

// Fires the first time a new User Pulse post document is created
// (js/lslPulse.js / js/pulseFirebase.js write these).
exports.onPulsePostCreated = onDocumentCreated("lslPulse/main/userPosts/{postId}", async (event) => {
  const post = event.data?.data();
  if (!post) return;

  await sendToAllTokens({
    title: `New Pulse post from ${post.author || "an LSL fan"}`,
    body: truncate(post.title || post.body || "Tap to read the post."),
    url: "./lsl-pulse.html",
  });
});

// Fires the first time a news article gets mirrored into Firestore
// (js/newsMirror.js writes these - see that file for why News needs a
// mirror step instead of triggering directly off the static JSON).
exports.onNewsArticleMirrored = onDocumentCreated("lslPulse/main/newsMirror/{articleId}", async (event) => {
  const article = event.data?.data();
  if (!article) return;

  await sendToAllTokens({
    title: "New LSL News",
    body: truncate(article.headline || "A new article was just published."),
    url: article.url || "./news.html",
  });
});
