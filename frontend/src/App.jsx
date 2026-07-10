import { useState, useRef, useEffect } from "react";
import { BM25, chunkText, buildRetrievalQuery, highlightTerms } from "./bm25.js";
import { PROVIDERS, getProvider, callAIStream, parseJSON, buildSystemPrompt, buildNotePrompt, generateLocalNote, getGenericInstructions, getDetailedInstructions } from "./api.js";
import { SYSTEM_COMPLAINTS } from "./complaints.js";
import SuperSummary, { DocumentIntake } from "./SuperSummary.jsx";
import HomeHero, { CardCarousel, IllustConsult, IllustDifferential, IllustDocs, IllustScan, IllustLibrary, IllustSafety, IllustGame, IllustDnb, AppFooter } from "./HomeHero.jsx";
import { useAuth } from "./AuthContext.jsx";
import { saveCaseRecord } from "./records.js";
import { RecordsModal } from "./RecordsModal.jsx";
import { AdminDashboard } from "./AdminDashboard.jsx";
import { RatingPrompt } from "./RatingPrompt.jsx";
import { publishWorkflow, listCommunityWorkflows, rateWorkflow } from "./community.js";
import { listBooks, uploadBook, downloadBook, deleteBook, listTags, upsertTagSource, removeTagSourceRemote, deleteTagRemote } from "./supermemory.js";
import { LoginModal } from "./AuthScreens.jsx";
import { TEAL, AMBER, RED, GRAY, PURPLE, LIKELIHOOD_COLORS, CATEGORIES } from "./theme.js";
import { Btn, Badge, Card, ShareLinkRow } from "./UIPrimitives.jsx";
import { initPDFJS, openPDFDoc, renderPDFPage, extractPageText, extractAllText, renderPageToDataURL, cropCanvasToDataURL, extractRegionText, getPDFChapters } from "./pdfUtils.js";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { WorkflowEditor } from "./WorkflowEditor.jsx";
import { ComplaintEditor } from "./ComplaintEditor.jsx";
import { DocumentVault } from "./DocumentVault.jsx";
import { ComplaintLibrary } from "./ComplaintLibrary.jsx";
import { ProductToggle, ProfileMenu } from "./ProfileMenu.jsx";

// ─── Library Screen ───────────────────────────────────────────────────────────
function LibraryScreen({ onStart, hasKey, provider, apiKey, idx, pdfDocs, setPdfDocs, customComplaints, setCustomComplaints, setSettingsOpen, tagLibrary, setTagLibrary, pdfBuffers, product, setProduct }) {
  const [selected, setSelected] = useState(null);
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState("years");
  const age = ageValue ? `${ageValue} ${ageUnit === "years" ? (ageValue === "1" ? "year" : "years") : ageUnit === "months" ? (ageValue === "1" ? "month" : "months") : (ageValue === "1" ? "day" : "days")}` : "";
  const [sex, setSex] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [editingNoAiNotice, setEditingNoAiNotice] = useState(false);
  const [isAiMode, setIsAiMode] = useState(true);
  const [aiComplaintText, setAiComplaintText] = useState("");
  const [readerState, setReaderState] = useState(null); // { doc, initPage }
  const [creatingFromPdf, setCreatingFromPdf] = useState(false);
  const [tagLibraryOpen, setTagLibraryOpen] = useState(false);
  const [consultMode, setConsultMode] = useState("learning");

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

  const saveComplaint = (c) => {
    const prev = JSON.parse(localStorage.getItem("clinicalmind:complaints") || "[]");
    const i = prev.findIndex(p => p.id === c.id);
    const next = i >= 0 ? prev.map((p, j) => j === i ? c : p) : [...prev, c];
    localStorage.setItem("clinicalmind:complaints", JSON.stringify(next));
    setCustomComplaints(next);
    setEditing(undefined);
  };

  const publishWorkflowHandler = async (c) => {
    try {
      await publishWorkflow({ name: c.name, category: c.category, tags: c.tags || [], workflow: c.workflow || {} });
      alert(`"${c.name}" published to the community! Other users can now find and rate it.`);
    } catch (err) {
      alert("Could not publish: " + err.message);
    }
  };

  const importWorkflowHandler = (item) => {
    const rec = { id: (item.name || "complaint").toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(), name: item.name + " (community)", category: item.category, tags: item.tags || [], workflow: item.workflow, source: "private", createdAt: new Date().toISOString() };
    const prev = JSON.parse(localStorage.getItem("clinicalmind:complaints") || "[]");
    const next = [...prev, rec];
    localStorage.setItem("clinicalmind:complaints", JSON.stringify(next));
    setCustomComplaints(next);
    alert(`"${item.name}" imported into your Private complaints!`);
  };

  const openEdit = (c) => {
    setEditingNoAiNotice(false);
    if (c?.source === "system") {
      setEditing({ ...c, id: c.id + "_fork_" + Date.now(), source: "private", author: "", createdAt: new Date().toISOString() });
    } else { setEditing(c ?? null); }
  };

  const handleCreateComplaint = async (pages, pdfDoc, docName) => {
    setReaderState(null);
    setCreatingFromPdf(true);
    try {
      let pageText = "";
      for (const p of pages) pageText += `[Page ${p}]\n${await extractPageText(pdfDoc, p)}\n\n`;
      const textSnippet = pageText.slice(0, 3500);
      if (apiKey) {
        const prompt = `Extract a clinical complaint template from this medical textbook content.

SOURCE: ${docName}, pages ${pages.join(", ")}
CONTENT:
${textSnippet}

Return ONLY valid JSON with this exact structure:
{
  "name": "symptom-based chief complaint (patient-facing, e.g. 'Fever with Cough')",
  "category": "Respiratory|GI|Neuro|Skin|Urinary|Hematology|General|Emergency|Newborn",
  "redFlagKeywords": ["keyword1","keyword2"],
  "commonDifferentials": ["Diagnosis 1","Diagnosis 2","Diagnosis 3","Diagnosis 4","Diagnosis 5"],
  "clinicalContent": "relevant clinical text for BM25 retrieval — keep under 2000 chars"
}`;
        let raw = "";
        await callAIStream([{ role: "user", content: prompt }],
          "You are a clinical knowledge extractor. Output only valid JSON. No markdown fences.",
          provider, apiKey, t => { raw = t; });
        const parsed = parseJSON(raw);
        if (parsed) { openEdit({ ...parsed, source: "private", id: "" }); return; }
      }
      // No AI configured, or parse failed — open editor with raw text and flag the fallback
      setEditingNoAiNotice(true);
      setEditing({ name: "", category: "General", clinicalContent: textSnippet, commonDifferentials: [], redFlagKeywords: [], tags: [], source: "private", id: "" });
    } finally { setCreatingFromPdf(false); }
  };

  return (
    <div data-testid="library-screen" style={{ minHeight: "100vh" }}>
      <div className="hero-band" style={{ padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(13,148,136,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🩺</span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#fff" }}>ClinicFlow</h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", margin: 0 }}>Indian OPD</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ProductToggle product={product} setProduct={setProduct} />
          <ProfileMenu
            onSettings={() => setSettingsOpen(true)}
            onTagLibrary={() => setTagLibraryOpen(true)}
            tagCount={tagLibrary.length}
          />
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ background: hasKey ? TEAL.bg : "var(--color-background-secondary)", border: `1.5px solid ${hasKey ? TEAL.border : "var(--color-border-primary)"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>{hasKey ? "🤖" : "📴"}</span>
          <div>
            {hasKey ? (
              <p style={{ fontSize: 14, color: TEAL.text, margin: 0 }}>
                <strong>AI mode active.</strong> Structured workflow runs first, then AI takes over for deeper clinical questions and note generation.
              </p>
            ) : (
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>
                <strong style={{ color: "var(--color-text-primary)" }}>Offline mode.</strong> All 10 complaints run fully without an API key — structured local workflow + offline note.{" "}
                <button data-testid="library-add-api-key-link" onClick={() => setSettingsOpen(true)} style={{ background: "none", border: "none", color: TEAL.primary, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 14, padding: 0 }}>Add API key →</button>
              </p>
            )}
          </div>
        </div>

        <div className="library-grid">
          <Card><DocumentVault pdfDocs={pdfDocs} setPdfDocs={setPdfDocs} idx={idx} tagLibrary={tagLibrary} setTagLibrary={setTagLibrary} pdfBuffers={pdfBuffers}
            onOpenReader={async (doc, initPage) => {
              if (!pdfBuffers.current.get(doc.name) && doc.bookId) {
                try { pdfBuffers.current.set(doc.name, await downloadBook(doc.bookId)); }
                catch (e) { alert("Could not load this book: " + e.message); return; }
              }
              setReaderState({ doc, initPage: initPage || 1 });
            }}
            onOpenTagLibrary={() => setTagLibraryOpen(true)} /></Card>
          <Card><ComplaintLibrary selected={selected} setSelected={setSelected} onEdit={openEdit} customComplaints={customComplaints} onModeChange={setIsAiMode}
            onPublish={publishWorkflowHandler} onImport={importWorkflowHandler} /></Card>
        </div>

        <Card className="start-card" style={{
          background: isAiMode ? "linear-gradient(135deg,#1e1b3a 0%,#3b1d6e 45%,#7c3aed 85%,#a855f7 100%)" : "#fff",
          border: isAiMode ? "1.5px solid #8B5CF6" : "1.5px solid var(--color-border-primary)" }}>

          {/* Complaint selector / AI text input */}
          {isAiMode ? (
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#9090C0", display: "block", marginBottom: 4 }}>Chief Complaint</label>
              <input data-testid="library-ai-complaint-input" value={aiComplaintText} onChange={e => setAiComplaintText(e.target.value)}
                placeholder="e.g. Fever for 3 days, Abdominal pain…"
                style={{ padding: "9px 12px", border: "1.5px solid #8B5CF6", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", width: "100%", background: "rgba(255,255,255,0.07)", color: "#E0E0FF", boxSizing: "border-box" }} />
            </div>
          ) : selected ? (
            <div style={{ background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 8, padding: "8px 14px" }}>
              <p style={{ fontSize: 11, color: TEAL.text, margin: "0 0 2px", fontWeight: 600 }}>Selected</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: TEAL.primary, margin: 0 }}>{selected.name}</p>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, alignSelf: "center" }}>← Select a complaint to begin</p>
          )}

          {/* Age */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Patient Age</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" min={0} data-testid="library-age-input" value={ageValue} onChange={e => setAgeValue(e.target.value)} placeholder="e.g. 6"
                style={{ padding: "9px 12px", border: `1.5px solid ${isAiMode ? "#8B5CF6" : "var(--color-border-primary)"}`, borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", width: 80,
                  background: isAiMode ? "rgba(255,255,255,0.07)" : "#fff", color: isAiMode ? "#E0E0FF" : "inherit" }} />
              <select data-testid="library-age-unit-select" value={ageUnit} onChange={e => setAgeUnit(e.target.value)}
                style={{ padding: "9px 10px", border: `1.5px solid ${isAiMode ? "#8B5CF6" : "var(--color-border-primary)"}`, borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", cursor: "pointer",
                  background: isAiMode ? "rgba(255,255,255,0.07)" : "#fff", color: isAiMode ? "#E0E0FF" : "inherit" }}>
                <option value="years">Years</option>
                <option value="months">Months</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>

          {/* Sex */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Sex</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["Male","Female","Other"].map(s => (
                <button key={s} data-testid={`library-sex-${s.toLowerCase()}-btn`} onClick={() => setSex(s)} style={{ padding: "9px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                  borderColor: sex === s ? (isAiMode ? "#8B5CF6" : TEAL.primary) : (isAiMode ? "#3A3A6A" : "var(--color-border-primary)"),
                  background: sex === s ? (isAiMode ? "#2A2A5E" : TEAL.bg) : (isAiMode ? "rgba(255,255,255,0.04)" : "#fff"),
                  color: sex === s ? (isAiMode ? "#D8B4FE" : TEAL.primary) : (isAiMode ? "#7070A0" : "var(--color-text-secondary)") }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Consultation Mode Selector */}
          <div style={{ width: "100%", borderTop: `1px solid ${isAiMode ? "#3A3A6A" : "var(--color-border-primary)"}`, paddingTop: 16, marginTop: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>Consultation Mode</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div 
                data-testid="library-consult-mode-learning-card"
                onClick={() => setConsultMode("learning")}
                style={{
                  padding: 12, borderRadius: 10, cursor: "pointer", border: "1.5px solid",
                  borderColor: consultMode === "learning" ? (isAiMode ? "#8B5CF6" : TEAL.primary) : (isAiMode ? "#3A3A6A" : "var(--color-border-primary)"),
                  background: consultMode === "learning" ? (isAiMode ? "#2A2A5E" : TEAL.bg) : (isAiMode ? "rgba(255,255,255,0.04)" : "#fff"),
                  transition: "all 0.15s"
                }}
              >
                <svg width="34" height="26" viewBox="0 0 48 36" style={{ marginBottom: 6 }}>
                  <path d="M4 6 C10 2 18 2 24 6 V30 C18 26 10 26 4 30 Z" fill={consultMode === "learning" ? (isAiMode ? "#8B5CF6" : TEAL.primary) : "#94a3b8"} opacity="0.85" />
                  <path d="M44 6 C38 2 30 2 24 6 V30 C30 26 38 26 44 30 Z" fill={consultMode === "learning" ? (isAiMode ? "#8B8BFF" : TEAL.light) : "#cbd5e1"} />
                  <line x1="24" y1="6" x2="24" y2="30" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
                </svg>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>📖</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: consultMode === "learning" ? (isAiMode ? "#D8B4FE" : TEAL.primary) : "var(--color-text-primary)" }}>Learning Mode</span>
                </div>
                <p style={{ fontSize: 11, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", margin: 0, lineHeight: 1.3 }}>
                  Follows the standard structured sequential clinical workflow (one question at a time).
                </p>
              </div>

              <div 
                data-testid="library-consult-mode-opd-card"
                onClick={() => {
                  if (hasKey) {
                    setConsultMode("opd");
                  } else {
                    alert("OPD Mode requires an API Key. Please add one in settings or use Learning Mode.");
                  }
                }}
                style={{
                  padding: 12, borderRadius: 10, cursor: "pointer", border: "1.5px solid",
                  borderColor: consultMode === "opd" ? (isAiMode ? "#8B5CF6" : TEAL.primary) : (isAiMode ? "#3A3A6A" : "var(--color-border-primary)"),
                  background: consultMode === "opd" ? (isAiMode ? "#2A2A5E" : TEAL.bg) : (isAiMode ? "rgba(255,255,255,0.04)" : "#fff"),
                  opacity: hasKey ? 1 : 0.6,
                  transition: "all 0.15s"
                }}
              >
                <svg width="34" height="26" viewBox="0 0 48 36" style={{ marginBottom: 6 }}>
                  <path d="M27 2 L10 20 h9 l-4 14 L33 16 h-9 Z" fill={consultMode === "opd" ? (isAiMode ? "#8B5CF6" : TEAL.primary) : "#94a3b8"} />
                  <circle cx="24" cy="18" r="16" fill="none" stroke={consultMode === "opd" ? (isAiMode ? "#8B5CF6" : TEAL.light) : "#cbd5e1"} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
                </svg>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>⚡</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: consultMode === "opd" ? (isAiMode ? "#D8B4FE" : TEAL.primary) : "var(--color-text-primary)" }}>OPD Mode</span>
                </div>
                <p style={{ fontSize: 11, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", margin: 0, lineHeight: 1.3 }}>
                  Fast-track mode. AI asks 3–4 questions simultaneously to quickly update differentials.
                </p>
              </div>
            </div>
          </div>

          {/* Start button */}
          {isAiMode ? (
            <Btn
              testId="library-start-ai-consultation-btn"
              disabled={!aiComplaintText.trim() || !age || !hasKey}
              onClick={() => onStart({
                complaint: { id: "ai_" + Date.now(), name: aiComplaintText.trim(), category: "General", source: "ai", clinicalContent: "", commonDifferentials: [], redFlagKeywords: [], tags: [] },
                age, sex, aiOnly: true, opdMode: consultMode === "opd"
              })}
              style={{ padding: "11px 28px", fontSize: 15, background: hasKey ? "#8B5CF6" : "#3A3A6A", color: "#fff" }}>
              {!hasKey ? "⚠ Add API Key First" : "✨ Start AI Consultation →"}
            </Btn>
          ) : (
            <Btn testId="library-start-consultation-btn" disabled={!selected || !age} onClick={() => onStart({ complaint: selected, age, sex, aiOnly: false, opdMode: consultMode === "opd" })} style={{ padding: "11px 28px", fontSize: 15 }}>
              Start Consultation →
            </Btn>
          )}
        </Card>
      </div>

      {editing !== undefined && (
        <ComplaintEditor complaint={editing} onSave={saveComplaint} onClose={() => setEditing(undefined)}
          tagLibrary={tagLibrary} noAiNotice={editingNoAiNotice}
          pdfDocs={pdfDocs} pdfBuffers={pdfBuffers} onAddTagSource={addTagSource} />
      )}
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
          onCreateComplaint={handleCreateComplaint}
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
            if (!pdfBuffers.current.get(doc.name) && doc.bookId) {
              try { pdfBuffers.current.set(doc.name, await downloadBook(doc.bookId)); }
              catch (e) { alert("Could not load this book: " + e.message); return; }
            }
            setTagLibraryOpen(false); setReaderState({ doc, initPage: page });
          }}
          onClose={() => setTagLibraryOpen(false)}
        />
      )}
      {creatingFromPdf && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "32px 40px", textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>✨ Generating complaint from PDF…</p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>AI is extracting clinical content. Please wait.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PDF Book Reader ─────────────────────────────────────────────────────────
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

// ─── Tag Library Browser ──────────────────────────────────────────────────────
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

// ─── Page Viewer Modal ────────────────────────────────────────────────────────
function PageViewer({ docName, page, pdfBuffers, onClose }) {
  const canvasRef = useRef();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const buf = pdfBuffers?.current?.get(docName);
        if (!buf) {
          if (active) setError("PDF buffer not found. Re-upload the document to enable page preview.");
          return;
        }
        const pdf = await openPDFDoc(buf);
        if (!active) return;
        const pg = await pdf.getPage(page);
        if (!active) return;
        const viewport = pg.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pg.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      } catch (e) {
        if (active) setError(`Could not render page: ${e.message}`);
      }
    })();
    return () => { active = false; };
  }, [docName, page]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: "90vw", maxHeight: "90vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>📖 {docName} — Page {page}</p>
          <button onClick={onClose} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>
        {error ? <p style={{ fontSize: 13, color: RED.text }}>{error}</p> : <canvas ref={canvasRef} style={{ maxWidth: "100%", borderRadius: 6, border: "1px solid var(--color-border-primary)" }} />}
      </div>
    </div>
  );
}

// ─── Diagnosis Sidebar ────────────────────────────────────────────────────────
function DiagnosisSidebar({ sidebar, onClose, query, complaintTags, pdfBuffers }) {
  const [pageViewer, setPageViewer] = useState(null); // { docName, page }
  return (
    <>
      {sidebar.open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 49 }} />}
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: "min(380px, 100vw)",
        background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", zIndex: 50, overflowY: "auto",
        transform: sidebar.open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s ease",
        padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>{sidebar.diagnosis}</h2>
            <p style={{ fontSize: 12, color: TEAL.primary, margin: 0 }}>
              {sidebar.ms != null ? `Retrieved in ${sidebar.ms}ms · ` : ""}{sidebar.chunks?.length || 0} sections
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
        {complaintTags?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", margin: 0, letterSpacing: 0.5 }}>BOOK REFERENCES</p>
            {complaintTags.flatMap(t => t.sources.map((s, i) => (
              <div key={`${t.id}-${i}`} style={{ background: "#E8F4FF", border: "1px solid #B3D4F5", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1A5C9A" }}>🏷 {t.label} — {s.docName} p.{s.page}</span>
                  <button onClick={() => setPageViewer({ docName: s.docName, page: s.page })}
                    style={{ fontSize: 11, fontWeight: 600, color: "#1A5C9A", background: "#fff", border: "1px solid #B3D4F5", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    View in PDF
                  </button>
                </div>
                {s.image && (
                  <img src={s.image} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 6, border: "1px solid #B3D4F5", display: "block", marginBottom: 8 }} />
                )}
                <p style={{ fontSize: 12, color: "#1A5C9A", margin: 0, lineHeight: 1.5, maxHeight: 100, overflowY: "auto" }}>
                  {s.extractedText ? s.extractedText.slice(0, 400) + (s.extractedText.length > 400 ? "…" : "") : "No text extracted."}
                </p>
              </div>
            )))}
          </div>
        )}
        {sidebar.chunks?.length > 0 ? sidebar.chunks.map((chunk, i) => (
          <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>{chunk.source}</span>
              <span style={{ fontSize: 11, background: TEAL.bg, color: TEAL.text, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{chunk.score?.toFixed(2)}</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}
              dangerouslySetInnerHTML={{ __html: highlightTerms(chunk.text, (sidebar.diagnosis + " " + (query || "")).trim()).replace(/\n/g, "<br/>") }} />
          </div>
        )) : (
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 20, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Upload Harrison's, Nelson's, or your hospital protocol to see relevant sections here.
            </p>
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--color-border-primary)" }}>
          Instant BM25 search — no API call.
        </p>
      </div>
      <style>{`mark { background: #FFF176; padding: 0 2px; border-radius: 2px; }`}</style>
      {pageViewer && <PageViewer docName={pageViewer.docName} page={pageViewer.page} pdfBuffers={pdfBuffers} onClose={() => setPageViewer(null)} />}
    </>
  );
}

// ─── SuperTags Card ──────────────────────────────────────────────────────────
function SuperTagsCard({ tagLibrary, idx, complaintName, history, pdfBuffers }) {
  const [matches, setMatches] = useState([]);
  const [pageViewer, setPageViewer] = useState(null);

  useEffect(() => {
    const historyAnswers = history.map(h => h.a).join(" ");
    const q = (complaintName + " " + historyAnswers).toLowerCase().trim();
    if (!q) {
      setMatches([]);
      return;
    }

    const words = q.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) {
      setMatches([]);
      return;
    }

    const matchedTags = tagLibrary.filter(tag => {
      const tagLabel = tag.label.toLowerCase();
      const matchesLabel = words.some(w => tagLabel.includes(w));
      const matchesSourceText = tag.sources.some(src => 
        words.some(w => src.extractedText?.toLowerCase().includes(w))
      );
      return matchesLabel || matchesSourceText;
    });

    let directChunks = [];
    if (idx && typeof idx.search === "function") {
      try {
        directChunks = idx.search(q, 3) || [];
      } catch (e) {
        console.error(e);
      }
    }

    const combinedMatches = [];

    matchedTags.forEach(t => {
      t.sources.forEach((src) => {
        combinedMatches.push({
          type: "tag",
          label: `🏷 ${t.label}`,
          source: src.docName,
          page: src.page,
          text: src.extractedText || "No text.",
          image: src.image
        });
      });
    });

    directChunks.forEach(chunk => {
      const isDuplicate = combinedMatches.some(m => m.source === chunk.source && m.text.includes(chunk.text.slice(0, 50)));
      if (!isDuplicate) {
        combinedMatches.push({
          type: "chunk",
          label: `📖 Relatable Passage`,
          source: chunk.source,
          page: chunk.page || 1,
          text: chunk.text,
          score: chunk.score
        });
      }
    });

    setMatches(combinedMatches.slice(0, 3));
  }, [tagLibrary, idx, complaintName, history]);

  return (
    <div style={{ marginTop: 16, borderTop: "1.5px solid var(--color-border-primary)", paddingTop: 16 }}>
      <div style={{ background: "#F3EEFF", border: "1.5px solid #D8C7FF", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#3E2570", display: "inline-flex", alignItems: "center", gap: 4 }}>✨ SuperTags</span>
          <span style={{ fontSize: 9, background: "#6E40C9", color: "#fff", padding: "2px 6px", borderRadius: 10, fontWeight: 700 }}>AI FILTERED</span>
        </div>
        <p style={{ fontSize: 11, color: "#3E2570", margin: "0 0 12px", lineHeight: 1.4, opacity: 0.85 }}>
          Upload multiple books and from them create your custom tags, and view them at any time from your OPD.
        </p>

        {matches.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0, fontStyle: "italic" }}>
            No matching tags or book passages found for the current context.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.map((item, index) => (
              <div key={index} style={{ background: "#fff", border: "1px solid #D8C7FF", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6E40C9" }}>{item.label}</span>
                  <button 
                    data-testid={`supertag-view-page-${index}`}
                    onClick={() => setPageViewer({ docName: item.source, page: item.page })}
                    style={{ fontSize: 10, fontWeight: 600, color: "#6E40C9", background: "#F3EEFF", border: "1px solid #D8C7FF", borderRadius: 5, padding: "1px 6px", cursor: "pointer" }}
                  >
                    p.{item.page} ↗
                  </button>
                </div>
                {item.image && (
                  <img src={item.image} alt="" style={{ maxWidth: "100%", maxHeight: 100, borderRadius: 4, marginBottom: 4, display: "block" }} />
                )}
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.4, maxHeight: 60, overflowY: "auto" }}>
                  {item.text.slice(0, 180)}{item.text.length > 180 ? "…" : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {pageViewer && (
        <PageViewer 
          docName={pageViewer.docName} 
          page={pageViewer.page} 
          pdfBuffers={pdfBuffers} 
          onClose={() => setPageViewer(null)} 
        />
      )}
    </div>
  );
}

// ─── Differentials Panel ──────────────────────────────────────────────────────
function DifferentialsPanel({ differentials, onClickDiag }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", margin: 0, letterSpacing: 0.5 }}>DIFFERENTIALS · TAP TO EXPLORE</p>
      {!differentials.length && <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Differentials will appear as you answer questions.</p>}
      {differentials.map((d, i) => {
        const col = LIKELIHOOD_COLORS[d.likelihood] || LIKELIHOOD_COLORS.low;
        return (
          <div key={i} data-testid={`differential-item-${i}`} onClick={() => onClickDiag(d.name)}
            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
              background: col.bg, border: `1.5px solid ${col.border}`, transition: "all 0.15s" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: col.dot, flexShrink: 0, marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <p style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)", margin: 0 }}>{d.name}</p>
                <span style={{ fontSize: 11, fontWeight: 700, color: col.text, flexShrink: 0 }}>{(d.likelihood || "low").toUpperCase()}</span>
              </div>
              {d.reasoning && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0", lineHeight: 1.4 }}>{d.reasoning}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Option Button ────────────────────────────────────────────────────────────
function OptionButton({ label, onClick, testId }) {
  const [hov, setHov] = useState(false);
  return (
    <button data-testid={testId} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: "100%", padding: "12px 16px", textAlign: "left", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer",
        border: `1.5px solid ${hov ? TEAL.border : "var(--color-border-primary)"}`,
        background: hov ? TEAL.bg : "#fff", color: "var(--color-text-primary)", transition: "all 0.15s", fontFamily: "var(--font-sans)" }}>
      {label}
    </button>
  );
}

// ─── Consultation Screen ──────────────────────────────────────────────────────
function ConsultationScreen({ session, idx, provider, apiKey, onEnd, onNote, tagLibrary, pdfBuffers, setSettingsOpen }) {
  const { complaint, age, sex, aiOnly, opdMode } = session;
  const complaintTags = (complaint.tagRefs || []).map(id => tagLibrary.find(t => t.id === id)).filter(Boolean);

  const [history, setHistory] = useState([]);
  const [currentQ, setCurrentQ] = useState("");
  const [options, setOptions] = useState([]);
  const [differentials, setDifferentials] = useState(
    (complaint.commonDifferentials || []).slice(0, 5).map(name => ({ name, likelihood: "low", reasoning: "" }))
  );
  const [redFlags, setRedFlags] = useState([]);
  const [retrieved, setRetrieved] = useState([]);
  const [retrieveMs, setRetrieveMs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [streamText, setStreamText] = useState("");
  const [nodeData, setNodeData] = useState(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceTx, setVoiceTx] = useState("");
  const [customIn, setCustomIn] = useState("");
  const [weightMap, setWeightMap] = useState({});
  const [sidebar, setSidebar] = useState({ open: false, diagnosis: "", chunks: [], ms: null });
  const [opdQuestions, setOpdQuestions] = useState([]);
  const [opdAnswers, setOpdAnswers] = useState({});
  
  // Discussion Mode states
  const [discussionMode, setDiscussionMode] = useState(false);
  const [discussionDocs, setDiscussionDocs] = useState([]);
  const processedDocs = useRef(new Set());

  const histRef = useRef(null);
  const recRef = useRef(null);
  // track current state in ref so closures in handleAnswer can access latest values
  const diffsRef = useRef(differentials);
  const redFlagsRef = useRef(redFlags);
  useEffect(() => { diffsRef.current = differentials; }, [differentials]);
  useEffect(() => { redFlagsRef.current = redFlags; }, [redFlags]);

  // Auto-send clinical reports to AI once uploaded and parsed
  useEffect(() => {
    if (!discussionMode) return;
    const completed = discussionDocs.filter(d => d.status === "done" && !processedDocs.current.has(d.id));
    if (completed.length === 0) return;
    completed.forEach(d => processedDocs.current.add(d.id));
    
    const text = completed.map(d => `Uploaded report: ${d.name}`).join(", ");
    const nextHist = [...history, { q: `System: Uploaded and analyzed reports: ${completed.map(c => c.name).join(", ")}`, a: "Reports attached to clinical context." }];
    setHistory(nextHist);
    askAI(nextHist);
  }, [discussionDocs.map(d => `${d.id}:${d.status}`).join(",")]);

  useEffect(() => {
    if (complaint.clinicalContent) {
      idx.add(chunkText(complaint.clinicalContent, `Prebuilt — ${complaint.name}`));
    }
    // AI-only mode: skip local workflow entirely
    if (aiOnly) { askAI([]); return; }
    if (opdMode) { askAI([]); return; }
    if (complaint.workflow?.nodes) {
      const entry = complaint.workflow.nodes.find(n => n.id === complaint.workflow.entryNode);
      if (entry) {
        setNodeData(entry);
        setCurrentQ(entry.question);
        let entryOpts = entry.options.map(o => o.label);
        if (entry.id && entry.id.endsWith("_handoff")) {
          entryOpts = [...entryOpts, "💬 Discuss further with AI (upload reports & chat)"];
        }
        setOptions(entryOpts);
        return;
      }
    }
    askAI([]);
  }, []);

  useEffect(() => { if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight; }, [history]);

  const doRetrieval = (hist) => {
    const q = buildRetrievalQuery(complaint.name, hist.map(h => h.a));
    const t0 = performance.now();
    const res = idx.search(q, 3);
    setRetrieved(res); setRetrieveMs((performance.now() - t0).toFixed(1));
    return res.map(r => r.text).join("\n\n---\n\n");
  };

  const askAI = async (hist) => {
    if (!apiKey) {
      setError("No API key configured. Add one in ⚙️ Settings to let AI continue the interview — or generate a note now from what's been answered so far.");
      return;
    }
    setLoading(true); setError(""); setStreamText("");
    
    const context = doRetrieval(hist);
    const reportsText = discussionDocs.filter(d => d.status === "done" && d.ocrText).map(d => `REPORT [${d.name}]: ${d.ocrText}`).join("\n\n");
    const combinedContext = [context, reportsText ? `UPLOADED CLINICAL REPORTS:\n${reportsText}` : ""].filter(Boolean).join("\n\n");

    const msgs = hist.length
      ? hist.flatMap((h, i) => [{ role: "user", content: `Q${i+1}: ${h.q}` }, { role: "assistant", content: `Answer: ${h.a}` }])
      : [];

    let systemPrompt = buildSystemPrompt(complaint.name, age, sex, combinedContext);
    if (opdMode) {
      systemPrompt = `Clinical thinking assistant for junior doctors, India government hospital OPD.
Patient: ${age || "?"}y ${sex || ""}. Chief complaint: ${complaint.name}.

CLINICAL REFERENCE (retrieved via BM25):
${combinedContext}

You are in OPD Mode (fast-track). Instead of one question, you MUST generate exactly 3 to 4 distinct, parallel questions to narrow down the differentials.
Output ONLY valid JSON. No markdown. No explanation. Exactly this structure:
{
  "opd_questions": [
    { "key": "unique_short_key", "question": "Question text here?", "options": ["opt1", "opt2", "opt3", "Not present"] }
  ],
  "differentials": [{"name":"...","likelihood":"high|medium|low","reasoning":"one line max"}],
  "red_flags": ["..."],
  "done": false
}

Rules for opd_questions:
- "key": unique alphanumeric key for the question, e.g. "fever_dur"
- "question": concise clinical question to ask
- "options": 3-4 short options, always ending with "Not present" or "Unsure". If it is open-ended or numeric, options can be []
- Never duplicate questions already in the history.
- If consultation is complete, set "done": true and empty opd_questions [].`;
    } else if (discussionMode) {
      systemPrompt = `Interactive clinical discussion assistant for junior doctors, India government hospital OPD.
Patient: ${age || "?"}y ${sex || ""}. Chief complaint: ${complaint.name}.

CLINICAL REFERENCE & UPLOADED REPORTS:
${combinedContext}

Output ONLY valid JSON. No markdown. No explanation. Exactly this structure:
{"question":"[Your response to the doctor's follow-up question or reports analysis. Keep it clinical, structured, helpful and brief.]","options":[],"differentials":[{"name":"...","likelihood":"high|medium|low","reasoning":"one line max"}],"red_flags":["..."],"done":false}

Rules:
- question: your response to the doctor's typed follow-up or report uploaded. Make sure to review the UPLOADED CLINICAL REPORTS if present!
- options: ALWAYS return [] (empty array) in discussion mode.
- differentials: max 5, updated and ranked based on new information, India-specific weighting.
- red_flags: ONLY if triggered.
- done: false.`;
    }

    if (msgs.length === 0) {
      msgs.push({ role: "user", content: "Let's begin the clinical discussion. Summarize what we know so far." });
    } else {
      msgs.push({ role: "user", content: "Discuss the latest update / answer the doctor's question." });
    }

    try {
      let raw = "";
      await callAIStream(msgs, systemPrompt, provider, apiKey, t => { raw = t; setStreamText(t); });
      const parsed = parseJSON(raw);
      if (parsed) {
        if (opdMode) {
          setOpdQuestions(parsed.opd_questions || []);
        } else {
          setCurrentQ(parsed.question || "");
          let nextOpts = parsed.options || [];
          if (parsed.done && hist.length >= 9) {
            nextOpts = [
              "Generate note with current findings",
              "💬 Discuss further with AI (upload reports & chat)"
            ];
          }
          setOptions(nextOpts);
        }
        if (parsed.differentials?.length) setDifferentials(parsed.differentials.slice(0, 5));
        if (parsed.red_flags?.length) setRedFlags(p => [...new Set([...p, ...parsed.red_flags])]);
      } else { setError("Could not parse AI response. Tap to retry."); }
    } catch (e) { setError(`${e.message}. Tap to retry.`); }
    finally { setLoading(false); setStreamText(""); setNodeData(null); }
  };

  const applyWeights = (tags) => {
    const dw = complaint.diffWeights || {};
    const map = { ...weightMap };
    Object.entries(dw).forEach(([diag, rule]) => {
      if (!map[diag]) map[diag] = 0;
      (rule.tags_increase || []).forEach(t => { if (tags.includes(t)) map[diag] += 2; });
      (rule.tags_decrease || []).forEach(t => { if (tags.includes(t)) map[diag] -= 1; });
    });
    setWeightMap(map);
    const sorted = Object.entries(map).sort(([,a],[,b]) => b-a).slice(0,5)
      .map(([name, score]) => ({ name, likelihood: score >= 8 ? "high" : score >= 4 ? "medium" : "low",
        reasoning: diffsRef.current.find(d => d.name === name)?.reasoning || "" }));
    if (sorted.length) setDifferentials(sorted);
    return sorted;
  };

  const handleAnswer = (answer, nodeOpt = null) => {
    if (answer === "Generate note with current findings") {
      onNote(history, differentials, redFlags);
      return;
    }
    if (answer === "💬 Discuss further with AI (upload reports & chat)") {
      setDiscussionMode(true);
      const nextHist = [...history, { q: currentQ, a: answer }];
      setHistory(nextHist);
      setOptions([]);
      setTimeout(() => {
        askAI(nextHist);
      }, 100);
      return;
    }

    const hist = [...history, { q: currentQ, a: answer }];
    setHistory(hist); setCustomIn(""); setVoiceTx("");
    const tags = nodeOpt?.tags || [];
    const newRedFlags = [...redFlagsRef.current];
    if (nodeOpt?.redFlag) {
      const msg = nodeOpt.redFlagMessage;
      if (!newRedFlags.includes(msg)) newRedFlags.push(msg);
      setRedFlags(newRedFlags);
    }
    const al = answer.toLowerCase();
    (complaint.redFlagKeywords || []).forEach(kw => {
      if (al.includes(kw.toLowerCase())) {
        const msg = `Red flag: "${kw}" reported`;
        if (!newRedFlags.includes(msg)) { newRedFlags.push(msg); setRedFlags([...newRedFlags]); }
      }
    });
    const updatedDiffs = applyWeights(tags);
    const nextId = nodeOpt?.next;
    if (nextId === "END") {
      if (apiKey) {
        askAI(hist);
      } else {
        onNote(hist, updatedDiffs.length ? updatedDiffs : diffsRef.current, newRedFlags);
      }
      return;
    }
    if (nextId && nextId !== "AI" && complaint.workflow?.nodes) {
      const next = complaint.workflow.nodes.find(n => n.id === nextId);
      if (next) {
        setNodeData(next);
        setCurrentQ(next.question);
        let nextOpts = next.options.map(o => o.label);
        if (next.id && next.id.endsWith("_handoff")) {
          nextOpts = [...nextOpts, "💬 Discuss further with AI (upload reports & chat)"];
        }
        setOptions(nextOpts);
        return;
      }
    }
    askAI(hist);
  };

  const openSidebar = (diag) => {
    const t0 = performance.now();
    const chunks = idx.search(diag + " symptoms diagnosis treatment signs", 5);
    setSidebar({ open: true, diagnosis: diag, chunks, ms: (performance.now() - t0).toFixed(1) });
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge."); return; }
    const rec = new SR(); rec.lang = "en-IN"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => setVoiceTx(Array.from(e.results).map(r => r[0].transcript).join(" "));
    rec.onend = () => setVoiceOn(false);
    rec.start(); recRef.current = rec; setVoiceOn(true);
  };

  return (
    <div className="consultation-root" style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-background-primary)" }}>
      <div className="consultation-header" style={{ background: "#fff", borderBottom: "1px solid var(--color-border-primary)", padding: "12px 20px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
        <span style={{ fontSize: 20 }}>🩺</span>
        <Badge color={TEAL}>{age} · {sex}</Badge>
        <Badge color={{ bg: "#F0F0F0", text: "#333", border: "#DDD" }}>{complaint.name}</Badge>
        <Badge color={{ bg: "#F0F0F0", text: "#333", border: "#DDD" }}>Q{history.length + 1}</Badge>
        {aiOnly && <Badge color={{ bg: "#4c1d95", text: "#F3E8FF", border: "#A855F7" }}>✨ AI Mode</Badge>}
        {retrieveMs && <span style={{ fontSize: 11, color: TEAL.primary, fontWeight: 600 }}>⚡ {retrieveMs}ms</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn testId="generate-note-btn" small variant="secondary" disabled={history.length < 4} onClick={() => onNote(history, differentials, redFlags)}>Generate Note</Btn>
          <Btn testId="end-consultation-btn" small variant="ghost" onClick={onEnd}>End</Btn>
        </div>
      </div>

      {redFlags.length > 0 && (
        <div style={{ background: RED.bg, borderBottom: `1px solid ${RED.border}`, padding: "10px 20px", display: "flex", gap: 10, alignItems: "flex-start", flexShrink: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🚨</span>
          <div>{redFlags.map((rf, i) => <p key={i} style={{ fontSize: 13, color: RED.text, margin: "2px 0", fontWeight: 600 }}>{rf}</p>)}</div>
        </div>
      )}

      <div className="consultation-layout" style={{ flex: 1, overflow: "hidden" }}>
        <div className="consultation-main" style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {history.length > 0 && (
            <div ref={histRef} style={{ maxHeight: 150, overflowY: "auto", background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 14px" }}>
              {history.map((h, i) => (
                <div key={i} style={{ marginBottom: 8, opacity: 0.75 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", margin: "0 0 1px" }}>Q{i+1}: {h.q}</p>
                  <p style={{ fontSize: 13, color: "var(--color-text-primary)", margin: 0 }}>→ {h.a}</p>
                </div>
              ))}
            </div>
          )}

          <Card style={{ padding: 20 }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>⏳</span>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>
                  {(() => {
                    if (!streamText) return "Thinking…";
                    try {
                      const cleaned = streamText.replace(/```json|```/g, "").trim();
                      const match = cleaned.match(/"question"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
                      if (match && match[1]) {
                        return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                      }
                    } catch (e) {}
                    return "Thinking…";
                  })()}
                </p>
              </div>
            ) : error ? (
              <div>
                <p style={{ fontSize: 14, color: AMBER.text, fontWeight: 500, margin: "0 0 12px" }}>{error}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {history.length >= 4 && (
                    <Btn testId="generate-note-offline-btn" small onClick={() => onNote(history, differentials, redFlags)}>Generate Note Offline →</Btn>
                  )}
                  {!apiKey && setSettingsOpen && (
                    <Btn testId="add-api-key-btn" small variant="secondary" onClick={() => setSettingsOpen(true)}>⚙️ Add API Key</Btn>
                  )}
                </div>
              </div>
            ) : opdMode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: TEAL.primary, display: "flex", alignItems: "center", gap: 6 }}>⚡ OPD Fast-Track (Ask parallel questions)</p>
                {opdQuestions.length === 0 ? (
                  <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>Loading questions...</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {opdQuestions.map((qObj, index) => {
                      const ans = opdAnswers[qObj.key] || "";
                      const opts = qObj.options || [];
                      return (
                        <div key={qObj.key || index} style={{ borderBottom: index < opdQuestions.length - 1 ? "1px solid var(--color-border-primary)" : "none", paddingBottom: index < opdQuestions.length - 1 ? 14 : 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px", color: "var(--color-text-primary)", lineHeight: 1.4 }}>{index + 1}. {qObj.question}</p>
                          
                          {opts.length > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                              {opts.map(opt => {
                                const active = ans === opt;
                                return (
                                  <button
                                    key={opt}
                                    data-testid={`opd-option-${qObj.key}-${opt}`}
                                    onClick={() => setOpdAnswers(prev => ({ ...prev, [qObj.key]: opt }))}
                                    style={{
                                      padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", fontFamily: "var(--font-sans)",
                                      borderColor: active ? TEAL.primary : "var(--color-border-primary)",
                                      background: active ? TEAL.bg : "#fff",
                                      color: active ? TEAL.primary : "var(--color-text-secondary)",
                                      transition: "all 0.15s"
                                    }}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <input
                            data-testid={`opd-answer-input-${qObj.key}`}
                            value={ans}
                            onChange={e => setOpdAnswers(prev => ({ ...prev, [qObj.key]: e.target.value }))}
                            placeholder={opts.length > 0 ? "Or type a custom answer..." : "Type answer..."}
                            style={{
                              width: "100%", padding: "8px 12px", border: "1.5px solid var(--color-border-primary)",
                              borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "var(--font-sans)",
                              background: "#fff", color: "var(--color-text-primary)"
                            }}
                          />
                        </div>
                      );
                    })}
                    
                    <Btn 
                      testId="submit-opd-answers-btn"
                      disabled={Object.keys(opdAnswers).length === 0} 
                      onClick={() => {
                        const newHist = [...history];
                        opdQuestions.forEach(qObj => {
                          const ans = opdAnswers[qObj.key];
                          if (ans && ans.trim()) {
                            newHist.push({ q: qObj.question, a: ans.trim() });
                          }
                        });
                        setHistory(newHist);
                        setOpdAnswers({});
                        askAI(newHist);
                      }}
                      style={{ alignSelf: "flex-end", marginTop: 8 }}
                    >
                      ⚡ Submit OPD Answers ({Object.keys(opdAnswers).length})
                    </Btn>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 16, fontWeight: 500, margin: 0, lineHeight: 1.6 }}>
                {currentQ || "Loading first question…"}
              </p>
            )}
          </Card>

          {discussionMode && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 14, border: "1px solid var(--color-border-primary)" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>📑 Upload Case Reports / Photos to Discuss</label>
              <DocumentIntake docs={discussionDocs} setDocs={setDiscussionDocs} provider={provider} apiKey={apiKey} />
            </div>
          )}

          {!loading && !error && !opdMode && options.map((opt, i) => (
            <OptionButton key={i} testId={`option-btn-${i}`} label={opt} onClick={() => handleAnswer(opt, nodeData?.options?.find(o => o.label === opt))} />
          ))}

          {!opdMode && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button data-testid="voice-toggle-btn" onClick={voiceOn ? () => { recRef.current?.stop(); setVoiceOn(false); } : startVoice}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
                      border: `1.5px solid ${voiceOn ? RED.primary : "var(--color-border-primary)"}`,
                      background: voiceOn ? RED.bg : "#fff", color: voiceOn ? RED.primary : "var(--color-text-secondary)" }}>
                    {voiceOn && <span style={{ width: 8, height: 8, borderRadius: "50%", background: RED.primary, animation: "pulse 1s infinite" }} />}
                    🎙 {voiceOn ? "Stop" : "Speak"}
                  </button>
                  {voiceTx && !voiceOn && (
                    <button data-testid="use-voice-transcript-btn" onClick={() => handleAnswer(voiceTx)}
                      style={{ padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
                        border: `1.5px solid ${TEAL.border}`, background: TEAL.bg, color: TEAL.primary }}>
                      Use this →
                    </button>
                  )}
                  {discussionMode && (
                    <Btn testId="generate-note-discussion-btn" small style={{ marginLeft: "auto" }} onClick={() => onNote(history, differentials, redFlags)}>
                      Generate Note ({history.length} items) →
                    </Btn>
                  )}
                </div>
                {(voiceOn || voiceTx) && (
                  <div style={{ padding: "10px 14px", background: "#F0FFF8", border: `1.5px solid ${TEAL.border}`, borderRadius: 8, fontSize: 13, color: TEAL.text, minHeight: 40 }}>
                    {voiceTx || <span style={{ opacity: 0.5 }}>Listening…</span>}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input data-testid="custom-answer-input" value={customIn} onChange={e => setCustomIn(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && customIn.trim()) handleAnswer(customIn.trim()); }}
                  placeholder="Or type a custom answer…"
                  style={{ flex: 1, padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)" }} />
                <button data-testid="send-custom-answer-btn" onClick={() => customIn.trim() && handleAnswer(customIn.trim())}
                  style={{ padding: "9px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", background: TEAL.primary, color: "#fff", fontFamily: "var(--font-sans)" }}>→</button>
              </div>
            </>
          )}

          {retrieved.length > 0 && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", margin: "0 0 8px", letterSpacing: 0.5 }}>CONTEXT USED · {retrieveMs}ms</p>
              {retrieved.slice(0, 2).map((r, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: TEAL.primary, margin: "0 0 2px" }}>{r.source}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.4 }}>{r.text.slice(0, 120)}…</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="consultation-sidebar" style={{ borderLeft: "1px solid var(--color-border-primary)", padding: 16, overflowY: "auto", background: "#fff" }}>
          <DifferentialsPanel differentials={differentials} onClickDiag={openSidebar} />
          <SuperTagsCard tagLibrary={tagLibrary} idx={idx} complaintName={complaint.name} history={history} pdfBuffers={pdfBuffers} />
        </div>
      </div>

      <DiagnosisSidebar sidebar={sidebar} onClose={() => setSidebar(s => ({ ...s, open: false }))}
        query={buildRetrievalQuery(complaint.name, history.map(h => h.a))} complaintTags={complaintTags} pdfBuffers={pdfBuffers} />

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}

// ─── Clinical Note ────────────────────────────────────────────────────────────
function NoteScreen({ session, history, differentials, redFlags, provider, apiKey, onNewPatient }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiUsed, setAiUsed] = useState(false);
  const [savedCaseId, setSavedCaseId] = useState(null);

  useEffect(() => {
    (async () => {
      if (!apiKey) {
        // Fully offline note
        const localNote = generateLocalNote(session.complaint.name, session.age, session.sex, history, differentials, redFlags);
        setNote(localNote);
        setLoading(false);
        const saved = await saveCaseRecord({ complaint: session.complaint.name, age: session.age, sex: session.sex, history, differentials, red_flags: redFlags, note_text: localNote });
        if (saved?.id) setSavedCaseId(saved.id);
        return;
      }
      setAiUsed(true);
      try {
        let finalNote = "";
        await callAIStream(
          [{ role: "user", content: buildNotePrompt(session.complaint.name, session.age, session.sex, history, differentials, redFlags) }],
          "You are a clinical documentation assistant for Indian government hospitals. Output structured clinical notes only.",
          provider, apiKey, t => { finalNote = t; setNote(t); }
        );
        const saved = await saveCaseRecord({ complaint: session.complaint.name, age: session.age, sex: session.sex, history, differentials, red_flags: redFlags, note_text: finalNote });
        if (saved?.id) setSavedCaseId(saved.id);
      } catch (e) {
        // Fallback to local note on API error
        const localNote = generateLocalNote(session.complaint.name, session.age, session.sex, history, differentials, redFlags);
        setNote(localNote + `\n\n[AI error: ${e.message} — local note generated]`);
        setAiUsed(false);
        const saved = await saveCaseRecord({ complaint: session.complaint.name, age: session.age, sex: session.sex, history, differentials, red_flags: redFlags, note_text: localNote });
        if (saved?.id) setSavedCaseId(saved.id);
      } finally { setLoading(false); }
    })();
  }, []);

  const providerName = getProvider(provider)?.name || provider;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid var(--color-border-primary)", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px" }}>Clinical Note</h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
            {history.length} questions · {session.complaint.name} · {session.age} · {session.sex}
            {aiUsed && !loading && <span style={{ marginLeft: 8, color: TEAL.primary, fontWeight: 600 }}>· via {providerName}</span>}
            {!aiUsed && !loading && <span style={{ marginLeft: 8, color: GRAY.text, fontWeight: 600 }}>· local (offline)</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn testId="copy-note-btn" small variant="ghost" onClick={() => navigator.clipboard?.writeText(note)}>Copy</Btn>
          <Btn testId="new-patient-btn" small onClick={onNewPatient}>New Patient</Btn>
        </div>
      </div>
      <div style={{ flex: 1, padding: 24, maxWidth: 760, margin: "0 auto", width: "100%" }}>
        {redFlags.length > 0 && (
          <div style={{ background: RED.bg, border: `1.5px solid ${RED.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: RED.text, margin: "0 0 6px" }}>🚨 Red Flags Triggered</p>
            {redFlags.map((rf, i) => <p key={i} style={{ fontSize: 13, color: RED.text, margin: "2px 0" }}>• {rf}</p>)}
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <p style={{ fontSize: 16, color: "var(--color-text-secondary)" }}>
              {aiUsed ? `Generating note via ${providerName}…` : "Generating local note…"}
            </p>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 12, padding: 24 }}>
            <pre style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--color-text-primary)", margin: 0 }}>{note}</pre>
          </div>
        )}
      </div>
      {savedCaseId && <RatingPrompt recordType="case" recordId={savedCaseId} onDismiss={() => setSavedCaseId(null)} />}
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function App() {
  const { user } = useAuth();
  const [product, setProduct] = useState(null); // null = Home Screen, "clinicalmind" | "supersummary"
  const [phase, setPhase] = useState("library");
  const [provider, setProvider] = useState("claude");
  const [apiKey, setApiKey] = useState(""); // truthy only when backend AI is configured ("backend-managed" sentinel)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [noteData, setNoteData] = useState(null);
  const [pdfDocs, setPdfDocs] = useState([]);
  const [customComplaints, setCustomComplaints] = useState(() => {
    try { return JSON.parse(localStorage.getItem("clinicalmind:complaints") || "[]"); } catch { return []; }
  });
  const [tagLibrary, setTagLibrary] = useState([]);
  const pdfBuffers = useRef(new Map());
  const idx = useRef(new BM25()).current;

  const refreshAiStatus = () => {
    const API_URL = import.meta.env.REACT_APP_BACKEND_URL;
    fetch(`${API_URL}/api/ai/status`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setProvider(data.provider || "claude");
        setApiKey(data.configured ? "backend-managed" : "");
      })
      .catch(() => setApiKey(""));
  };

  useEffect(() => { refreshAiStatus(); }, []);

  // Hydrate SuperMemory (uploaded books + custom tags) from the backend on login,
  // so a user's library follows them across devices/sessions instead of resetting.
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
    })();
  }, [user]);

  // Guests can browse the home page freely — this gate only fires when they try to
  // actually use a feature (launch a tool / open an external partner link).
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const requireAuth = (action) => {
    if (user) { action(); return; }
    setLoginModalOpen(true);
  };

  // Provider/key are now managed centrally by the admin — these are no-ops for regular
  // users and are only reachable via the admin-only settings UI, which calls refreshAiStatus().
  const handleProviderChange = () => {};
  const handleKeyChange = () => { refreshAiStatus(); };

  const goNote = (history, differentials, redFlags) => { setNoteData({ history, differentials, redFlags }); setPhase("note"); };
  const reset = () => { setSession(null); setNoteData(null); setPhase("library"); };

  return (
    <>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        provider={provider}
        setProvider={handleProviderChange}
        currentKey={apiKey}
        setCurrentKey={handleKeyChange}
      />
      {product === null && (
        <div style={{ minHeight: "100vh", background: "var(--color-background-primary)", display: "flex", flexDirection: "column" }}>
          {/* Header — premium gradient */}
          <div className="hero-band" style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(13,148,136,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26 }}>⚡</span>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "#fff", letterSpacing: "-0.5px" }}>ClinicFlow</h1>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", margin: 0, fontWeight: 500 }}>Comprehensive Clinical Intelligence Suite</p>
              </div>
            </div>
            <ProfileMenu onSettings={() => setSettingsOpen(true)} onTagLibrary={() => setProduct("clinicalmind")} tagCount={tagLibrary.length} />
          </div>

          {/* Main Dashboard Cards Container */}
          <div style={{ flex: 1, padding: "32px 20px 0", width: "100%", maxWidth: 1040, margin: "0 auto" }}>
            {/* Animated premium hero carousel */}
            <HomeHero />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>Choose your workspace</h2>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>Two tools, one clinical suite — pick where you want to start.</p>
              </div>
            </div>

            <div className="library-grid anim-fade-up" style={{ width: "100%", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
              {/* Card 1: ClinicFlow */}
              <Card testId="home-card-clinicflow" onClick={() => requireAuth(() => setProduct("clinicalmind"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(13, 148, 136, 0.15)" }} className="premium-card">
                <div style={{ background: "#f0fdfa", borderBottom: "1px solid rgba(13, 148, 136, 0.08)" }}>
                  <CardCarousel accent="#0d9488" slides={[IllustConsult, IllustDifferential, IllustSafety]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🩺</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-teal-primary)", margin: 0 }}>ClinicFlow</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 20px 0", flex: 1 }}>
                    Interactive clinical consultations, patient history taking, differentials weighting, and automated clinical documentation designed for Indian OPDs.
                  </p>
                  <button data-testid="launch-clinicflow-btn" style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "var(--color-teal-primary)", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(13, 148, 136, 0.2)" }}>
                    Launch ClinicFlow →
                  </button>
                </div>
              </Card>

              {/* Card 2: SuperSummary */}
              <Card testId="home-card-supersummary" onClick={() => requireAuth(() => setProduct("supersummary"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(124, 58, 237, 0.15)" }} className="premium-card">
                <div style={{ background: "#f5f3ff", borderBottom: "1px solid rgba(124, 58, 237, 0.08)" }}>
                  <CardCarousel accent="#7c3aed" slides={[IllustDocs, IllustScan]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>📋</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-purple-primary, #7c3aed)", margin: 0 }}>SuperSummary</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 20px 0", flex: 1 }}>
                    Advanced discharge summary generator. Create templates, parse intake documents via OCR, review safety checklists, and save/export results.
                  </p>
                  <button data-testid="launch-supersummary-btn" style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(124, 58, 237, 0.2)" }}>
                    Launch SuperSummary →
                  </button>
                </div>
              </Card>

              {/* Card 3: SuperMemory — opens as its own page in a new tab, own login gate too */}
              <Card testId="home-card-supermemory" onClick={() => requireAuth(() => window.open("/supermemory", "_blank"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(245, 158, 11, 0.2)" }} className="premium-card">
                <div style={{ background: "#fff7ed", borderBottom: "1px solid rgba(245, 158, 11, 0.1)" }}>
                  <CardCarousel accent="#f59e0b" slides={[IllustLibrary, IllustDocs]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>✨</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#b45309", margin: 0 }}>SuperMemory</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 20px 0", flex: 1 }}>
                    Your textbooks and hospital protocols, AI-indexed. Upload once, then search or jump to the exact page mid-consult — fully offline.
                  </p>
                  <button data-testid="open-supermemory-btn" style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#f59e0b", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(245, 158, 11, 0.25)" }}>
                    Open SuperMemory →
                  </button>
                </div>
              </Card>
            </div>

            {/* Our Other Apps — MoProPrep & DnbProPrep, each with a shareable vanity link */}
            <div style={{ marginTop: 40, marginBottom: 18 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>Our Other Apps</h2>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>Sister platforms from the same team — share these links with your friends.</p>
            </div>
            <div className="library-grid anim-fade-up" style={{ width: "100%", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
              {/* Card 4: MoProPrep — external gamified learning platform */}
              <Card testId="home-card-moproprep" onClick={() => requireAuth(() => window.open("https://www.moproprep.in/", "_blank", "noopener,noreferrer"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(8, 145, 178, 0.2)" }} className="premium-card">
                <div style={{ background: "#ecfeff", borderBottom: "1px solid rgba(8, 145, 178, 0.1)" }}>
                  <CardCarousel accent="#0891b2" slides={[IllustGame]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🎮</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0891b2", margin: 0 }}>MoProPrep</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 14px 0", flex: 1 }}>
                    Learn medicine the fun way — a gamified prep platform with quizzes, streaks, and challenges. Opens in a new tab.
                  </p>
                  <ShareLinkRow path="/moproprep" testId="moproprep" accent="#0891b2" />
                  <button data-testid="play-learn-btn" style={{ alignSelf: "flex-start", marginTop: 12, padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#0891b2", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(8, 145, 178, 0.25)" }}>
                    Play & Learn ↗
                  </button>
                </div>
              </Card>

              {/* Card 5: DnbProPrep — external DNB exam prep platform */}
              <Card testId="home-card-dnbproprep" onClick={() => requireAuth(() => window.open("https://dnbproprep.com/", "_blank", "noopener,noreferrer"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(79, 70, 229, 0.2)" }} className="premium-card">
                <div style={{ background: "#eef2ff", borderBottom: "1px solid rgba(79, 70, 229, 0.1)" }}>
                  <CardCarousel accent="#4f46e5" slides={[IllustDnb]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🎓</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#4f46e5", margin: 0 }}>DnbProPrep</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 14px 0", flex: 1 }}>
                    Focused DNB exam preparation — structured practice and review material. Opens in a new tab.
                  </p>
                  <ShareLinkRow path="/dnbproprep" testId="dnbproprep" accent="#4f46e5" />
                  <button data-testid="prep-dnb-btn" style={{ alignSelf: "flex-start", marginTop: 12, padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(79, 70, 229, 0.25)" }}>
                    Prep for DNB ↗
                  </button>
                </div>
              </Card>
            </div>
          </div>
          <AppFooter />
          {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
        </div>
      )}
      {product === "supersummary" && (
        <div style={{ minHeight: "100vh" }}>
          <div style={{ background: "linear-gradient(120deg,#6E40C9,#9333EA)", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(124,58,237,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>📋</span>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#fff" }}>SuperSummary</h1>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", margin: 0 }}>Discharge summaries — templates + OCR intake</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ProductToggle product={product} setProduct={setProduct} />
              <ProfileMenu onSettings={() => setSettingsOpen(true)} onTagLibrary={() => setProduct("clinicalmind")} tagCount={tagLibrary.length} />
            </div>
          </div>
          <SuperSummary provider={provider} apiKey={apiKey} setSettingsOpen={setSettingsOpen} />
        </div>
      )}
      {product === "clinicalmind" && phase === "library" && (
        <LibraryScreen
          onStart={s => { setSession(s); setPhase("consultation"); }}
          hasKey={!!apiKey}
          provider={provider}
          apiKey={apiKey}
          idx={idx}
          pdfDocs={pdfDocs}
          setPdfDocs={setPdfDocs}
          customComplaints={customComplaints}
          setCustomComplaints={setCustomComplaints}
          setSettingsOpen={setSettingsOpen}
          tagLibrary={tagLibrary}
          setTagLibrary={setTagLibrary}
          pdfBuffers={pdfBuffers}
          product={product}
          setProduct={setProduct}
        />
      )}
      {product === "clinicalmind" && phase === "consultation" && session && (
        <ConsultationScreen
          session={session}
          idx={idx}
          provider={provider}
          apiKey={apiKey}
          onEnd={reset}
          onNote={goNote}
          tagLibrary={tagLibrary}
          pdfBuffers={pdfBuffers}
          setSettingsOpen={setSettingsOpen}
        />
      )}
      {product === "clinicalmind" && phase === "note" && noteData && session && (
        <NoteScreen
          session={session}
          history={noteData.history}
          differentials={noteData.differentials}
          redFlags={noteData.redFlags}
          provider={provider}
          apiKey={apiKey}
          onNewPatient={reset}
        />
      )}
    </>
  );
}
