// Firebase web app config for LSL Pulse and push notifications.
export const FIREBASE_ENABLED = true;

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBfof4zVfIuZreJZUDaw2AOzGTpggQwXcY",
  authDomain: "lsl-pulse1.firebaseapp.com",
  projectId: "lsl-pulse1",
  storageBucket: "lsl-pulse1.firebasestorage.app",
  messagingSenderId: "161853176873",
  appId: "1:161853176873:web:a5ce7392bad9c59ecc3038",
};

// Web Push certificate (VAPID key) from Firebase Console -> Project Settings
// -> Cloud Messaging -> Web configuration. Required by getToken() to
// register this browser/device for push notifications.
export const FIREBASE_VAPID_KEY = "BHPRTOB7x1PA_hN6IsxHcq7qhqiGhVe6JYeM3JOSSVsvtkkd-iKGsBZADtZE5bA2UrcIp3G60bY5NsXDwH1B7x8";
