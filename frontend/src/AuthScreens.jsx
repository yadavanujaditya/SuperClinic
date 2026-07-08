import { useState } from "react";
import { useAuth } from "./AuthContext.jsx";

const TEAL = { primary: "#0d9488", bg: "#f0fdfa", border: "#99f6e4" };
const PURPLE = { primary: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" };

const inputStyle = {
  width: "100%", padding: "11px 14px", border: "1.5px solid #E2E8F0", borderRadius: 10,
  fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box",
};

const PROFESSIONS = [
  { id: "mbbs_student", label: "MBBS Student", icon: "🎓" },
  { id: "resident", label: "Resident", icon: "🩺" },
  { id: "consultant", label: "Consultant", icon: "⚕️" },
];

function AuthShell({ children }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      background: "linear-gradient(135deg,#0d9488 0%,#115e59 55%,#4c1d95 100%)", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -80, right: -80, width: 320, height: 320, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
      <div style={{ position: "absolute", bottom: -100, left: -60, width: 260, height: 260, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
      {children}
    </div>
  );
}

export function LoginSignupScreen() {
  const { login, register, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState("login"); // login | signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim());
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div style={{ position: "relative", zIndex: 1, background: "#fff", borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 400, boxShadow: "0 30px 70px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <span style={{ fontSize: 26 }}>⚡</span>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 900, margin: 0, color: "var(--color-text-primary)" }}>ClinicFlow</h1>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>Comprehensive Clinical Intelligence Suite</p>
          </div>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 20px" }}>
          {mode === "login" ? "Sign in to continue to your workspace." : "Sign up to start using ClinicFlow & SuperSummary."}
        </p>

        <button
          data-testid="google-signin-btn"
          type="button"
          onClick={loginWithGoogle}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff",
            fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "var(--font-sans)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.9 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 15.8 3 8.8 7.7 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 45c5.4 0 10.3-2 13.9-5.2l-6.4-5.4C29.5 36.2 26.9 37 24 37c-5.2 0-9.6-3.4-11.2-8l-6.6 5.1C8.7 40.3 15.8 45 24 45z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.4 5.4c3.7-3.4 6.3-8.5 6.3-14.5 0-1.2-.1-2.4-.4-3.5z" />
          </svg>
          Sign in with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 16px" }}>
          <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
          <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: "#E2E8F0" }} />
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mode === "signup" && (
            <input data-testid="signup-name-input" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required style={inputStyle} />
          )}
          <input data-testid="auth-email-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" required style={inputStyle} />
          <input data-testid="auth-password-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required minLength={6} style={inputStyle} />

          {error && (
            <p data-testid="auth-error-message" style={{ fontSize: 13, color: "#dc2626", margin: 0, background: "#fef2f2", padding: "8px 12px", borderRadius: 8 }}>{error}</p>
          )}

          <button data-testid="auth-submit-btn" type="submit" disabled={loading} style={{
            padding: "12px", borderRadius: 10, border: "none", background: TEAL.primary, color: "#fff",
            fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", margin: "18px 0 0" }}>
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button data-testid="auth-toggle-mode-btn" onClick={() => { setMode(m => m === "login" ? "signup" : "login"); setError(""); }} style={{ background: "none", border: "none", color: TEAL.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0, fontFamily: "var(--font-sans)" }}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </AuthShell>
  );
}

export function OnboardingModal() {
  const { user, updateProfile } = useAuth();
  const [profession, setProfession] = useState(user?.profession || "");
  const [mobile, setMobile] = useState(user?.mobile_number || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const needsProfession = !user?.profession;
  const needsMobile = !user?.mobile_number;

  const submit = async (e) => {
    e.preventDefault();
    if (needsProfession && !profession) { setError("Please select your profession."); return; }
    if (needsMobile && (!mobile.trim() || mobile.trim().length < 10)) { setError("Please enter a valid mobile number."); return; }
    setError(""); setSaving(true);
    try {
      const payload = {};
      if (needsProfession) payload.profession = profession;
      if (needsMobile) payload.mobile_number = mobile.trim();
      await updateProfile(payload);
    } catch (err) {
      setError(err.message || "Could not save — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell>
      <div data-testid="onboarding-modal" style={{ position: "relative", zIndex: 1, background: "#fff", borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 440, boxShadow: "0 30px 70px rgba(0,0,0,0.3)" }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 6px" }}>Just one more step</h2>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 22px" }}>Tell us a bit about yourself to finish setting up your account.</p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {needsProfession && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>What is your profession?</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {PROFESSIONS.map(p => (
                  <div key={p.id} data-testid={`profession-option-${p.id}`} onClick={() => setProfession(p.id)}
                    style={{
                      border: `2px solid ${profession === p.id ? TEAL.primary : "#E2E8F0"}`,
                      background: profession === p.id ? TEAL.bg : "#fff",
                      borderRadius: 12, padding: "14px 8px", textAlign: "center", cursor: "pointer", transition: "all 0.15s",
                    }}>
                    <p style={{ fontSize: 20, margin: "0 0 4px" }}>{p.icon}</p>
                    <p style={{ fontSize: 11.5, fontWeight: 700, margin: 0, color: profession === p.id ? TEAL.primary : "var(--color-text-primary)" }}>{p.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {needsMobile && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>Mobile number</label>
              <input data-testid="onboarding-mobile-input" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="e.g. 9876543210" style={inputStyle} />
            </div>
          )}

          {error && <p data-testid="onboarding-error-message" style={{ fontSize: 13, color: "#dc2626", margin: 0, background: "#fef2f2", padding: "8px 12px", borderRadius: 8 }}>{error}</p>}

          <button data-testid="onboarding-submit-btn" type="submit" disabled={saving} style={{
            padding: "12px", borderRadius: 10, border: "none", background: PURPLE.primary, color: "#fff",
            fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1,
          }}>
            {saving ? "Saving…" : "Continue →"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

export function AuthGate({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AuthShell>
        <p data-testid="auth-loading" style={{ color: "#fff", fontSize: 14, fontWeight: 600, position: "relative", zIndex: 1 }}>Loading…</p>
      </AuthShell>
    );
  }

  if (!user) return <LoginSignupScreen />;
  if (!user.profession || !user.mobile_number) return <OnboardingModal />;
  return children;
}
