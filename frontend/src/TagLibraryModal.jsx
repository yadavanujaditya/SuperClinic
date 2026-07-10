import { useState } from "react";
import { TEAL, RED } from "./theme.js";

export function TagLibraryModal({ tagLibrary, pdfBuffers, onOpenReader, onRemoveTag, onClose }) {
  const [selectedId, setSelectedId] = useState(tagLibrary[0]?.id || null);
  const [lightbox, setLightbox] = useState(null); // image src
  const selected = tagLibrary.find(t => t.id === selectedId);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "min(880px, 100%)", height: "min(600px, 90vh)", display: "flex", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>
        {/* Tag list */}
        <div style={{ width: 260, borderRight: "1px solid var(--color-border-primary)", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "16px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>📚 Tag Library</p>
            <button data-testid="tag-library-modal-close-btn" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
          </div>
          {tagLibrary.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "0 16px" }}>No tags yet. Open a PDF reader and tag some pages.</p>
          ) : tagLibrary.map(t => (
            <div key={t.id} data-testid={`tag-library-modal-tag-${t.id}-item`} onClick={() => setSelectedId(t.id)}
              style={{ padding: "10px 16px", cursor: "pointer", borderLeft: `3px solid ${selectedId === t.id ? TEAL.primary : "transparent"}`,
                background: selectedId === t.id ? TEAL.bg : "transparent", display: "flex", gap: 10, alignItems: "center" }}>
              {t.sources[0]?.image && (
                <img src={t.sources[0].image} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, border: "1px solid var(--color-border-primary)", flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: selectedId === t.id ? TEAL.primary : "var(--color-text-primary)" }}>{t.label}</p>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>{t.sources.length} page{t.sources.length !== 1 ? "s" : ""} · {new Set(t.sources.map(s => s.docName)).size} book(s)</p>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {!selected ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Select a tag to see all its pages.</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>🏷 {selected.label}</h3>
                <button onClick={() => onRemoveTag(selected.id)}
                  style={{ fontSize: 12, color: RED.primary, background: RED.bg, border: `1px solid ${RED.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  Delete tag
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selected.sources.map((s, i) => (
                  <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: TEAL.primary, margin: 0 }}>{s.docName} — p.{s.page}</p>
                      <button onClick={() => onOpenReader(s.docName, s.page)}
                        disabled={!pdfBuffers.current.has(s.docName)}
                        style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: `1px solid ${TEAL.border}`, background: TEAL.bg, color: TEAL.primary, cursor: pdfBuffers.current.has(s.docName) ? "pointer" : "not-allowed", opacity: pdfBuffers.current.has(s.docName) ? 1 : 0.4, fontFamily: "var(--font-sans)" }}>
                        📖 View in PDF
                      </button>
                    </div>
                    {s.image && (
                      <img src={s.image} alt="" onClick={() => setLightbox(s.image)}
                        style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 6, border: "1px solid var(--color-border-primary)", cursor: "zoom-in", display: "block", marginBottom: 8 }} />
                    )}
                    <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5, maxHeight: 90, overflowY: "auto" }}>
                      {s.extractedText ? s.extractedText.slice(0, 400) + (s.extractedText.length > 400 ? "…" : "") : "No text extracted."}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 6 }} />
        </div>
      )}
    </div>
  );
}
