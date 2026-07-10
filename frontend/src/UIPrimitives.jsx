import { useState } from "react";
import { TEAL, RED } from "./theme.js";

export function Btn({ children, onClick, variant = "primary", disabled, small, style: s = {}, testId, ...rest }) {
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    borderRadius: 8, fontFamily: "var(--font-sans)", cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600, transition: "all 0.15s", opacity: disabled ? 0.5 : 1,
    padding: small ? "6px 14px" : "10px 20px", fontSize: small ? 13 : 14, border: "none",
  };
  const variants = {
    primary:   { background: TEAL.primary, color: "#fff" },
    secondary: { background: "transparent", color: TEAL.primary, border: `1.5px solid ${TEAL.border}` },
    ghost:     { background: "transparent", color: "var(--color-text-secondary)", border: `1.5px solid var(--color-border-primary)` },
    danger:    { background: RED.primary, color: "#fff" },
  };
  return <button data-testid={testId} style={{ ...base, ...variants[variant], ...s }} onClick={onClick} disabled={disabled} {...rest}>{children}</button>;
}

export function Badge({ children, color = TEAL }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: color.bg, color: color.text, border: `1px solid ${color.border}` }}>
      {children}
    </span>
  );
}

export function Card({ children, style: s = {}, onClick, testId, className }) {
  return (
    <div data-testid={testId} className={className} style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 12,
      padding: 16, boxShadow: "var(--shadow-sm)", ...s }} onClick={onClick}>
      {children}
    </div>
  );
}

// Shareable vanity link row (e.g. "yourapp.com/moproprep") — copies a link that instantly
// redirects to the partner site, so users can share it without needing to be logged in.
export function ShareLinkRow({ path, testId, accent }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${path}`;
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--color-background-secondary)", borderRadius: 8, padding: "6px 10px" }}>
      <span data-testid={`share-link-${testId}-text`} style={{ fontSize: 11.5, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{link}</span>
      <button data-testid={`share-link-${testId}-copy-btn`} onClick={copy} style={{ fontSize: 11, fontWeight: 700, color: copied ? "#fff" : accent, background: copied ? accent : "transparent", border: `1.5px solid ${accent}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", flexShrink: 0, fontFamily: "var(--font-sans)" }}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
