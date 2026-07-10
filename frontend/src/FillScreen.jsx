import { useState, useRef, useEffect } from "react";
import { emptyTemplate, parseTemplateParts, fillTemplate } from "./templates.js";
import { callAIStream, parseJSON } from "./api.js";
import { saveSummaryRecord } from "./records.js";
import { RatingPrompt } from "./RatingPrompt.jsx";
import { TEAL, AMBER, RED, PURPLE, Btn, Card, inputS } from "./SuperSummaryShared.jsx";
import { DocumentIntake } from "./DocumentIntake.jsx";
import { SafetyCheckPanel } from "./SafetyCheckPanel.jsx";
import { SaveAsTemplateModal } from "./SaveAsTemplateModal.jsx";

export function FillScreen({ template: rawTemplate, provider, apiKey, onCancel, onSaveAsTemplate, existingTemplates = [], aiAssistantEnabled = true }) {
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

