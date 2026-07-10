import { useState, useRef, useEffect } from "react";
import { callAIStream } from "./api.js";
import { saveSummaryRecord } from "./records.js";
import { RatingPrompt } from "./RatingPrompt.jsx";
import { AMBER, RED, Btn, Card, inputS } from "./SuperSummaryShared.jsx";
import { DocumentIntake } from "./DocumentIntake.jsx";
import { SafetyCheckPanel } from "./SafetyCheckPanel.jsx";

export function AIModeScreen({ complaint, provider, apiKey, onCancel, onDone }) {
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

