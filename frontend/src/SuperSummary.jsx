import { useState, useRef, useEffect } from "react";
import { SYSTEM_TEMPLATES, emptyTemplate, parseTemplateParts, fillTemplate, SECTION_SEQUENCE } from "./templates.js";
import { extractDocumentText } from "./ocr.js";
import { callAIStream, parseJSON, getGenericInstructions, getDetailedInstructions } from "./api.js";
import { CardCarousel, IllustDocs, IllustScan, IllustSafety } from "./HomeHero.jsx";
import { saveSummaryRecord } from "./records.js";
import { RatingPrompt } from "./RatingPrompt.jsx";
import { publishTemplate as apiPublishTemplate, listCommunityTemplates, rateTemplate } from "./community.js";
import { CommunityBrowserModal } from "./CommunityBrowserModal.jsx";

const TEAL   = { primary: "#0F6E56", bg: "#E1F5EE", border: "#9FE1CB", text: "#085041" };
const AMBER  = { primary: "#EF9F27", bg: "#FAEEDA", border: "#FAC775", text: "#633806" };
const RED    = { primary: "#E24B4A", bg: "#FCEBEB", border: "#F7C1C1", text: "#791F1F" };
const PURPLE = { primary: "#6E40C9", bg: "#F3EEFF", border: "#D8C7FF", text: "#3E2570" };

function Btn({ children, onClick, variant = "primary", disabled, small, style: s = {}, testId }) {
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, fontFamily: "var(--font-sans)", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, opacity: disabled ? 0.5 : 1, padding: small ? "6px 14px" : "10px 20px", fontSize: small ? 13 : 14, border: "none" };
  const variants = {
    primary:   { background: PURPLE.primary, color: "#fff" },
    secondary: { background: "transparent", color: PURPLE.primary, border: `1.5px solid ${PURPLE.border}` },
    ghost:     { background: "transparent", color: "var(--color-text-secondary)", border: `1.5px solid var(--color-border-primary)` },
  };
  return <button data-testid={testId} style={{ ...base, ...variants[variant], ...s }} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Card({ children, style: s = {}, testId }) {
  return <div data-testid={testId} style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 12, padding: 16, boxShadow: "var(--shadow-sm)", ...s }}>{children}</div>;
}
const inputS = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box" };

async function fileToDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
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

async function extractDateFromText(text, provider, apiKey) {
  if (!apiKey || !text || !text.trim()) return "";
  const prompt = `Review this parsed medical report text and extract the single most likely report date or collection date.
TEXT:
${text.slice(0, 1500)}

Return ONLY a valid date string in YYYY-MM-DD or DD-MM-YYYY format. If no date is visible, return exactly "unknown". No explanation.`;
  try {
    let raw = "";
    await callAIStream([{ role: "user", content: prompt }], "You are a clinical database compiler. Output only the date or 'unknown'.", provider, apiKey, t => { raw = t; });
    const cleaned = raw.replace(/```/g, "").trim();
    return cleaned.toLowerCase() === "unknown" ? "" : cleaned;
  } catch {
    return "";
  }
}

// ─── Document intake + OCR (multi-image) ───────────────────────────────────────
export function DocumentIntake({ docs, setDocs, provider, apiKey, isInvestigation }) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();
  const processFile = async (file) => {
    const dataURL = await fileToDataURL(file);
    const id = "doc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    setDocs(prev => [...prev, { id, name: file.name, dataURL, status: "processing", ocrText: "", engine: null }]);
    try {
      const r = await extractDocumentText({ image: dataURL, provider, apiKey });
      setDocs(prev => prev.map(d => d.id === id ? { ...d, status: r.failed ? "failed" : "done", ocrText: r.text, engine: r.engine, confidence: r.confidence } : d));
    } catch { setDocs(prev => prev.map(d => d.id === id ? { ...d, status: "failed", ocrText: "" } : d)); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div onDrop={e => { e.preventDefault(); setDragging(false); Array.from(e.dataTransfer.files).forEach(processFile); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onClick={() => fileRef.current?.click()}
        data-testid={isInvestigation ? "investigation-upload-dropzone" : "clinical-doc-upload-dropzone"}
        style={{ border: `2px dashed ${dragging ? PURPLE.primary : "var(--color-border-secondary)"}`, borderRadius: 10, padding: "18px 16px", textAlign: "center", cursor: "pointer", background: dragging ? PURPLE.bg : "var(--color-background-secondary)" }}>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{ display: "none" }}
          data-testid={isInvestigation ? "investigation-file-input" : "clinical-doc-file-input"}
          onChange={e => { Array.from(e.target.files).forEach(processFile); e.target.value = ""; }} />
        <p style={{ fontSize: 22, margin: "0 0 4px" }}>🧾</p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          {isInvestigation ? "Drop lab reports / PDFs / clinical test results · click to browse" : "Drop clinical notes / prescriptions / history sheets · click to browse"}
        </p>
      </div>
      {docs.map(d => (
        <div key={d.id} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <img src={d.dataURL} alt="" style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#ddd" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</p>
            {d.status === "processing" && <p style={{ fontSize: 11, color: PURPLE.primary, margin: 0 }}>⏳ Reading…</p>}
            {d.status === "done" && <p style={{ fontSize: 11, color: TEAL.primary, margin: 0 }}>✓ Read via {d.engine === "tesseract" ? `Tesseract ${d.confidence}%` : "AI vision"}</p>}
            {d.status === "failed" && <p style={{ fontSize: 11, color: RED.primary, margin: 0 }}>⚠ Could not read — enter manually</p>}
          </div>
          <button onClick={() => setDocs(prev => prev.filter(x => x.id !== d.id))} data-testid={`remove-doc-${d.id}`} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ─── AI safety review ───────────────────────────────────────────────────────────

async function runSafetyCheck(summaryText, diagnosis, provider, apiKey) {
  const prompt = `You are a senior consultant doing a final safety review of this discharge summary before it is signed. Diagnosis: ${diagnosis || "(as stated)"}.

SUMMARY:
${summaryText.slice(0, 5000)}

Flag genuine issues only: wrong/under-dosed treatment for this diagnosis (e.g. prednisolone too low for nephrotic relapse), abnormal investigation values not addressed, missing standard screenings/advice for this patient type (e.g. preterm → ROP + hearing screening + immunization), gross omissions or contradictions.

Return ONLY valid JSON: {"flags":[{"severity":"high|advisory","issue":"...","suggestion":"..."}]}. If nothing wrong, {"flags":[]}. No markdown.`;
  let raw = "";
  await callAIStream([{ role: "user", content: prompt }], "You are a meticulous senior consultant doing a discharge-summary safety review. Only flag genuine issues.", provider, apiKey, t => { raw = t; });
  return (parseJSON(raw) || {}).flags || [];
}
function SafetyCheckPanel({ getText, diagnosis, provider, apiKey }) {
  const [flags, setFlags] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  if (!apiKey) return null;
  const run = async () => {
    setChecking(true); setError(""); setFlags(null);
    try { setFlags(await runSafetyCheck(getText(), diagnosis, provider, apiKey)); }
    catch (e) { setError(e.message); } finally { setChecking(false); }
  };
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>🔍 AI Safety Check</h3>
        <Btn testId="safety-check-run-btn" small variant="secondary" onClick={run} disabled={checking}>{checking ? "Reviewing…" : flags ? "Re-check" : "Review for red flags"}</Btn>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>Flags dosing errors, unaddressed abnormal labs, and missing screenings/advice. Advisory only.</p>
      {error && <p style={{ fontSize: 13, color: RED.primary, margin: "10px 0 0" }}>{error}</p>}
      {flags && flags.length === 0 && <p style={{ fontSize: 13, color: TEAL.primary, fontWeight: 600, margin: "12px 0 0" }}>✓ No red flags found.</p>}
      {flags && flags.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {flags.map((f, i) => {
            const high = f.severity === "high";
            return (
              <div key={i} style={{ background: high ? RED.bg : AMBER.bg, border: `1px solid ${high ? RED.border : AMBER.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: high ? RED.text : AMBER.text, margin: "0 0 3px" }}>{high ? "🚩" : "⚠"} {f.issue}</p>
                {f.suggestion && <p style={{ fontSize: 12, color: high ? RED.text : AMBER.text, margin: 0 }}>→ {f.suggestion}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Save As Template Modal ─────────────────────────────────────────────────────
function SaveAsTemplateModal({ defaultName = "", existingTemplates = [], onConfirm, onClose }) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const allTemplates = [
    ...(existingTemplates || []),
    ...((() => { try { return JSON.parse(localStorage.getItem("clinicalmind:templates") || "[]"); } catch { return []; } })())
  ];

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Please enter a template name."); return; }
    const duplicate = allTemplates.some(t => t.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (duplicate) { setError(`"${trimmed}" already exists. Please choose a different name.`); return; }
    setSaved(true);
    setTimeout(() => { onConfirm(trimmed); }, 1200);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", animation: "fadeSlideIn 0.2s ease" }}>
        {saved ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "10px 0 4px" }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, animation: "popIn 0.35s cubic-bezier(.36,.07,.19,.97)" }}>✅</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0F6E56", margin: 0 }}>Template saved!</p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, textAlign: "center" }}>"<strong>{name.trim()}</strong>" has been added to your templates.</p>
          </div>
        ) : (
          <>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>💾 Save as New Template</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 18px" }}>Give this template a unique name so you can find it later.</p>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Template Name</label>
            <input
              ref={inputRef}
              data-testid="save-template-name-input"
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
              placeholder="e.g. Neonatal Jaundice — NICU"
              style={{ ...inputS, fontSize: 14, marginBottom: 8 }}
            />
            {error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FCEBEB", border: "1.5px solid #F7C1C1", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
                <p style={{ fontSize: 13, color: "#791F1F", margin: 0 }}>{error}</p>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn testId="save-template-cancel-btn" variant="ghost" small onClick={onClose}>Cancel</Btn>
              <Btn testId="save-template-confirm-btn" small onClick={handleSave} disabled={!name.trim()}>Save Template</Btn>
            </div>
          </>
        )}
      </div>
      <style>{`
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn { 0%,100%{transform:scale(1)} 30%{transform:scale(1.25)} 60%{transform:scale(0.92)} }
      `}</style>
    </div>
  );
}

// ─── Template Editor — annotated sample: paste a real summary, highlight → slots ──
function TemplateEditor({ template, onSave, onDelete, onClose, provider, apiKey }) {
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

// ─── How-to-use explainer carousel — image + caption rotate together ──────────
const HOWTO_STEPS = [
  { Illust: IllustDocs, title: "1. Paste a real summary", body: "Start from a discharge summary you've actually written — that becomes your template." },
  { Illust: IllustScan, title: "2. Mark blanks, or just scan", body: "Highlight the words that change per patient, or snap report photos and let AI find them." },
  { Illust: IllustSafety, title: "3. Generate & review", body: "The draft fills in seconds. AI Safety Check flags anything that needs a second look." },
];
function HowToUseCarousel() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(v => (v + 1) % HOWTO_STEPS.length), 3400); return () => clearInterval(t); }, []);
  const { Illust, title, body } = HOWTO_STEPS[i];
  return (
    <div style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 14, overflow: "hidden", display: "flex", flexWrap: "wrap" }}>
      <div style={{ width: 180, flexShrink: 0, background: PURPLE.bg }}>
        <div style={{ height: 130 }}><Illust /></div>
      </div>
      <div style={{ flex: 1, minWidth: 200, padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: PURPLE.primary, letterSpacing: 0.5, margin: "0 0 4px" }}>HOW TEMPLATES WORK</p>
        <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>{title}</p>
        <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {HOWTO_STEPS.map((_, n) => (
            <span key={n} data-testid={`howto-step-dot-${n}`} onClick={() => setI(n)} style={{ width: n === i ? 18 : 6, height: 6, borderRadius: 4, background: n === i ? PURPLE.primary : "var(--color-border-primary)", cursor: "pointer", transition: "all 0.3s" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Template Library ───────────────────────────────────────────────────────────
function TemplateLibrary({ customTemplates, onEdit, onDelete, onSelect, onPublish, onBrowseCommunity }) {
  const [tab, setTab] = useState("System Template");
  const source = tab === "System Template" ? SYSTEM_TEMPLATES : customTemplates.filter(t => t.source === "private");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <HowToUseCarousel />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Template Library</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button data-testid="browse-community-templates-btn" onClick={onBrowseCommunity}
            style={{ fontSize: 12.5, fontWeight: 700, color: PURPLE.primary, background: PURPLE.bg, border: `1px solid ${PURPLE.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
            🌐 Community
          </button>
          <Btn testId="new-template-btn" small onClick={() => onEdit(null)}>+ New Template</Btn>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["System Template", "My Templates"].map(t => (
          <button key={t} data-testid={`template-tab-${t.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => setTab(t)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
            borderColor: tab === t ? PURPLE.primary : "var(--color-border-primary)",
            background: tab === t ? PURPLE.bg : "#fff",
            color: tab === t ? PURPLE.primary : "var(--color-text-secondary)" }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10, maxHeight: 400, overflowY: "auto" }}>
        {source.map(t => (
          <div key={t.id} data-testid={`template-card-${t.id}`} onClick={() => onSelect(t)} style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 10, padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>{t.name}</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {tab === "My Templates" && (
                  <button onClick={e => { e.stopPropagation(); onPublish(t); }} title="Publish to Community"
                    data-testid={`template-publish-${t.id}`}
                    style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>🌐</button>
                )}
                <button onClick={e => { e.stopPropagation(); onEdit(t); }} title={t.source === "system" ? "Edit a copy in My Templates" : "Edit"}
                  data-testid={`template-edit-${t.id}`}
                  style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>✏️</button>
                {t.source !== "system" && (
                  <button onClick={e => {
                    e.stopPropagation();
                    if (window.confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
                      onDelete(t.id);
                    }
                  }} title="Delete" data-testid={`template-delete-${t.id}`} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>🗑️</button>
                )}
              </div>
            </div>
            <span style={{ fontSize: 11, color: PURPLE.text, background: PURPLE.bg, padding: "2px 6px", borderRadius: 4 }}>{t.category}</span>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "8px 0 0" }}>{(t.slots || []).length} blanks to fill</p>
          </div>
        ))}
        {!source.length && <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>No templates here yet.</p>}
      </div>
    </div>
  );
}

// ─── AI Mode Card — standalone top-level card (image + freeform diagnosis-to-draft) ─────
function AiModeCard({ hasKey, onStartAiMode, setSettingsOpen }) {
  const [aiComplaint, setAiComplaint] = useState("");
  return (
    <Card testId="ai-mode-card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", border: "1px solid rgba(168,85,247,0.25)" }} className="premium-card">
      <div style={{ background: "linear-gradient(135deg,#1e1b3a 0%,#3b1d6e 45%,#7c3aed 85%,#a855f7 100%)", borderBottom: "1px solid rgba(124,58,237,0.15)" }}>
        <CardCarousel accent="#a855f7" slides={[IllustScan, IllustSafety]} />
      </div>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>✨</span>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#7c3aed", margin: 0 }}>AI Mode</h3>
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 16px 0" }}>
          No template? Type the diagnosis — AI drafts a typical summary instantly; refine with photos or notes.
        </p>
        <input data-testid="ai-mode-complaint-input" value={aiComplaint} onChange={e => setAiComplaint(e.target.value)} placeholder="e.g. Nephrotic syndrome relapse"
          style={{ padding: "9px 12px", border: "1.5px solid #D8C7FF", borderRadius: 8, fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
        {!hasKey && (
          <p style={{ fontSize: 12, color: PURPLE.text, margin: "0 0 12px" }}>
            ⚠ AI isn't configured yet.{" "}
            <button onClick={() => setSettingsOpen(true)} data-testid="ai-mode-add-apikey-btn" style={{ background: "none", border: "none", color: PURPLE.primary, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12, padding: 0 }}>Settings →</button>
          </p>
        )}
        <button data-testid="launch-ai-mode-btn" disabled={!aiComplaint.trim() || !hasKey} onClick={() => onStartAiMode(aiComplaint.trim())}
          style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: hasKey ? "#7c3aed" : "#c4b5fd", color: "#fff", border: "none", cursor: hasKey ? "pointer" : "not-allowed", boxShadow: hasKey ? "0 4px 10px rgba(124, 58, 237, 0.2)" : "none" }}>
          {!hasKey ? "⚠ AI Not Available" : "Launch AI Mode →"}
        </button>
      </div>
    </Card>
  );
}


// ─── Fill Screen — the living document with editable blanks + multi-image autofill ─
function FillScreen({ template: rawTemplate, provider, apiKey, onCancel, onSaveAsTemplate, existingTemplates = [], aiAssistantEnabled = true }) {
  // Normalize so old-model / incomplete templates never crash.
  const template = { ...emptyTemplate(), ...rawTemplate };
  const [values, setValues] = useState({});
  const [unverified, setUnverified] = useState(new Set());
  const [docs, setDocs] = useState([]);
  const [showUpload, setShowUpload] = useState(true);
  const [autofilling, setAutofilling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [customInfo, setCustomInfo] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [savedSummaryId, setSavedSummaryId] = useState(null);
  const recRef = useRef(null);
  const consumed = useRef(new Set());

  // Interactive AI Assistant states
  const [missingDetails, setMissingDetails] = useState([]);
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [assistantAnswers, setAssistantAnswers] = useState({});
  const [timelineTable, setTimelineTable] = useState("");
  const [generatingTimeline, setGeneratingTimeline] = useState(false);
  const [showFillIn, setShowFillIn] = useState(false); // collapsed by default

  const parts = parseTemplateParts(template.sampleBody);
  const slotOf = (key) => template.slots.find(s => s.key === key);
  const finalText = () => editing ? editText : fillTemplate(template.sampleBody, values, template.slots);

  // ONE extraction pass over everything available: OCR'd documents + the doctor's typed/spoken notes.
  const runAutofill = async (notesText) => {
    if (!apiKey) return;
    setAutofilling(true);
    const docText = docs.filter(d => d.status === "done").map(d => d.ocrText).join("\n\n").slice(0, 4500);
    const allText = [docText, notesText ? `DOCTOR'S NOTES:\n${notesText}` : ""].filter(Boolean).join("\n\n");
    if (!allText.trim()) { setAutofilling(false); return; }
    try {
      const prompt = `Extract values for these blanks from the medical documents and doctor's notes below. Return ONLY valid JSON {key: value} — omit any key not clearly found. Keep exact numbers.
BLANKS:
${template.slots.map(s => `- ${s.key}: ${s.label}${s.ocrHints?.length ? ` (${s.ocrHints.join(", ")})` : ""}`).join("\n")}
TEXT:
${allText.slice(0, 5500)}`;
      let raw = "";
      await callAIStream([{ role: "user", content: prompt }], "Extract structured data. Output only valid JSON.", provider, apiKey, t => { raw = t; });
      const parsed = parseJSON(raw);
      if (parsed) {
        setValues(prev => {
          const next = { ...prev }; const u = new Set(unverified);
          Object.entries(parsed).forEach(([k, v]) => { if (v && slotOf(k)) { next[k] = String(v); u.add(k); } });
          setUnverified(u); return next;
        });
      }
    } catch { /* ignore */ }
    setAutofilling(false);
  };

  // Queries Claude to detect missing key parameters for the diagnosis and generate dynamic checklists
  const analyzeMissingDetails = async () => {
    if (!apiKey) return;
    setCheckingMissing(true);
    const docText = docs.filter(d => d.status === "done").map(d => d.ocrText).join("\n\n");
    const currentDetails = [
      `Diagnosis: ${template.diagnosis}`,
      `Current Filled Blanks: ${JSON.stringify(values)}`,
      docText ? `Uploaded Documents OCR:\n${docText}` : "",
      customInfo.trim() ? `Doctor's Notes:\n${customInfo}` : ""
    ].filter(Boolean).join("\n\n");

    const prompt = `You are a clinical assistant. Analyze the diagnosis and the patient details below, and determine:
1. What key clinical findings, lab results, and history details should a high-quality discharge summary for this diagnosis ("${template.diagnosis}") ideally contain?
2. Which of these key details are currently MISSING or UNKNOWN from the provided details?
3. For each missing detail, provide a short key, a clear label, and a list of typical multiple-choice options (2 to 4 options maximum) OR an empty list if it's a numeric/free-text value.

Return ONLY a valid JSON object of this structure:
{"missing": [{"key": "string", "label": "string", "options": ["opt1", "opt2", ...]}]}
Only suggest 3-5 of the most critical missing parameters. Do not suggest parameters that are already clearly stated or filled in the patient details. No markdown.`;

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a clinical assistant identifying missing information. Output only valid JSON.",
        provider,
        apiKey,
        t => { raw = t; }
      );
      const parsed = parseJSON(raw);
      if (parsed && Array.isArray(parsed.missing)) {
        setMissingDetails(parsed.missing);
      }
    } catch (err) {
      console.error("Failed to analyze missing details", err);
    } finally {
      setCheckingMissing(false);
    }
  };

  // Extracts vital parameters and reports chronologically into a proper table (test × date)
  const generateTimelineTable = async () => {
    if (!apiKey) return;
    setGeneratingTimeline(true);
    const docText = docs.filter(d => d.status === "done").map(d => d.ocrText).join("\n\n");
    const allText = [
      docText ? `UPLOADED REPORTS/DOCUMENTS:\n${docText}` : "",
      customInfo.trim() ? `DOCTOR'S NOTES / EXTRA DETAILS:\n${customInfo}` : ""
    ].filter(Boolean).join("\n\n");

    if (!allText.trim()) {
      setGeneratingTimeline(false);
      return;
    }

    const prompt = `Extract ALL laboratory investigations, vitals, and clinical test results from the text below.
Format as a Markdown table where:
- ROWS = individual test parameter names (e.g. ALB, SGPT, SGOT, Bilirubin, HBsAg, Anti HAV IgM, etc.)
- COLUMNS = absolute calendar dates in DD-MM-YYYY format, sorted chronologically (oldest left → newest right)
- Cells = result values (leave blank if not tested on that date)
- Include units in the test name column (e.g. SGPT (U/L))
- Do NOT use relative labels like "Day 1" — use actual dates only
- If a test has no date, use a column labelled "Unknown"

Example format:
| Test Name | 29-06-2026 | 30-06-2026 | 03-07-2026 |
| :--- | :--- | :--- | :--- |
| SGPT (U/L) | | 2598.0 | 204.9 |
| Anti HAV IgM | Positive | | |

TEXT:
${allText.slice(0, 5500)}

Output ONLY the Markdown table. No code fences, no introduction, no notes.`;

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a meticulous clinical data analyst. Output only the markdown table.",
        provider,
        apiKey,
        t => { raw = t; }
      );
      if (raw.trim()) {
        setTimelineTable(raw.trim());
      }
    } catch (err) {
      alert("Failed to generate timeline table: " + err.message);
    } finally {
      setGeneratingTimeline(false);
    }
  };

  // Intelligently refine the discharge summary by merging OCR'd reports, timeline, notes, and checklist answers
  const runAiRefine = async () => {
    if (!apiKey) return;
    setAutofilling(true);
    setEditing(true);
    setEditText("✨ AI is analyzing reports, timeline, and checklist answers to refine the summary...");

    const docText = docs.filter(d => d.status === "done").map(d => d.ocrText).join("\n\n").slice(0, 4500);
    
    // Format assistant checklist answers
    const filledAnswersText = Object.entries(assistantAnswers)
      .filter(([_, v]) => v && v.trim())
      .map(([k, v]) => {
        const detail = missingDetails.find(d => d.key === k);
        return `- ${detail ? detail.label : k}: ${v}`;
      })
      .join("\n");

    const extraText = [
      docText ? `UPLOADED REPORTS/DOCUMENTS:\n${docText}` : "",
      timelineTable.trim() ? `CHRONOLOGICAL INVESTIGATIONS TIMELINE:\n${timelineTable}` : "",
      customInfo.trim() ? `DOCTOR'S NOTES / EXTRA DETAILS:\n${customInfo}` : "",
      filledAnswersText ? `ADDITIONAL CLINICAL PARAMETERS (CHECKLIST):\n${filledAnswersText}` : ""
    ].filter(Boolean).join("\n\n");

    const currentSummary = finalText();

    const prompt = `You are a senior medical consultant. You need to refine a patient's discharge summary by intelligently merging additional clinical details (from uploaded reports, chronological timelines, doctor's notes, and answered clinical checklist questions) into the existing template text.

EXISTING DISCHARGE SUMMARY:
${currentSummary}

ADDITIONAL CLINICAL DETAILS TO MERGE:
${extraText}

INSTRUCTIONS:
1. Analyze the additional details (e.g., lab report findings, positive/negative tests like DCT positive, PBF for hemolysis positive, vomiting history, dates/times).
2. Intelligently merge these details into the appropriate sections of the existing discharge summary (e.g., Clinical History, Investigations, Treatment Given, Course in Hospital, or Treatment Advice). Do not just append them; weave them naturally, chronologically, and professionally into the narrative. CRITICAL: Ensure that all specific treatments given (e.g., antiemetics, intravenous fluids, specific medications, oxygen, or surgeries) are fully documented in the TREATMENT GIVEN or COURSE OF TREATMENT IN HOSPITAL sections. Do not summarize them away or omit them.
3. If new symptoms or complications are mentioned (e.g., vomiting from 2 days), add them to the CHIEF COMPLAINT or HISTORY OF PRESENT ILLNESS.
4. If new investigations WITH RESULTS are mentioned (e.g., DCT positive, PBF positive, Hb 8.1), add them to the INVESTIGATIONS, TREATMENT GIVEN, or COURSE OF TREATMENT IN HOSPITAL. CRITICAL: the INVESTIGATIONS section must ONLY contain tests that were actually performed and have a result/value — NEVER include tests that are merely "Advised", ordered, planned, or pending. Remove any such advised/pending entries if present.
5. Maintain the professional medical tone, formatting, and layout of the original summary. Do not fabricate details.
6. Output ONLY the complete, refined discharge summary text. Do not include any introduction, formatting like markdown code blocks, or comments. Just output the final plain text summary.`;

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a senior medical consultant refining a discharge summary. Output only the final plain text summary.",
        provider,
        apiKey,
        t => {
          raw = t;
          setEditText(t);
        }
      );
    } catch (err) {
      alert("AI Refinement failed: " + err.message);
      setEditText(currentSummary);
    } finally {
      setAutofilling(false);
    }
  };

  // Trigger missing details analysis when documents are processed or template changes
  useEffect(() => {
    if (!apiKey) return;
    const timer = setTimeout(() => {
      analyzeMissingDetails();
    }, 1000);
    return () => clearTimeout(timer);
  }, [docs.map(d => `${d.id}:${d.status}`).join(","), template.id, apiKey]);

  // New OCR'd docs trigger an automatic pass (notes included if present).
  useEffect(() => {
    const fresh = docs.filter(d => d.status === "done" && d.ocrText && !consumed.current.has(d.id));
    if (!fresh.length || !apiKey) return;
    fresh.forEach(d => consumed.current.add(d.id));
    runAutofill(customInfo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.map(d => `${d.id}:${d.status}`).join(",")]);

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge."); return; }
    const rec = new SR(); rec.lang = "en-IN"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => setCustomInfo(Array.from(e.results).map(r => r[0].transcript).join(" "));
    rec.onend = () => setVoiceOn(false);
    rec.start(); recRef.current = rec; setVoiceOn(true);
  };

  const setVal = (key, v) => { setValues(prev => ({ ...prev, [key]: v })); setUnverified(prev => { const s = new Set(prev); s.delete(key); return s; }); };
  const setAssistantAnswer = (key, val) => { setAssistantAnswers(prev => ({ ...prev, [key]: val })); };

  const emptyMandatory = template.slots.filter(s => s.mandatory && !values[s.key]);

  const saveAsTemplate = () => { setSaveModalOpen(true); };

  const handleConfirmSaveAs = (chosenName) => {
    setSaveModalOpen(false);
    onSaveAsTemplate({ ...template, id: "", name: chosenName, source: "private", sampleBody: finalText(), slots: [] });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 2px" }}>{template.name}</h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>The summary is already written — just fill the highlighted blanks (or upload photos to auto-fill)</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn testId="fillscreen-copy-btn" variant="secondary" small onClick={async () => {
            navigator.clipboard?.writeText(finalText());
            const saved = await saveSummaryRecord({ diagnosis: template.diagnosis || template.name, template_name: template.name, source: "fill", text: finalText() });
            if (saved?.id) setSavedSummaryId(saved.id);
          }}>Copy</Btn>
          <Btn testId="fillscreen-close-btn" variant="ghost" small onClick={onCancel}>Close</Btn>
        </div>
      </div>

      {/* Multi-image + notes + voice autofill */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showUpload ? 12 : 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>📷 Auto-fill {autofilling && <span style={{ fontSize: 12, color: PURPLE.primary, fontWeight: 400 }}>· reading…</span>}</h3>
          <button onClick={() => setShowUpload(v => !v)} style={{ fontSize: 12, fontWeight: 600, color: PURPLE.primary, background: "none", border: "none", cursor: "pointer" }}>{showUpload ? "Hide" : "Show"}</button>
        </div>
        {showUpload && (
          <>
            {!apiKey && <p style={{ fontSize: 12, color: AMBER.text, margin: "0 0 8px" }}>⚠ Auto-fill needs an API key. You can still fill blanks manually below.</p>}
            <DocumentIntake docs={docs} setDocs={setDocs} provider={provider} apiKey={apiKey} />
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", margin: "12px 0 6px" }}>
              …or tell it the details <span style={{ fontWeight: 400 }}>(type or 🎙 speak — e.g. "baby of Sunita, born 30 Dec at 1:16 am by LSCS, weight 3.1 kg")</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <textarea value={customInfo} onChange={e => setCustomInfo(e.target.value)}
                data-testid="fillscreen-custom-info-textarea"
                placeholder={voiceOn ? "Listening…" : "Patient details in your own words…"}
                style={{ ...inputS, minHeight: 52, resize: "vertical", flex: 1, fontSize: 13 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={voiceOn ? () => { recRef.current?.stop(); setVoiceOn(false); } : startVoice}
                  data-testid="fillscreen-voice-toggle-btn"
                  style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
                    border: `1.5px solid ${voiceOn ? RED.primary : "var(--color-border-primary)"}`, background: voiceOn ? RED.bg : "#fff", color: voiceOn ? RED.primary : "var(--color-text-secondary)" }}>
                  🎙 {voiceOn ? "Stop" : "Speak"}
                </button>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Btn testId="fillscreen-fill-blanks-btn" variant="secondary" small onClick={() => runAutofill(customInfo)} disabled={!apiKey || autofilling || (!customInfo.trim() && !docs.some(d => d.status === "done"))} style={{ flex: "1 1 auto", whiteSpace: "nowrap" }}>
                    ✨ Fill Blanks
                  </Btn>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Chronological Timeline card */}
      {apiKey && docs.some(d => d.status === "done") && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>📈 Chronological Investigations Timeline</h3>
            <Btn testId="extract-timeline-btn" variant="secondary" small onClick={generateTimelineTable} disabled={generatingTimeline}>
              {generatingTimeline ? "⌛ Sorting..." : "✨ Extract Chronological Table"}
            </Btn>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
            Extracts all test parameters as rows and dates as columns for a clean aligned view.
          </p>
          {timelineTable && (() => {
            // Parse markdown table into rows
            const lines = timelineTable.split("\n").filter(l => l.trim().startsWith("|"));
            const dataLines = lines.filter(l => !/^\|[\s:|-]+\|/.test(l)); // exclude separator rows
            const rows = dataLines.map(l =>
              l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim())
            );
            if (rows.length < 2) return (
              <textarea value={timelineTable} onChange={e => setTimelineTable(e.target.value)}
                data-testid="timeline-table-textarea"
                style={{ ...inputS, minHeight: 120, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6 }} />
            );
            const headers = rows[0];
            const bodyRows = rows.slice(1);
            return (
              <div style={{ overflowX: "auto", borderRadius: 8, border: "1.5px solid var(--color-border-primary)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                  <thead>
                    <tr style={{ background: "var(--color-background-secondary)" }}>
                      {headers.map((h, i) => (
                        <th key={i} style={{
                          padding: "8px 12px", textAlign: i === 0 ? "left" : "center",
                          fontWeight: 700, borderBottom: "2px solid var(--color-border-secondary)",
                          whiteSpace: "nowrap", color: "var(--color-text-primary)"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bodyRows.map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "var(--color-background-secondary)" }}>
                        {headers.map((_, ci) => {
                          const cell = row[ci] ?? "";
                          const isPositive = /positive/i.test(cell);
                          const isNegative = /negative/i.test(cell);
                          return (
                            <td key={ci} style={{
                              padding: "7px 12px",
                              textAlign: ci === 0 ? "left" : "center",
                              borderBottom: "1px solid var(--color-border-primary)",
                              whiteSpace: "nowrap",
                              fontWeight: ci === 0 ? 600 : 400,
                              color: isPositive ? "#b91c1c" : isNegative ? "#15803d" : "var(--color-text-primary)",
                            }}>{cell || <span style={{ color: "#ccc" }}>—</span>}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
          {timelineTable && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 11, color: "var(--color-text-secondary)", cursor: "pointer" }}>✏️ Edit raw table</summary>
              <textarea value={timelineTable} onChange={e => setTimelineTable(e.target.value)}
                data-testid="timeline-table-raw-textarea"
                style={{ ...inputS, minHeight: 100, fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5, marginTop: 6 }} />
            </details>
          )}
        </Card>
      )}

      {/* AI Assistant Checklist card */}
      {apiKey && aiAssistantEnabled && (
        <Card style={{ borderLeft: `4px solid ${PURPLE.primary}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
              💡 AI Assistant: Missing Clinical Details Checklist
              {checkingMissing && <span style={{ fontSize: 12, color: PURPLE.primary, fontWeight: 400, marginLeft: 8 }}>· analyzing...</span>}
            </h3>
            <button onClick={analyzeMissingDetails} disabled={checkingMissing} 
              data-testid="reanalyze-missing-details-btn"
              style={{ fontSize: 12, fontWeight: 600, color: PURPLE.primary, background: "none", border: "none", cursor: "pointer" }}>
              ↻ Re-analyze
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
            The AI scans for key parameters standard for {template.diagnosis}. Click option chips or write custom details below. Everything is optional.
          </p>
          
          {missingDetails.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {missingDetails.map(item => {
                const currentVal = assistantAnswers[item.key] ?? "";
                return (
                  <div key={item.key} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>{item.label}</p>
                    
                    {item.options && item.options.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        {item.options.map(opt => (
                          <button key={opt} onClick={() => setAssistantAnswer(item.key, opt)}
                            data-testid={`missing-detail-option-${item.key}-${opt}`}
                            style={{ 
                              padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                              borderColor: currentVal === opt ? PURPLE.primary : "var(--color-border-primary)", 
                              background: currentVal === opt ? PURPLE.bg : "#fff", 
                              color: currentVal === opt ? PURPLE.primary : "var(--color-text-secondary)" 
                            }}>
                            {opt}
                          </button>
                        ))}
                        <input value={item.options.includes(currentVal) ? "" : currentVal} 
                          onChange={e => setAssistantAnswer(item.key, e.target.value)}
                          data-testid={`missing-detail-custom-${item.key}`}
                          placeholder="or custom..." style={{ ...inputS, fontSize: 12, width: 120, padding: "4px 8px" }} />
                      </div>
                    ) : (
                      <input value={currentVal} onChange={e => setAssistantAnswer(item.key, e.target.value)} 
                        placeholder={`Enter ${item.label.toLowerCase()}...`}
                        data-testid={`missing-detail-freetext-${item.key}`}
                        style={{ ...inputS, fontSize: 12, padding: "6px 10px" }} />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            !checkingMissing && <p style={{ fontSize: 12, color: TEAL.primary, fontWeight: 600, margin: "6px 0" }}>✓ No missing critical details identified. Ready to generate!</p>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <Btn testId="ai-refine-generate-btn" small onClick={runAiRefine} disabled={autofilling} style={{ background: PURPLE.primary }}>
              {autofilling ? "✨ Generating Summary…" : "✨ Generate Summary with AI"}
            </Btn>
          </div>
        </Card>
      )}

      {emptyMandatory.length > 0 && (
        <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 12, color: AMBER.text }}>
          ★ Still to fill: {emptyMandatory.map(s => s.label).join(", ")}
        </div>
      )}

      {!template.sampleBody.trim() && (
        <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: AMBER.text }}>
          This template has no summary text yet. Close this, click the ✏️ pencil on its card, and paste a discharge summary to set it up.
        </div>
      )}

      {/* Fill-in panel — collapsible, collapsed by default */}
      {template.slots.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <button
            onClick={() => setShowFillIn(v => !v)}
            data-testid="toggle-fillin-panel-btn"
            style={{
              width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "13px 16px", background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font-sans)", borderBottom: showFillIn ? "1.5px solid var(--color-border-primary)" : "none"
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700 }}>✍️ Fill in</span>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              {showFillIn ? "▲ Collapse" : "▼ Expand"}
            </span>
          </button>
          {showFillIn && (
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              {template.slots.map(s => {
                const val = values[s.key] ?? "";
                const un = unverified.has(s.key);
                return (
                  <div key={s.key}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>
                      {s.mandatory && <span style={{ color: PURPLE.primary }}>★ </span>}{s.question || s.label}
                      {un && <span style={{ fontSize: 11, color: AMBER.text, fontWeight: 400 }}> · from photo, verify</span>}
                    </p>
                    {(s.options || []).length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                        {s.options.map(opt => (
                          <button key={opt} onClick={() => setVal(s.key, opt)}
                            data-testid={`fillin-option-${s.key}-${opt}`}
                            style={{ padding: "6px 14px", borderRadius: 18, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                              borderColor: val === opt ? PURPLE.primary : "var(--color-border-primary)", background: val === opt ? PURPLE.bg : "#fff", color: val === opt ? PURPLE.primary : "var(--color-text-secondary)" }}>
                            {opt}
                          </button>
                        ))}
                        <input value={s.options.includes(val) ? "" : val} onChange={e => setVal(s.key, e.target.value)}
                          data-testid={`fillin-custom-${s.key}`}
                          placeholder="or type…" style={{ ...inputS, fontSize: 13, width: 140, padding: "6px 10px" }} />
                      </div>
                    ) : (
                      <input value={val} onChange={e => setVal(s.key, e.target.value)} placeholder={s.default || s.label}
                        data-testid={`fillin-input-${s.key}`}
                        style={{ ...inputS, fontSize: 13, borderColor: un ? AMBER.border : "var(--color-border-primary)", background: un ? AMBER.bg : "#fff" }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Edit full text + Save — above the summary */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Btn variant="secondary" small onClick={() => { if (!editing) setEditText(finalText()); setEditing(v => !v); }}>
          {editing ? "✅ Done editing" : "✏️ Edit full text"}
        </Btn>
        <Btn variant="secondary" small onClick={saveAsTemplate} disabled={savingTemplate}>💾 Save as new template</Btn>
        {savedToast && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#0F6E56", background: "#E1F5EE", border: "1px solid #9FE1CB", borderRadius: 20, padding: "4px 12px", animation: "fadeSlideIn 0.25s ease" }}>
            ✅ Template saved!
          </span>
        )}
      </div>

      {saveModalOpen && (
        <SaveAsTemplateModal
          defaultName={template.name + " (copy)"}
          existingTemplates={existingTemplates}
          onConfirm={handleConfirmSaveAs}
          onClose={() => setSaveModalOpen(false)}
        />
      )}

      {/* The living document (summary below) */}
      <Card style={{ padding: 20 }}>
        {editing ? (
          <textarea value={editText} onChange={e => setEditText(e.target.value)}
            data-testid="edit-full-text-textarea"
            style={{ width: "100%", minHeight: 440, border: "none", outline: "none", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, resize: "vertical" }} />
        ) : (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 2.1, whiteSpace: "pre-wrap", color: "var(--color-text-primary)" }}>
            {parts.map((p, i) => {
              if (p.type === "text") return <span key={i}>{p.text}</span>;
              const s = slotOf(p.key); if (!s) return null;
              const val = values[p.key] ?? "";
              const un = unverified.has(p.key);
              const width = Math.max((val || s.default || s.label).length, 3) + 2;
              return (
                <input key={i} value={val} onChange={e => setVal(p.key, e.target.value)} placeholder={s.default || s.label}
                  title={s.label}
                  data-testid={`inline-slot-${p.key}`}
                  style={{ width: width + "ch", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, textAlign: "center",
                    padding: "1px 4px", margin: "0 1px", borderRadius: 5, outline: "none",
                    border: `1.5px solid ${un ? AMBER.primary : val ? TEAL.border : PURPLE.border}`,
                    background: un ? AMBER.bg : val ? "#fff" : PURPLE.bg, color: un ? AMBER.text : PURPLE.primary }} />
              );
            })}
          </div>
        )}
      </Card>

      <SafetyCheckPanel getText={finalText} diagnosis={template.diagnosis} provider={provider} apiKey={apiKey} />
      {savedSummaryId && <RatingPrompt recordType="summary" recordId={savedSummaryId} onDismiss={() => setSavedSummaryId(null)} />}
    </div>
  );
}

// ─── SuperFast AI Agent Wizard ──────────────────────────────────────────────────
function SuperFastAiWizard({ template, provider, apiKey, onCancel, onSaveAsTemplate, existingTemplates = [] }) {
  const [step, setStep] = useState(1); // 1: Confirm Profile, 2: Select Type, 3: Clinical Intake, 4: AI Checklist, 5: Narrative Summary
  const [wizardSaveModal, setWizardSaveModal] = useState(false);
  const [wizardSavedToast, setWizardSavedToast] = useState(false);
  const [confirmedDiagnosis, setConfirmedDiagnosis] = useState(template.diagnosis || "");
  const [confirmedAge, setConfirmedAge] = useState(() => {
    const ageSlot = template.slots.find(s => s.key === "age");
    return ageSlot ? ageSlot.default : "3 days";
  });
  const [summaryType, setSummaryType] = useState("detailed"); // template | generic | detailed
  
  // Intake Step States
  const [docs, setDocs] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [notesText, setNotesText] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const recRef = useRef(null);
  const [processingIntake, setProcessingIntake] = useState(false);

  // Structured temporary single-session patient memory
  const [patientMemory, setPatientMemory] = useState(null);

  // AI-parsed editable previews shown below each card in Step 3
  const [clinicalText, setClinicalText] = useState("");
  const [compilingClinical, setCompilingClinical] = useState(false);
  const [investigationsText, setInvestigationsText] = useState("");
  const [compilingInvestigations, setCompilingInvestigations] = useState(false);

  // Dynamic clinical gap checklist states
  const [missingChecklist, setMissingChecklist] = useState([]);
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [answers, setAnswers] = useState({});

  // Summary generation states
  const [summaryText, setSummaryText] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [savedSummaryId, setSavedSummaryId] = useState(null);

  // Auto-compile clinical docs when all uploads finish
  const prevDoneDocs = useRef(0);
  useEffect(() => {
    const doneNow = docs.filter(d => d.status === "done").length;
    const hasProcessing = docs.some(d => d.status === "processing");
    if (doneNow > 0 && !hasProcessing && doneNow !== prevDoneDocs.current && apiKey) {
      prevDoneDocs.current = doneNow;
      compileCardText(docs, "clinical");
    }
  }, [docs]);

  // Auto-compile investigation reports when all uploads finish
  const prevDoneInv = useRef(0);
  useEffect(() => {
    const doneNow = investigations.filter(d => d.status === "done").length;
    const hasProcessing = investigations.some(d => d.status === "processing");
    if (doneNow > 0 && !hasProcessing && doneNow !== prevDoneInv.current && apiKey) {
      prevDoneInv.current = doneNow;
      compileCardText(investigations, "investigations");
    }
  }, [investigations]);

  // AI helper: parse a batch of OCR docs into a structured human-readable text preview
  const compileCardText = async (docList, cardType) => {
    const readyDocs = docList.filter(d => d.status === "done" && d.ocrText);
    if (!readyDocs.length || !apiKey) return;
    if (cardType === "clinical") setCompilingClinical(true);
    else setCompilingInvestigations(true);
    const combined = readyDocs.map((d, i) => `--- Document ${i+1}: ${d.name} ---\n${d.ocrText}`).join("\n\n");
    const isInv = cardType === "investigations";
    const prompt = isInv
      ? `You are a clinical lab data parser. Parse the OCR text of lab/investigation reports for a patient (Diagnosis: ${confirmedDiagnosis}, Age: ${confirmedAge}).

TASK: Build a PIVOT TABLE where:
- Rows = individual test names (with units in brackets, e.g. "SGPT (U/L)")
- Columns = report dates in DD-MM-YYYY format, sorted in ascending order
- Cells = the result value for that test on that date (leave blank if not found)

STRICT RULES:
1. Only include test values you can CLEARLY identify in the OCR text — do NOT guess or hallucinate values.
2. If a date cannot be extracted from the report, use "Unknown" as the column header.
3. Each distinct date found in the reports becomes one column.
4. If the same test appears under both known and unknown dates, put them in separate columns.
5. Do NOT repeat test names — merge results into the same row across dates.
6. Include unit in the test name column, e.g. "SGPT (U/L)".
7. Format as a proper markdown table.

After the table, write a concise 2-3 line summary of key trends (e.g. improving, worsening, normal).

OCR TEXT:
${combined.slice(0, 7000)}

Return markdown table + summary. No JSON. No extra explanation.`
      : `You are a clinical data parser. Parse the following clinical document OCR text for a patient with diagnosis: ${confirmedDiagnosis} (Age: ${confirmedAge}).

Extract and organize as structured plain text:
- Demographics (if found)
- Chief Complaints & History
- Vitals (if found)
- Examination Findings
- Hospital Course / Treatment Given

OCR TEXT:
${combined.slice(0, 6000)}

Return organized plain text. Be concise. No JSON.`;
    try {
      let out = "";
      await callAIStream([{ role: "user", content: prompt }], "You are a precise clinical data parser. Output clean structured text.", provider, apiKey, t => { out = t; });
      if (isInv) setInvestigationsText(out.trim());
      else setClinicalText(out.trim());
    } catch (e) {
      console.warn("compileCardText failed silently:", e);
    }
    if (cardType === "clinical") setCompilingClinical(false);
    else setCompilingInvestigations(false);
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge."); return; }
    const rec = new SR(); rec.lang = "en-IN"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => setNotesText(Array.from(e.results).map(r => r[0].transcript).join(" "));
    rec.onend = () => setVoiceOn(false);
    rec.start(); recRef.current = rec; setVoiceOn(true);
  };

  // Toggles selecting multiple options and joins them as a pipe-separated string
  const toggleAnswerOption = (key, opt) => {
    setAnswers(prev => {
      const current = prev[key] || "";
      const items = current.split("|").map(x => x.trim()).filter(Boolean);
      if (items.includes(opt)) {
        const next = items.filter(x => x !== opt).join(" | ");
        return { ...prev, [key]: next };
      } else {
        const next = [...items, opt].join(" | ");
        return { ...prev, [key]: next };
      }
    });
  };

  // Memory Compiler Phase: Parse raw OCR reports & notes into temporary patient facts
  const compilePatientMemory = async () => {
    if (!apiKey) return;
    setProcessingIntake(true);
    // Use the AI-compiled & user-edited preview text if available, else fallback to raw OCR
    const docText = clinicalText.trim() || docs.filter(d => d.status === "done").map(d => d.ocrText).join("\n\n");
    const invText = investigationsText.trim() || investigations.filter(d => d.status === "done").map(d => `OCR TEXT:\n${d.ocrText}`).join("\n\n");
    const allText = [
      docText ? `PATIENT CLINICAL HISTORY/PROGRESS RECORDS:\n${docText}` : "",
      invText ? `LABORATORY REPORTS & INVESTIGATIONS:\n${invText}` : "",
      notesText.trim() ? `DOCTOR TYPED NOTES:\n${notesText}` : ""
    ].filter(Boolean).join("\n\n");

    const prompt = `You are a clinical data compiler. Parse the unstructured reports and notes below and build a structured, compiled clinical record.
DIAGNOSIS: ${confirmedDiagnosis}
AGE: ${confirmedAge}

TEXT TO PARSE:
${allText.slice(0, 6000)}

Return ONLY valid JSON matching this exact structure:
{
  "confirmedDiagnosis": "string",
  "confirmedAge": "string",
  "summaryType": "${summaryType}",
  "extractedFacts": {
    "demographics": { "sex": "male|female|other", "birthWeight": "string or unknown" },
    "symptomsAndHopi": ["symptom 1 with duration", "symptom 2"],
    "generalExamination": ["general exam findings, e.g. severe dehydration, pallor"],
    "systemicExamination": ["systemic exam findings, e.g. chest clear"],
    "vitals": { "temp": "string", "hr": "string", "rr": "string", "spo2": "string" },
    "investigations": [{"test": "test name", "result": "result value", "dateTime": "date time or unknown"}],
    "treatmentsAndCourse": ["treatments given, hospital course events, e.g., FFP transfused, phototherapy"]
  }
}
No markdown. No extra keys.`;

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a precise clinical data compiler. Output only valid JSON.",
        provider,
        apiKey,
        t => { raw = t; }
      );
      const parsed = parseJSON(raw);
      if (parsed) {
        setPatientMemory(parsed);
        await analyzeWizardGaps(parsed, answers);
        setStep(4);
      } else {
        const fallback = {
          confirmedDiagnosis,
          confirmedAge,
          summaryType,
          extractedFacts: { demographics: {}, symptomsAndHopi: [], generalExamination: [], systemicExamination: [], vitals: {}, investigations: [], treatmentsAndCourse: [] }
        };
        setPatientMemory(fallback);
        await analyzeWizardGaps(fallback, answers);
        setStep(4);
      }
    } catch (err) {
      alert("Failed to process clinical details: " + err.message);
    } finally {
      setProcessingIntake(false);
    }
  };

  // Gap Analysis Phase: Find missing details based on Mode (Template-based, Generic, Detailed)
  // Merges the user's checklistAnswers into the memory representation to avoid repeated questions.
  const analyzeWizardGaps = async (memory, currentAnswers = answers) => {
    if (!apiKey) return;
    setCheckingMissing(true);
    
    // Inject checklist answers into the memory context object for Claude to review
    const memoryWithAnswers = {
      ...memory,
      checklistAnswers: currentAnswers
    };
    
    const memoryText = JSON.stringify(memoryWithAnswers, null, 2);
    let prompt = "";

    if (summaryType === "template") {
      prompt = `You are a clinical assistant. Analyze the selected template slots, compiled patient details, and already answered questions below to find empty or unresolved blanks.
TEMPLATE SLOTS:
${template.slots.map(s => `- ${s.key}: ${s.label}${s.ocrHints?.length ? ` (${s.ocrHints.join(", ")})` : ""}`).join("\n")}

COMPILED PATIENT DETAILS & ANSWERS:
${memoryText}

Identify which template slots are still MISSING or UNRESOLVED. For each missing slot, provide:
- A short key (must match the template slot key exactly, e.g. "tsb_discharge")
- A clear label (e.g. "TSB at discharge")
- A list of typical multiple-choice options (2 to 4 options maximum) OR an empty list if it's a numeric/free-text value.

Return ONLY a valid JSON object of this structure:
{"missing": [{"key": "string", "label": "string", "options": ["opt1", "opt2", ...]}]}
Suggest ALL missing relevant parameters in a single response (up to 10-12 parameters maximum if needed). Do not drip-feed questions. Do NOT generate questions for any parameters that are already answered or known in "checklistAnswers" or "extractedFacts". No markdown.`;
    } else if (summaryType === "generic") {
      prompt = `You are a clinical assistant. For a GENERIC (minimal information) discharge summary for diagnosis "${confirmedDiagnosis}" and age "${confirmedAge}", we need to ensure the basic core clinical details are documented.
COMPILED PATIENT DETAILS & ANSWERS:
${memoryText}

Identify which minimal core parameters (e.g., primary discharge vital, key outcome parameter, feeding/activity status, or details of treatment given/hospital course) are still MISSING or UNKNOWN. For each missing core parameter, provide:
- A short key (e.g. "feeding_status", "treatment_given")
- A clear label (e.g. "Feeding status at discharge", "Course of treatment in hospital")
- A list of typical options (2 to 4 options) OR empty list for text.

Return ONLY a valid JSON object of this structure:
{"missing": [{"key": "string", "label": "string", "options": ["opt1", "opt2", ...]}]}
Suggest ALL missing core parameters in a single response (up to 10-12 parameters maximum if needed). Do not drip-feed questions. Do NOT generate questions for any parameters that are already answered or known in "checklistAnswers" or "extractedFacts". No markdown.`;
    } else {
      prompt = `You are a clinical assistant. For a DETAILED, comprehensive, academic-grade discharge summary for diagnosis "${confirmedDiagnosis}" and age "${confirmedAge}", we must check for any missing critical clinical parameters, lab results, exam findings, or screen plans.
COMPILED PATIENT DETAILS & ANSWERS:
${memoryText}

Identify which critical detailed investigations, symptom characteristics, exam findings, or treatment details are still MISSING or UNKNOWN. For each missing parameter, provide:
- A short key (e.g. "dct_result", "g6pd_status", "neuro_exam")
- A clear label (e.g. "Direct Coombs Test (DCT)", "G6PD status")
- A list of typical options (2 to 4 options) OR empty list for text.

Return ONLY a valid JSON object of this structure:
{"missing": [{"key": "string", "label": "string", "options": ["opt1", "opt2", ...]}]}
Suggest ALL missing relevant parameters in a single response (up to 10-12 parameters maximum if needed). Do not drip-feed questions. Do NOT generate questions for any parameters that are already answered or known in "checklistAnswers" or "extractedFacts". No markdown.`;
    }

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a clinical assistant identifying missing information. Output only valid JSON.",
        provider,
        apiKey,
        t => { raw = t; }
      );
      const parsed = parseJSON(raw);
      if (parsed && Array.isArray(parsed.missing)) {
        setMissingChecklist(parsed.missing);
      } else {
        setMissingChecklist([]);
      }
    } catch (err) {
      console.error("Failed to analyze gaps in wizard", err);
    } finally {
      setCheckingMissing(false);
    }
  };

  // Narrative Generation Phase
  const generateWizardSummary = async () => {
    if (!apiKey) return;
    setGeneratingSummary(true);
    setEditing(false);
    setSummaryText("✨ AI is synthesizing the final discharge summary...");

    const filledAnswersText = Object.entries(answers)
      .filter(([_, v]) => v && v.trim())
      .map(([k, v]) => {
        const item = missingChecklist.find(d => d.key === k);
        const cleanVal = v.split("|").map(x => x.trim()).filter(Boolean).join(", ");
        return `- ${item ? item.label : k}: ${cleanVal}`;
      })
      .join("\n");

    const memoryContext = JSON.stringify(patientMemory, null, 2);
    let prompt = "";

    if (summaryType === "template") {
      // Set values we have
      const defaultVals = Object.fromEntries(template.slots.map(s => [s.key, s.default]));
      const combinedAnswers = { ...defaultVals, ...answers };
      const filledTemplate = fillTemplate(template.sampleBody, combinedAnswers, template.slots);
      
      prompt = `You are a senior medical consultant. You must generate a discharge summary strictly following the template layout below, while merging in the compiled patient details and checklist answers.

TEMPLATE LAYOUT (WITH PRE-FILLED VALUES):
${filledTemplate}

COMPILED PATIENT DETAILS:
${memoryContext}

CHECKLIST ANSWERS:
${filledAnswersText}

INSTRUCTIONS:
1. Retain the exact sections and boilerplate of the TEMPLATE LAYOUT.
2. Intelligently merge the clinical details (like symptoms, examinations, investigations, treatments, clinical course) from the patient details and checklist answers into the corresponding template sections.
3. Ensure clinical cohesion. Weave findings (e.g. DCT results, FFP transfusions, dehydration history) smoothly and professionally.
4. The DIAGNOSIS section MUST use exactly TWO separate headings in this order:

   DIAGNOSIS
   [Clinical description of the condition, e.g.: Acute Infective Hepatitis with signs of liver cell failure, ascitis]

   PRIMARY DIAGNOSIS
   ICD-10 Code: B15.9 (Hepatitis A without hepatic coma)
   ICD-10 Code: K72.0 (Acute and subacute hepatic failure)
   ICD-10 Code: R17 (Unspecified jaundice)
   ICD-10 Code: R60.0 (Localized edema)

   ALL ICD-10 codes (primary and secondary) are listed together under PRIMARY DIAGNOSIS only. Do NOT create a separate SECONDARY DIAGNOSIS heading.
5a. Do NOT use any markdown bold syntax (**text**) anywhere in the summary. All labels and headings must be in PLAIN CAPITAL LETTERS only (e.g., HEART RATE, PRIMARY DIAGNOSIS).
5b. For vitals, use colon-dash style: Heart Rate:- 88/min, Respiratory Rate:- 20/min, Temperature:- 98.6°F (no asterisks, no bold).
6. If there are any patient reports, laboratory investigations, or clinical tests, CRITICAL RULE: the INVESTIGATIONS section must ONLY contain tests that were actually performed AND have an available result/value. NEVER list a test that is merely "Advised", ordered, planned, pending, awaited, or has no result — omit those entirely. If no investigation has an actual result, omit the INVESTIGATIONS section completely. For the tests that DO have results, you MUST format them under the heading "INVESTIGATIONS" as a clean, aligned plain-text ASCII grid trend table (using characters like +, -, and |) instead of default Markdown. The columns MUST represent absolute calendar dates formatted in DD-MM-YYYY format (e.g. | Test Name | 07-07-2026 | 08-07-2026 | ... |) sorted in chronological increasing order. You MUST NOT use relative day descriptors like "Day 2 of Life" or "Day 3". The rows must represent individual test parameters. Do NOT include reference ranges or units as separate columns. Pad columns with spaces so vertical borders align perfectly. Compatible with word processors.
7. Output ONLY the completed, refined discharge summary text. Do not include any introduction, formatting like markdown code blocks, or comments. Just output the final plain text summary.`;
    } else if (summaryType === "generic") {
      const genericInstructions = getGenericInstructions();
      prompt = `You are a senior medical consultant. Write a CONCISE, minimal, safe discharge summary for the patient.

CONFIRMED DIAGNOSIS: ${confirmedDiagnosis}
CONFIRMED AGE: ${confirmedAge}

COMPILED PATIENT DETAILS:
${memoryContext}

CHECKLIST ANSWERS:
${filledAnswersText}

INSTRUCTIONS:
${genericInstructions}`;
    } else {
      const detailedInstructions = getDetailedInstructions();
      prompt = `You are a senior medical consultant. Write a highly DETAILED, comprehensive, academic-grade discharge summary for this patient.

CONFIRMED DIAGNOSIS: ${confirmedDiagnosis}
CONFIRMED AGE: ${confirmedAge}

COMPILED PATIENT DETAILS:
${memoryContext}

CHECKLIST ANSWERS:
${filledAnswersText}

INSTRUCTIONS:
${detailedInstructions}`;
    }

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a senior medical consultant generating a discharge summary. Output only the final plain text summary.",
        provider,
        apiKey,
        t => {
          raw = t;
          setSummaryText(t);
        }
      );
      if (raw.trim()) {
        const saved = await saveSummaryRecord({ diagnosis: confirmedDiagnosis || template.diagnosis || template.name, template_name: template.name, source: "ai_wizard", text: raw });
        if (saved?.id) setSavedSummaryId(saved.id);
      }
    } catch (err) {
      alert("Failed to generate summary: " + err.message);
      setSummaryText("");
    } finally {
      setGeneratingSummary(false);
    }
  };

  const refineSummaryWithInstruction = async (instruction) => {
    if (!apiKey || !instruction.trim()) return;
    setGeneratingSummary(true);
    setRefinePrompt("");
    const prompt = `You are a senior medical consultant. We have generated the following discharge summary:

${summaryText}

The doctor has given the following instruction to edit/refine the summary:
"${instruction}"

Rewrite the discharge summary to incorporate the instruction. Retain the general facts, details, and layout structure of the original summary.
The DIAGNOSIS section MUST use exactly TWO separate headings:
   DIAGNOSIS
   [Clinical description of the condition]

   PRIMARY DIAGNOSIS
   ICD-10 Code: [primary code] ([primary condition name])
   ICD-10 Code: [secondary code] ([secondary condition name])
   (ALL ICD-10 codes listed under PRIMARY DIAGNOSIS only. No separate SECONDARY DIAGNOSIS heading.)
Do NOT use any markdown bold syntax (**text**) anywhere. All labels and headings must be in PLAIN CAPITAL LETTERS only. For vitals, use colon-dash style: Heart Rate:- 88/min (no asterisks). Output ONLY the updated complete plain text summary. Do not include markdown code block syntax.`;

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a senior medical consultant editing a discharge summary. Output only the updated plain text summary.",
        provider,
        apiKey,
        t => {
          raw = t;
          setSummaryText(t);
        }
      );
    } catch (err) {
      alert("Failed to refine summary: " + err.message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      
      {/* Header with Step Tracker */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border-primary)", paddingBottom: 14 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: PURPLE.primary, background: PURPLE.bg, padding: "3px 8px", borderRadius: 12 }}>
            Step {step} of 5
          </span>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "6px 0 2px" }}>
            {step === 1 && "Confirm Patient Profile"}
            {step === 2 && "Select Summary Type"}
            {step === 3 && "Upload Reports & Notes"}
            {step === 4 && "AI Assistant: Refine Clinical Gaps"}
            {step === 5 && "Generated Discharge Summary"}
          </h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
            {step === 1 && "Confirm the diagnosis and age pre-filled from your template."}
            {step === 2 && "Choose how strictly the AI should structure the narrative."}
            {step === 3 && "Provide patient reports, investigations, and progress notes."}
            {step === 4 && "Check/fill missing critical details identified by the AI."}
            {step === 5 && "Review, edit, copy or save your final discharge summary."}
          </p>
        </div>
        <Btn testId="wizard-exit-btn" variant="ghost" small onClick={onCancel}>Exit Wizard</Btn>
      </div>

      {/* Step 1 Content */}
      {step === 1 && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Confirmed Diagnosis</label>
            <input value={confirmedDiagnosis} onChange={e => setConfirmedDiagnosis(e.target.value)} data-testid="wizard-diagnosis-input" style={inputS} placeholder="e.g. Neonatal Jaundice" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Confirmed Age</label>
            <input value={confirmedAge} onChange={e => setConfirmedAge(e.target.value)} data-testid="wizard-age-input" style={inputS} placeholder="e.g. 3 days" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <Btn testId="wizard-step1-next-btn" onClick={() => setStep(2)}>Next →</Btn>
          </div>
        </Card>
      )}

      {/* Step 2 Content */}
      {step === 2 && (
        <Card>
          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>Select the narrative structure for the summary:</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, margin: "20px 0" }}>
            {[
              ...(template?.id !== "ai_mode" ? [{ type: "template", label: "📄 Template-Based", text: "Strictly follows the template boilerplate, layout, and sections. Best for formal hospital formats." }] : []),
              { type: "generic", label: "⚡ Generic", text: "Quick, minimal discharge summary. Focuses only on core diagnostics, vitals, and advice." },
              { type: "detailed", label: "🔬 Detailed", text: "Comprehensive, clinical narrative including history, full physical/neuro exam, labs, and warnings." }
            ].map(item => {
              const active = summaryType === item.type;
              return (
                <div key={item.type} onClick={() => setSummaryType(item.type)}
                  style={{
                    border: `2px solid ${active ? PURPLE.primary : "var(--color-border-primary)"}`,
                    background: active ? PURPLE.bg : "#fff",
                    borderRadius: 12, padding: 18, cursor: "pointer", transition: "all 0.2s ease-in-out",
                    boxShadow: active ? "var(--shadow-md)" : "var(--shadow-sm)"
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = PURPLE.border; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = "var(--color-border-primary)"; }}
                >
                  <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 6px", color: active ? PURPLE.primary : "var(--color-text-primary)" }}>{item.label}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>{item.text}</p>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 16 }}>
            <Btn testId="wizard-step2-back-btn" variant="ghost" onClick={() => setStep(1)}>← Back</Btn>
            <Btn testId="wizard-step2-next-btn" onClick={() => setStep(3)}>Next →</Btn>
          </div>
        </Card>
      )}

      {/* Step 3 Content */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Card 1: Patient Clinical Details */}
          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: PURPLE.primary }}>📋 Patient Clinical Details & Notes</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Doctor's Clinical / Progress Notes <span style={{ fontWeight: 400 }}>(vitals, boluses, course, exceptions)</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={notesText} onChange={e => setNotesText(e.target.value)}
                  placeholder={voiceOn ? "Listening…" : "e.g., Baby admitted with severe dehydration, fluid bolus correction given, DCT positive, FFP transfused..."}
                  data-testid="wizard-notes-textarea"
                  style={{ ...inputS, minHeight: 100, resize: "vertical", flex: 1 }} />
                <button onClick={voiceOn ? () => { recRef.current?.stop(); setVoiceOn(false); } : startVoice}
                  data-testid="wizard-voice-toggle-btn"
                  style={{ padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${voiceOn ? RED.primary : "var(--color-border-primary)"}`, background: voiceOn ? RED.bg : "#fff", color: voiceOn ? RED.primary : "var(--color-text-secondary)", flexShrink: 0 }}>
                  🎙 {voiceOn ? "Stop" : "Speak"}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Upload Clinical Documents <span style={{ fontWeight: 400 }}>(admission slips, prescriptions, progress charts)</span></label>
              <DocumentIntake docs={docs} setDocs={setDocs} provider={provider} apiKey={apiKey} />
            </div>
            {/* AI-parsed clinical preview */}
            {(compilingClinical || clinicalText) && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE.primary }}>✨ AI-Parsed Clinical Summary</span>
                  {compilingClinical && <span style={{ fontSize: 11, color: PURPLE.primary }}>⏳ Parsing…</span>}
                  {!compilingClinical && clinicalText && <span style={{ fontSize: 11, color: TEAL.primary }}>✓ Review and edit below</span>}
                </div>
                <textarea
                  value={compilingClinical ? "⏳ AI is parsing uploaded documents…" : clinicalText}
                  onChange={e => setClinicalText(e.target.value)}
                  readOnly={compilingClinical}
                  placeholder="AI-parsed clinical summary will appear here after upload. You can edit freely."
                  style={{ ...inputS, minHeight: 120, resize: "vertical", fontFamily: "monospace", fontSize: 12, background: compilingClinical ? "var(--color-background-secondary)" : "#fff" }}
                />
              </div>
            )}
          </Card>

          {/* Card 2: Patient Investigations */}
          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: PURPLE.primary }}>🧪 Investigations & Laboratory Reports</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Upload Lab Reports / Diagnostic Scans</label>
              <DocumentIntake docs={investigations} setDocs={setInvestigations} provider={provider} apiKey={apiKey} isInvestigation />
            </div>
            {/* AI-parsed investigations preview */}
            {(compilingInvestigations || investigationsText) && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE.primary }}>✨ AI-Parsed Investigations Table</span>
                  {compilingInvestigations && <span style={{ fontSize: 11, color: PURPLE.primary }}>⏳ Parsing…</span>}
                  {!compilingInvestigations && investigationsText && <span style={{ fontSize: 11, color: TEAL.primary }}>✓ Review below — dates as columns, tests as rows</span>}
                </div>
                {compilingInvestigations ? (
                  <div style={{ padding: 12, background: "var(--color-background-secondary)", borderRadius: 8, fontSize: 12, color: PURPLE.primary }}>⏳ AI is parsing lab reports…</div>
                ) : (() => {
                  const lines = investigationsText.split("\n").filter(l => l.trim().startsWith("|"));
                  const dataLines = lines.filter(l => !/^\|[\s:|-]+\|/.test(l));
                  const rows = dataLines.map(l =>
                    l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim())
                  );
                  if (rows.length < 2) return (
                    <textarea value={investigationsText} onChange={e => setInvestigationsText(e.target.value)}
                      placeholder="AI-parsed investigations table will appear here after upload."
                      data-testid="wizard-investigations-textarea-fallback"
                      style={{ ...inputS, minHeight: 140, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
                  );
                  const headers = rows[0];
                  const bodyRows = rows.slice(1);
                  return (
                    <>
                      <div style={{ overflowX: "auto", borderRadius: 8, border: "1.5px solid var(--color-border-primary)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                          <thead>
                            <tr style={{ background: "var(--color-background-secondary)" }}>
                              {headers.map((h, i) => (
                                <th key={i} style={{
                                  padding: "8px 12px", textAlign: i === 0 ? "left" : "center",
                                  fontWeight: 700, borderBottom: "2px solid var(--color-border-secondary)",
                                  whiteSpace: "nowrap", color: "var(--color-text-primary)"
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {bodyRows.map((row, ri) => (
                              <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "var(--color-background-secondary)" }}>
                                {headers.map((_, ci) => {
                                  const cell = row[ci] ?? "";
                                  const isPositive = /positive/i.test(cell);
                                  const isNegative = /negative/i.test(cell);
                                  return (
                                    <td key={ci} style={{
                                      padding: "7px 12px",
                                      textAlign: ci === 0 ? "left" : "center",
                                      borderBottom: "1px solid var(--color-border-primary)",
                                      whiteSpace: "nowrap",
                                      fontWeight: ci === 0 ? 600 : 400,
                                      color: isPositive ? "#b91c1c" : isNegative ? "#15803d" : "var(--color-text-primary)",
                                    }}>{cell || <span style={{ color: "#ccc" }}>—</span>}</td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: 11, color: "var(--color-text-secondary)", cursor: "pointer" }}>✏️ Edit raw table</summary>
                        <textarea value={investigationsText} onChange={e => setInvestigationsText(e.target.value)}
                          data-testid="wizard-investigations-raw-textarea"
                          style={{ ...inputS, minHeight: 100, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, marginTop: 6 }} />
                      </details>
                    </>
                  );
                })()}
              </div>
            )}
          </Card>

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 10 }}>
            <Btn testId="wizard-step3-back-btn" variant="ghost" onClick={() => setStep(2)}>← Back</Btn>
            <Btn testId="wizard-step3-next-btn" onClick={compilePatientMemory} disabled={processingIntake || compilingClinical || compilingInvestigations}>
              {processingIntake ? "✨ Processing details..." : "✨ Process & Next →"}
            </Btn>
          </div>
        </div>
      )}

      {/* Step 4 Content */}
      {step === 4 && (() => {
        const isInvestigation = (item) => {
          const k = (item.key || "").toLowerCase();
          const l = (item.label || "").toLowerCase();
          const keywords = [
            "investigation", "test", "result", "lab", "cbc", "tsb", "bilirubin", "ultrasound", 
            "usg", "dct", "g6pd", "crp", "wbc", "hb", "plt", "level", "serum", "urine", "blood", 
            "count", "titer", "screen", "scan", "xray", "x-ray", "hemoglobin", "platelet", 
            "creatinine", "urea", "electrolyte", "sodium", "potassium", "bilirubin", "liver", "renal"
          ];
          return keywords.some(kw => k.includes(kw) || l.includes(kw));
        };

        const gapInvestigations = missingChecklist.filter(isInvestigation);
        const gapClinical = missingChecklist.filter(item => !isInvestigation(item));

        const renderGapItem = (item) => {
          const currentVal = answers[item.key] ?? "";
          const customVal = currentVal.split("|")
            .map(x => x.trim())
            .filter(x => !item.options.some(opt => opt.trim().toLowerCase() === x.toLowerCase()))
            .filter(Boolean)
            .join(" | ");
          return (
            <div key={item.key} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>{item.label}</p>
              {item.options && item.options.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {item.options.map(opt => {
                    const isSelected = currentVal.split("|").map(x => x.trim().toLowerCase()).includes(opt.trim().toLowerCase());
                    return (
                      <button key={opt} onClick={() => toggleAnswerOption(item.key, opt)}
                        style={{ 
                          padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                          borderColor: isSelected ? PURPLE.primary : "var(--color-border-primary)", 
                          background: isSelected ? PURPLE.bg : "#fff", 
                          color: isSelected ? PURPLE.primary : "var(--color-text-secondary)" 
                        }}>
                        {opt}
                      </button>
                    );
                  })}
                  <input value={customVal} 
                    onChange={e => {
                      const selectedOpts = currentVal.split("|").map(x => x.trim()).filter(x => item.options.some(opt => opt.toLowerCase() === x.toLowerCase()));
                      const newCustom = e.target.value;
                      const nextVal = [...selectedOpts, newCustom].filter(x => x !== "").join(" | ");
                      setAnswers(prev => ({ ...prev, [item.key]: nextVal }));
                    }}
                    data-testid={`gap-custom-${item.key}`}
                    placeholder="or custom..." style={{ ...inputS, fontSize: 12, width: 120, padding: "4px 8px" }} />
                </div>
              ) : (
                <input value={currentVal} onChange={e => setAnswers(prev => ({ ...prev, [item.key]: e.target.value }))} 
                  placeholder={`Enter ${item.label.toLowerCase()}...`}
                  data-testid={`gap-freetext-${item.key}`}
                  style={{ ...inputS, fontSize: 12, padding: "6px 10px" }} />
              )}
            </div>
          );
        };

        return (
          <Card style={{ borderLeft: `4px solid ${PURPLE.primary}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                📋 Dynamic Gap Checklist ({summaryType.toUpperCase()} Mode)
                {checkingMissing && <span style={{ fontSize: 12, color: PURPLE.primary, fontWeight: 400, marginLeft: 8 }}>· analyzing gaps...</span>}
              </h3>
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
              Answering these parameters is optional. Click generate summary at any point.
            </p>

            {missingChecklist.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "10px 0" }}>
                {gapClinical.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: PURPLE.primary, margin: "4px 0 0" }}>📋 Clinical & Profile Gaps</p>
                    {gapClinical.map(renderGapItem)}
                  </div>
                )}
                {gapInvestigations.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--color-border-primary)", paddingTop: 14, marginTop: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: PURPLE.primary, margin: 0 }}>🧪 Investigations & Lab Gaps</p>
                    <div style={{ padding: 12, background: "rgba(139,92,246,0.06)", border: "1px dashed #8B5CF6", borderRadius: 8, margin: "6px 0 10px" }}>
                      <DocumentIntake docs={investigations} setDocs={setInvestigations} provider={provider} apiKey={apiKey} isInvestigation />
                    </div>
                    {gapInvestigations.map(renderGapItem)}
                  </div>
                )}
              </div>
            ) : (
              !checkingMissing && <p style={{ fontSize: 12, color: TEAL.primary, fontWeight: 600, margin: "10px 0" }}>✓ No missing parameters identified. Ready to generate summary!</p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 14, borderTop: "1px solid var(--color-border-primary)", paddingTop: 14 }}>
              <Btn testId="wizard-step4-back-btn" variant="ghost" onClick={() => setStep(3)}>← Back</Btn>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn testId="wizard-reanalyze-gaps-btn" variant="secondary" onClick={() => analyzeWizardGaps(patientMemory, answers)} disabled={checkingMissing}>
                  ↻ Re-analyze Gaps
                </Btn>
                <Btn testId="wizard-generate-summary-btn" onClick={() => { setStep(5); generateWizardSummary(); }} disabled={checkingMissing}>
                  ✨ Generate Summary
                </Btn>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Step 5 Content */}
      {step === 5 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: 20 }}>
            {generatingSummary ? (
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", textAlign: "center", padding: 40 }}>✨ Writing Discharge Summary...</p>
            ) : editing ? (
              <textarea value={summaryText} onChange={e => setSummaryText(e.target.value)}
                data-testid="wizard-summary-textarea"
                style={{ width: "100%", minHeight: 440, border: "none", outline: "none", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, resize: "vertical" }} />
            ) : (
              <pre style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", margin: 0 }}>{summaryText}</pre>
            )}
          </Card>
          
          {/* Custom instructions area for summary refinement */}
          {!generatingSummary && summaryText.trim() && (
            <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, background: "rgba(91,91,219,0.02)", border: `1.5px solid ${PURPLE.border}` }}>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", color: PURPLE.text }}>
                ✨ Refine summary with custom AI instruction:
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea 
                  value={refinePrompt} 
                  onChange={e => setRefinePrompt(e.target.value)}
                  placeholder="e.g., Add a warning to avoid heavy lifting, emphasize strict rest, or rephrase clinical course..."
                  data-testid="wizard-refine-prompt-textarea"
                  style={{ ...inputS, minHeight: 50, resize: "vertical", fontSize: 12, flex: 1, padding: "6px 10px" }}
                />
                <Btn 
                  testId="wizard-refine-summary-btn"
                  small
                  disabled={generatingSummary || !refinePrompt.trim()} 
                  onClick={() => refineSummaryWithInstruction(refinePrompt)} 
                >
                  Refine Summary
                </Btn>
              </div>
            </Card>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn testId="wizard-adjust-details-btn" variant="secondary" small onClick={() => setStep(4)} disabled={generatingSummary}>
              ← Adjust Details (Step 4)
            </Btn>
            <Btn testId="wizard-edit-summary-btn" variant="secondary" small onClick={() => setEditing(v => !v)} disabled={generatingSummary}>
              {editing ? "Done Editing" : "✏️ Edit Summary Text"}
            </Btn>
            <Btn testId="wizard-copy-summary-btn" variant="secondary" small onClick={() => { navigator.clipboard?.writeText(summaryText); setCopied(true); setTimeout(() => setCopied(false), 2000); }} disabled={generatingSummary}>
              {copied ? "✓ Copied!" : "Copy Summary"}
            </Btn>
            <Btn testId="wizard-download-txt-btn" variant="secondary" small onClick={() => {
              const filename = `${confirmedDiagnosis.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_discharge_summary.txt`;
              const element = document.createElement("a");
              const file = new Blob([summaryText], { type: "text/plain;charset=utf-8" });
              element.href = URL.createObjectURL(file);
              element.download = filename;
              document.body.appendChild(element);
              element.click();
              document.body.removeChild(element);
            }} disabled={generatingSummary}>
              📥 Download TXT
            </Btn>
            <Btn testId="wizard-save-template-btn" onClick={() => setWizardSaveModal(true)} disabled={generatingSummary || !summaryText.trim()}>
              💾 Save as Template
            </Btn>
            {wizardSavedToast && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#0F6E56", background: "#E1F5EE", border: "1px solid #9FE1CB", borderRadius: 20, padding: "4px 12px", animation: "fadeSlideIn 0.25s ease" }}>
                ✅ Template saved!
              </span>
            )}
            {wizardSaveModal && (
              <SaveAsTemplateModal
                defaultName={template.name + " (AI copy)"}
                existingTemplates={existingTemplates}
                onConfirm={(chosenName) => {
                  setWizardSaveModal(false);
                  onSaveAsTemplate({ ...template, id: "", name: chosenName, source: "private", sampleBody: summaryText, slots: [] });
                  setWizardSavedToast(true);
                  setTimeout(() => setWizardSavedToast(false), 3000);
                }}
                onClose={() => setWizardSaveModal(false)}
              />
            )}
          </div>

          {!generatingSummary && summaryText.trim() && (
            <SafetyCheckPanel getText={() => summaryText} diagnosis={confirmedDiagnosis} provider={provider} apiKey={apiKey} />
          )}
        </div>
      )}
      {savedSummaryId && <RatingPrompt recordType="summary" recordId={savedSummaryId} onDismiss={() => setSavedSummaryId(null)} />}
    </div>
  );
}

// ─── AI Mode — freeform typical draft, no template ──────────────────────────────
async function composeTypicalDraft(complaint, { patient, reportsText, exceptions }, provider, apiKey) {
  const prompt = `Write a complete discharge summary for a TYPICAL, uncomplicated case of "${complaint}", as a senior consultant at a tertiary hospital in India.

${patient ? `PATIENT: ${patient}\n` : ""}${reportsText ? `REPORTS (use these EXACT values):\n${reportsText}\n\n` : ""}${exceptions ? `EXCEPTIONS for THIS patient (override the typical assumptions):\n${exceptions}\n\n` : ""}RULES:
- Assume the standard textbook course unless an exception says otherwise
- Stay GENERIC where specifics weren't given — do NOT invent numbers/doses/findings
- Keep GENERAL EXAMINATION, VITALS and SYSTEMIC EXAMINATION terse and line-wise (not prose)
- The DIAGNOSIS section MUST use exactly TWO separate headings in this order:

   DIAGNOSIS
   [Clinical description of the condition, e.g.: Acute Infective Hepatitis with signs of liver cell failure, ascitis]

   PRIMARY DIAGNOSIS
   ICD-10 Code: J18.9 (Pneumonia, unspecified organism)
   ICD-10 Code: [secondary code] ([secondary condition name])

   ALL ICD-10 codes (primary and secondary) are listed together under PRIMARY DIAGNOSIS only. Do NOT create a separate SECONDARY DIAGNOSIS heading.
- Do NOT use any markdown bold syntax (**text**) anywhere in the summary. All labels and headings must be in PLAIN CAPITAL LETTERS only (e.g., HEART RATE, PRIMARY DIAGNOSIS).
- For vitals, use colon-dash style: Heart Rate:- 88/min, Respiratory Rate:- 20/min, Temperature:- 98.6°F (no asterisks, no bold).
- If there are any laboratory investigations or clinical tests, CRITICAL RULE: the INVESTIGATIONS section must ONLY contain tests that were actually performed AND have an available result/value. NEVER list a test that is merely "Advised", ordered, planned, pending, awaited, or has no result — omit those entirely. If no investigation has an actual result, omit the INVESTIGATIONS section completely. For the tests that DO have results, you MUST format them under the heading "INVESTIGATIONS" as a clean, aligned plain-text ASCII grid trend table (using characters like +, -, and |). The columns MUST represent absolute calendar dates formatted in DD-MM-YYYY format (e.g. | Test Name | 07-07-2026 | 08-07-2026 | ... |) sorted in chronological increasing order. You MUST NOT use relative day descriptors like "Day 2 of Life" or "Day 3". The rows must represent individual test parameters. Do NOT include reference ranges or units as separate columns. Pad columns with spaces so vertical borders align perfectly. Compatible with word processors.
- Use EXACTLY these section headers in order: ${SECTION_SEQUENCE.join(", ")}

Plain text only, no markdown.`;
  let raw = "";
  await callAIStream([{ role: "user", content: prompt }], "You are a senior consultant composing discharge summaries. Never fabricate specific facts.", provider, apiKey, t => { raw = t; });
  return raw.trim();
}
function AIModeScreen({ complaint, provider, apiKey, onCancel, onDone }) {
  const [patient, setPatient] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [docs, setDocs] = useState([]);
  const [showScan, setShowScan] = useState(false);
  const [exceptions, setExceptions] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedSummaryId, setSavedSummaryId] = useState(null);
  const recRef = useRef(null);
  const reportsText = () => docs.filter(d => d.status === "done").map(d => d.ocrText).join("\n\n").slice(0, 3000);

  const generate = async () => {
    setLoading(true); setError("");
    try {
      const d = await composeTypicalDraft(complaint, { patient, reportsText: reportsText(), exceptions }, provider, apiKey);
      setText(d || "");
      if (!d) setError("Could not generate — tap to retry.");
      else {
        const saved = await saveSummaryRecord({ diagnosis: complaint, template_name: null, source: "ai_mode", text: d });
        if (saved?.id) setSavedSummaryId(saved.id);
      }
    }
    catch (e) { setError(`${e.message}. Tap to retry.`); } finally { setLoading(false); }
  };
  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice needs Chrome or Edge."); return; }
    const rec = new SR(); rec.lang = "en-IN"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => setExceptions(Array.from(e.results).map(r => r[0].transcript).join(" "));
    rec.onend = () => setVoiceOn(false); rec.start(); recRef.current = rec; setVoiceOn(true);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 2px" }}>✨ {complaint}</h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Typical draft — refine only what's different</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn testId="aimode-copy-btn" variant="secondary" small onClick={handleCopy} disabled={loading}>{copied ? "✓ Copied!" : "Copy"}</Btn>
          <Btn testId="aimode-download-btn" variant="secondary" small onClick={() => {
            const filename = `${complaint.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_draft.txt`;
            const element = document.createElement("a");
            const file = new Blob([text], { type: "text/plain;charset=utf-8" });
            element.href = URL.createObjectURL(file);
            element.download = filename;
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
          }} disabled={loading}>📥 Download TXT</Btn>
          <Btn testId="aimode-finish-btn" small onClick={onDone} disabled={loading}>Finish</Btn>
          <Btn testId="aimode-cancel-btn" variant="ghost" small onClick={onCancel}>Cancel</Btn>
        </div>
      </div>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12 }}>
          <input value={patient} onChange={e => setPatient(e.target.value)} placeholder="Patient — name, age, sex" data-testid="aimode-patient-input" style={inputS} />
          <Btn testId="aimode-scan-report-btn" small variant="secondary" onClick={() => setShowScan(v => !v)}>📷 {docs.length ? `Reports (${docs.length})` : "Scan report"}</Btn>
        </div>
        {showScan && <div style={{ marginBottom: 12 }}><DocumentIntake docs={docs} setDocs={setDocs} provider={provider} apiKey={apiKey} /></div>}
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Anything different about this patient?</label>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea value={exceptions} onChange={e => setExceptions(e.target.value)} placeholder="e.g. one episode of melena on day 3" data-testid="aimode-exceptions-textarea" style={{ ...inputS, minHeight: 52, resize: "vertical", flex: 1 }} />
          <button onClick={voiceOn ? () => { recRef.current?.stop(); setVoiceOn(false); } : startVoice}
            data-testid="aimode-voice-toggle-btn"
            style={{ padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, border: `1.5px solid ${voiceOn ? RED.primary : "var(--color-border-primary)"}`, background: voiceOn ? RED.bg : "#fff", color: voiceOn ? RED.primary : "var(--color-text-secondary)" }}>🎙 {voiceOn ? "Stop" : "Speak"}</button>
        </div>
        <div style={{ marginTop: 10 }}><Btn testId="aimode-regenerate-btn" small onClick={generate} disabled={loading}>{loading ? "Generating…" : "↻ Regenerate"}</Btn></div>
      </Card>
      <Card style={{ padding: 20 }}>
        {loading ? <p style={{ fontSize: 14, color: "var(--color-text-secondary)", textAlign: "center", padding: 40 }}>✨ Drafting…</p>
          : error ? <div><p style={{ fontSize: 14, color: AMBER.text, margin: "0 0 12px" }}>{error}</p><Btn testId="aimode-retry-btn" small onClick={generate}>Retry</Btn></div>
          : editing ? <textarea className="premium-textarea" data-testid="aimode-edit-textarea" value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 440, resize: "vertical" }} />
          : <pre style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", margin: 0 }}>{text}</pre>}
      </Card>
      {!loading && !error && <Btn testId="aimode-edit-toggle-btn" variant="secondary" small onClick={() => setEditing(v => !v)}>{editing ? "Done editing" : "✏️ Edit"}</Btn>}
      {!loading && !error && <SafetyCheckPanel getText={() => text} diagnosis={complaint} provider={provider} apiKey={apiKey} />}
      {savedSummaryId && <RatingPrompt recordType="summary" recordId={savedSummaryId} onDismiss={() => setSavedSummaryId(null)} />}
    </div>
  );
}

// ─── SuperSummary root ──────────────────────────────────────────────────────────
export default function SuperSummary({ provider, apiKey, setSettingsOpen }) {
  const [phase, setPhase] = useState("library"); // library | fill | ai | ai_wizard
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("clinicalmind:templates") || "[]"); } catch { return []; }
  });
  const [editing, setEditing] = useState(undefined);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [aiComplaint, setAiComplaint] = useState("");
  const [selectedTemplateForOptions, setSelectedTemplateForOptions] = useState(null);
  const [aiAssistantEnabled, setAiAssistantEnabled] = useState(true);

  // Editing a system template forks it into a private copy (new id + name) so the original stays intact.
  const openEdit = (t) => {
    if (t && t.source === "system") setEditing({ ...t, id: "", name: t.name + " (my copy)", source: "private" });
    else setEditing(t ?? null);
  };

  const saveTemplate = (t) => {
    const now = new Date().toISOString();
    const rec = { ...t, id: t.id || (t.name || "template").toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(), source: "private", createdAt: t.createdAt || now, editedAt: now };
    const prev = JSON.parse(localStorage.getItem("clinicalmind:templates") || "[]");
    const i = prev.findIndex(p => p.id === rec.id);
    const next = i >= 0 ? prev.map((p, j) => j === i ? rec : p) : [...prev, rec];
    localStorage.setItem("clinicalmind:templates", JSON.stringify(next));
    setCustomTemplates(next);
    setEditing(undefined);
  };

  const deleteTemplate = (id) => {
    const prev = JSON.parse(localStorage.getItem("clinicalmind:templates") || "[]");
    const next = prev.filter(t => t.id !== id);
    localStorage.setItem("clinicalmind:templates", JSON.stringify(next));
    setCustomTemplates(next);
    setEditing(undefined);
  };

  const [communityTemplatesOpen, setCommunityTemplatesOpen] = useState(false);

  const publishTemplateHandler = async (t) => {
    try {
      await apiPublishTemplate({ name: t.name, diagnosis: t.diagnosis, category: t.category, slots: t.slots, sampleBody: t.sampleBody });
      alert(`"${t.name}" published to the community! Other users can now find and rate it.`);
    } catch (err) {
      alert("Could not publish: " + err.message);
    }
  };

  const importTemplateHandler = (item) => {
    const rec = { id: (item.name || "template").toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(), name: item.name + " (community)", diagnosis: item.diagnosis, category: item.category, slots: item.slots, sampleBody: item.sampleBody, source: "private", createdAt: new Date().toISOString() };
    const prev = JSON.parse(localStorage.getItem("clinicalmind:templates") || "[]");
    const next = [...prev, rec];
    localStorage.setItem("clinicalmind:templates", JSON.stringify(next));
    setCustomTemplates(next);
    setCommunityTemplatesOpen(false);
    alert(`"${item.name}" imported into My Templates!`);
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      {phase === "library" && (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
          {!apiKey && (
            <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>📴</span>
              <p style={{ fontSize: 14, color: AMBER.text, margin: 0 }}>
                <strong>AI not configured.</strong> Templates fill instantly by hand; photo auto-fill, AI Mode & Safety Check need your admin to add an API key.{" "}
                <button onClick={() => setSettingsOpen(true)} data-testid="supersummary-add-apikey-btn" style={{ background: "none", border: "none", color: PURPLE.primary, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 14, padding: 0 }}>Open Settings →</button>
              </p>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
            <AiModeCard hasKey={!!apiKey} setSettingsOpen={setSettingsOpen}
              onStartAiMode={c => {
                const dummyTemplate = { id: "ai_mode", name: c, diagnosis: c, slots: [], sampleBody: "", category: "General", source: "private" };
                setActiveTemplate(dummyTemplate);
                setAiAssistantEnabled(true);
                setPhase("ai_wizard");
              }} />
            <Card testId="template-library-card">
              <TemplateLibrary customTemplates={customTemplates} onEdit={openEdit} onDelete={deleteTemplate}
                onSelect={t => { setSelectedTemplateForOptions(t); }}
                onPublish={publishTemplateHandler}
                onBrowseCommunity={() => setCommunityTemplatesOpen(true)} />
            </Card>
          </div>
        </div>
      )}

      {selectedTemplateForOptions && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 190, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, boxShadow: "var(--shadow-lg)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>Discharge Summary Flow</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 20px" }}>
              Choose how you would like to generate the discharge summary for <strong>{selectedTemplateForOptions.name}</strong>:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button 
                onClick={() => {
                  setActiveTemplate(selectedTemplateForOptions);
                  setAiAssistantEnabled(false);
                  setPhase("fill");
                  setSelectedTemplateForOptions(null);
                }}
                data-testid="flow-option-smart-editor-btn"
                style={{ 
                  padding: "14px", borderRadius: 10, border: "1.5px solid var(--color-border-primary)", background: "#fff", cursor: "pointer", textAlign: "left", transition: "all 0.2s"
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = PURPLE.primary}
                onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-primary)"}
              >
                <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 3px", color: "var(--color-text-primary)" }}>✏️ Smart Summary Editor</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Template-driven blanks with manual entry & OCR. No AI checklist.</p>
              </button>

              <button 
                onClick={() => {
                  setActiveTemplate(selectedTemplateForOptions);
                  setAiAssistantEnabled(true);
                  setPhase("ai_wizard");
                  setSelectedTemplateForOptions(null);
                }}
                data-testid="flow-option-ai-wizard-btn"
                style={{ 
                  padding: "14px", borderRadius: 10, border: `1.5px solid ${PURPLE.border}`, background: PURPLE.bg, cursor: "pointer", textAlign: "left", transition: "all 0.2s"
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = PURPLE.primary}
                onMouseLeave={e => e.currentTarget.style.borderColor = PURPLE.border}
              >
                <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 3px", color: PURPLE.primary }}>✨ Generate with AI (Super Fast)</p>
                <p style={{ fontSize: 12, color: PURPLE.text, margin: 0 }}>Guided wizard. Compiles reports and asks clinical questions to build the summary.</p>
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
              <Btn testId="flow-options-cancel-btn" variant="ghost" small onClick={() => setSelectedTemplateForOptions(null)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {phase === "fill" && activeTemplate && (
        <FillScreen template={activeTemplate} provider={provider} apiKey={apiKey}
          aiAssistantEnabled={aiAssistantEnabled}
          existingTemplates={customTemplates}
          onCancel={() => { setPhase("library"); setActiveTemplate(null); }}
          onSaveAsTemplate={t => saveTemplate(t)} />
      )}

      {phase === "ai_wizard" && activeTemplate && (
        <SuperFastAiWizard template={activeTemplate} provider={provider} apiKey={apiKey}
          existingTemplates={customTemplates}
          onCancel={() => { setPhase("library"); setActiveTemplate(null); }}
          onSaveAsTemplate={t => {
            const now = new Date().toISOString();
            const newT = {
              ...t,
              id: (t.name || "template").toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(),
              source: "private",
              createdAt: now,
              editedAt: now
            };
            const prev = JSON.parse(localStorage.getItem("clinicalmind:templates") || "[]");
            localStorage.setItem("clinicalmind:templates", JSON.stringify([...prev, newT]));
            setCustomTemplates([...prev, newT]);
            setEditing(newT);
            setPhase("library");
            setActiveTemplate(null);
          }} />
      )}

      {phase === "ai" && (
        <AIModeScreen complaint={aiComplaint} provider={provider} apiKey={apiKey}
          onCancel={() => { setPhase("library"); setAiComplaint(""); }}
          onDone={() => { setPhase("library"); setAiComplaint(""); }} />
      )}

      {editing !== undefined && (
        <TemplateEditor template={editing} onSave={saveTemplate} onDelete={deleteTemplate} onClose={() => setEditing(undefined)} provider={provider} apiKey={apiKey} />
      )}
      {communityTemplatesOpen && (
        <CommunityBrowserModal title="Community Templates" listFn={listCommunityTemplates} rateFn={rateTemplate}
          onImport={importTemplateHandler} onClose={() => setCommunityTemplatesOpen(false)} />
      )}
    </div>
  );
}
