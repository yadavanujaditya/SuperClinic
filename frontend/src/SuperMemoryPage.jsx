import { useState, useRef, useEffect } from "react";
import { BM25 } from "./bm25.js";
import { DocumentVault, TagLibraryModal, PDFReader } from "./App.jsx";
import { useAuth } from "./AuthContext.jsx";
import { listBooks, uploadBook, downloadBook, deleteBook, listTags, upsertTagSource, removeTagSourceRemote, deleteTagRemote } from "./supermemory.js";

// Dedicated full-page SuperMemory manager — opened in its own browser tab so a user's
// uploaded books & tags are one click away, independent of the ClinicFlow session.
export default function SuperMemoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [pdfDocs, setPdfDocs] = useState([]);
  const [tagLibrary, setTagLibrary] = useState([]);
  const [readerState, setReaderState] = useState(null);
  const [tagLibraryOpen, setTagLibraryOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pdfBuffers = useRef(new Map());
  const idx = useRef(new BM25()).current;

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [books, tags] = await Promise.all([listBooks(), listTags()]);
        setPdfDocs(books.map(b => ({ name: b.name, numPages: b.num_pages, isPdf: true, parsed: false, bookId: b.id })));
        setTagLibrary(tags.map(t => ({
          id: t.id, label: t.label,
          sources: t.sources.map(s => ({ docName: s.doc_name, page: s.page, extractedText: s.extracted_text, image: s.image })),
        })));
      } catch (e) { console.error("Could not load your SuperMemory library:", e); }
      finally { setHydrated(true); }
    })();
  }, [user]);

  const addTagSource = (label, docName, page, extractedText, image) => {
    const norm = label.trim().toLowerCase();
    const existing = tagLibrary.find(t => t.label.toLowerCase() === norm);
    const id = existing?.id || ("tag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6));
    setTagLibrary(prev => {
      const match = prev.find(t => t.id === id);
      if (match) {
        if (match.sources.some(s => s.docName === docName && s.page === page)) return prev;
        return prev.map(t => t.id === id ? { ...t, sources: [...t.sources, { docName, page, extractedText, image }] } : t);
      }
      return [...prev, { id, label: label.trim(), sources: [{ docName, page, extractedText, image }] }];
    });
    const docEntry = pdfDocs.find(d => d.name === docName);
    if (docEntry?.bookId) {
      upsertTagSource(id, label.trim(), { doc_id: docEntry.bookId, doc_name: docName, page, extracted_text: extractedText, image }).catch(() => {});
    }
    return id;
  };

  const removeTagSource = (tagId, docName, page) => {
    setTagLibrary(prev => prev
      .map(t => t.id === tagId ? { ...t, sources: t.sources.filter(s => !(s.docName === docName && s.page === page)) } : t)
      .filter(t => t.sources.length > 0));
    const docEntry = pdfDocs.find(d => d.name === docName);
    if (docEntry?.bookId) removeTagSourceRemote(tagId, docEntry.bookId, page).catch(() => {});
  };

  const removeTag = (tagId) => {
    setTagLibrary(prev => prev.filter(t => t.id !== tagId));
    deleteTagRemote(tagId).catch(() => {});
  };

  const openReader = async (doc, initPage) => {
    if (!pdfBuffers.current.get(doc.name) && doc.bookId) {
      try { pdfBuffers.current.set(doc.name, await downloadBook(doc.bookId)); }
      catch (e) { alert("Could not load this book: " + e.message); return; }
    }
    setReaderState({ doc, initPage: initPage || 1 });
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-primary)" }}>
        <p data-testid="supermemory-page-loading" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 600 }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "var(--color-background-primary)", padding: 24, textAlign: "center" }}>
        <span style={{ fontSize: 34 }}>✨</span>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Sign in to open SuperMemory</h1>
        <p data-testid="supermemory-page-signin-required" style={{ fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 320, margin: 0 }}>
          Your books and tags are tied to your account. Please sign in from the main app first, then reopen this tab.
        </p>
        <a data-testid="supermemory-page-go-home-link" href="/" style={{ marginTop: 6, padding: "10px 20px", borderRadius: 20, background: "#f59e0b", color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
          Go to SuperClinic →
        </a>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-primary)" }}>
        <p data-testid="supermemory-page-loading" style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 600 }}>Loading your library…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-primary)" }}>
      <div style={{ background: "linear-gradient(120deg,#b45309,#f59e0b)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(245,158,11,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>✨</span>
          <div>
            <h1 data-testid="supermemory-page-title" style={{ fontSize: 19, fontWeight: 900, margin: 0, color: "#fff" }}>SuperMemory</h1>
            <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.9)", margin: 0 }}>Your books &amp; custom tags — synced to your profile</p>
          </div>
        </div>
        <button data-testid="supermemory-page-close-tab-btn" onClick={() => window.close()}
          style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 700, border: "1.5px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          Close Tab
        </button>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 16px 60px" }}>
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "var(--shadow-sm)", border: "1.5px solid var(--color-border-primary)", padding: 20 }}>
          <DocumentVault
            pdfDocs={pdfDocs} setPdfDocs={setPdfDocs} idx={idx}
            tagLibrary={tagLibrary} setTagLibrary={setTagLibrary} pdfBuffers={pdfBuffers}
            onOpenReader={openReader}
            onOpenTagLibrary={() => setTagLibraryOpen(true)}
            defaultExpanded
          />
        </div>
      </div>

      {readerState && (
        <PDFReader
          docName={readerState.doc.name}
          buf={pdfBuffers.current.get(readerState.doc.name)}
          initPage={readerState.initPage || 1}
          tagLibrary={tagLibrary}
          onAddTagSource={addTagSource}
          onRemoveTagSource={removeTagSource}
          onOpenTagLibrary={() => setTagLibraryOpen(true)}
          onClose={() => setReaderState(null)}
          onCreateComplaint={() => alert("Open ClinicFlow to turn a PDF selection into a complaint workflow.")}
        />
      )}
      {tagLibraryOpen && (
        <TagLibraryModal
          tagLibrary={tagLibrary}
          pdfBuffers={pdfBuffers}
          onRemoveTag={removeTag}
          onOpenReader={async (docName, page) => {
            const doc = pdfDocs.find(d => d.name === docName);
            if (!doc) return;
            setTagLibraryOpen(false);
            await openReader(doc, page);
          }}
          onClose={() => setTagLibraryOpen(false)}
        />
      )}
    </div>
  );
}
