import { FIREBASE_CONFIG, FIREBASE_ENABLED } from "./firebaseConfig.js";

const FIREBASE_SDK_VERSION = "10.12.5";

export async function createLiveMatchCentreClient({ onUpdates, onStatus, onAuthChange } = {}) {
  if (!FIREBASE_ENABLED || !FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId || !FIREBASE_CONFIG.appId) {
    onStatus?.("Firebase live sync is not configured.");
    return null;
  }

  try {
    const [appSdk, authSdk, firestoreSdk, functionsSdk] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-functions.js`),
    ]);
    const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
    const auth = authSdk.getAuth(app);
    const db = firestoreSdk.getFirestore(app);
    const functions = functionsSdk.getFunctions(app);
    const updatesQuery = firestoreSdk.query(firestoreSdk.collection(db, "liveMatchCentre"));
    const unsubscribeUpdates = firestoreSdk.onSnapshot(
      updatesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const rows = snapshot.docs.map((document) => {
          const data = document.data() || {};
          return {
            ...data,
            documentId: document.id,
            updatedAtMs: data.updatedAt?.toMillis?.() || Number(data.updatedAtMs) || 0,
          };
        });
        onUpdates?.(rows);
        onStatus?.(snapshot.metadata.fromCache ? "Showing cached live updates; reconnecting..." : "");
      },
      (error) => onStatus?.(`Live score sync unavailable: ${error.message}`)
    );
    const unsubscribeAuth = authSdk.onAuthStateChanged(auth, async (user) => {
      if (!user) {
        onAuthChange?.({ user: null, isAdmin: false });
        return;
      }
      try {
        const token = await authSdk.getIdTokenResult(user, true);
        if (token.claims.lslMatchAdmin === true) {
          onAuthChange?.({ user: { email: user.email || "Admin account" }, isAdmin: true });
          return;
        }
        onAuthChange?.({ user: null, isAdmin: false, unauthorized: true });
        await authSdk.signOut(auth);
      } catch (error) {
        onAuthChange?.({ user: null, isAdmin: false, error: error.message });
      }
    });

    return {
      async signIn(email, password) {
        const credential = await authSdk.signInWithEmailAndPassword(auth, email, password);
        const token = await authSdk.getIdTokenResult(credential.user, true);
        if (token.claims.lslMatchAdmin !== true) {
          await authSdk.signOut(auth);
          throw new Error("This account does not have verified LSL match-admin access.");
        }
      },
      signOut() {
        return authSdk.signOut(auth);
      },
      async publish(update) {
        const callable = functionsSdk.httpsCallable(functions, "publishLiveMatchUpdate");
        const response = await callable(update);
        return response.data;
      },
      dispose() {
        unsubscribeUpdates();
        unsubscribeAuth();
      },
    };
  } catch (error) {
    console.error("Could not initialize LSL live match sync", error);
    onStatus?.(`Live score sync unavailable: ${error.message}`);
    return null;
  }
}
