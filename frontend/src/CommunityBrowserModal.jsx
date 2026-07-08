import { useEffect, useState } from "react";

const PURPLE = { primary: "#7c3aed", bg: "#f5f3ff", text: "#5b21b6", border: "#ddd6fe" };

function StarRow({ avg, count }) {
  return (
    <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>
      {avg > 0 ? `${"★".repeat(Math.round(avg))}${"☆".repeat(5 - Math.round(avg))} ${avg}` : "Not rated yet"}
      {count > 0 && <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}> ({count})</span>}
    </span>
  );
}

// Generic browser for published community content (templates or workflows).
export function CommunityBrowserModal({ title, listFn, rateFn, onImport, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myRating, setMyRating] = useState({});

  useEffect(() => {
    listFn().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  const submitRate = async (id, stars) => {
    setMyRating(prev => ({ ...prev, [id]: stars }));
    try {
      const updated = await rateFn(id, stars);
      setItems(prev => prev.map(i => i.id === id ? updated : i));
    } catch { /* silent */ }
  };

  return (
    <div data-testid="community-browser-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 600, maxHeight: "85vh", overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>🌐 {title}</h2>
          <button data-testid="community-browser-close-btn" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>
        <div style={{ padding: "16px 24px 24px", overflowY: "auto", flex: 1 }}>
          {loading ? <p style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 30 }}>Loading…</p>
            : items.length === 0 ? <p data-testid="community-browser-empty" style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 30 }}>Nothing published by the community yet — be the first!</p>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map(item => (
                  <div key={item.id} data-testid={`community-item-${item.id}`} style={{ border: "1.5px solid var(--color-border-primary)", borderRadius: 12, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14, margin: "0 0 2px" }}>{item.name}</p>
                        <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>by {item.owner_name} · {item.category}</p>
                      </div>
                      <button data-testid={`community-import-${item.id}`} onClick={() => onImport(item)}
                        style={{ fontSize: 12, fontWeight: 700, color: PURPLE.primary, background: PURPLE.bg, border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", flexShrink: 0 }}>
                        + Import
                      </button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <StarRow avg={item.avg_rating} count={item.rating_count} />
                      <div style={{ display: "flex", gap: 2 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} data-testid={`community-rate-${item.id}-${n}`} onClick={() => submitRate(item.id, n)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0, color: (myRating[item.id] || 0) >= n ? "#f59e0b" : "#e2e8f0" }}>★</button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
