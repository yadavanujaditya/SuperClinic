import { useState, useEffect } from "react";
import { getProvider, callAIStream, buildNotePrompt, generateLocalNote } from "./api.js";
import { saveCaseRecord } from "./records.js";
import { RatingPrompt } from "./RatingPrompt.jsx";
import { TEAL, RED, GRAY } from "./theme.js";
import { Btn } from "./UIPrimitives.jsx";

export function NoteScreen({ session, history, differentials, redFlags, provider, apiKey, onNewPatient }) {
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
