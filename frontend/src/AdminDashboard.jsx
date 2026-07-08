import { useEffect, useState } from "react";
import { adminListSummaries, adminListCases, adminListRatings, adminListUsers } from "./records.js";

const TEAL = { primary: "#0d9488", bg: "#f0fdfa", text: "#0f766e" };
const PURPLE = { primary: "#7c3aed", bg: "#f5f3ff", text: "#5b21b6" };
const AMBER = { primary: "#d97706", bg: "#fffbeb", text: "#92400e" };

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const TABS = ["Overview", "Users", "Discharge Summaries", "Clinical Cases", "Ratings"];

export function AdminDashboard({ onClose }) {
  const [tab, setTab] = useState("Overview");
  const [users, setUsers] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [cases, setCases] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminListUsers().catch(() => []),
      adminListSummaries().catch(() => []),
      adminListCases().catch(() => []),
      adminListRatings().catch(() => []),
    ]).then(([u, s, c, r]) => { setUsers(u); setSummaries(s); setCases(c); setRatings(r); }).finally(() => setLoading(false));
  }, []);

  const countByUser = (list) => {
    const m = {};
    list.forEach(item => { m[item.user_id] = (m[item.user_id] || 0) + 1; });
    return m;
  };
  const summaryCounts = countByUser(summaries);
  const caseCounts = countByUser(cases);
  const avgRating = ratings.length ? (ratings.reduce((a, r) => a + r.stars, 0) / ratings.length).toFixed(1) : "—";

  const statCard = (label, value, color, testId) => (
    <div data-testid={testId} style={{ flex: 1, minWidth: 130, background: color.bg, borderRadius: 12, padding: "16px 18px" }}>
      <p style={{ fontSize: 26, fontWeight: 800, color: color.primary, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 12, color: color.text, margin: "4px 0 0", fontWeight: 600 }}>{label}</p>
    </div>
  );

  return (
    <div data-testid="admin-dashboard-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 920, maxHeight: "90vh", overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 26px", borderBottom: "1px solid var(--color-border-primary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>🛠 Admin Dashboard</h2>
          <button data-testid="admin-dashboard-close-btn" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "14px 26px 0", flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} data-testid={`admin-tab-${t.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => setTab(t)}
              style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                borderColor: tab === t ? PURPLE.primary : "var(--color-border-primary)", background: tab === t ? PURPLE.bg : "#fff", color: tab === t ? PURPLE.primary : "var(--color-text-secondary)" }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ padding: "18px 26px 26px", overflowY: "auto", flex: 1 }}>
          {loading ? <p style={{ textAlign: "center", color: "var(--color-text-secondary)", padding: 40 }}>Loading…</p> : (
            <>
              {tab === "Overview" && (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }} data-testid="admin-overview-stats">
                  {statCard("Total Users", users.length, TEAL, "admin-stat-users")}
                  {statCard("Discharge Summaries", summaries.length, PURPLE, "admin-stat-summaries")}
                  {statCard("Clinical Cases", cases.length, AMBER, "admin-stat-cases")}
                  {statCard("Avg. App Rating", avgRating === "—" ? "—" : `${avgRating} ★`, TEAL, "admin-stat-rating")}
                </div>
              )}
              {tab === "Users" && (
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }} data-testid="admin-users-table">
                  <thead><tr style={{ textAlign: "left", color: "var(--color-text-secondary)", fontSize: 11.5 }}>
                    <th style={{ padding: "6px 8px" }}>Name</th><th style={{ padding: "6px 8px" }}>Email</th><th style={{ padding: "6px 8px" }}>Profession</th>
                    <th style={{ padding: "6px 8px" }}>Role</th><th style={{ padding: "6px 8px" }}>Summaries</th><th style={{ padding: "6px 8px" }}>Cases</th><th style={{ padding: "6px 8px" }}>Joined</th>
                  </tr></thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.user_id} data-testid={`admin-user-row-${u.user_id}`} style={{ borderTop: "1px solid var(--color-border-primary)" }}>
                        <td style={{ padding: "8px" }}>{u.name}</td>
                        <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{u.email}</td>
                        <td style={{ padding: "8px" }}>{u.profession || "—"}</td>
                        <td style={{ padding: "8px" }}>{u.role === "admin" ? <span style={{ background: PURPLE.primary, color: "#fff", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>ADMIN</span> : "user"}</td>
                        <td style={{ padding: "8px" }}>{summaryCounts[u.user_id] || 0}</td>
                        <td style={{ padding: "8px" }}>{caseCounts[u.user_id] || 0}</td>
                        <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{fmtDate(u.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {tab === "Discharge Summaries" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="admin-summaries-list">
                  {summaries.length === 0 && <p style={{ color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center", padding: 20 }}>No summaries generated yet.</p>}
                  {summaries.map(s => (
                    <div key={s.id} style={{ border: "1px solid var(--color-border-primary)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 2px" }}>{s.diagnosis}</p>
                        <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>by {s.user_name} · {s.source} · {fmtDate(s.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {tab === "Clinical Cases" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="admin-cases-list">
                  {cases.length === 0 && <p style={{ color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center", padding: 20 }}>No consultations completed yet.</p>}
                  {cases.map(c => (
                    <div key={c.id} style={{ border: "1px solid var(--color-border-primary)", borderRadius: 10, padding: "10px 14px" }}>
                      <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 2px" }}>{c.complaint}</p>
                      <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>by {c.user_name} · {c.age}, {c.sex} · {fmtDate(c.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
              {tab === "Ratings" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="admin-ratings-list">
                  {ratings.length === 0 && <p style={{ color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center", padding: 20 }}>No ratings submitted yet.</p>}
                  {ratings.map(r => (
                    <div key={r.id} style={{ border: "1px solid var(--color-border-primary)", borderRadius: 10, padding: "10px 14px" }}>
                      <p style={{ margin: "0 0 2px", fontSize: 13 }}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)} <span style={{ color: "var(--color-text-secondary)", fontSize: 11.5 }}>· {r.record_type} · {fmtDate(r.created_at)}</span></p>
                      {r.comment && <p style={{ fontSize: 12.5, color: "var(--color-text-secondary)", margin: 0 }}>"{r.comment}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
