import { useState } from "react";
import { callAIStream, parseJSON } from "./api.js";
import { publishWorkflow } from "./community.js";
import { downloadBook, upsertTagSource, removeTagSourceRemote, deleteTagRemote } from "./supermemory.js";
import { extractPageText } from "./pdfUtils.js";
import { TEAL } from "./theme.js";
import { Btn, Card } from "./UIPrimitives.jsx";
import { ComplaintEditor } from "./ComplaintEditor.jsx";
import { DocumentVault } from "./DocumentVault.jsx";
import { ComplaintLibrary } from "./ComplaintLibrary.jsx";
import { ProductToggle, ProfileMenu } from "./ProfileMenu.jsx";
import { PDFReader } from "./PDFReader.jsx";
import { TagLibraryModal } from "./TagLibraryModal.jsx";

export function LibraryScreen({ onStart, hasKey, provider, apiKey, idx, pdfDocs, setPdfDocs, customComplaints, setCustomComplaints, setSettingsOpen, tagLibrary, setTagLibrary, pdfBuffers, product, setProduct }) {
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
