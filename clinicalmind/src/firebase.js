// ─── Firebase setup ──────────────────────────────────────────────────────────
// Config comes from Vite env vars (see .env.example). For local testing, set
// VITE_USE_EMULATORS=true and the app talks to the Firebase Local Emulator Suite
// (Auth + Firestore on localhost) — no real Firebase project needed.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";

const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === "true";

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (useEmulators ? "demo-api-key" : ""),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  // "demo-" project IDs are special: the emulators accept them without a real project.
  projectId: env.VITE_FIREBASE_PROJECT_ID || (useEmulators ? "demo-superclinic" : ""),
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || "",
};

// If nothing is configured the app keeps working exactly as before (on-device only).
export const firebaseEnabled = Boolean(config.apiKey && config.projectId);
export const usingEmulators = firebaseEnabled && useEmulators;

export let auth = null;
export let db = null;

if (firebaseEnabled) {
  const app = initializeApp(config);
  auth = getAuth(app);
  // Offline cache so the app keeps working on patchy hospital internet.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (useEmulators) {
    const host = env.VITE_EMULATOR_HOST || "127.0.0.1";
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
  }
}
