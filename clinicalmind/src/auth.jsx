// ─── Auth context + cloud sync hooks ─────────────────────────────────────────
// Data model (Firestore):
//   users/{uid}                    → { provider, instructionsGeneric, instructionsDetailed, email, updatedAt }
//   users/{uid}/complaints/{id}    → { json, name, createdMs, updatedAt }
//   users/{uid}/templates/{id}     → { json, name, createdMs, updatedAt }
// Items are stored as a JSON string because complaint workflows / templates can
// contain nested arrays, which Firestore fields don't allow.
// API keys are deliberately NOT synced — they stay on this device only.
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fbSignOut,
} from "firebase/auth";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp, writeBatch, deleteField,
} from "firebase/firestore";
import { auth, db, firebaseEnabled } from "./firebase.js";

// localStorage keys mirrored to the cloud
export const LS = {
  complaints: "clinicalmind:complaints",
  templates: "clinicalmind:templates",
  provider: "clinicalmind:provider",
  instructionsGeneric: "clinicalmind:instructions:generic",
  instructionsDetailed: "clinicalmind:instructions:detailed",
};

const readList = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
const writeList = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* storage full/blocked */ } };
const docId = (id) => encodeURIComponent(String(id));

// ── Auth ─────────────────────────────────────────────────────────────────────
const AuthCtx = createContext({ user: null, ready: true, enabled: false });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!firebaseEnabled);
  useEffect(() => {
    if (!firebaseEnabled) return;
    return onAuthStateChanged(auth, u => { setUser(u); setReady(true); });
  }, []);
  return <AuthCtx.Provider value={{ user, ready, enabled: firebaseEnabled }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export const signInWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signInWithEmail = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const signUpWithEmail = (email, pw) => createUserWithEmailAndPassword(auth, email, pw);

// Signing out clears synced data from this browser, so the next person on a
// shared hospital computer doesn't see it. It's safe in the cloud.
export async function signOut() {
  await fbSignOut(auth);
  [LS.complaints, LS.templates, LS.instructionsGeneric, LS.instructionsDetailed].forEach(k => localStorage.removeItem(k));
  window.dispatchEvent(new Event("superclinic:signed-out"));
}

export function friendlyAuthError(e) {
  const code = e?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Wrong email or password.";
  if (code.includes("email-already-in-use")) return "An account with this email already exists — sign in instead.";
  if (code.includes("weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("invalid-email")) return "That email address doesn't look right.";
  if (code.includes("popup-closed")) return "Sign-in window was closed.";
  if (code.includes("network")) return "No internet connection.";
  return e?.message || "Something went wrong.";
}

// ── Synced list (complaints / templates) ─────────────────────────────────────
// Keeps localStorage as the working copy (so the app works offline / logged out)
// and mirrors it to Firestore when signed in. On first sign-in, anything saved
// locally before is uploaded, so nothing is lost.
export function useSyncedList(kind, lsKey) {
  const { user } = useAuth();
  const [items, setItemsState] = useState(() => readList(lsKey));
  const createdRef = useRef(new Map()); // id → createdMs, to keep list order stable

  const setItems = useCallback((list) => { writeList(lsKey, list); setItemsState(list); }, [lsKey]);

  useEffect(() => {
    const onOut = () => setItemsState([]);
    window.addEventListener("superclinic:signed-out", onOut);
    return () => window.removeEventListener("superclinic:signed-out", onOut);
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const col = collection(db, "users", user.uid, kind);
    let first = true;
    const unsub = onSnapshot(col, async (snap) => {
      const cloud = snap.docs
        .map(d => { const x = d.data(); try { return { item: JSON.parse(x.json), createdMs: x.createdMs || 0 }; } catch { return null; } })
        .filter(Boolean)
        .sort((a, b) => a.createdMs - b.createdMs);
      cloud.forEach(c => createdRef.current.set(c.item.id, c.createdMs));

      if (first) {
        first = false;
        // Upload local-only items (data saved before signing in).
        const cloudIds = new Set(cloud.map(c => c.item.id));
        const localOnly = readList(lsKey).filter(it => it && it.id && !cloudIds.has(it.id));
        if (localOnly.length) {
          const batch = writeBatch(db);
          const base = Date.now();
          localOnly.forEach((it, i) => {
            const createdMs = base + i;
            createdRef.current.set(it.id, createdMs);
            batch.set(doc(col, docId(it.id)), { json: JSON.stringify(it), name: it.name || "", createdMs, updatedAt: serverTimestamp() });
          });
          try { await batch.commit(); } catch (e) { console.error(`Sync upload (${kind}) failed`, e); }
          return; // the snapshot fires again with the uploaded items
        }
      }
      setItems(cloud.map(c => c.item));
    }, (e) => console.error(`Sync listener (${kind}) failed`, e));
    return unsub;
  }, [user, kind, lsKey, setItems]);

  // Insert or replace by id.
  const upsert = useCallback((item) => {
    const prev = readList(lsKey);
    const i = prev.findIndex(p => p.id === item.id);
    const next = i >= 0 ? prev.map((p, j) => j === i ? item : p) : [...prev, item];
    setItems(next);
    if (user && db) {
      const createdMs = createdRef.current.get(item.id) ?? Date.now();
      createdRef.current.set(item.id, createdMs);
      setDoc(doc(db, "users", user.uid, kind, docId(item.id)),
        { json: JSON.stringify(item), name: item.name || "", createdMs, updatedAt: serverTimestamp() })
        .catch(e => console.error(`Sync save (${kind}) failed`, e));
    }
    return next;
  }, [user, kind, lsKey, setItems]);

  const remove = useCallback((id) => {
    const next = readList(lsKey).filter(p => p.id !== id);
    setItems(next);
    if (user && db) {
      deleteDoc(doc(db, "users", user.uid, kind, docId(id))).catch(e => console.error(`Sync delete (${kind}) failed`, e));
    }
    return next;
  }, [user, kind, lsKey, setItems]);

  return [items, upsert, remove];
}

// ── Synced preferences (provider + custom AI instructions) ───────────────────
const PREF_FIELDS = { provider: LS.provider, instructionsGeneric: LS.instructionsGeneric, instructionsDetailed: LS.instructionsDetailed };

let currentUid = null; // used by savePrefs, which is called from plain event handlers

// Writes to localStorage immediately and to the cloud when signed in.
// Pass null for a value to clear it (falls back to the built-in default).
export function savePrefs(partial) {
  const cloud = {};
  for (const [field, value] of Object.entries(partial)) {
    const key = PREF_FIELDS[field];
    if (!key) continue;
    if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    cloud[field] = value == null ? deleteField() : value;
  }
  if (currentUid && db) {
    setDoc(doc(db, "users", currentUid), { ...cloud, updatedAt: serverTimestamp() }, { merge: true })
      .catch(e => console.error("Sync prefs failed", e));
  }
}

// Pulls cloud prefs into localStorage; calls onChange(prefs) when they arrive.
export function usePrefsSync(onChange) {
  const { user } = useAuth();
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    currentUid = user?.uid || null;
    if (!user || !db) return;
    const ref = doc(db, "users", user.uid);
    let first = true;
    return onSnapshot(ref, (snap) => {
      const data = snap.data() || {};
      if (first) {
        first = false;
        // First sign-in on this account: push this device's prefs up.
        if (!snap.exists()) {
          const local = {};
          for (const [field, key] of Object.entries(PREF_FIELDS)) {
            const v = localStorage.getItem(key);
            if (v != null) local[field] = v;
          }
          setDoc(ref, { ...local, email: user.email || "", updatedAt: serverTimestamp() }, { merge: true })
            .catch(e => console.error("Sync prefs failed", e));
          return;
        }
      }
      for (const [field, key] of Object.entries(PREF_FIELDS)) {
        if (typeof data[field] === "string") localStorage.setItem(key, data[field]);
        else if (field !== "provider") localStorage.removeItem(key);
      }
      cb.current?.(data);
    }, (e) => console.error("Sync prefs listener failed", e));
  }, [user]);
}
