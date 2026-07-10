import { useState } from "react";
import { TEAL, AMBER, RED, CATEGORIES } from "./theme.js";
import { Btn } from "./UIPrimitives.jsx";
import { WorkflowEditor } from "./WorkflowEditor.jsx";
import { openPDFDoc, extractPageText, renderPageToDataURL } from "./pdfUtils.js";

// ─── Complaint Editor ─────────────────────────────────────────────────────────
export function ComplaintEditor({ complaint, onSave, onClose, tagLibrary = [], noAiNotice, pdfDocs = [], pdfBuffers, onAddTagSource }) {
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState(complaint || {
    name: "", category: "General", ageGroup: "all", clinicalContent: "",
    redFlagKeywords: [], commonDifferentials: [], tags: [], source: "private", author: ""
  });
  const [rfInput, setRfInput] = useState((form.redFlagKeywords || []).join(", "));
  const [diffInput, setDiffInput] = useState((form.commonDifferentials || []).join(", "));
  const [tagInput, setTagInput] = useState((form.tags || []).join(", "));
  const [workflow, setWorkflow] = useState(form.workflow || { nodes: [], entryNode: "" });
  const [diffWeights, setDiffWeights] = useState(form.diffWeights || {});
  const [tagRefs, setTagRefs] = useState(form.tagRefs || []);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagDoc, setNewTagDoc] = useState(pdfDocs.find(d => d.isPdf)?.name || "");
  const [newTagPage, setNewTagPage] = useState("");
  const [newTagBusy, setNewTagBusy] = useState(false);

  const createInlineTag = async () => {
    const doc = pdfDocs.find(d => d.name === newTagDoc);
    const page = parseInt(newTagPage);
    if (!newTagLabel.trim() || !doc || !page || page < 1 || page > (doc.numPages || 1)) return;
    setNewTagBusy(true);
    try {
      const buf = pdfBuffers?.current?.get(doc.name);
      if (!buf) return;
      const pdf = await openPDFDoc(buf);
      const text = await extractPageText(pdf, page);
      const image = await renderPageToDataURL(pdf, page);
      const id = onAddTagSource(newTagLabel.trim(), doc.name, page, text, image);
      setTagRefs(prev => prev.includes(id) ? prev : [...prev, id]);
      setNewTagLabel(""); setNewTagPage("");
    } finally { setNewTagBusy(false); }
  };

  const inputS = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box" };

  const save = () => {
    const now = new Date().toISOString();
    const saved = {
      ...form,
      id: form.id || form.name.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(),
      redFlagKeywords: rfInput.split(",").map(s => s.trim()).filter(Boolean),
      commonDifferentials: diffInput.split(",").map(s => s.trim()).filter(Boolean),
      tags: tagInput.split(",").map(s => s.trim()).filter(Boolean),
      source: "private",
      createdAt: form.createdAt || now,
      editedAt: now,
    };
    if (workflow.nodes.length > 0) saved.workflow = workflow;
    if (Object.keys(diffWeights).length > 0) saved.diffWeights = diffWeights;
    if (tagRefs.length > 0) saved.tagRefs = tagRefs;
    onSave(saved);
  };

  const TABS = [{ id: "details", label: "Details" }, { id: "workflow", label: `Workflow (${workflow.nodes.length} nodes)` }, { id: "content", label: "Clinical Content" }, { id: "weights", label: "Weights" }];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 820 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{complaint ? `Edit: ${complaint.name}` : "Create New Complaint"}</h2>
          <button data-testid="complaint-editor-close-btn" onClick={onClose} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>

        {complaint?.source === "system" && (
          <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: AMBER.text }}>
            System complaints are read-only. Saving creates a private fork with your changes.
          </div>
        )}

        {noAiNotice && (
          <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: AMBER.text }}>
            ⚠ No API key configured — the extracted PDF text was dropped into Clinical Content as-is. Fill in Name, Category, and Differentials manually, or add an API key in ⚙️ Settings for automatic extraction next time.
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1.5px solid var(--color-border-primary)", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} data-testid={`complaint-editor-tab-${t.id}-btn`} onClick={() => setTab(t.id)}
              style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "var(--font-sans)",
                borderBottom: tab === t.id ? `2.5px solid ${TEAL.primary}` : "2.5px solid transparent",
                background: "none", color: tab === t.id ? TEAL.primary : "var(--color-text-secondary)", marginBottom: -1.5 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Details tab */}
        {tab === "details" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Complaint Name</label>
              <input data-testid="complaint-editor-name-input" style={inputS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Fever with Cough" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Category</label>
                <select data-testid="complaint-editor-category-select" style={inputS} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.slice(1).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Age Group</label>
                <select data-testid="complaint-editor-age-group-select" style={inputS} value={form.ageGroup} onChange={e => setForm(f => ({ ...f, ageGroup: e.target.value }))}>
                  {["all","pediatric","neonatal","adult"].map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Red Flag Keywords <span style={{ fontWeight: 400, fontSize: 12 }}>(comma-separated — triggers alert if patient mentions these)</span></label>
              <input data-testid="complaint-editor-redflags-input" style={inputS} value={rfInput} onChange={e => setRfInput(e.target.value)} placeholder="e.g. petechiae, neck stiff, cyanosis" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Common Differentials <span style={{ fontWeight: 400, fontSize: 12 }}>(comma-separated — shown in sidebar)</span></label>
              <input data-testid="complaint-editor-differentials-input" style={inputS} value={diffInput} onChange={e => setDiffInput(e.target.value)} placeholder="e.g. Malaria, Dengue, Typhoid" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Tags</label>
              <input data-testid="complaint-editor-tags-input" style={inputS} value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="e.g. fever, rash" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
                Book References <span style={{ fontWeight: 400, fontSize: 12 }}>(attach tags from your PDF Tag Library — shown in the consultation sidebar)</span>
              </label>
              {tagLibrary.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>No tags yet.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {tagLibrary.map(t => {
                    const on = tagRefs.includes(t.id);
                    return (
                      <button key={t.id} type="button" data-testid={`complaint-editor-tagref-${t.id}-toggle`}
                        onClick={() => setTagRefs(prev => on ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                        style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "var(--font-sans)",
                          border: `1.5px solid ${on ? TEAL.primary : "var(--color-border-primary)"}`,
                          background: on ? TEAL.bg : "#fff", color: on ? TEAL.primary : "var(--color-text-secondary)" }}>
                        {on ? "✓ " : "🏷 "}{t.label} <span style={{ opacity: 0.6 }}>({t.sources.length})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Inline tag creator — create a new tag right from here, no need to open the PDF reader first */}
              {pdfDocs.filter(d => d.isPdf).length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Upload a PDF in the Document Vault to create book-reference tags.</p>
              ) : (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>NEW TAG LABEL</label>
                    <input data-testid="complaint-editor-new-tag-label-input" style={{ ...inputS, padding: "7px 10px", fontSize: 13 }} value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)}
                      placeholder="e.g. Fever" list="complaint-editor-tag-labels" />
                    <datalist id="complaint-editor-tag-labels">
                      {tagLibrary.map(t => <option key={t.id} value={t.label} />)}
                    </datalist>
                  </div>
                  <div style={{ minWidth: 140 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>PDF</label>
                    <select data-testid="complaint-editor-new-tag-doc-select" style={{ ...inputS, padding: "7px 10px", fontSize: 13 }} value={newTagDoc} onChange={e => setNewTagDoc(e.target.value)}>
                      {pdfDocs.filter(d => d.isPdf).map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 70 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>PAGE</label>
                    <input data-testid="complaint-editor-new-tag-page-input" type="number" style={{ ...inputS, padding: "7px 10px", fontSize: 13 }} value={newTagPage} onChange={e => setNewTagPage(e.target.value)} min={1} />
                  </div>
                  <button data-testid="complaint-editor-new-tag-add-btn" type="button" onClick={createInlineTag} disabled={newTagBusy || !newTagLabel.trim() || !newTagPage}
                    style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: newTagBusy ? "default" : "pointer", border: "none",
                      background: TEAL.primary, color: "#fff", fontFamily: "var(--font-sans)", opacity: (!newTagLabel.trim() || !newTagPage) ? 0.5 : 1 }}>
                    {newTagBusy ? "Adding…" : "+ Add Tag"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Workflow tab */}
        {tab === "workflow" && (
          <div>
            <div style={{ background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: TEAL.text }}>
              Build a structured question tree. Each node is one question. Options can branch to other nodes, end the consultation (<strong>END</strong>), or hand off to AI (<strong>AI</strong>). The <strong>entry node</strong> is the first question shown.
            </div>
            {workflow.nodes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ fontSize: 32, marginBottom: 10 }}>🌳</p>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 16 }}>No workflow yet. Add your first question node to get started.</p>
                <Btn testId="complaint-editor-create-first-node-btn" onClick={() => {
                  const id = "q1";
                  setWorkflow({ nodes: [{ id, question: "First question?", options: [{ label: "Yes", next: "END", tags: [] }, { label: "No", next: "END", tags: [] }] }], entryNode: id });
                }}>+ Create First Node</Btn>
              </div>
            ) : (
              <WorkflowEditor nodes={workflow.nodes} entryNode={workflow.entryNode}
                onChange={setWorkflow} />
            )}
          </div>
        )}

        {/* Weights tab */}
        {tab === "weights" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: TEAL.text }}>
              For each differential, specify which answer tags <strong>increase</strong> or <strong>decrease</strong> its likelihood score. Tags come from the options in your workflow nodes. Scores: each increase-tag match adds +2, each decrease-tag match subtracts -1. High ≥ 8, Medium ≥ 4.
            </div>
            {diffInput.split(",").map(s => s.trim()).filter(Boolean).map(diag => {
              const w = diffWeights[diag] || { tags_increase: [], tags_decrease: [] };
              return (
                <div key={diag} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{diag}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: TEAL.text, display: "block", marginBottom: 4 }}>↑ INCREASE TAGS (comma-sep)</label>
                      <input data-testid={`weights-${diag}-increase-input`} style={inputS} value={(w.tags_increase || []).join(", ")} placeholder="e.g. rigors, chills"
                        onChange={e => setDiffWeights(dw => ({ ...dw, [diag]: { ...w, tags_increase: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: RED.text, display: "block", marginBottom: 4 }}>↓ DECREASE TAGS (comma-sep)</label>
                      <input data-testid={`weights-${diag}-decrease-input`} style={inputS} value={(w.tags_decrease || []).join(", ")} placeholder="e.g. rash, bleeding"
                        onChange={e => setDiffWeights(dw => ({ ...dw, [diag]: { ...w, tags_decrease: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } }))} />
                    </div>
                  </div>
                </div>
              );
            })}
            {!diffInput.trim() && (
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Add differentials in the Details tab first — they'll appear here for weight configuration.</p>
            )}
          </div>
        )}

        {/* Clinical content tab */}
        {tab === "content" && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
              Clinical Reference Content <span style={{ fontWeight: 400, fontSize: 12 }}>(BM25-indexed — used as AI context and for the diagnosis sidebar)</span>
            </label>
            <textarea data-testid="complaint-editor-content-textarea" className="premium-textarea" style={{ minHeight: 320, resize: "vertical" }}
              value={form.clinicalContent}
              onChange={e => setForm(f => ({ ...f, clinicalContent: e.target.value }))}
              placeholder="Paste clinical reference text here — differentials, red flags, investigations, treatment. Plain text is fine." />
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--color-border-primary)", flexWrap: "wrap" }}>
          <Btn testId="complaint-editor-cancel-btn" variant="ghost" onClick={onClose} small>Cancel</Btn>
          <Btn testId="complaint-editor-export-json-btn" variant="secondary" small onClick={() => {
            const data = { ...form, redFlagKeywords: rfInput.split(",").map(s => s.trim()).filter(Boolean), workflow };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${form.name || "complaint"}.json`; a.click();
          }}>Export JSON</Btn>
          <Btn testId="complaint-editor-save-btn" onClick={save} disabled={!form.name}>Save as Private</Btn>
        </div>
      </div>
    </div>
  );
}
