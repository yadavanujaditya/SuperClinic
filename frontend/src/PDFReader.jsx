import { useState, useRef, useEffect } from "react";
import { TEAL } from "./theme.js";
import { openPDFDoc, extractPageText, renderPageToDataURL, cropCanvasToDataURL, extractRegionText, getPDFChapters } from "./pdfUtils.js";

export function PDFReader({ docName, buf, initPage = 1, tagLibrary, onAddTagSource, onRemoveTagSource, onOpenTagLibrary, onClose, onCreateComplaint }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initPage);
  const [scale, setScale] = useState(1.5);
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [chapters, setChapters] = useState(null); // null = loading, [] = none found
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [tagLabel, setTagLabel] = useState("");
  const [tagPages, setTagPages] = useState("");
  const [tagMode, setTagMode] = useState("page"); // "page" | "region"
  const [dragStart, setDragStart] = useState(null); // display-space {x,y}
  const [dragRect, setDragRect] = useState(null); // display-space {x,y,w,h}
  const [savingTag, setSavingTag] = useState(false);
  const [leftTab, setLeftTab] = useState("chapters"); // "chapters" | "search"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [indexProgress, setIndexProgress] = useState(null); // { done, total } while extracting
  const canvasRef = useRef();
  const pageCache = useRef(new Map()); // page number -> extracted text, built lazily & reused across searches

  // Extract & cache every page's text once, so repeat searches are instant.
  const ensureIndexed = async () => {
    if (!pdfDoc) return;
    const missing = [];
    for (let p = 1; p <= numPages; p++) if (!pageCache.current.has(p)) missing.push(p);
    if (!missing.length) return;
    setIndexProgress({ done: 0, total: missing.length });
    for (let i = 0; i < missing.length; i++) {
      const p = missing[i];
      try { pageCache.current.set(p, await extractPageText(pdfDoc, p)); } catch { pageCache.current.set(p, ""); }
      if (i % 5 === 0 || i === missing.length - 1) setIndexProgress({ done: i + 1, total: missing.length });
    }
    setIndexProgress(null);
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q || !pdfDoc) { setSearchResults(null); return; }
    await ensureIndexed();
    const qLower = q.toLowerCase();
    const results = [];
    for (let p = 1; p <= numPages; p++) {
      const text = pageCache.current.get(p) || "";
      const lower = text.toLowerCase();
      let count = 0, idx = lower.indexOf(qLower);
      while (idx !== -1) { count++; idx = lower.indexOf(qLower, idx + qLower.length); }
      if (count > 0) {
        const at = lower.indexOf(qLower);
        const start = Math.max(0, at - 60);
        const snippet = (start > 0 ? "…" : "") + text.slice(start, at) +
          "[[" + text.slice(at, at + q.length) + "]]" + text.slice(at + q.length, at + q.length + 100) + "…";
        results.push({ page: p, count, snippet });
      }
    }
    results.sort((a, b) => b.count - a.count);
    setSearchResults(results);
  };

  useEffect(() => {
    if (!buf) { setLoadError("PDF buffer not found — try re-uploading the file."); return; }
    setLoadError(""); setChapters(null);
    openPDFDoc(buf)
      .then(async pdf => {
        setPdfDoc(pdf); setNumPages(pdf.numPages);
        setChapters(await getPDFChapters(pdf));
      })
      .catch(e => setLoadError(`Could not open PDF: ${e.message}`));
  }, [buf]);

  // Cancelable render — fixes the first-page mirror/corruption bug caused by
  // overlapping render tasks racing on the same canvas.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    let task = null;
    setRendering(true);
    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = vp.width; canvas.height = vp.height;
        task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
        await task.promise;
      } catch (e) {
        if (e?.name !== "RenderingCancelledException") console.error(e);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [pdfDoc, currentPage, scale]);

  const goTo = (p) => setCurrentPage(Math.min(numPages, Math.max(1, p)));
  const currentTags = tagLibrary.filter(t => t.sources.some(s => s.docName === docName && s.page === currentPage));
  const allDocTags = tagLibrary.filter(t => t.sources.some(s => s.docName === docName));

  // Convert a drag rectangle from displayed (CSS) pixel space into the canvas's true bitmap pixel space
  const toTrueRect = (r) => {
    const canvas = canvasRef.current;
    const box = canvas.getBoundingClientRect();
    const rx = canvas.width / box.width, ry = canvas.height / box.height;
    return { x: r.x * rx, y: r.y * ry, w: r.w * rx, h: r.h * ry };
  };

  const onCanvasMouseDown = (e) => {
    if (tagMode !== "region" || !showTagPanel) return;
    const box = canvasRef.current.getBoundingClientRect();
    const p = { x: e.clientX - box.left, y: e.clientY - box.top };
    setDragStart(p); setDragRect({ ...p, w: 0, h: 0 });
  };
  const onCanvasMouseMove = (e) => {
    if (!dragStart) return;
    const box = canvasRef.current.getBoundingClientRect();
    const p = { x: e.clientX - box.left, y: e.clientY - box.top };
    setDragRect({ x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y), w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y) });
  };
  const onCanvasMouseUp = () => setDragStart(null);

  const saveTag = async () => {
    if (!tagLabel.trim() || !pdfDoc) return;
    setSavingTag(true);
    try {
      if (tagMode === "region") {
        if (!dragRect || dragRect.w < 4 || dragRect.h < 4) return;
        const trueRect = toTrueRect(dragRect);
        const image = cropCanvasToDataURL(canvasRef.current, trueRect);
        const text = await extractRegionText(pdfDoc, currentPage, scale, trueRect);
        onAddTagSource(tagLabel.trim(), docName, currentPage, text, image);
        setDragRect(null);
      } else {
        const pages = tagPages.trim()
          ? tagPages.split(/[,\s]+/).map(Number).filter(n => n > 0 && n <= numPages)
          : [currentPage];
        for (const p of pages) {
          const text = await extractPageText(pdfDoc, p);
          const image = p === currentPage ? canvasRef.current.toDataURL("image/jpeg", 0.85) : await renderPageToDataURL(pdfDoc, p, scale);
          onAddTagSource(tagLabel.trim(), docName, p, text, image);
        }
      }
      setShowTagPanel(false); setTagLabel(""); setTagPages("");
    } finally { setSavingTag(false); }
  };

  const toggleSelect = (p) => setSelectedPages(prev => {
    const s = new Set(prev); s.has(p) ? s.delete(p) : s.add(p); return s;
  });

  const btnS = (active) => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? TEAL.border : "#2D3748"}`,
    background: active ? TEAL.bg : "#1A202C", color: active ? TEAL.primary : "#A0AEC0",
    fontFamily: "var(--font-sans)", transition: "all 0.15s",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0D1117", zIndex: 500, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ background: "#161B22", borderBottom: "1px solid #21262D", padding: "10px 16px", display: "flex", gap: 10, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
        <button data-testid="pdf-reader-close-btn" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "#8B949E", flexShrink: 0 }}>✕</button>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#E6EDF3", margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>📖 {docName}</p>

        {/* Page navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button data-testid="pdf-reader-first-page-btn" onClick={() => goTo(1)} disabled={currentPage <= 1} style={{ ...btnS(false), padding: "5px 10px" }}>«</button>
          <button data-testid="pdf-reader-prev-page-btn" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} style={{ ...btnS(false), padding: "5px 10px" }}>‹</button>
          <input data-testid="pdf-reader-page-input" type="number" value={currentPage} min={1} max={numPages}
            onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= numPages) setCurrentPage(v); }}
            style={{ width: 56, textAlign: "center", padding: "5px 6px", borderRadius: 6, border: "1px solid #30363D", background: "#0D1117", color: "#E6EDF3", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none" }} />
          <span style={{ color: "#6E7681", fontSize: 12 }}>/ {numPages}</span>
          <button data-testid="pdf-reader-next-page-btn" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= numPages} style={{ ...btnS(false), padding: "5px 10px" }}>›</button>
          <button data-testid="pdf-reader-last-page-btn" onClick={() => goTo(numPages)} disabled={currentPage >= numPages} style={{ ...btnS(false), padding: "5px 10px" }}>»</button>
        </div>

        {/* Zoom */}
        <select data-testid="pdf-reader-zoom-select" value={scale} onChange={e => setScale(Number(e.target.value))}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #30363D", background: "#0D1117", color: "#E6EDF3", fontSize: 12, cursor: "pointer" }}>
          {[0.75, 1, 1.25, 1.5, 1.75, 2].map(s => <option key={s} value={s}>{Math.round(s * 100)}%</option>)}
        </select>

        <button data-testid="pdf-reader-tag-toggle-btn" onClick={() => { setShowTagPanel(v => !v); setTagLabel(""); setTagPages(""); }}
          style={{ ...btnS(showTagPanel), borderColor: showTagPanel ? TEAL.border : "#2D3748" }}>
          🏷 Tag
        </button>
        {onOpenTagLibrary && (
          <button data-testid="pdf-reader-tag-library-btn" onClick={onOpenTagLibrary} style={btnS(false)}>📚 Tag Library</button>
        )}
        <button data-testid="pdf-reader-add-to-selection-btn" onClick={() => toggleSelect(currentPage)}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
            border: `1.5px solid ${selectedPages.has(currentPage) ? "#6E40C9" : "#2D3748"}`,
            background: selectedPages.has(currentPage) ? "#21183A" : "#1A202C",
            color: selectedPages.has(currentPage) ? "#A78BFA" : "#A0AEC0" }}>
          {selectedPages.has(currentPage) ? "✓ In selection" : "+ Add to selection"}
        </button>
        {selectedPages.size > 0 && (
          <button data-testid="pdf-reader-create-complaint-btn" onClick={() => onCreateComplaint([...selectedPages].sort((a, b) => a - b), pdfDoc, docName)}
            style={{ padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", border: "none", background: "#6E40C9", color: "#fff" }}>
            ✨ Create Complaint ({selectedPages.size}p) →
          </button>
        )}
      </div>

      <div className="pdf-row" style={{ overflow: "hidden" }}>
        {/* Left: Chapters / Search */}
        <div className="pdf-sidebar-left" style={{ background: "#0D1117", borderRight: "1px solid #21262D", padding: "14px 12px", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexShrink: 0 }}>
            {[["chapters", "Chapters"], ["search", "🔍 Search"]].map(([id, label]) => (
              <button key={id} data-testid={`pdf-reader-lefttab-${id}-btn`} onClick={() => setLeftTab(id)}
                style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "6px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)",
                  background: leftTab === id ? "#1A2E3D" : "transparent", color: leftTab === id ? "#58A6FF" : "#8B949E" }}>
                {label}
              </button>
            ))}
          </div>

          {leftTab === "chapters" ? (
            chapters === null ? (
              <p style={{ fontSize: 12, color: "#484F58" }}>Loading…</p>
            ) : chapters.length === 0 ? (
              <p style={{ fontSize: 12, color: "#484F58" }}>No table of contents found in this PDF. Use page navigation above.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {chapters.map((c, i) => (
                  <button key={i} data-testid={`pdf-reader-chapter-${i}-btn`} disabled={c.page == null} onClick={() => goTo(c.page)}
                    style={{ textAlign: "left", fontSize: 12, padding: "5px 8px", paddingLeft: 8 + c.depth * 12, borderRadius: 6, border: "none", cursor: c.page == null ? "default" : "pointer",
                      background: c.page === currentPage ? "#1A2E3D" : "transparent",
                      color: c.page == null ? "#3D4451" : c.page === currentPage ? "#58A6FF" : "#8B949E",
                      fontFamily: "var(--font-sans)", lineHeight: 1.4 }}>
                    {c.title}{c.page != null && <span style={{ color: "#484F58", marginLeft: 4 }}>· p.{c.page}</span>}
                  </button>
                ))}
              </div>
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input data-testid="pdf-reader-search-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") runSearch(); }}
                  placeholder="Search this book…" autoFocus
                  style={{ flex: 1, padding: "7px 10px", border: "1px solid #30363D", borderRadius: 6, fontSize: 13, background: "#161B22", color: "#E6EDF3", fontFamily: "var(--font-sans)", outline: "none" }} />
                <button data-testid="pdf-reader-search-go-btn" onClick={runSearch} disabled={!searchQuery.trim() || !!indexProgress}
                  style={{ padding: "7px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: TEAL.primary, color: "#fff", fontFamily: "var(--font-sans)", opacity: !searchQuery.trim() ? 0.5 : 1 }}>
                  Go
                </button>
              </div>
              {indexProgress && (
                <p style={{ fontSize: 11, color: "#6E7681", margin: 0 }}>
                  Indexing book… {indexProgress.done}/{indexProgress.total} pages (first search only — instant after)
                </p>
              )}
              {searchResults !== null && !indexProgress && (
                <p style={{ fontSize: 11, color: "#6E7681", margin: 0 }}>
                  {searchResults.length} page{searchResults.length !== 1 ? "s" : ""} matched
                </p>
              )}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {searchResults?.map(r => (
                  <button key={r.page} data-testid={`pdf-reader-search-result-p${r.page}-btn`} onClick={() => goTo(r.page)}
                    style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid #21262D", cursor: "pointer", background: r.page === currentPage ? "#1A2E3D" : "#161B22", fontFamily: "var(--font-sans)" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#58A6FF", margin: "0 0 3px" }}>p.{r.page} <span style={{ color: "#6E7681", fontWeight: 400 }}>· {r.count} match{r.count !== 1 ? "es" : ""}</span></p>
                    <p style={{ fontSize: 11, color: "#8B949E", margin: 0, lineHeight: 1.4 }}>
                      {r.snippet.split(/\[\[|\]\]/).map((part, i) => i % 2 === 1
                        ? <mark key={i} style={{ background: "#3B4A00", color: "#F0E68C", padding: "0 1px", borderRadius: 2 }}>{part}</mark>
                        : <span key={i}>{part}</span>
                      )}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="pdf-center" style={{ overflowY: "auto", overflowX: "auto", padding: "28px 24px", background: "#0D1117", position: "relative", alignItems: "flex-start", justifyContent: "center" }}>
          {loadError ? (
            <div style={{ color: "#F87171", fontSize: 14, marginTop: 60, textAlign: "center", maxWidth: 400 }}>
              <p style={{ fontSize: 24, margin: "0 0 12px" }}>⚠️</p>
              <p style={{ margin: 0 }}>{loadError}</p>
            </div>
          ) : !pdfDoc ? (
            <div style={{ color: "#8B949E", fontSize: 14, marginTop: 60 }}>Loading PDF…</div>
          ) : (
            <>
              {rendering && (
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "#8B949E", fontSize: 13, background: "rgba(13,17,23,0.8)", padding: "8px 16px", borderRadius: 8, zIndex: 2 }}>Rendering…</div>
              )}
              <div style={{ position: "relative", lineHeight: 0 }}>
                <canvas data-testid="pdf-reader-canvas" ref={canvasRef}
                  onMouseDown={onCanvasMouseDown} onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp} onMouseLeave={onCanvasMouseUp}
                  style={{ borderRadius: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.7)", maxWidth: "100%", cursor: tagMode === "region" && showTagPanel ? "crosshair" : "default" }} />
                {tagMode === "region" && showTagPanel && dragRect && (
                  <div style={{ position: "absolute", left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h,
                    border: "2px dashed #A78BFA", background: "rgba(167,139,250,0.15)", pointerEvents: "none" }} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Right panel */}
        <div className="pdf-sidebar-right" style={{ background: "#161B22", borderLeft: "1px solid #21262D", padding: "16px 14px", overflowY: "auto", gap: 16 }}>

          {/* Tag form */}
          {showTagPanel && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#0D1117", borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6E7681", margin: 0, letterSpacing: 0.5 }}>TAG PAGES</p>

              <div style={{ display: "flex", gap: 4 }}>
                {[["page", "Whole page"], ["region", "Select area"]].map(([id, label]) => (
                  <button key={id} data-testid={`pdf-reader-tagmode-${id}-btn`} onClick={() => { setTagMode(id); setDragRect(null); setDragStart(null); }}
                    style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "6px 4px", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font-sans)",
                      border: `1px solid ${tagMode === id ? "#A78BFA" : "#30363D"}`,
                      background: tagMode === id ? "#21183A" : "transparent", color: tagMode === id ? "#A78BFA" : "#8B949E" }}>
                    {label}
                  </button>
                ))}
              </div>

              <input data-testid="pdf-reader-tag-label-input" value={tagLabel} onChange={e => setTagLabel(e.target.value)} placeholder="Label, e.g. Fever" list="tag-library-labels"
                style={{ padding: "7px 10px", border: "1px solid #30363D", borderRadius: 6, fontSize: 13, background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--font-sans)", outline: "none" }} />
              <datalist id="tag-library-labels">
                {tagLibrary.map(t => <option key={t.id} value={t.label} />)}
              </datalist>
              <p style={{ fontSize: 10, color: "#484F58", margin: 0 }}>Reuse an existing tag name to add this page under it, from any PDF.</p>

              {tagMode === "page" ? (
                <input data-testid="pdf-reader-tag-pages-input" value={tagPages} onChange={e => setTagPages(e.target.value)} placeholder={`Pages (blank = current p.${currentPage})`}
                  style={{ padding: "7px 10px", border: "1px solid #30363D", borderRadius: 6, fontSize: 12, background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--font-sans)", outline: "none" }} />
              ) : (
                <p style={{ fontSize: 11, color: dragRect ? "#A78BFA" : "#6E7681", margin: 0 }}>
                  {dragRect && dragRect.w > 4 ? `Selection: ${Math.round(dragRect.w)}×${Math.round(dragRect.h)}px` : "Drag on the page image to select an area."}
                </p>
              )}

              <button data-testid="pdf-reader-save-tag-btn" onClick={saveTag} disabled={savingTag || (tagMode === "region" && (!dragRect || dragRect.w < 4))}
                style={{ padding: "7px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", background: TEAL.primary, color: "#fff", border: "none", fontFamily: "var(--font-sans)",
                  opacity: (tagMode === "region" && (!dragRect || dragRect.w < 4)) ? 0.5 : 1 }}>
                {savingTag ? "Saving…" : "Save Tag (auto-extracts image + text)"}
              </button>
            </div>
          )}

          {/* Tags on current page */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6E7681", margin: "0 0 8px", letterSpacing: 0.5 }}>THIS PAGE (p.{currentPage})</p>
            {currentTags.length === 0
              ? <p style={{ fontSize: 12, color: "#484F58" }}>No tags. Click 🏷 Tag above.</p>
              : currentTags.map((t, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: "#0D1117", borderRadius: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#58A6FF", fontWeight: 600 }}>🏷 {t.label}</span>
                  <button data-testid={`pdf-reader-currentpage-tag-${i}-remove-btn`} onClick={() => onRemoveTagSource(t.id, docName, currentPage)}
                    style={{ fontSize: 11, color: "#E24B4A", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              ))
            }
          </div>

          {/* All tags in doc */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6E7681", margin: "0 0 8px", letterSpacing: 0.5 }}>ALL TAGS IN BOOK</p>
            {allDocTags.length === 0
              ? <p style={{ fontSize: 12, color: "#484F58" }}>None yet.</p>
              : allDocTags.map((t, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#E6EDF3", margin: "0 0 5px" }}>{t.label}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {t.sources.filter(s => s.docName === docName).map(s => (
                      <button key={s.page} data-testid={`pdf-reader-alltags-${t.id}-p${s.page}-btn`} onClick={() => goTo(s.page)}
                        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: `1px solid ${currentPage === s.page ? TEAL.primary : "#30363D"}`,
                          background: currentPage === s.page ? TEAL.bg : "#0D1117", color: currentPage === s.page ? TEAL.primary : "#8B949E", cursor: "pointer", fontFamily: "var(--font-mono)" }}>
                        p.{s.page}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            }
          </div>

          {/* Selection summary */}
          {selectedPages.size > 0 && (
            <div style={{ marginTop: "auto", borderTop: "1px solid #21262D", paddingTop: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6E7681", margin: "0 0 6px", letterSpacing: 0.5 }}>SELECTED PAGES</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                {[...selectedPages].sort((a, b) => a - b).map(p => (
                  <button key={p} data-testid={`pdf-reader-selected-p${p}-btn`} onClick={() => toggleSelect(p)}
                    style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #6E40C9", background: "#21183A", color: "#A78BFA", cursor: "pointer" }}>
                    p.{p} ✕
                  </button>
                ))}
              </div>
              <button data-testid="pdf-reader-clear-selection-btn" onClick={() => setSelectedPages(new Set())}
                style={{ fontSize: 11, color: "#6E7681", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-sans)" }}>
                Clear selection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
