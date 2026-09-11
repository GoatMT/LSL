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
    imageDataUrl: data.imageDataUrl || "",
    accountId: data.accountId || "",
    likesBy: Array.isArray(data.likesBy) ? data.likesBy : [],
    dislikesBy: Array.isArray(data.dislikesBy) ? data.dislikesBy : [],
    repostsBy: Array.isArray(data.repostsBy) ? data.repostsBy : [],
    replies: Array.isArray(data.replies) ? data.replies : [],
    createdAtMs: Number(data.createdAtMs) || 0,
  };
}

function sanitizeInteraction(docSnap) {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    likesBy: Array.isArray(data.likesBy) ? data.likesBy : [],
    dislikesBy: Array.isArray(data.dislikesBy) ? data.dislikesBy : [],
    repostsBy: Array.isArray(data.repostsBy) ? data.repostsBy : [],
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
          interactions[item.id] = { likesBy: item.likesBy, dislikesBy: item.dislikesBy, repostsBy: item.repostsBy, replies: item.replies };
        });
        onOfficialInteractions?.(interactions);
      },
      (error) => onStatus?.(`Pulse sync issue: ${error.message}`)
    );

    onStatus?.("");

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
          return { id: usernameKey, username: account.username || username.trim(), usernameKey, avatarDataUrl: account.avatarDataUrl || "" };
        }

        const account = {
          username: username.trim(),
          usernameKey,
          pinHash,
          avatarDataUrl: "",
          createdAtMs: Date.now(),
        };
        await firestore.setDoc(accountRef, account);
        return { id: usernameKey, username: account.username, usernameKey, avatarDataUrl: "" };
      },
      async updateAvatar(usernameKeyValue, avatarDataUrl) {
        await firestore.setDoc(firestore.doc(accountsCol, usernameKeyValue), { avatarDataUrl }, { merge: true });
      },
      async createUserPost(post) {
        const postRef = firestore.doc(userPostsCol, post.id);
        await firestore.setDoc(postRef, {
          ...post,
          likesBy: [],
          dislikesBy: [],
          replies: [],
          createdAtMs: Date.now(),
        });
      },
      async likeUserPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { likesBy: firestore.arrayUnion(accountId), dislikesBy: firestore.arrayRemove(accountId) },
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
      async dislikeUserPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { dislikesBy: firestore.arrayUnion(accountId), likesBy: firestore.arrayRemove(accountId) },
          { merge: true }
        );
      },
      async undislikeUserPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { dislikesBy: firestore.arrayRemove(accountId) },
          { merge: true }
        );
      },
      async repostUserPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { repostsBy: firestore.arrayUnion(accountId) },
          { merge: true }
        );
      },
      async unrepostUserPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(userPostsCol, postId),
          { repostsBy: firestore.arrayRemove(accountId) },
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
          { likesBy: firestore.arrayUnion(accountId), dislikesBy: firestore.arrayRemove(accountId) },
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
      async dislikeOfficialPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(officialInteractionsCol, postId),
          { dislikesBy: firestore.arrayUnion(accountId), likesBy: firestore.arrayRemove(accountId) },
          { merge: true }
        );
      },
      async undislikeOfficialPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(officialInteractionsCol, postId),
          { dislikesBy: firestore.arrayRemove(accountId) },
          { merge: true }
        );
      },
      async repostOfficialPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(officialInteractionsCol, postId),
          { repostsBy: firestore.arrayUnion(accountId) },
          { merge: true }
        );
      },
      async unrepostOfficialPost(postId, accountId) {
        await firestore.setDoc(
          firestore.doc(officialInteractionsCol, postId),
          { repostsBy: firestore.arrayRemove(accountId) },
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

// One-time (non-live) fetch of every user post and every official
// interaction record, for building a single account's profile page
// (Posted / Liked / Disliked / Reposted). Falls back to empty arrays
// when Firebase isn't configured, so the profile page can still fall
// back to whatever is in this browser's local storage.
export async function fetchAllPulsePosts() {
  if (!hasConfig()) return { userPosts: [], officialInteractions: {} };

  try {
    const firestore = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`);
    const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
    const app = appModule.initializeApp(FIREBASE_CONFIG);
    const db = firestore.getFirestore(app);
    const rootDoc = firestore.doc(db, PULSE_ROOT, PULSE_ID);
    const userPostsCol = firestore.collection(rootDoc, "userPosts");
    const officialInteractionsCol = firestore.collection(rootDoc, "officialInteractions");

    const [userPostsSnap, officialSnap] = await Promise.all([
      firestore.getDocs(userPostsCol),
      firestore.getDocs(officialInteractionsCol),
    ]);

    const officialInteractions = {};
    officialSnap.docs.forEach((docSnap) => {
      officialInteractions[docSnap.id] = sanitizeInteraction(docSnap);
    });

    return {
      userPosts: userPostsSnap.docs.map(sanitizePost),
      officialInteractions,
    };
  } catch (error) {
    console.error("Could not fetch Pulse profile data", error);
    return { userPosts: [], officialInteractions: {} };
  }
}

// Public, non-admin directory of every Pulse username, for @mention
// autocomplete and for rendering @mentions as links in post/reply bodies.
// Only exposes id + username - never pinHash.
export async function fetchAllPulseAccounts() {
  if (!hasConfig()) return [];

  try {
    const firestore = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`);
    const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
    const app = appModule.initializeApp(FIREBASE_CONFIG);
    const db = firestore.getFirestore(app);
    const rootDoc = firestore.doc(db, PULSE_ROOT, PULSE_ID);
    const accountsCol = firestore.collection(rootDoc, "accounts");
    const snapshot = await firestore.getDocs(accountsCol);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return { id: docSnap.id, username: data.username || docSnap.id, avatarDataUrl: data.avatarDataUrl || "" };
    });
  } catch (error) {
    console.error("Could not fetch Pulse accounts", error);
    return [];
  }
}

// Admin tools: list every account, reset a forgotten PIN, remove an
// account's login (their posts stay, just no one can log back into that
// exact account), and merge one account into another (moves every post,
// like, dislike, repost, and reply from "from" onto "into", then removes
// the "from" account). Not gated by Firestore security rules beyond
// whatever the rest of Pulse already allows - see admin.html for the
// (client-side only) passphrase gate.
export async function createPulseAdminStore() {
  if (!hasConfig()) return null;

  try {
    const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
    const firestore = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`);
    const app = appModule.initializeApp(FIREBASE_CONFIG);
    const db = firestore.getFirestore(app);
    const rootDoc = firestore.doc(db, PULSE_ROOT, PULSE_ID);
    const userPostsCol = firestore.collection(rootDoc, "userPosts");
    const accountsCol = firestore.collection(rootDoc, "accounts");
    const officialInteractionsCol = firestore.collection(rootDoc, "officialInteractions");

    function arraysEqual(a = [], b = []) {
      if (a.length !== b.length) return false;
      const setB = new Set(b);
      return a.every((item) => setB.has(item));
    }

    function mergeArray(list = [], fromKey, intoKey) {
      const set = new Set(list);
      if (set.has(fromKey)) {
        set.delete(fromKey);
        set.add(intoKey);
      }
      return [...set];
    }

    return {
      enabled: true,
      async listAccounts() {
        const [accountsSnap, userPostsSnap] = await Promise.all([firestore.getDocs(accountsCol), firestore.getDocs(userPostsCol)]);
        const postCounts = new Map();
        userPostsSnap.docs.forEach((docSnap) => {
          const accId = docSnap.data()?.accountId;
          if (accId) postCounts.set(accId, (postCounts.get(accId) || 0) + 1);
        });

        return accountsSnap.docs
          .map((docSnap) => {
            const data = docSnap.data() || {};
            return {
              id: docSnap.id,
              username: data.username || docSnap.id,
              usernameKey: data.usernameKey || docSnap.id,
              createdAtMs: Number(data.createdAtMs) || 0,
              postCount: postCounts.get(docSnap.id) || 0,
            };
          })
          .sort((a, b) => a.username.localeCompare(b.username));
      },
      async resetAccountPin(usernameKeyValue, newPin) {
        const pinHash = await hashPin(usernameKeyValue, newPin);
        await firestore.setDoc(firestore.doc(accountsCol, usernameKeyValue), { pinHash }, { merge: true });
      },
      async deleteAccount(usernameKeyValue) {
        await firestore.deleteDoc(firestore.doc(accountsCol, usernameKeyValue));
      },
      async mergeAccounts(fromKey, intoKey) {
        if (!fromKey || !intoKey) throw new Error("Choose both an account to merge from and an account to merge into.");
        if (fromKey === intoKey) throw new Error("Choose two different accounts to merge.");

        const [accountsSnap, userPostsSnap, officialSnap] = await Promise.all([
          firestore.getDocs(accountsCol),
          firestore.getDocs(userPostsCol),
          firestore.getDocs(officialInteractionsCol),
        ]);

        const intoAccountDoc = accountsSnap.docs.find((docSnap) => docSnap.id === intoKey);
        const fromAccountDoc = accountsSnap.docs.find((docSnap) => docSnap.id === fromKey);
        if (!intoAccountDoc) throw new Error("The account to merge into was not found.");
        if (!fromAccountDoc) throw new Error("The account to merge from was not found.");
        const intoUsername = intoAccountDoc.data()?.username || intoKey;

        let postsMoved = 0;
        let repliesMoved = 0;
        const batch = firestore.writeBatch(db);

        const processDoc = (docSnap) => {
          const data = docSnap.data() || {};
          const updates = {};
          let touched = false;

          if (data.accountId === fromKey) {
            updates.accountId = intoKey;
            updates.author = intoUsername;
            postsMoved += 1;
            touched = true;
          }

          const likesBy = mergeArray(data.likesBy, fromKey, intoKey);
          if (!arraysEqual(likesBy, data.likesBy || [])) {
            updates.likesBy = likesBy;
            touched = true;
          }
          const dislikesBy = mergeArray(data.dislikesBy, fromKey, intoKey);
          if (!arraysEqual(dislikesBy, data.dislikesBy || [])) {
            updates.dislikesBy = dislikesBy;
            touched = true;
          }
          const repostsBy = mergeArray(data.repostsBy, fromKey, intoKey);
          if (!arraysEqual(repostsBy, data.repostsBy || [])) {
            updates.repostsBy = repostsBy;
            touched = true;
          }

          const originalReplies = Array.isArray(data.replies) ? data.replies : [];
          const movedInThisDoc = originalReplies.filter((reply) => reply.accountId === fromKey).length;
          if (movedInThisDoc > 0) {
            updates.replies = originalReplies.map((reply) =>
              reply.accountId === fromKey ? { ...reply, accountId: intoKey, author: intoUsername } : reply
            );
            repliesMoved += movedInThisDoc;
            touched = true;
          }

          if (touched) batch.set(docSnap.ref, updates, { merge: true });
        };

        userPostsSnap.docs.forEach(processDoc);
        officialSnap.docs.forEach(processDoc);
        batch.delete(firestore.doc(accountsCol, fromKey));

        await batch.commit();
        return { postsMoved, repliesMoved };
      },
    };
  } catch (error) {
    console.error("Could not connect Pulse admin store", error);
    return null;
  }
}
