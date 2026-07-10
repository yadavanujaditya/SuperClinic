import { useState } from "react";
import { publishTemplate as apiPublishTemplate, listCommunityTemplates, rateTemplate } from "./community.js";
import { CommunityBrowserModal } from "./CommunityBrowserModal.jsx";
import { AMBER, PURPLE, Btn, Card } from "./SuperSummaryShared.jsx";
import { AiModeCard } from "./AiModeCard.jsx";
import { TemplateLibrary } from "./TemplateLibrary.jsx";
import { TemplateEditor } from "./TemplateEditor.jsx";
import { FillScreen } from "./FillScreen.jsx";
import { SuperFastAiWizard } from "./SuperFastAiWizard.jsx";
import { AIModeScreen } from "./AIModeScreen.jsx";

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
