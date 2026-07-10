import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { PROVIDERS, getProvider, getGenericInstructions, getDetailedInstructions } from "./api.js";
import { TEAL, AMBER, RED, PURPLE } from "./theme.js";
import { Btn } from "./UIPrimitives.jsx";

// ─── Settings Panel ───────────────────────────────────────────────────────────
export function SettingsPanel({ open, onClose, provider, setProvider, currentKey, setCurrentKey }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const API_URL = import.meta.env.REACT_APP_BACKEND_URL;

  const [genericInst, setGenericInst] = useState("");
  const [detailedInst, setDetailedInst] = useState("");
  const [saved, setSaved] = useState(false);

  // Admin AI-config state
  const [aiConfig, setAiConfig] = useState({ configured: false, provider: null, masked_key: null });
  const [aiProviderDraft, setAiProviderDraft] = useState("claude");
  const [aiKeyDraft, setAiKeyDraft] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSavedMsg, setAiSavedMsg] = useState(false);

  useEffect(() => {
    setGenericInst(getGenericInstructions());
    setDetailedInst(getDetailedInstructions());
    if (open && isAdmin) {
      fetch(`${API_URL}/api/admin/ai-config`, { credentials: "include" })
        .then(r => r.json())
        .then(data => { setAiConfig(data); setAiProviderDraft(data.provider || "claude"); })
        .catch(() => {});
    }
  }, [open, isAdmin]);

  const saveAiConfig = async () => {
    setAiError(""); setAiSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/ai-config`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: aiProviderDraft, api_key: aiKeyDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save");
      setAiConfig(data);
      setAiKeyDraft("");
      setAiSavedMsg(true);
      setTimeout(() => setAiSavedMsg(false), 2000);
      setCurrentKey(); // trigger sibling refresh of AI status for all users
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiSaving(false);
    }
  };

  const removeAiConfig = async () => {
    if (!window.confirm("Remove the AI key? Users will lose access to AI features until a new key is added.")) return;
    await fetch(`${API_URL}/api/admin/ai-config`, { method: "DELETE", credentials: "include" });
    setAiConfig({ configured: false, provider: null, masked_key: null });
    setCurrentKey();
  };

  const saveInstructions = () => {
    localStorage.setItem("clinicalmind:instructions:generic", genericInst);
    localStorage.setItem("clinicalmind:instructions:detailed", detailedInst);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputS = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box" };

  return (
    <>
      {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 99 }} />}
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 380, background: "#fff",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", zIndex: 100, padding: 28, overflowY: "auto",
        transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s ease",
        display: "flex", flexDirection: "column", gap: 24 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Settings</h2>
          <button data-testid="settings-close-btn" onClick={onClose} style={{ fontSize: 20, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>

        {/* AI key — admin manages centrally, regular users just see status */}
        {isAdmin ? (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>
              AI Provider &amp; Key <span style={{ fontWeight: 400, color: PURPLE.primary }}>(Admin only)</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {PROVIDERS.map(pr => (
                <button key={pr.id} data-testid={`settings-provider-${pr.id}-btn`} onClick={() => setAiProviderDraft(pr.id)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)",
                    border: `1.5px solid ${aiProviderDraft === pr.id ? TEAL.primary : "var(--color-border-primary)"}`,
                    background: aiProviderDraft === pr.id ? TEAL.bg : "#fff", color: aiProviderDraft === pr.id ? TEAL.primary : "var(--color-text-primary)" }}>
                  <span>{pr.name}</span>
                  {aiConfig.configured && aiConfig.provider === pr.id && <span style={{ fontSize: 11, background: TEAL.primary, color: "#fff", padding: "2px 7px", borderRadius: 10 }}>✓ Active</span>}
                </button>
              ))}
            </div>
            {aiConfig.configured && (
              <p data-testid="settings-current-masked-key" style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 8px", fontFamily: "var(--font-mono)" }}>
                Current key: {aiConfig.masked_key} (hidden — not shown in full for security)
              </p>
            )}
            <input data-testid="settings-api-key-input" type="password" value={aiKeyDraft} onChange={e => setAiKeyDraft(e.target.value)}
              placeholder={getProvider(aiProviderDraft).keyHint}
              style={{ ...inputS, marginBottom: 8 }} />
            {aiError && <p data-testid="settings-key-error-msg" style={{ fontSize: 12, color: RED.primary, margin: "0 0 8px" }}>{aiError}</p>}
            {aiSavedMsg && <p data-testid="settings-key-saved-msg" style={{ fontSize: 12, color: TEAL.primary, margin: "0 0 8px" }}>✓ Saved successfully</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Btn testId="settings-save-key-btn" onClick={saveAiConfig} disabled={!aiKeyDraft.trim() || aiSaving} small>{aiSaving ? "Saving…" : "Save Key"}</Btn>
              {aiConfig.configured && (
                <button data-testid="settings-remove-key-btn" onClick={removeAiConfig}
                  style={{ fontSize: 12, color: RED.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  Remove key
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: currentKey ? TEAL.bg : AMBER.bg, border: `1px solid ${currentKey ? TEAL.border : AMBER.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <p data-testid="settings-ai-status-readonly" style={{ fontSize: 13, color: currentKey ? TEAL.text : AMBER.text, margin: 0, lineHeight: 1.6 }}>
              {currentKey
                ? `✅ AI is enabled — managed centrally by your administrator (${getProvider(provider).name}).`
                : "⚠️ AI features aren't configured yet. Ask your administrator to add an API key."}
            </p>
          </div>
        )}

        {/* Personal AI prompt customization — stored locally per-browser, available to any user */}
        <div style={{ borderTop: "1px solid var(--color-border-primary)", paddingTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: TEAL.primary }}>Customize AI Instructions</h3>
          
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Generic Mode Instructions</label>
            <textarea
              data-testid="settings-generic-instructions-textarea"
              value={genericInst}
              onChange={e => setGenericInst(e.target.value)}
              rows={8}
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", resize: "vertical" }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Detailed Mode Instructions</label>
            <textarea
              data-testid="settings-detailed-instructions-textarea"
              value={detailedInst}
              onChange={e => setDetailedInst(e.target.value)}
              rows={8}
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Btn testId="settings-save-instructions-btn" onClick={saveInstructions} small>Save Instructions</Btn>
            <button
              data-testid="settings-reset-instructions-btn"
              onClick={() => {
                if (window.confirm("Are you sure you want to reset instructions to default?")) {
                  localStorage.removeItem("clinicalmind:instructions:generic");
                  localStorage.removeItem("clinicalmind:instructions:detailed");
                  setGenericInst(getGenericInstructions());
                  setDetailedInst(getDetailedInstructions());
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                }
              }}
              style={{ background: "none", border: "none", color: RED.primary, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 500 }}
            >
              Reset to Default
            </button>
          </div>
        </div>

        <div style={{ background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <p style={{ fontSize: 13, color: TEAL.text, margin: 0, lineHeight: 1.6 }}>
            <strong>No API key needed</strong> for built-in complaints. The 10 prebuilt workflows run entirely offline — AI is optional for enrichment.
          </p>
        </div>

        <div style={{ borderTop: "1px solid var(--color-border-primary)", paddingTop: 20 }}>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            <strong>ClinicFlow</strong><br />
            Built for doctors in Indian OPDs.<br /><br />
            All processing is local. Your patient data never leaves your device.
          </p>
        </div>
      </div>
    </>
  );
}
