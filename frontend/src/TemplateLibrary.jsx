import { useState, useEffect } from "react";
import { SYSTEM_TEMPLATES } from "./templates.js";
import { IllustDocs, IllustScan, IllustSafety } from "./HomeHero.jsx";
import { PURPLE, Btn } from "./SuperSummaryShared.jsx";

// ─── How-to-use explainer carousel — image + caption rotate together ──────────
const HOWTO_STEPS = [
  { Illust: IllustDocs, title: "1. Paste a real summary", body: "Start from a discharge summary you've actually written — that becomes your template." },
  { Illust: IllustScan, title: "2. Mark blanks, or just scan", body: "Highlight the words that change per patient, or snap report photos and let AI find them." },
  { Illust: IllustSafety, title: "3. Generate & review", body: "The draft fills in seconds. AI Safety Check flags anything that needs a second look." },
];
function HowToUseCarousel() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(v => (v + 1) % HOWTO_STEPS.length), 3400); return () => clearInterval(t); }, []);
  const { Illust, title, body } = HOWTO_STEPS[i];
  return (
    <div style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 14, overflow: "hidden", display: "flex", flexWrap: "wrap" }}>
      <div style={{ width: 180, flexShrink: 0, background: PURPLE.bg }}>
        <div style={{ height: 130 }}><Illust /></div>
      </div>
      <div style={{ flex: 1, minWidth: 200, padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: PURPLE.primary, letterSpacing: 0.5, margin: "0 0 4px" }}>HOW TEMPLATES WORK</p>
        <p style={{ fontSize: 15, fontWeight: 800, margin: "0 0 4px" }}>{title}</p>
        <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {HOWTO_STEPS.map((_, n) => (
            <span key={n} data-testid={`howto-step-dot-${n}`} onClick={() => setI(n)} style={{ width: n === i ? 18 : 6, height: 6, borderRadius: 4, background: n === i ? PURPLE.primary : "var(--color-border-primary)", cursor: "pointer", transition: "all 0.3s" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Template Library ───────────────────────────────────────────────────────────
export function TemplateLibrary({ customTemplates, onEdit, onDelete, onSelect, onPublish, onBrowseCommunity }) {
  const [tab, setTab] = useState("System Template");
  const source = tab === "System Template" ? SYSTEM_TEMPLATES : customTemplates.filter(t => t.source === "private");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <HowToUseCarousel />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Template Library</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button data-testid="browse-community-templates-btn" onClick={onBrowseCommunity}
            style={{ fontSize: 12.5, fontWeight: 700, color: PURPLE.primary, background: PURPLE.bg, border: `1px solid ${PURPLE.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
            🌐 Community
          </button>
          <Btn testId="new-template-btn" small onClick={() => onEdit(null)}>+ New Template</Btn>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["System Template", "My Templates"].map(t => (
          <button key={t} data-testid={`template-tab-${t.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => setTab(t)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
            borderColor: tab === t ? PURPLE.primary : "var(--color-border-primary)",
            background: tab === t ? PURPLE.bg : "#fff",
            color: tab === t ? PURPLE.primary : "var(--color-text-secondary)" }}>{t}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10, maxHeight: 400, overflowY: "auto" }}>
        {source.map(t => (
          <div key={t.id} data-testid={`template-card-${t.id}`} onClick={() => onSelect(t)} style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 10, padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 6px" }}>{t.name}</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {tab === "My Templates" && (
                  <button onClick={e => { e.stopPropagation(); onPublish(t); }} title="Publish to Community"
                    data-testid={`template-publish-${t.id}`}
                    style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>🌐</button>
                )}
                <button onClick={e => { e.stopPropagation(); onEdit(t); }} title={t.source === "system" ? "Edit a copy in My Templates" : "Edit"}
                  data-testid={`template-edit-${t.id}`}
                  style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>✏️</button>
                {t.source !== "system" && (
                  <button onClick={e => {
                    e.stopPropagation();
                    if (window.confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
                      onDelete(t.id);
                    }
                  }} title="Delete" data-testid={`template-delete-${t.id}`} style={{ fontSize: 12, background: "none", border: "none", cursor: "pointer", padding: 0 }}>🗑️</button>
                )}
              </div>
            </div>
            <span style={{ fontSize: 11, color: PURPLE.text, background: PURPLE.bg, padding: "2px 6px", borderRadius: 4 }}>{t.category}</span>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "8px 0 0" }}>{(t.slots || []).length} blanks to fill</p>
          </div>
        ))}
        {!source.length && <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>No templates here yet.</p>}
      </div>
    </div>
  );
}

