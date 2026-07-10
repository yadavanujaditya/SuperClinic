import { useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext.jsx";
import { RecordsModal } from "./RecordsModal.jsx";
import { AdminDashboard } from "./AdminDashboard.jsx";
import { LoginModal } from "./AuthScreens.jsx";
import { TEAL, PURPLE } from "./theme.js";

// ─── Product Toggle: ClinicFlow ⇄ SuperSummary ──────────────────────────────
export function ProductToggle({ product, setProduct }) {
  const opts = [
    { id: null, label: "🏠 Home", color: "var(--color-text-primary)", bg: "var(--color-border-primary)" },
    { id: "clinicalmind", label: "ClinicFlow", color: TEAL.primary, bg: TEAL.bg },
    { id: "supersummary", label: "SuperSummary", color: PURPLE.primary, bg: PURPLE.bg },
  ];
  return (
    <div style={{ display: "flex", gap: 3, background: "var(--color-background-secondary)", borderRadius: 20, padding: 3 }}>
      {opts.map(o => (
        <button key={o.id ?? "home"} data-testid={`product-toggle-${o.id ?? "home"}-btn`} onClick={() => setProduct(o.id)}
          style={{ padding: "6px 14px", borderRadius: 18, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: "var(--font-sans)",
            background: product === o.id ? o.bg : "transparent", color: product === o.id ? o.color : "var(--color-text-secondary)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({ onClose, onSettings }) {
  const { user, logout } = useAuth();
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const professionLabels = { mbbs_student: "MBBS Student", resident: "Resident", consultant: "Consultant" };
  return (
    <div data-testid="profile-modal-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} className="anim-fade">
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 380, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,0.3)" }} className="anim-fade-up">
        <div style={{ background: "linear-gradient(120deg,#0d9488,#14b8a6)", padding: "32px 24px 46px", position: "relative" }}>
          <button data-testid="profile-modal-close-btn" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "#fff", fontSize: 15, cursor: "pointer" }}>✕</button>
          {user?.picture ? (
            <img src={user.picture} alt="" style={{ width: 76, height: 76, borderRadius: "50%", margin: "0 auto", display: "block", boxShadow: "0 8px 20px rgba(0,0,0,0.15)", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, margin: "0 auto", boxShadow: "0 8px 20px rgba(0,0,0,0.15)" }}>🧑‍⚕️</div>
          )}
        </div>
        <div style={{ padding: "0 24px 24px", marginTop: -28 }}>
          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", padding: 18, textAlign: "center" }}>
            <p data-testid="profile-modal-user-name" style={{ fontSize: 16, fontWeight: 800, margin: "0 0 2px" }}>{user?.name || "Doctor"}</p>
            <p data-testid="profile-modal-user-email" style={{ fontSize: 12.5, color: "var(--color-text-secondary)", margin: 0 }}>{user?.email}</p>
            {user?.role === "admin" && <span style={{ display: "inline-block", marginTop: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: PURPLE.primary, padding: "2px 8px", borderRadius: 10 }}>ADMIN</span>}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1, background: TEAL.bg, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: TEAL.primary, margin: 0 }}>🩺</p>
              <p data-testid="profile-modal-profession" style={{ fontSize: 10.5, color: TEAL.text, margin: "3px 0 0", fontWeight: 600 }}>{professionLabels[user?.profession] || "Profession"}</p>
            </div>
            <div style={{ flex: 1, background: PURPLE.bg, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: PURPLE.primary, margin: 0 }}>📱</p>
              <p data-testid="profile-modal-mobile" style={{ fontSize: 10.5, color: PURPLE.text, margin: "3px 0 0", fontWeight: 600 }}>{user?.mobile_number || "No number"}</p>
            </div>
          </div>
          <button data-testid="profile-modal-open-records-btn" onClick={() => setRecordsOpen(true)} style={{ width: "100%", marginTop: 16, padding: "11px", borderRadius: 10, border: "1.5px solid var(--color-border-primary)", background: "#fff", color: "var(--color-text-primary)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            📁 My Records
          </button>
          {user?.role === "admin" && (
            <button data-testid="profile-modal-open-admin-dashboard-btn" onClick={() => setAdminOpen(true)} style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "1.5px solid " + PURPLE.border, background: PURPLE.bg, color: PURPLE.primary, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              🛠 Admin Dashboard
            </button>
          )}
          <button data-testid="profile-modal-open-settings-btn" onClick={() => { onClose(); onSettings(); }} style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "none", background: "var(--color-text-primary)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ⚙️ Open Settings
          </button>
          <button data-testid="profile-modal-logout-btn" onClick={() => { onClose(); logout(); }} style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "1.5px solid #fecdd3", background: "#fff", color: "#e11d48", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            🚪 Log Out
          </button>
        </div>
      </div>
      {recordsOpen && <RecordsModal onClose={() => setRecordsOpen(false)} />}
      {adminOpen && <AdminDashboard onClose={() => setAdminOpen(false)} />}
    </div>
  );
}

// ─── Profile Menu ─────────────────────────────────────────────────────────────
export function ProfileMenu({ onSettings, onTagLibrary, tagCount }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const itemS = { width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "none", background: "none", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };

  if (!user) {
    return (
      <>
        <button data-testid="profile-menu-signin-btn" onClick={() => setLoginModalOpen(true)}
          style={{ padding: "8px 18px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: "1.5px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.15)", color: "#fff", fontFamily: "var(--font-sans)" }}>
          Sign In
        </button>
        {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
      </>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button data-testid="profile-menu-avatar-btn" onClick={() => setOpen(v => !v)}
        style={{ width: 38, height: 38, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.6)", background: "linear-gradient(135deg,#fff,#f0fdfa)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
        🧑‍⚕️
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#fff", borderRadius: 12,
          border: "1px solid var(--color-border-primary)", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", minWidth: 200, overflow: "hidden", zIndex: 60 }}>
          <button data-testid="profile-menu-view-profile-item" onClick={() => { setOpen(false); setShowProfile(true); }} style={itemS}>
            <span>👤 View Profile</span>
          </button>
          <div style={{ height: 1, background: "var(--color-border-primary)" }} />
          <button data-testid="profile-menu-tag-library-item" onClick={() => { setOpen(false); onTagLibrary(); }} style={itemS}>
            <span>📚 Tag Library</span>
            {tagCount > 0 && <span style={{ fontSize: 11, background: TEAL.bg, color: TEAL.primary, padding: "1px 7px", borderRadius: 10, fontWeight: 700 }}>{tagCount}</span>}
          </button>
          <div style={{ height: 1, background: "var(--color-border-primary)" }} />
          <button data-testid="profile-menu-settings-item" onClick={() => { setOpen(false); onSettings(); }} style={itemS}>
            <span>⚙️ Settings</span>
          </button>
        </div>
      )}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} onSettings={onSettings} />}
    </div>
  );
}
