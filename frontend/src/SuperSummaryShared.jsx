export const TEAL   = { primary: "#0F6E56", bg: "#E1F5EE", border: "#9FE1CB", text: "#085041" };
export const AMBER  = { primary: "#EF9F27", bg: "#FAEEDA", border: "#FAC775", text: "#633806" };
export const RED    = { primary: "#E24B4A", bg: "#FCEBEB", border: "#F7C1C1", text: "#791F1F" };
export const PURPLE = { primary: "#6E40C9", bg: "#F3EEFF", border: "#D8C7FF", text: "#3E2570" };

export function Btn({ children, onClick, variant = "primary", disabled, small, style: s = {}, testId }) {
  const base = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, fontFamily: "var(--font-sans)", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, opacity: disabled ? 0.5 : 1, padding: small ? "6px 14px" : "10px 20px", fontSize: small ? 13 : 14, border: "none" };
  const variants = {
    primary:   { background: PURPLE.primary, color: "#fff" },
    secondary: { background: "transparent", color: PURPLE.primary, border: `1.5px solid ${PURPLE.border}` },
    ghost:     { background: "transparent", color: "var(--color-text-secondary)", border: `1.5px solid var(--color-border-primary)` },
  };
  return <button data-testid={testId} style={{ ...base, ...variants[variant], ...s }} onClick={onClick} disabled={disabled}>{children}</button>;
}
export function Card({ children, style: s = {}, testId }) {
  return <div data-testid={testId} style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 12, padding: 16, boxShadow: "var(--shadow-sm)", ...s }}>{children}</div>;
}
export const inputS = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box" };
