// ─── The doctor's books: page-level index + search for the Notebook agent ────
// Books are uploaded from the browser as page text (PDF.js), stored privately at
//   users/{uid}/books/{bookId}                    { title, pageCount, textPages, status, updatedAt }
//   users/{uid}/books/{bookId}/shards/{n}         { pages: [{ page, text }] }   (≤ ~700 KB each)
// On the server each page is cut into short passages that keep their book + page,
// and searched with BM25 (+ a small Indian/medical synonym list). The index is
// cached per function instance and rebuilt only when the books change.

const STOP = new Set("the a an is are was were be been have has had do does will would could should may might can to of in for on with at by from as into and or but if then when where which who that this these those it its they them we you i my he she her his not no also than such".split(" "));

// Colloquial / Indian terms → textbook terms (both directions are added to the query).
const SYNONYMS = [
  ["loose", "motions", "stools", "diarrhoea", "diarrhea", "gastroenteritis"],
  ["fits", "fit", "seizure", "seizures", "convulsion", "convulsions"],
  ["fever", "febrile", "pyrexia"],
  ["cold", "coryza", "rhinorrhoea", "rhinorrhea", "nasal"],
  ["fast", "breathing", "tachypnoea", "tachypnea", "respiratory", "distress"],
  ["yellow", "jaundice", "icterus", "hyperbilirubinemia", "hyperbilirubinaemia", "bilirubin"],
  ["vomiting", "vomit", "emesis"],
  ["pale", "pallor", "anaemia", "anemia"],
  ["rash", "exanthem", "eruption"],
  ["swelling", "oedema", "edema"],
  ["noisy", "wheeze", "wheezing"],
  ["baby", "infant", "infants", "neonate", "newborn"],
  ["stomach", "abdominal", "abdomen", "belly"],
  ["urine", "urinary", "micturition", "dysuria"],
];
const SYN = new Map();
for (const group of SYNONYMS) for (const w of group) SYN.set(w, group);

export function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => t.length > 2 && !STOP.has(t));
}

function expandQuery(q) {
  const base = tokenize(q);
  const out = new Map(base.map(t => [t, 1]));
  for (const t of base) for (const s of SYN.get(t) || []) if (!out.has(s) && s.length > 2) out.set(s, 0.5);
  return out; // token → weight
}

// Join words hyphenated across PDF line breaks, normalise quotes/whitespace.
export function normText(s) {
  return String(s || "").replace(/­/g, "").replace(/(\w)-\s+(\w)/g, "$1$2")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

// Split a page into overlapping ~110-word passages.
function passagesOf(text, size = 110, overlap = 25) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    out.push(words.slice(i, i + size).join(" "));
    if (i + size >= words.length) break;
  }
  return out;
}

export class BookIndex {
  constructor(books) {
    // books: [{ id, title, label, pages: Map(page → text) }]
    this.books = new Map(books.map(b => [b.id, b]));
    this.labelToId = new Map(books.map(b => [b.label, b.id]));
    this.passages = [];
    this.df = new Map();
    let total = 0;
    for (const b of books) {
      for (const [page, text] of b.pages) {
        passagesOf(text).forEach((p, n) => {
          const tokens = tokenize(p);
          const tf = new Map();
          tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
          const id = `${b.label}-p${page}-${n + 1}`;
          this.passages.push({ id, bookId: b.id, page, text: p, tf, len: tokens.length });
          total += tokens.length;
          tf.forEach((_, t) => this.df.set(t, (this.df.get(t) || 0) + 1));
        });
      }
    }
    this.avgdl = this.passages.length ? total / this.passages.length : 1;
    this.byId = new Map(this.passages.map(p => [p.id, p]));
  }

  get size() { return this.passages.length; }

  search(query, k = 8) {
    const q = expandQuery(query);
    const N = this.passages.length;
    if (!N || !q.size) return [];
    const scored = [];
    for (const p of this.passages) {
      let s = 0;
      for (const [t, w] of q) {
        const f = p.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) || 0;
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        s += w * idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * p.len / this.avgdl));
      }
      if (s > 0) scored.push([s, p]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    // At most 2 passages from the same page, so results cover more of the books.
    const perPage = new Map(), out = [];
    for (const [score, p] of scored) {
      const key = `${p.bookId}:${p.page}`;
      if ((perPage.get(key) || 0) >= 2) continue;
      perPage.set(key, (perPage.get(key) || 0) + 1);
      out.push({ ...p, score });
      if (out.length >= k) break;
    }
    return out;
  }

  pageText(bookId, page) { return this.books.get(bookId)?.pages.get(page) ?? null; }
  pagePassages(bookId, page) { return this.passages.filter(p => p.bookId === bookId && p.page === page); }
  title(bookId) { return this.books.get(bookId)?.title || "Unknown book"; }
}

// ── Loading + per-instance cache ─────────────────────────────────────────────
const cache = new Map(); // uid → { signature, index }

export async function loadBookIndex(db, uid) {
  const snap = await db.collection(`users/${uid}/books`).where("status", "==", "ready").get();
  const metas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
  const signature = metas.map(m => `${m.id}:${m.textPages}:${m.updatedAtMs || 0}`).join("|");
  const hit = cache.get(uid);
  if (hit && hit.signature === signature) return hit.index;

  const books = [];
  for (const [i, m] of metas.entries()) {
    const shards = await db.collection(`users/${uid}/books/${m.id}/shards`).get();
    const pages = new Map();
    shards.docs.forEach(s => (s.data().pages || []).forEach(p => { if (p?.text) pages.set(Number(p.page), String(p.text)); }));
    books.push({ id: m.id, title: m.title || `Book ${i + 1}`, label: `B${i + 1}`, pages });
  }
  const index = new BookIndex(books);
  cache.set(uid, { signature, index });
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  return index;
}
