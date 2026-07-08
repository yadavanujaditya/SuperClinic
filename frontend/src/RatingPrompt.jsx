import { useState } from "react";
import { submitRating } from "./records.js";

const TEAL = { primary: "#0d9488" };

export function RatingPrompt({ recordType, recordId, onDismiss }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!stars) return;
    await submitRating({ record_type: recordType, record_id: recordId, stars, comment: comment.trim() || undefined }).catch(() => {});
    setSubmitted(true);
    setTimeout(onDismiss, 1400);
  };

  return (
    <div data-testid="rating-prompt" style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 250, background: "#fff", borderRadius: 16,
      boxShadow: "0 12px 36px rgba(0,0,0,0.18)", padding: 18, width: 300, border: "1px solid var(--color-border-primary)",
    }}>
      {submitted ? (
        <p data-testid="rating-prompt-thanks" style={{ fontSize: 14, fontWeight: 700, color: TEAL.primary, margin: 0, textAlign: "center", padding: "10px 0" }}>
          🙏 Thanks for your feedback!
        </p>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0 }}>How was this {recordType === "summary" ? "discharge summary" : "consultation"}?</p>
            <button data-testid="rating-prompt-dismiss-btn" onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "var(--color-text-secondary)", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} data-testid={`rating-star-${n}`} onClick={() => setStars(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, padding: 0, color: (hover || stars) >= n ? "#f59e0b" : "#e2e8f0" }}>
                ★
              </button>
            ))}
          </div>
          <textarea data-testid="rating-prompt-comment" value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional comment…"
            style={{ width: "100%", minHeight: 50, padding: "8px 10px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 12.5, outline: "none", resize: "none", boxSizing: "border-box", fontFamily: "var(--font-sans)", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button data-testid="rating-prompt-submit-btn" onClick={submit} disabled={!stars}
              style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: stars ? TEAL.primary : "#a7f3d0", color: "#fff", fontWeight: 700, fontSize: 13, cursor: stars ? "pointer" : "not-allowed" }}>
              Submit
            </button>
            <button data-testid="rating-prompt-skip-btn" onClick={onDismiss}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid var(--color-border-primary)", background: "#fff", color: "var(--color-text-secondary)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
