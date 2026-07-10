import { useState, useRef } from "react";
import { chunkText } from "./bm25.js";
import { initPDFJS, extractAllText } from "./pdfUtils.js";
import { uploadBook, deleteBook } from "./supermemory.js";
import { TEAL, RED, PURPLE } from "./theme.js";
import { CardCarousel, IllustLibrary, IllustDocs } from "./HomeHero.jsx";

// ─── SuperMemory (collapsed Document Vault) ──────────────────────────────────
export function DocumentVault({ pdfDocs, setPdfDocs, idx, tagLibrary, setTagLibrary, pdfBuffers, onOpenReader, onOpenTagLibrary, defaultExpanded = false }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(null);
  const [parsing, setParsing] = useState(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const fileRef = useRef();

  const processFile = async (file) => {
    const name = file.name;
    if (pdfDocs.find(d => d.name === name)) return;
    setLoading(name);
    try {
      const isPdf = file.type === "application/pdf";
      if (isPdf) {
        const buf = await file.arrayBuffer();
        await initPDFJS();
        const pdf = await window.pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        pdfBuffers.current.set(name, buf);
        setPdfDocs(prev => [...prev, { name, numPages: pdf.numPages, isPdf: true, parsed: false }]);
        try {
          const saved = await uploadBook(file, pdf.numPages);
          setPdfDocs(prev => prev.map(d => d.name === name ? { ...d, bookId: saved.id } : d));
        } catch (e) { console.error("Could not save book to your profile:", e); }
      } else {
        const text = await file.text();
        const chunks = chunkText(text, name);
        idx.add(chunks);
        setPdfDocs(prev => [...prev, { name, numPages: 0, isPdf: false, parsed: true, chunks: chunks.length }]);
      }
    } catch (e) { console.error(`Could not load ${name}:`, e); }
    finally { setLoading(null); }
  };

  const parseDoc = async (doc) => {
    const buf = pdfBuffers.current.get(doc.name);
    if (!buf) return;
    setParsing(doc.name);
    try {
      const text = await extractAllText(buf);
      const chunks = chunkText(text, doc.name);
      idx.add(chunks);
      setPdfDocs(prev => prev.map(d => d.name === doc.name ? { ...d, parsed: true, chunks: chunks.length } : d));
    } finally { setParsing(null); }
  };

  const removeDoc = (name) => {
    const doc = pdfDocs.find(d => d.name === name);
    pdfBuffers.current.delete(name);
    setPdfDocs(prev => prev.filter(d => d.name !== name));
    setTagLibrary(prev => prev
      .map(t => ({ ...t, sources: t.sources.filter(s => s.docName !== name) }))
      .filter(t => t.sources.length > 0));
    if (doc?.bookId) deleteBook(doc.bookId).catch(() => {});
  };

  const totalDocs = pdfDocs.length;
  const totalTags = tagLibrary.length;

  if (!expanded) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 2 }}>
          <CardCarousel accent={PURPLE.primary} height={110} slides={[IllustLibrary, IllustDocs]} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: PURPLE.primary, display: "inline-flex", alignItems: "center", gap: 6 }}>✨ SuperMemory</h3>
          <span style={{ fontSize: 10, background: PURPLE.bg, color: PURPLE.primary, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>AI INDEXED</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.45 }}>
          Forgotten asthma algorithm in OPD? Not anymore. Create your custom tags from your books and just review your custom tags.
        </p>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
          📄 {totalDocs} book{totalDocs !== 1 ? "s" : ""} uploaded · 🏷️ {totalTags} custom tag{totalTags !== 1 ? "s" : ""}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button 
            data-testid="supermemory-manage-books-btn"
            onClick={() => setExpanded(true)}
            style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${PURPLE.border}`, background: PURPLE.bg, color: PURPLE.primary, cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            📥 Manage Books & Tags
          </button>
          {totalTags > 0 && (
            <button 
              data-testid="supermemory-view-tag-library-btn"
              onClick={onOpenTagLibrary}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--color-border-primary)", background: "#fff", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
            >
              📚 View Tag Library
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: PURPLE.primary, display: "inline-flex", alignItems: "center", gap: 6 }}>✨ SuperMemory</h3>
        <button data-testid="supermemory-collapse-btn" onClick={() => setExpanded(false)} style={{ fontSize: 12, fontWeight: 600, color: PURPLE.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>Collapse ✕</button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Manage your medical books and protocol library</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {tagLibrary.length > 0 && (
            <button data-testid="document-vault-tag-library-btn" onClick={onOpenTagLibrary} style={{ fontSize: 12, fontWeight: 600, color: TEAL.primary, background: "none", border: "none", cursor: "pointer" }}>📚 Tag Library ({tagLibrary.length})</button>
          )}
          {pdfDocs.length > 0 && (
            <button data-testid="document-vault-clear-all-btn" onClick={() => { setPdfDocs([]); setTagLibrary([]); pdfBuffers.current.clear(); idx.clear(); }}
              style={{ fontSize: 12, color: RED.primary, background: "none", border: "none", cursor: "pointer" }}>Clear all</button>
          )}
        </div>
      </div>
      <div data-testid="document-vault-dropzone" onDrop={e => { e.preventDefault(); setDragging(false); Array.from(e.dataTransfer.files).forEach(processFile); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? TEAL.primary : "var(--color-border-secondary)"}`, borderRadius: 10,
          padding: "20px 16px", textAlign: "center", cursor: "pointer",
          background: dragging ? TEAL.bg : "var(--color-background-secondary)", transition: "all 0.15s" }}>
        <input data-testid="document-vault-file-input" ref={fileRef} type="file" multiple accept=".txt,.md,.pdf" style={{ display: "none" }}
          onChange={e => { Array.from(e.target.files).forEach(processFile); e.target.value = ""; }} />
        {loading ? <p style={{ fontSize: 13, color: TEAL.primary, margin: 0 }}>Loading {loading}…</p> : (
          <>
            <p style={{ fontSize: 22, margin: "0 0 5px" }}>📄</p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Drop .txt, .md, or .pdf · click to browse</p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "4px 0 0", opacity: 0.6 }}>PDFs are stored locally — not parsed until you choose</p>
          </>
        )}
      </div>
      {pdfDocs.map((doc, i) => (
        <div key={i} data-testid={`document-vault-doc-${i}-item`} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>
                {doc.isPdf ? `${doc.numPages} pages` : "Text document"}
                {doc.parsed && <span style={{ marginLeft: 6, color: TEAL.primary, fontWeight: 600 }}>· {doc.chunks} chunks indexed</span>}
              </p>
            </div>
            <button data-testid={`document-vault-doc-${i}-remove-btn`} onClick={() => removeDoc(doc.name)}
              style={{ fontSize: 14, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", flexShrink: 0, marginLeft: 8 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {doc.isPdf && (
              <button data-testid={`document-vault-doc-${i}-open-reader-btn`} onClick={() => onOpenReader(doc)}
                style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${TEAL.border}`, background: TEAL.bg, color: TEAL.primary, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                📖 Open Reader
              </button>
            )}
            {doc.isPdf && !doc.parsed && (
              <button data-testid={`document-vault-doc-${i}-parse-btn`} onClick={() => parseDoc(doc)} disabled={parsing === doc.name}
                style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: "1.5px solid var(--color-border-primary)", background: "#fff", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)", opacity: parsing === doc.name ? 0.6 : 1 }}>
                {parsing === doc.name ? "Parsing…" : "🔍 Parse for BM25 search"}
              </button>
            )}
            {doc.parsed && <span style={{ fontSize: 11, color: TEAL.primary, fontWeight: 600, alignSelf: "center" }}>✓ Indexed for search</span>}
          </div>
          {tagLibrary.some(t => t.sources.some(s => s.docName === doc.name)) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingTop: 2 }}>
              {tagLibrary.flatMap(t =>
                t.sources.filter(s => s.docName === doc.name).map(s => (
                  <button key={`${t.id}-${s.page}`} data-testid={`document-vault-tag-${t.id}-p${s.page}-btn`} onClick={() => onOpenReader(doc, s.page)}
                    style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, border: "1.5px solid #B3D4F5", background: "#E8F4FF", color: "#1A5C9A", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    📖 {t.label} p.{s.page}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
