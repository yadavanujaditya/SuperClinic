import { useState } from "react";
import { callAIStream, parseJSON } from "./api.js";
import { TEAL, AMBER, RED, Card, Btn } from "./SuperSummaryShared.jsx";

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
export function SafetyCheckPanel({ getText, diagnosis, provider, apiKey }) {
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
