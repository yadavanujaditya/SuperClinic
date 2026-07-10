import { useState } from "react";
import { CardCarousel, IllustScan, IllustSafety } from "./HomeHero.jsx";
import { PURPLE, Card } from "./SuperSummaryShared.jsx";

export function AiModeCard({ hasKey, onStartAiMode, setSettingsOpen }) {
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


