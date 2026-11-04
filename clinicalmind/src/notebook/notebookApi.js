// ─── Client API for the ClinicFlow Notebook ──────────────────────────────────
import { httpsCallable } from "firebase/functions";
import { collection, doc, onSnapshot, query, orderBy, setDoc, deleteDoc, getDocs, writeBatch } from "firebase/firestore";
import { db, functions } from "../firebase.js";

export const askNotebook = async (payload) => (await httpsCallable(functions, "askNotebook", { timeout: 300_000 })(payload)).data;

export const watchBooks = (uid, cb, onErr) =>
  onSnapshot(query(collection(db, `users/${uid}/books`), orderBy("createdAtMs")), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onErr);

// PDF.js is bundled with the app (no CDN), so book upload works on any network.
let pdfjsPromise = null;
function loadPdfJs() {
  pdfjsPromise ||= Promise.all([
    import("pdfjs-dist/build/pdf.min.mjs"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  }).catch(e => { pdfjsPromise = null; throw new Error("Could not load the PDF reader: " + (e?.message || e)); });
  return pdfjsPromise;
}

const SHARD_BYTES = 650_000; // stay well under Firestore's 1 MB document limit

/**
 * Extract text page by page in the browser and store it privately in Firestore.
 * Returns { pageCount, textPages }. Scanned (image-only) pages have no text and are skipped.
 */
export async function uploadBook(uid, file, onProgress = () => {}) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const bookRef = doc(collection(db, `users/${uid}/books`));
  const now = Date.now();
  const title = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 200) || "Untitled book";
  await setDoc(bookRef, { title, fileName: file.name.slice(0, 200), pageCount: pdf.numPages, textPages: 0, status: "uploading", createdAtMs: now, updatedAtMs: now });

  let shard = [], shardBytes = 0, shardNo = 0, textPages = 0;
  const flush = async () => {
    if (!shard.length) return;
    await setDoc(doc(db, `users/${uid}/books/${bookRef.id}/shards/${String(shardNo++).padStart(4, "0")}`), { pages: shard });
    shard = []; shardBytes = 0;
  };
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(it => it.str + (it.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+/g, " ").trim();
    if (text.length >= 40) {
      const bytes = text.length * 2 + 32;
      if (shardBytes + bytes > SHARD_BYTES || shard.length >= 200) await flush();
      shard.push({ page: i, text });
      shardBytes += bytes;
      textPages++;
    }
    if (i % 10 === 0 || i === pdf.numPages) onProgress(i, pdf.numPages);
  }
  await flush();
  await setDoc(bookRef, { title, fileName: file.name.slice(0, 200), pageCount: pdf.numPages, textPages, status: "ready", createdAtMs: now, updatedAtMs: Date.now() });
  return { pageCount: pdf.numPages, textPages };
}

export async function renameBook(uid, book, title) {
  await setDoc(doc(db, `users/${uid}/books/${book.id}`), { title: title.slice(0, 200), fileName: book.fileName || "", pageCount: book.pageCount, textPages: book.textPages, status: book.status, createdAtMs: book.createdAtMs, updatedAtMs: Date.now() });
}

export async function deleteBook(uid, bookId) {
  const shards = await getDocs(collection(db, `users/${uid}/books/${bookId}/shards`));
  const batch = writeBatch(db);
  shards.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  await deleteDoc(doc(db, `users/${uid}/books/${bookId}`));
}
