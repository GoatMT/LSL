// Firebase web app config for LSL Pulse.
export const FIREBASE_ENABLED = true;

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBfof4zVfIuZreJZUDaw2AOzGTpggQwXcY",
  authDomain: "lsl-pulse1.firebaseapp.com",
  projectId: "lsl-pulse1",
  storageBucket: "lsl-pulse1.firebasestorage.app",
  messagingSenderId: "161853176873",
  appId: "1:161853176873:web:a5ce7392bad9c59ecc3038",
};

// Web Push certificate key pair (VAPID) for Firebase Cloud Messaging.
// Get this from: Firebase Console -> Project Settings -> Cloud Messaging ->
// Web configuration -> Web Push certificates -> "Key pair". Until a real
// key is set here, enablePushNotifications() will fail gracefully (the
// button will show an error status) rather than breaking page load.
export const FIREBASE_VAPID_KEY = "";
