import { FIREBASE_CONFIG, FIREBASE_ENABLED } from "./firebaseConfig.js";

const FIREBASE_SDK_VERSION = "10.12.5";
const PULSE_ROOT = "lslPulse";
const PULSE_ID = "main";

function hasConfig() {
  return Boolean(FIREBASE_ENABLED && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}

function normalizeUsername(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, "-");
}

function sanitizePost(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    type: "user",
    author: data.author || "LSL User",
    badge: data.badge || "User Pulse",
    date: data.date || "Date TBA",
    title: data.title || "",
    body: data.body || "",
    accountId: data.accountId || "",
    likesBy: Array.isArray(data.likesBy) ? data.likesBy : [],
    replies: Array.isArray(data.replies) ? data.replies : [],
    createdAtMs: Number(data.createdAtMs) || 0,
  };
}

function sanitizeInteraction(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    likesBy: Array.isArray(data.likesBy) ? data.likesBy : [],
    replies: Array.isArray(data.replies) ? data.replies : [],
  };
}

async function hashPin(usernameKey, pin) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${usernameKey}:${pin}`));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createPulseCloudStore({ onUserPosts, onOfficialInteractions, onStatus } = {}) {
  if (!hasConfig()) {
    onStatus?.("Local mode. Add Firebase config to sync between devices.");
    return null;
  }

  try {
    const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
    const firestore = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`);
    const app = appModule.initializeApp(FIREBASE_CONFIG);
    const db = firestore.getFirestore(app);

    const rootDoc = firestore.doc(db, PULSE_ROOT, PULSE_ID);
    const userPostsCol = firestore.collection(rootDoc, "userPosts");
    const accountsCol = firestore.collection(rootDoc, "accounts");
    const officialInteractionsCol = firestore.collection(rootDoc, "officialInteractions");

    const userPostsQuery = firestore.query(userPostsCol, firestore.orderBy("createdAtMs", "desc"));
    const unsubscribeUserPosts = firestore.onSnapshot(
      userPostsQuery,
      (snapshot) => onUserPosts?.(snapshot.docs.map(sanitizePost)),
      (error) => onStatus?.(`Pulse sync issue: ${error.message}`)
    );

    const unsubscribeOfficialInteractions = firestore.onSnapshot(
      officialInteractionsCol,
      (snapshot) => {
        const interactions = {};
        snapshot.docs.forEach((docSnap) => {
          const item = sanitizeInteraction(docSnap);
          interactions[item.id] = { likesBy: item.likesBy, replies: item.replies };
        });
        onOfficialInteractions?.(interactions);
      },
      (error) => onStatus?.(`Pulse sync issue: ${error.message}`)
    );

    onStatus?.("Cloud sync on.");

    return {
      enabled: true,
      async login(username, pin) {
        const usernameKey = normalizeUsername(username);
        const accountRef = firestore.doc(accountsCol, usernameKey);
        const accountSnap = await firestore.getDoc(accountRef);
        const pinHash = await hashPin(usernameKey, pin);

        if (accountSnap.exists()) {
          const account = accountSnap.data();
          if (account.pinHash !== pinHash) throw new Error("That PIN does not match this username.");
          return { id: usernameKey, username: account.username || username.trim(), usernameKey };
        }

        const account = {
          username: username.trim(),
          usernameKey,
          pinHash,
          createdAtMs: Date.now(),
        };
        await firestore.setDoc(accountRef, account);
        return { id: usernameKey, username: account.username, usernameKey };
      },
      async createUserPost(post) {
        const postRef = firestore.doc(userPostsCol, post.id);
        await firestore.setDoc(postRef, {
          ...post,
          likesBy: [],
          replies: [],
          createdAtMs: Date.now(),
        });
      },
      async likeUserPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { likesBy: firestore.arrayUnion(accountId) },
          { merge: true }
        );
      },
      async unlikeUserPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { likesBy: firestore.arrayRemove(accountId) },
          { merge: true }
        );
      },
      async replyUserPost(postId, reply) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { replies: firestore.arrayUnion(reply) },
          { merge: true }
        );
      },
      async deleteUserPost(postId) {
        await firestore.deleteDoc(firestore.doc(userPostsCol, postId));
      },
      async deleteUserReply(postId, reply) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { replies: firestore.arrayRemove(reply) },
          { merge: true }
        );
      },
      async likeOfficialPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(officialInteractionsCol, postId),
          { likesBy: firestore.arrayUnion(accountId) },
          { merge: true }
        );
      },
      async unlikeOfficialPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(officialInteractionsCol, postId),
          { likesBy: firestore.arrayRemove(accountId) },
          { merge: true }
        );
      },
      async replyOfficialPost(postId, reply) {
        await firestore.setDoc(
          firestore.doc(officialInteractionsCol, postId),
          { replies: firestore.arrayUnion(reply) },
          { merge: true }
        );
      },
      async deleteOfficialReply(postId, reply) {
        await firestore.setDoc(
          firestore.doc(officialInteractionsCol, postId),
          { replies: firestore.arrayRemove(reply) },
          { merge: true }
        );
      },
      unsubscribe() {
        unsubscribeUserPosts();
        unsubscribeOfficialInteractions();
      },
    };
  } catch (error) {
    onStatus?.(`Local mode. Firebase did not connect: ${error.message}`);
    return null;
  }
}
