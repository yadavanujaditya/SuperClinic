import { useState, useRef, useEffect } from "react";
import { Btn, inputS } from "./SuperSummaryShared.jsx";

export function SaveAsTemplateModal({ defaultName = "", existingTemplates = [], onConfirm, onClose }) {
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
