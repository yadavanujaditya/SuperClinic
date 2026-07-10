import { useState, useRef } from "react";
import { SYSTEM_TEMPLATES, emptyTemplate } from "./templates.js";
import { callAIStream, parseJSON } from "./api.js";
import { AMBER, RED, PURPLE, Btn, inputS } from "./SuperSummaryShared.jsx";

async function extractPdfTextQuick(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) { const p = await pdf.getPage(i); const c = await p.getTextContent(); text += c.items.map(it => it.str).join(" ") + "\n\n"; }
  return text;
}
export function TemplateEditor({ template, onSave, onDelete, onClose, provider, apiKey }) {
  // Merge with empty defaults so templates missing slots/sampleBody (old model / forks) never crash.
  const [form, setForm] = useState({ ...emptyTemplate(), ...(template || {}) });
  const [sel, setSel] = useState(null); // { start, end, text }
  const [slotDraft, setSlotDraft] = useState(null); // { label, question, mandatory, ocrHints }
  const [history, setHistory] = useState([]); // Undo history stack: array of { sampleBody, slots }
  const bodyRef = useRef();
  const fileRef = useRef();

  const pushHistory = () => {
    setHistory(prev => [...prev, { sampleBody: form.sampleBody, slots: form.slots }]);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setForm(f => ({ ...f, sampleBody: prev.sampleBody, slots: prev.slots }));
    setHistory(h => h.slice(0, -1));
  };

  const captureSelection = () => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    if (end > start) setSel({ start, end, text: form.sampleBody.slice(start, end) });
    else setSel(null);
  };

  const beginSlot = () => {
    if (!sel) return;
    setSlotDraft({ label: "", question: "", mandatory: false, ocrHints: "", options: "" });
  };

  const confirmSlot = () => {
    if (!sel || !slotDraft.label.trim()) return;
    pushHistory();
    const key = slotDraft.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) + "_" + Math.random().toString(36).slice(2, 4);
    
    // Normalize lines
    const normalizedSample = form.sampleBody.replace(/\r\n/g, "\n");
    let body = normalizedSample.slice(0, sel.start) + `{{${key}}}` + normalizedSample.slice(sel.end);
    
    // Global replace: if the same text appears elsewhere, offer to link every occurrence to this one blank.
    if (sel.text.trim().length >= 3) {
      const escaped = sel.text.replace(/\r\n/g, "\n").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "g");
      const remaining = (body.match(re) || []).length;
      if (remaining > 0 && window.confirm(`"${sel.text}" appears ${remaining} more time${remaining > 1 ? "s" : ""} in the template.\n\nReplace ALL of them with this blank too? (Answering once will then fill every occurrence.)`)) {
        body = body.replace(re, `{{${key}}}`);
      }
    }
    const options = slotDraft.options.split(",").map(s => s.trim()).filter(Boolean);
    const newSlot = { key, label: slotDraft.label.trim(), question: slotDraft.question.trim() || slotDraft.label.trim() + "?", mandatory: slotDraft.mandatory, default: sel.text.replace(/\r\n/g, "\n"), ocrHints: slotDraft.ocrHints.split(",").map(s => s.trim()).filter(Boolean), options };
    setForm(f => ({ ...f, sampleBody: body, slots: [...f.slots, newSlot] }));
    setSel(null); setSlotDraft(null);
  };

  const removeSlot = (key) => {
    pushHistory();
    // turn every {{key}} occurrence (global blanks have several) back into its default text
    const s = form.slots.find(x => x.key === key);
    setForm(f => ({ ...f, sampleBody: f.sampleBody.replace(/\r\n/g, "\n").split(`{{${key}}}`).join(s?.default || ""), slots: f.slots.filter(x => x.key !== key) }));
  };

  const handleFile = async (file) => {
    pushHistory();
    const text = (file.type === "application/pdf" ? await extractPdfTextQuick(file) : await file.text()).replace(/\r\n/g, "\n");
    setForm(f => ({ ...f, sampleBody: text }));
  };

  const findFlexibleSubstring = (text, find) => {
    const cleanedFind = find.trim().replace(/\s+/g, ' ');
    if (!cleanedFind) return null;
    const regexStr = cleanedFind
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\ /g, "\\s+");
    try {
      const regex = new RegExp(regexStr, "i");
      const match = text.match(regex);
      return match ? match[0] : null;
    } catch (e) {
      return text.includes(find) ? find : null;
    }
  };

  const [aiFinding, setAiFinding] = useState(false);
  const [aiFindError, setAiFindError] = useState("");
  // AI reads the pasted summary and proposes the question set — user reviews/removes chips after.
  const aiFindQuestions = async () => {
    if (!form.sampleBody.trim() || !apiKey) return;
    pushHistory();
    setAiFinding(true); setAiFindError("");
    try {
      const prompt = `Analyze this real hospital discharge summary. Identify the PATIENT-SPECIFIC values that would change for every new patient (sex, dates, times, weights, lab values, delivery mode, gravida, durations, follow-up dates). Do NOT mark fixed boilerplate.

SUMMARY:
${form.sampleBody.replace(/\r\n/g, "\n").slice(0, 6000)}

Return ONLY valid JSON:
{"slots":[{"find":"EXACT text copied verbatim from the summary","label":"short label","question":"Question to ask?","options":["opt1","opt2"],"global":true|false}]}

Rules:
- "find" must be an EXACT substring of the summary (copy it character-for-character) — it will be replaced programmatically
- options: only for true either/or choices (male/female, NVD/LSCS, term/preterm); otherwise []
- global:true only when the same value genuinely recurs and should be answered once (e.g. sex)
- 5-15 slots. No markdown.`;
      let raw = "";
      await callAIStream([{ role: "user", content: prompt }],
        "You are a clinical template annotator. Output only valid JSON, nothing else.", provider, apiKey, t => { raw = t; });
      const parsed = parseJSON(raw);
      let slots = null;
      if (parsed) {
        if (Array.isArray(parsed)) {
          slots = parsed;
        } else if (Array.isArray(parsed.slots)) {
          slots = parsed.slots;
        }
      }
      if (!slots || !slots.length) {
        const snippet = (raw || "").trim().slice(0, 120);
        setAiFindError(snippet ? `AI didn't return usable questions. It said: "${snippet}${raw.length > 120 ? "…" : ""}". Try again, or select text manually.` : "AI returned an empty response — try again, or select text manually.");
        return;
      }
      let body = form.sampleBody.replace(/\r\n/g, "\n");
      const newSlots = [];
      let missed = 0;
      for (const s of slots) {
        if (!s.find) { missed++; continue; }
        const matchedSubstring = findFlexibleSubstring(body, s.find);
        if (!matchedSubstring || matchedSubstring.includes("{{")) { missed++; continue; }
        const key = (s.label || s.find).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) + "_" + Math.random().toString(36).slice(2, 4);
        body = s.global ? body.split(matchedSubstring).join(`{{${key}}}`) : body.replace(matchedSubstring, `{{${key}}}`);
        newSlots.push({ key, label: s.label || s.find, question: s.question || (s.label || s.find) + "?", mandatory: false, default: matchedSubstring, ocrHints: [], options: Array.isArray(s.options) ? s.options : [] });
      }
      if (!newSlots.length) { setAiFindError(`AI suggested ${slots.length} question(s) but none matched the text. Try again, or select text manually and use "+ Make blank".`); return; }
      setForm(f => ({ ...f, sampleBody: body, slots: [...f.slots, ...newSlots] }));
      setAiFindError(missed ? `Added ${newSlots.length} question(s). ${missed} suggestion(s) couldn't be matched — add those manually.` : "");
    } catch (e) { setAiFindError(`Error: ${e.message}`); }
    finally { setAiFinding(false); }
  };

  const save = () => {
    if (!form.name.trim()) { alert("Please enter a template name."); return; }
    
    const now = new Date().toISOString();
    const newName = form.name.trim().toLowerCase();
    
    // Check for duplicate in SYSTEM_TEMPLATES
    const isDuplicateSystem = SYSTEM_TEMPLATES.some(t => t.name.trim().toLowerCase() === newName);
    
    // Check for duplicate in localStorage custom templates
    const prevTemplates = JSON.parse(localStorage.getItem("clinicalmind:templates") || "[]");
    const isDuplicateCustom = prevTemplates.some(t => t.name.trim().toLowerCase() === newName && t.id !== form.id);
    
    if (isDuplicateSystem || isDuplicateCustom) {
      alert("A template with this name already exists. Please choose a unique name.");
      return;
    }
    
    onSave({ ...form, name: form.name.trim(), sampleBody: form.sampleBody.replace(/\r\n/g, "\n"), source: "private", id: form.id || (form.name || "template").toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(), createdAt: form.createdAt || now, editedAt: now });
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
      onDelete(form.id);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{template ? `Edit: ${template.name}` : "Create Template"}</h2>
          <button onClick={onClose} data-testid="template-editor-close-btn" style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>

        <div style={{ background: PURPLE.bg, border: `1px solid ${PURPLE.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: PURPLE.text, marginBottom: 16 }}>
          Paste one of your <strong>real discharge summaries</strong> below. Then <strong>select any words that change per patient</strong> (a value, the age, a duration) and click <strong>“+ Make blank”</strong>. Everything you don't mark stays fixed and prints exactly as written.
        </div>

        <div className="template-editor-grid" style={{ gap: 12, marginBottom: 14 }}>
          <input data-testid="template-name-input" style={inputS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Template name (e.g. Neonatal Jaundice)" />
          <input data-testid="template-diagnosis-input" style={inputS} value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))} placeholder="Diagnosis" />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Btn testId="template-upload-file-btn" small variant="secondary" onClick={() => fileRef.current?.click()}>Upload .txt / .pdf</Btn>
          <input ref={fileRef} type="file" accept=".txt,.pdf" data-testid="template-upload-file-input" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
          <Btn testId="template-make-blank-btn" small onClick={beginSlot} disabled={!sel}>+ Make blank {sel ? `("${sel.text.slice(0, 20)}${sel.text.length > 20 ? "…" : ""}")` : "(select text first)"}</Btn>
          {sel && !slotDraft && (
            <Btn testId="template-clear-selection-btn" small variant="ghost" onClick={() => setSel(null)} style={{ color: RED.primary }}>✕ Clear selection</Btn>
          )}
          <Btn testId="template-ai-find-questions-btn" small variant="secondary" onClick={aiFindQuestions} disabled={!form.sampleBody.trim() || !apiKey || aiFinding}
            title={!apiKey ? "Needs an API key" : ""}>
            {aiFinding ? "✨ Analyzing…" : "✨ AI: find the questions"}
          </Btn>
          <Btn testId="template-undo-btn" small variant="secondary" onClick={undo} disabled={history.length === 0}>
            ↩ Undo
          </Btn>
        </div>
        {aiFindError && <p style={{ fontSize: 12, color: RED.primary, margin: "0 0 8px" }}>{aiFindError}</p>}

        <textarea ref={bodyRef} value={form.sampleBody} onSelect={captureSelection}
          className="premium-textarea"
          data-testid="template-sample-body-textarea"
          onChange={e => setForm(f => ({ ...f, sampleBody: e.target.value.replace(/\r\n/g, "\n") }))}
          placeholder="Paste your discharge summary here…"
          style={{ minHeight: 300, resize: "vertical" }} />

        {slotDraft && (
          <div style={{ background: PURPLE.bg, border: `1px solid ${PURPLE.border}`, borderRadius: 10, padding: 14, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Make "{sel?.text}" a blank</p>
              <button onClick={() => { setSlotDraft(null); setSel(null); }} 
                data-testid="slot-draft-close-btn"
                style={{ fontSize: 16, background: "none", border: "none", cursor: "pointer", color: PURPLE.primary, padding: 4, fontWeight: "bold" }}>
                ✕
              </button>
            </div>
            <div className="template-preview-grid" style={{ gap: 10 }}>
              <input data-testid="slot-draft-label-input" style={inputS} autoFocus value={slotDraft.label} onChange={e => setSlotDraft(s => ({ ...s, label: e.target.value }))} placeholder="Label, e.g. TSB at admission" />
              <input data-testid="slot-draft-ocrhints-input" style={inputS} value={slotDraft.ocrHints} onChange={e => setSlotDraft(s => ({ ...s, ocrHints: e.target.value }))} placeholder="OCR hints (optional): tsb, bilirubin" />
            </div>
            <input data-testid="slot-draft-question-input" style={inputS} value={slotDraft.question} onChange={e => setSlotDraft(s => ({ ...s, question: e.target.value }))} placeholder="Question to ask (optional), e.g. Sex?" />
            <input data-testid="slot-draft-options-input" style={inputS} value={slotDraft.options} onChange={e => setSlotDraft(s => ({ ...s, options: e.target.value }))} placeholder="Answer options (optional, comma-sep) — e.g. male, female. Leave blank for free text." />
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
              <input type="checkbox" data-testid="slot-draft-mandatory-checkbox" checked={slotDraft.mandatory} onChange={e => setSlotDraft(s => ({ ...s, mandatory: e.target.checked }))} /> Mandatory (always ask)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn testId="slot-draft-confirm-btn" small onClick={confirmSlot} disabled={!slotDraft.label.trim()}>Add blank</Btn>
              <Btn testId="slot-draft-cancel-btn" small variant="ghost" onClick={() => { setSlotDraft(null); setSel(null); }}>Cancel</Btn>
            </div>
          </div>
        )}

        {form.slots.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", margin: "0 0 8px" }}>BLANKS ({form.slots.length})</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {form.slots.map(s => (
                <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 16, background: s.mandatory ? PURPLE.bg : "var(--color-background-secondary)", color: s.mandatory ? PURPLE.primary : "var(--color-text-secondary)", border: `1px solid ${s.mandatory ? PURPLE.border : "var(--color-border-primary)"}` }}>
                  {s.mandatory && "★ "}{s.label} <button onClick={() => removeSlot(s.key)} data-testid={`remove-slot-${s.key}`} style={{ background: "none", border: "none", color: RED.primary, cursor: "pointer", padding: 0, fontSize: 12 }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--color-border-primary)" }}>
          <div>
            {form.id && (
              <Btn testId="template-delete-btn" onClick={handleDelete} small style={{ background: RED.bg, color: RED.primary, borderColor: RED.border }}>
                🗑️ Delete Template
              </Btn>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {!form.name.trim() && form.sampleBody.trim() && <span style={{ fontSize: 12, color: AMBER.text }}>← enter a name to save</span>}
            <Btn testId="template-editor-cancel-btn" variant="ghost" onClick={onClose} small>Cancel</Btn>
            {/* Enabled as soon as there's body text — questions are optional; save() validates the name. */}
            <Btn testId="template-editor-save-btn" onClick={save} disabled={!form.sampleBody.trim()}>Save Template</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

