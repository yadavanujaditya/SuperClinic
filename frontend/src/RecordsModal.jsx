import { useEffect, useState } from "react";
import { listMySummaries, listMyCases, deleteSummaryRecord, deleteCaseRecord } from "./records.js";

const TEAL = { primary: "#0d9488", bg: "#f0fdfa", border: "#99f6e4", text: "#0f766e" };
const PURPLE = { primary: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" };

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export function RecordsModal({ onClose }) {
  const [tab, setTab] = useState("summaries");
  const [summaries, setSummaries] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    Promise.all([listMySummaries().catch(() => []), listMyCases().catch(() => [])])
      .then(([s, c]) => { setSummaries(s); setCases(c); })
      .finally(() => setLoading(false));
  }, []);

  const removeSummary = async (id) => {
    await deleteSummaryRecord(id).catch(() => {});
    setSummaries(prev => prev.filter(s => s.id !== id));
  };
  const removeCase = async (id) => {
    await deleteCaseRecord(id).catch(() => {});
    setCases(prev => prev.filter(c => c.id !== id));
  };

  const items = tab === "summaries" ? summaries : cases;

  return (
    <div data-testid="records-modal-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 640, maxHeight: "85vh", overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>📁 My Records</h2>
          <button data-testid="records-modal-close-btn" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "14px 24px 0" }}>
          <button data-testid="records-tab-summaries" onClick={() => setTab("summaries")} style={{ padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
            borderColor: tab === "summaries" ? PURPLE.primary : "var(--color-border-primary)", background: tab === "summaries" ? PURPLE.bg : "#fff", color: tab === "summaries" ? PURPLE.primary : "var(--color-text-secondary)" }}>
            Discharge Summaries ({summaries.length})
          </button>
          <button data-testid="records-tab-cases" onClick={() => setTab("cases")} style={{ padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
            borderColor: tab === "cases" ? TEAL.primary : "var(--color-border-primary)", background: tab === "cases" ? TEAL.bg : "#fff", color: tab === "cases" ? TEAL.primary : "var(--color-text-secondary)" }}>
            Clinical Cases ({cases.length})
          </button>
        </div>
        <div style={{ padding: "16px 24px 24px", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 30 }}>Loading…</p>
          ) : items.length === 0 ? (
            <p data-testid="records-empty-state" style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 30 }}>
              Nothing saved here yet — {tab === "summaries" ? "generate a discharge summary" : "finish a consultation"} to see it appear.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map(item => {
                const isSummary = tab === "summaries";
                const isOpen = expanded === item.id;
                return (
                  <div key={item.id} data-testid={`record-item-${item.id}`} style={{ border: "1.5px solid var(--color-border-primary)", borderRadius: 12, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : item.id)}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 3px" }}>{isSummary ? item.diagnosis : item.complaint}</p>
                        <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>
                          {fmtDate(item.created_at)}{isSummary && item.template_name ? ` · ${item.template_name}` : ""}{!isSummary && item.age ? ` · ${item.age}, ${item.sex}` : ""}
                        </p>
                      </div>
                      <button data-testid={`record-delete-${item.id}`} onClick={e => { e.stopPropagation(); isSummary ? removeSummary(item.id) : removeCase(item.id); }}
                        style={{ fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "#dc2626", flexShrink: 0 }}>🗑️</button>
                    </div>
                    {isOpen && (
                      <pre data-testid={`record-detail-${item.id}`} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border-primary)", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: 260, overflowY: "auto" }}>
                        {isSummary ? item.text : item.note_text}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
