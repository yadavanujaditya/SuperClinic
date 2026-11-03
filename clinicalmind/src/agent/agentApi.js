// ─── Client API for the SuperSummary learning agent ──────────────────────────
import { httpsCallable } from "firebase/functions";
import {
  collection, doc, onSnapshot, query, orderBy, limit, where, updateDoc, deleteDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import { db, functions } from "../firebase.js";

const call = (name, timeout = 70_000) => httpsCallable(functions, name, { timeout });

export function friendlyCallError(e) {
  // Firebase callable errors carry a code + the server's message
  if (e?.code === "functions/unauthenticated") return "Please sign in first.";
  if (e?.code === "functions/unavailable" || e?.code === "functions/deadline-exceeded") return "Couldn't reach the server — check your internet and try again.";
  return e?.message?.replace(/^.*?:\s*/, "") || "Something went wrong.";
}

// Upload in chunks of 50 (server limit). Returns { added: [{id, identifiersRemoved}] }
export async function addSummaries(summaries) {
  const added = [];
  for (let i = 0; i < summaries.length; i += 50) {
    const r = await call("addSummaries")({ summaries: summaries.slice(i, i + 50) });
    added.push(...r.data.added);
  }
  return { added };
}

export const startLearning = async () => (await call("startLearning")()).data;
export const draftSummary = async (payload) => (await call("draftSummary", 300_000)(payload)).data;

// ── Live data ────────────────────────────────────────────────────────────────
const snapList = (q, cb, onErr) => onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);

export const watchSummaries = (uid, cb, onErr) =>
  snapList(query(collection(db, `users/${uid}/summaries`), orderBy("createdAt", "desc"), limit(1000)), cb, onErr);
export const watchMemories = (uid, cb, onErr) =>
  snapList(collection(db, `users/${uid}/memories`), list => cb(list.sort((a, b) => a.path.localeCompare(b.path))), onErr);
export const watchLatestLearnRun = (uid, cb, onErr) =>
  snapList(query(collection(db, `users/${uid}/agentRuns`), where("kind", "==", "learn"), orderBy("createdAt", "desc"), limit(1)), l => cb(l[0] || null), onErr);
export const watchProfile = (uid, cb) => onSnapshot(doc(db, `users/${uid}`), s => cb(s.data() || {}));

// ── Doctor edits ─────────────────────────────────────────────────────────────
export const setSummaryCategory = (uid, id, category) =>
  updateDoc(doc(db, `users/${uid}/summaries/${id}`), { category: category || null, categorySource: category ? "doctor" : null });
export const setSummaryDoctor = (uid, id, doctorLabel) =>
  updateDoc(doc(db, `users/${uid}/summaries/${id}`), { doctorLabel: doctorLabel || null });
export const deleteSummary = (uid, id) => deleteDoc(doc(db, `users/${uid}/summaries/${id}`));
export const setAutoLearn = (uid, on) => setDoc(doc(db, `users/${uid}`), { autoLearn: !!on }, { merge: true });

export function memoryPathValid(path) {
  return /^\/memories\/[A-Za-z0-9_./-]{1,180}$/.test(path) && !path.includes("..");
}
export const saveMemory = (uid, path, content) =>
  setDoc(doc(db, `users/${uid}/memories/${encodeURIComponent(path)}`), { path, content, updatedAt: serverTimestamp(), updatedBy: "doctor" });
export const deleteMemory = (uid, path) => deleteDoc(doc(db, `users/${uid}/memories/${encodeURIComponent(path)}`));

// Split pasted text into several summaries on lines of 3+ dashes / equals.
export function splitPasted(text) {
  return text.split(/\n\s*(?:-{3,}|={3,})\s*\n/).map(s => s.trim()).filter(s => s.length >= 80);
}

// Plain text of a verified draft (missing items as [brackets]).
export function draftToText(draft) {
  return draft.sections.map(s => `${s.heading.toUpperCase()}\n` + s.lines.map(l => l.source === "missing" ? `[${l.text}]` : l.text).join("\n")).join("\n\n");
}
