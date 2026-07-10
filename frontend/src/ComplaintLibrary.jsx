import { useState, useEffect } from "react";
import { SYSTEM_COMPLAINTS } from "./complaints.js";
import { listCommunityWorkflows, rateWorkflow } from "./community.js";
import { TEAL, AMBER, CATEGORIES } from "./theme.js";
import { Btn } from "./UIPrimitives.jsx";

// ─── Complaint Library ────────────────────────────────────────────────────────
function ComplaintCard({ complaint, selected, onEdit, onSelect, onPublish }) {
  const [hov, setHov] = useState(false);
  const hasWorkflow = !!complaint.workflow;
  return (
    <div data-testid={`complaint-card-${complaint.id}`} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: selected ? TEAL.bg : "#fff", border: `1.5px solid ${selected ? TEAL.primary : hov ? TEAL.border : "var(--color-border-primary)"}`,
        borderRadius: 10, padding: 12, transition: "all 0.15s", cursor: "pointer" }}
      onClick={onSelect}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: hasWorkflow ? TEAL.primary : AMBER.primary, flexShrink: 0, marginTop: 4 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {onPublish && (
            <button data-testid={`complaint-card-${complaint.id}-publish-btn`} onClick={e => { e.stopPropagation(); onPublish(); }} title="Publish to Community"
              style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 2 }}>🌐</button>
          )}
          <button data-testid={`complaint-card-${complaint.id}-edit-btn`} onClick={e => { e.stopPropagation(); onEdit(); }}
            style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 2 }}>✏️</button>
        </div>
      </div>
      <p style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)", margin: "0 0 6px", lineHeight: 1.4 }}>{complaint.name}</p>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", padding: "2px 6px", borderRadius: 4 }}>{complaint.category}</span>
    </div>
  );
}

export function ComplaintLibrary({ selected, setSelected, onEdit, customComplaints, onModeChange, onPublish, onImport }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [tab, setTab] = useState("AI");
  const [communityItems, setCommunityItems] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [myRating, setMyRating] = useState({});

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleTab = (t) => {
    setTab(t);
    onModeChange?.(t === "AI");
    if (t === "AI") setSelected(null);
    if (t === "Community" && communityItems.length === 0) {
      setCommunityLoading(true);
      listCommunityWorkflows().then(setCommunityItems).catch(() => setCommunityItems([])).finally(() => setCommunityLoading(false));
    }
  };

  const rateCommunityItem = async (id, stars) => {
    setMyRating(prev => ({ ...prev, [id]: stars }));
    try {
      const updated = await rateWorkflow(id, stars);
      setCommunityItems(prev => prev.map(i => i.id === id ? updated : i));
    } catch { /* silent */ }
  };

  const source = tab === "System" ? SYSTEM_COMPLAINTS : tab === "AI" || tab === "Community" ? [] : customComplaints.filter(c => c.source === "private");

  const filtered = source.filter(c => {
    const matchCat = cat === "All" || c.category === cat;
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.tags || []).some(t => t.includes(q));
    return matchCat && matchSearch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: TEAL.primary }}>Complaint Library</h3>
        {tab !== "AI" && <Btn testId="complaint-library-new-btn" small onClick={() => onEdit(null)}>+ New</Btn>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["System","Private","Community","AI"].map(t => (
          <button key={t} data-testid={`complaint-library-tab-${t.toLowerCase()}-btn`} onClick={() => handleTab(t)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
            borderColor: tab === t ? (t === "AI" ? "#A855F7" : TEAL.primary) : "var(--color-border-primary)",
            background: tab === t ? (t === "AI" ? "linear-gradient(120deg,#4c1d95,#7c3aed)" : TEAL.bg) : "#fff",
            boxShadow: tab === t && t === "AI" ? "0 3px 10px rgba(124,58,237,0.35)" : "none",
            color: tab === t ? (t === "AI" ? "#F3E8FF" : TEAL.primary) : "var(--color-text-secondary)" }}>
            {t === "AI" ? "✨ AI Mode" : t}
          </button>
        ))}
      </div>

      {tab === "AI" ? (
        <div style={{ background: "linear-gradient(135deg,#1e1b3a 0%,#3b1d6e 45%,#7c3aed 85%,#a855f7 100%)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 28 }}>✨</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#E0E0FF", margin: "0 0 3px" }}>Fully AI-Controlled Mode</p>
              <p style={{ fontSize: 12, color: "#9090C0", margin: 0 }}>AI generates every question, differential, and management plan. Type the chief complaint below to start.</p>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 12 }}>
            <p style={{ fontSize: 11, color: "#7070A0", margin: "0 0 6px", fontWeight: 600, letterSpacing: 0.5 }}>HOW IT WORKS</p>
            <ul style={{ fontSize: 12, color: "#9090C0", margin: 0, paddingLeft: 16, lineHeight: 2 }}>
              <li>AI asks the most clinically relevant questions</li>
              <li>Differentials update after each answer</li>
              <li>AI decides when history is complete</li>
              <li>Generates detailed note with management plan</li>
            </ul>
          </div>
          <p style={{ fontSize: 11, color: "#5050A0", margin: 0 }}>⚠ Requires an API key in ⚙️ Settings</p>
        </div>
      ) : tab === "Community" ? (
        <div data-testid="community-workflows-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {communityLoading ? <p style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>Loading…</p>
            : communityItems.length === 0 ? <p data-testid="community-workflows-empty" style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>No custom workflows published yet — publish one from your Private tab!</p>
            : communityItems.map(item => (
              <div key={item.id} data-testid={`community-workflow-${item.id}`} style={{ border: "1.5px solid var(--color-border-primary)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 2px" }}>{item.name}</p>
                    <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>by {item.owner_name} · {item.category}</p>
                  </div>
                  <button data-testid={`community-workflow-import-${item.id}`} onClick={() => onImport(item)}
                    style={{ fontSize: 11.5, fontWeight: 700, color: TEAL.primary, background: TEAL.bg, border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", flexShrink: 0 }}>+ Import</button>
                </div>
                <div style={{ display: "flex", gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} data-testid={`community-workflow-rate-${item.id}-${n}`} onClick={() => rateCommunityItem(item.id, n)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0, color: (myRating[item.id] || 0) >= n ? "#f59e0b" : "#e2e8f0" }}>★</button>
                  ))}
                  {item.rating_count > 0 && <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 4 }}>{item.avg_rating} ({item.rating_count})</span>}
                </div>
              </div>
            ))}
        </div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)" }}>📁 Select System / Category</label>
            <input 
              data-testid="complaint-library-mobile-category-input"
              value={cat === "All" ? "" : cat} 
              onChange={e => setCat(e.target.value.trim() ? e.target.value : "All")}
              placeholder="Type to search system (e.g. GI, Neuro)..."
              list="mobile-categories-list"
              style={{ padding: "10px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)", width: "100%", outline: "none" }}
            />
            <datalist id="mobile-categories-list">
              {CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)" }}>🩺 Search & Select Complaint</label>
            <input 
              data-testid="complaint-library-mobile-search-input"
              value={search} 
              onChange={e => {
                const val = e.target.value;
                setSearch(val);
                const matched = source.find(c => c.name.toLowerCase() === val.toLowerCase());
                if (matched) setSelected(matched);
              }}
              placeholder="Type to search & select complaint..."
              list="mobile-complaints-list"
              style={{ padding: "10px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)", width: "100%", outline: "none" }}
            />
            <datalist id="mobile-complaints-list">
              {filtered.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>

          {selected && (
            <div data-testid="complaint-library-mobile-selected-badge" style={{ background: TEAL.bg, border: `1.5px solid ${TEAL.border}`, borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeSlideIn 0.2s ease" }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, color: TEAL.primary }}>SELECTED COMPLAINT</span>
                <p style={{ fontSize: 14, fontWeight: 700, margin: "2px 0 0", color: TEAL.text }}>{selected.name}</p>
              </div>
              <span style={{ fontSize: 18 }}>✅</span>
            </div>
          )}
        </div>
      ) : (
        <>
          <input data-testid="complaint-library-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search complaints…"
            style={{ padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIES.map(c => (
              <button key={c} data-testid={`complaint-library-category-${c.toLowerCase()}-chip`} onClick={() => setCat(c)} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                borderColor: cat === c ? TEAL.primary : "var(--color-border-primary)", background: cat === c ? TEAL.primary : "#fff", color: cat === c ? "#fff" : "var(--color-text-secondary)" }}>
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8, maxHeight: 280, overflowY: "auto" }}>
            {filtered.map(c => (
              <ComplaintCard key={c.id} complaint={c} selected={selected?.id === c.id}
                onEdit={() => onEdit(c)} onSelect={() => setSelected(c)}
                onPublish={tab === "Private" ? () => onPublish(c) : null} />
            ))}
            {!filtered.length && <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>No complaints found.</p>}
          </div>
        </>
      )}
    </div>
  );
}
