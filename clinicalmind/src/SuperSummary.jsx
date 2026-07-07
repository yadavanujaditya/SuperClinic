import { useState, useRef, useEffect } from "react";
import { SYSTEM_TEMPLATES, emptyTemplate, parseTemplateParts, fillTemplate, SECTION_SEQUENCE } from "./templates.js";
import { extractDocumentText } from "./ocr.js";
import { callAIStream, parseJSON } from "./api.js";

const TEAL   = { primary: "#0F6E56", bg: "#E1F5EE", border: "#9FE1CB", text: "#085041" };
const AMBER  = { primary: "#EF9F27", bg: "#FAEEDA", border: "#FAC775", text: "#633806" };
const RED    = { primary: "#E24B4A", bg: "#FCEBEB", border: "#F7C1C1", text: "#791F1F" };
const PURPLE = { primary: "#6E40C9", bg: "#F3EEFF", border: "#D8C7FF", text: "#3E2570" };

function Btn({ children, onClick, variant = "primary", disabled, small, style: s = {} }) {
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, fontFamily: "var(--font-sans)", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, opacity: disabled ? 0.5 : 1, padding: small ? "6px 14px" : "10px 20px", fontSize: small ? 13 : 14, border: "none" };
  const variants = {
    primary:   { background: PURPLE.primary, color: "#fff" },
    secondary: { background: "transparent", color: PURPLE.primary, border: `1.5px solid ${PURPLE.border}` },
    ghost:     { background: "transparent", color: "var(--color-text-secondary)", border: `1.5px solid var(--color-border-primary)` },
  };
  return <button style={{ ...base, ...variants[variant], ...s }} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Card({ children, style: s = {} }) {
  return <div style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 12, padding: 16, boxShadow: "var(--shadow-sm)", ...s }}>{children}</div>;
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

// ─── Document intake + OCR (multi-image) ───────────────────────────────────────
function DocumentIntake({ docs, setDocs, provider, apiKey }) {
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
        style={{ border: `2px dashed ${dragging ? PURPLE.primary : "var(--color-border-secondary)"}`, borderRadius: 10, padding: "18px 16px", textAlign: "center", cursor: "pointer", background: dragging ? PURPLE.bg : "var(--color-background-secondary)" }}>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{ display: "none" }}
          onChange={e => { Array.from(e.target.files).forEach(processFile); e.target.value = ""; }} />
        <p style={{ fontSize: 22, margin: "0 0 4px" }}>🧾</p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Drop 3–4 photos/PDFs — reports, admission slip, notes · click to browse</p>
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
          <button onClick={() => setDocs(prev => prev.filter(x => x.id !== d.id))} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
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
        <Btn small variant="secondary" onClick={run} disabled={checking}>{checking ? "Reviewing…" : flags ? "Re-check" : "Review for red flags"}</Btn>
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

// ─── Template Editor — annotated sample: paste a real summary, highlight → slots ──
function TemplateEditor({ template, onSave, onClose, provider, apiKey }) {
  // Merge with empty defaults so templates missing slots/sampleBody (old model / forks) never crash.
  const [form, setForm] = useState({ ...emptyTemplate(), ...(template || {}) });
  const [sel, setSel] = useState(null); // { start, end, text }
  const [slotDraft, setSlotDraft] = useState(null); // { label, question, mandatory, ocrHints }
  const bodyRef = useRef();
  const fileRef = useRef();

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
    const key = slotDraft.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) + "_" + Math.random().toString(36).slice(2, 4);
    let body = form.sampleBody.slice(0, sel.start) + `{{${key}}}` + form.sampleBody.slice(sel.end);
    // Global replace: if the same text appears elsewhere, offer to link every occurrence to this one blank.
    if (sel.text.trim().length >= 3) {
      const escaped = sel.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "g");
      const remaining = (body.match(re) || []).length;
      if (remaining > 0 && window.confirm(`"${sel.text}" appears ${remaining} more time${remaining > 1 ? "s" : ""} in the template.\n\nReplace ALL of them with this blank too? (Answering once will then fill every occurrence.)`)) {
        body = body.replace(re, `{{${key}}}`);
      }
    }
    const options = slotDraft.options.split(",").map(s => s.trim()).filter(Boolean);
    const newSlot = { key, label: slotDraft.label.trim(), question: slotDraft.question.trim() || slotDraft.label.trim() + "?", mandatory: slotDraft.mandatory, default: sel.text, ocrHints: slotDraft.ocrHints.split(",").map(s => s.trim()).filter(Boolean), options };
    setForm(f => ({ ...f, sampleBody: body, slots: [...f.slots, newSlot] }));
    setSel(null); setSlotDraft(null);
  };

  const removeSlot = (key) => {
    // turn every {{key}} occurrence (global blanks have several) back into its default text
    const s = form.slots.find(x => x.key === key);
    setForm(f => ({ ...f, sampleBody: f.sampleBody.split(`{{${key}}}`).join(s?.default || ""), slots: f.slots.filter(x => x.key !== key) }));
  };

  const handleFile = async (file) => {
    const text = file.type === "application/pdf" ? await extractPdfTextQuick(file) : await file.text();
    setForm(f => ({ ...f, sampleBody: text }));
  };

  const [aiFinding, setAiFinding] = useState(false);
  const [aiFindError, setAiFindError] = useState("");
  // AI reads the pasted summary and proposes the question set — user reviews/removes chips after.
  const aiFindQuestions = async () => {
    if (!form.sampleBody.trim() || !apiKey) return;
    setAiFinding(true); setAiFindError("");
    try {
      const prompt = `Analyze this real hospital discharge summary. Identify the PATIENT-SPECIFIC values that would change for every new patient (sex, dates, times, weights, lab values, delivery mode, gravida, durations, follow-up dates). Do NOT mark fixed boilerplate.

SUMMARY:
${form.sampleBody.slice(0, 6000)}

Return ONLY valid JSON:
{"slots":[{"find":"EXACT text copied verbatim from the summary","label":"short label","question":"Question to ask?","options":["opt1","opt2"],"global":true|false}]}

Rules:
- "find" must be an EXACT substring of the summary (copy it character-for-character) — it will be replaced programmatically
- options: only for true either/or choices (male/female, NVD/LSCS, term/preterm); otherwise []
- global:true only when the same value genuinely recurs and should be answered once (e.g. sex)
- 5-15 slots. No markdown.`;
      let raw = "";
      await callAIStream([{ role: "user", content: prompt }],
        "You are a clinical template annotator. Output only valid JSON.", provider, apiKey, t => { raw = t; });
      const parsed = parseJSON(raw);
      if (!parsed?.slots?.length) { setAiFindError("AI could not identify questions — try selecting text manually."); return; }
      let body = form.sampleBody;
      const newSlots = [];
      for (const s of parsed.slots) {
        if (!s.find || !body.includes(s.find)) continue;
        const key = (s.label || s.find).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24) + "_" + Math.random().toString(36).slice(2, 4);
        body = s.global ? body.split(s.find).join(`{{${key}}}`) : body.replace(s.find, `{{${key}}}`);
        newSlots.push({ key, label: s.label || s.find, question: s.question || (s.label || s.find) + "?", mandatory: false, default: s.find, ocrHints: [], options: Array.isArray(s.options) ? s.options : [] });
      }
      if (!newSlots.length) { setAiFindError("AI's suggestions didn't match the text exactly — try manual selection."); return; }
      setForm(f => ({ ...f, sampleBody: body, slots: [...f.slots, ...newSlots] }));
    } catch (e) { setAiFindError(e.message); }
    finally { setAiFinding(false); }
  };

  const save = () => {
    const now = new Date().toISOString();
    onSave({ ...form, source: "private", id: form.id || (form.name || "template").toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(), createdAt: form.createdAt || now, editedAt: now });
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{template ? `Edit: ${template.name}` : "Create Template"}</h2>
          <button onClick={onClose} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>

        <div style={{ background: PURPLE.bg, border: `1px solid ${PURPLE.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: PURPLE.text, marginBottom: 16 }}>
          Paste one of your <strong>real discharge summaries</strong> below. Then <strong>select any words that change per patient</strong> (a value, the age, a duration) and click <strong>“+ Make blank”</strong>. Everything you don't mark stays fixed and prints exactly as written.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <input style={inputS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Template name (e.g. Neonatal Jaundice)" />
          <input style={inputS} value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))} placeholder="Diagnosis" />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Btn small variant="secondary" onClick={() => fileRef.current?.click()}>Upload .txt / .pdf</Btn>
          <input ref={fileRef} type="file" accept=".txt,.pdf" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ""; }} />
          <Btn small onClick={beginSlot} disabled={!sel}>+ Make blank {sel ? `("${sel.text.slice(0, 20)}${sel.text.length > 20 ? "…" : ""}")` : "(select text first)"}</Btn>
          <Btn small variant="secondary" onClick={aiFindQuestions} disabled={!form.sampleBody.trim() || !apiKey || aiFinding}
            title={!apiKey ? "Needs an API key" : ""}>
            {aiFinding ? "✨ Analyzing…" : "✨ AI: find the questions"}
          </Btn>
        </div>
        {aiFindError && <p style={{ fontSize: 12, color: RED.primary, margin: "0 0 8px" }}>{aiFindError}</p>}

        <textarea ref={bodyRef} value={form.sampleBody} onSelect={captureSelection}
          onChange={e => setForm(f => ({ ...f, sampleBody: e.target.value }))}
          placeholder="Paste your discharge summary here…"
          style={{ ...inputS, minHeight: 300, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.7, resize: "vertical" }} />

        {slotDraft && (
          <div style={{ background: PURPLE.bg, border: `1px solid ${PURPLE.border}`, borderRadius: 10, padding: 14, marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Make "{sel?.text}" a blank</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input style={inputS} autoFocus value={slotDraft.label} onChange={e => setSlotDraft(s => ({ ...s, label: e.target.value }))} placeholder="Label, e.g. TSB at admission" />
              <input style={inputS} value={slotDraft.ocrHints} onChange={e => setSlotDraft(s => ({ ...s, ocrHints: e.target.value }))} placeholder="OCR hints (optional): tsb, bilirubin" />
            </div>
            <input style={inputS} value={slotDraft.question} onChange={e => setSlotDraft(s => ({ ...s, question: e.target.value }))} placeholder="Question to ask (optional), e.g. Sex?" />
            <input style={inputS} value={slotDraft.options} onChange={e => setSlotDraft(s => ({ ...s, options: e.target.value }))} placeholder="Answer options (optional, comma-sep) — e.g. male, female. Leave blank for free text." />
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
              <input type="checkbox" checked={slotDraft.mandatory} onChange={e => setSlotDraft(s => ({ ...s, mandatory: e.target.checked }))} /> Mandatory (always ask)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn small onClick={confirmSlot} disabled={!slotDraft.label.trim()}>Add blank</Btn>
              <Btn small variant="ghost" onClick={() => setSlotDraft(null)}>Cancel</Btn>
            </div>
          </div>
        )}

        {form.slots.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", margin: "0 0 8px" }}>BLANKS ({form.slots.length})</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {form.slots.map(s => (
                <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 16, background: s.mandatory ? PURPLE.bg : "var(--color-background-secondary)", color: s.mandatory ? PURPLE.primary : "var(--color-text-secondary)", border: `1px solid ${s.mandatory ? PURPLE.border : "var(--color-border-primary)"}` }}>
                  {s.mandatory && "★ "}{s.label} <button onClick={() => removeSlot(s.key)} style={{ background: "none", border: "none", color: RED.primary, cursor: "pointer", padding: 0, fontSize: 12 }}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--color-border-primary)" }}>
          <Btn variant="ghost" onClick={onClose} small>Cancel</Btn>
          <Btn onClick={save} disabled={!form.name || !form.sampleBody.trim()}>Save Template</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Template Library ───────────────────────────────────────────────────────────
function TemplateLibrary({ customTemplates, onEdit, onSelect, onStartAiMode, hasKey }) {
  const [tab, setTab] = useState("System");
  const [aiComplaint, setAiComplaint] = useState("");
  const source = tab === "System" ? SYSTEM_TEMPLATES : tab === "AI" ? [] : customTemplates.filter(t => t.source === (tab === "Private" ? "private" : "community"));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Template Library</h3>
        {tab !== "AI" && <Btn small onClick={() => onEdit(null)}>+ New Template</Btn>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["System", "Private", "Community", "AI"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
            borderColor: tab === t ? (t === "AI" ? "#5B5BDB" : PURPLE.primary) : "var(--color-border-primary)",
            background: tab === t ? (t === "AI" ? "#1E1E2E" : PURPLE.bg) : "#fff",
            color: tab === t ? (t === "AI" ? "#A5A5FF" : PURPLE.primary) : "var(--color-text-secondary)" }}>{t === "AI" ? "✨ AI Mode" : t}</button>
        ))}
      </div>
      {tab === "AI" ? (
        <div style={{ background: "linear-gradient(135deg,#1E1E2E,#2A1A4E)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#E0E0FF", margin: 0 }}>✨ No template? Let AI draft one.</p>
          <p style={{ fontSize: 12, color: "#9090C0", margin: 0 }}>Type the diagnosis — AI drafts a typical summary instantly; refine with photos or notes.</p>
          <input value={aiComplaint} onChange={e => setAiComplaint(e.target.value)} placeholder="e.g. Nephrotic syndrome relapse"
            style={{ padding: "9px 12px", border: "1.5px solid #5B5BDB", borderRadius: 8, fontSize: 14, outline: "none", background: "rgba(255,255,255,0.07)", color: "#E0E0FF", boxSizing: "border-box" }} />
          {!hasKey && <p style={{ fontSize: 11, color: "#5050A0", margin: 0 }}>⚠ Requires an API key in ⚙️ Settings</p>}
          <Btn disabled={!aiComplaint.trim() || !hasKey} onClick={() => onStartAiMode(aiComplaint.trim())} style={{ background: hasKey ? "#5B5BDB" : "#3A3A6A", color: "#fff", alignSelf: "flex-start" }}>
            {!hasKey ? "⚠ Add API Key First" : "✨ Draft it →"}
          </Btn>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10, maxHeight: 400, overflowY: "auto" }}>
          {source.map(t => (
            <div key={t.id} onClick={() => onSelect(t)} style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 10, padding: 14, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>{t.name}</p>
                <button onClick={e => { e.stopPropagation(); onEdit(t); }} title={t.source === "system" ? "Edit a copy in your Private templates" : "Edit"}
                  style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>✏️</button>
              </div>
              <span style={{ fontSize: 11, color: PURPLE.text, background: PURPLE.bg, padding: "2px 6px", borderRadius: 4 }}>{t.category}</span>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "8px 0 0" }}>{(t.slots || []).length} blanks to fill</p>
            </div>
          ))}
          {!source.length && <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>No templates here yet.</p>}
        </div>
      )}
    </div>
  );
}

// ─── Fill Screen — the living document with editable blanks + multi-image autofill ─
function FillScreen({ template: rawTemplate, provider, apiKey, onCancel, onSaveAsTemplate }) {
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
  const [customInfo, setCustomInfo] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const recRef = useRef(null);
  const consumed = useRef(new Set());

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

  const emptyMandatory = template.slots.filter(s => s.mandatory && !values[s.key]);

  const saveAsTemplate = async () => {
    // The finished text becomes a new private template's sampleBody (slots carried over)
    setSavingTemplate(true);
    try { onSaveAsTemplate({ ...template, id: "", name: template.name + " (copy)", source: "private", sampleBody: finalText(), slots: [] }); }
    finally { setSavingTemplate(false); }
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 2px" }}>{template.name}</h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>The summary is already written — just fill the highlighted blanks (or upload photos to auto-fill)</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" small onClick={() => navigator.clipboard?.writeText(finalText())}>Copy</Btn>
          <Btn variant="ghost" small onClick={onCancel}>Close</Btn>
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
                placeholder={voiceOn ? "Listening…" : "Patient details in your own words…"}
                style={{ ...inputS, minHeight: 52, resize: "vertical", flex: 1, fontSize: 13 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={voiceOn ? () => { recRef.current?.stop(); setVoiceOn(false); } : startVoice}
                  style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
                    border: `1.5px solid ${voiceOn ? RED.primary : "var(--color-border-primary)"}`, background: voiceOn ? RED.bg : "#fff", color: voiceOn ? RED.primary : "var(--color-text-secondary)" }}>
                  🎙 {voiceOn ? "Stop" : "Speak"}
                </button>
                <Btn small onClick={() => runAutofill(customInfo)} disabled={!apiKey || autofilling || (!customInfo.trim() && !docs.some(d => d.status === "done"))}>
                  ✨ Fill
                </Btn>
              </div>
            </div>
          </>
        )}
      </Card>

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

      {/* Fill-in panel — questions above (chips for option-blanks), summary below */}
      {template.slots.length > 0 && (
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>✍️ Fill in</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                          style={{ padding: "6px 14px", borderRadius: 18, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                            borderColor: val === opt ? PURPLE.primary : "var(--color-border-primary)", background: val === opt ? PURPLE.bg : "#fff", color: val === opt ? PURPLE.primary : "var(--color-text-secondary)" }}>
                          {opt}
                        </button>
                      ))}
                      <input value={s.options.includes(val) ? "" : val} onChange={e => setVal(s.key, e.target.value)}
                        placeholder="or type…" style={{ ...inputS, fontSize: 13, width: 140, padding: "6px 10px" }} />
                    </div>
                  ) : (
                    <input value={val} onChange={e => setVal(s.key, e.target.value)} placeholder={s.default || s.label}
                      style={{ ...inputS, fontSize: 13, borderColor: un ? AMBER.border : "var(--color-border-primary)", background: un ? AMBER.bg : "#fff" }} />
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* The living document (summary below) */}
      <Card style={{ padding: 20 }}>
        {editing ? (
          <textarea value={editText} onChange={e => setEditText(e.target.value)}
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
                  style={{ width: width + "ch", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, textAlign: "center",
                    padding: "1px 4px", margin: "0 1px", borderRadius: 5, outline: "none",
                    border: `1.5px solid ${un ? AMBER.primary : val ? TEAL.border : PURPLE.border}`,
                    background: un ? AMBER.bg : val ? "#fff" : PURPLE.bg, color: un ? AMBER.text : PURPLE.primary }} />
              );
            })}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn variant="secondary" small onClick={() => { if (!editing) setEditText(finalText()); setEditing(v => !v); }}>
          {editing ? "Done editing" : "✏️ Edit full text"}
        </Btn>
        <Btn variant="secondary" small onClick={saveAsTemplate} disabled={savingTemplate}>💾 Save as new template</Btn>
      </div>

      <SafetyCheckPanel getText={finalText} diagnosis={template.diagnosis} provider={provider} apiKey={apiKey} />
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
  const recRef = useRef(null);
  const reportsText = () => docs.filter(d => d.status === "done").map(d => d.ocrText).join("\n\n").slice(0, 3000);

  const generate = async () => {
    setLoading(true); setError("");
    try { const d = await composeTypicalDraft(complaint, { patient, reportsText: reportsText(), exceptions }, provider, apiKey); setText(d || ""); if (!d) setError("Could not generate — tap to retry."); }
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

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 2px" }}>✨ {complaint}</h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Typical draft — refine only what's different</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" small onClick={() => navigator.clipboard?.writeText(text)} disabled={loading}>Copy</Btn>
          <Btn small onClick={onDone} disabled={loading}>Finish</Btn>
          <Btn variant="ghost" small onClick={onCancel}>Cancel</Btn>
        </div>
      </div>
      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12 }}>
          <input value={patient} onChange={e => setPatient(e.target.value)} placeholder="Patient — name, age, sex" style={inputS} />
          <Btn small variant="secondary" onClick={() => setShowScan(v => !v)}>📷 {docs.length ? `Reports (${docs.length})` : "Scan report"}</Btn>
        </div>
        {showScan && <div style={{ marginBottom: 12 }}><DocumentIntake docs={docs} setDocs={setDocs} provider={provider} apiKey={apiKey} /></div>}
        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Anything different about this patient?</label>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea value={exceptions} onChange={e => setExceptions(e.target.value)} placeholder="e.g. one episode of melena on day 3" style={{ ...inputS, minHeight: 52, resize: "vertical", flex: 1 }} />
          <button onClick={voiceOn ? () => { recRef.current?.stop(); setVoiceOn(false); } : startVoice}
            style={{ padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, border: `1.5px solid ${voiceOn ? RED.primary : "var(--color-border-primary)"}`, background: voiceOn ? RED.bg : "#fff", color: voiceOn ? RED.primary : "var(--color-text-secondary)" }}>🎙 {voiceOn ? "Stop" : "Speak"}</button>
        </div>
        <div style={{ marginTop: 10 }}><Btn small onClick={generate} disabled={loading}>{loading ? "Generating…" : "↻ Regenerate"}</Btn></div>
      </Card>
      <Card style={{ padding: 20 }}>
        {loading ? <p style={{ fontSize: 14, color: "var(--color-text-secondary)", textAlign: "center", padding: 40 }}>✨ Drafting…</p>
          : error ? <div><p style={{ fontSize: 14, color: AMBER.text, margin: "0 0 12px" }}>{error}</p><Btn small onClick={generate}>Retry</Btn></div>
          : editing ? <textarea value={text} onChange={e => setText(e.target.value)} style={{ width: "100%", minHeight: 440, border: "none", outline: "none", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, resize: "vertical" }} />
          : <pre style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", margin: 0 }}>{text}</pre>}
      </Card>
      {!loading && !error && <Btn variant="secondary" small onClick={() => setEditing(v => !v)}>{editing ? "Done editing" : "✏️ Edit"}</Btn>}
      {!loading && !error && <SafetyCheckPanel getText={() => text} diagnosis={complaint} provider={provider} apiKey={apiKey} />}
    </div>
  );
}

// ─── SuperSummary root ──────────────────────────────────────────────────────────
export default function SuperSummary({ provider, apiKey, setSettingsOpen }) {
  const [phase, setPhase] = useState("library"); // library | fill | ai
  const [customTemplates, setCustomTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem("clinicalmind:templates") || "[]"); } catch { return []; }
  });
  const [editing, setEditing] = useState(undefined);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [aiComplaint, setAiComplaint] = useState("");

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

  return (
    <div style={{ minHeight: "100vh" }}>
      {phase === "library" && (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
          {!apiKey && (
            <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>📴</span>
              <p style={{ fontSize: 14, color: AMBER.text, margin: 0 }}>
                <strong>No API key.</strong> Templates fill instantly by hand; photo auto-fill, AI Mode & Safety Check need a key.{" "}
                <button onClick={() => setSettingsOpen(true)} style={{ background: "none", border: "none", color: PURPLE.primary, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 14, padding: 0 }}>Add API key →</button>
              </p>
            </div>
          )}
          <Card>
            <TemplateLibrary customTemplates={customTemplates} onEdit={openEdit} hasKey={!!apiKey}
              onSelect={t => { setActiveTemplate(t); setPhase("fill"); }}
              onStartAiMode={c => { setAiComplaint(c); setPhase("ai"); }} />
          </Card>
        </div>
      )}

      {phase === "fill" && activeTemplate && (
        <FillScreen template={activeTemplate} provider={provider} apiKey={apiKey}
          onCancel={() => { setPhase("library"); setActiveTemplate(null); }}
          onSaveAsTemplate={t => saveTemplate(t)} />
      )}

      {phase === "ai" && (
        <AIModeScreen complaint={aiComplaint} provider={provider} apiKey={apiKey}
          onCancel={() => { setPhase("library"); setAiComplaint(""); }}
          onDone={() => { setPhase("library"); setAiComplaint(""); }} />
      )}

      {editing !== undefined && (
        <TemplateEditor template={editing} onSave={saveTemplate} onClose={() => setEditing(undefined)} provider={provider} apiKey={apiKey} />
      )}
    </div>
  );
}
