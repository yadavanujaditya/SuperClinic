// ─── Shared design tokens — used across App.jsx, SuperSummary.jsx and their split-out components ───
export const TEAL   = { primary: "#0d9488", light: "#14b8a6", bg: "#f0fdfa", border: "#99f6e4", text: "#115e59" };
export const AMBER  = { primary: "#d97706", bg: "#fef3c7", border: "#fde68a", text: "#78350f" };
export const RED    = { primary: "#e11d48", bg: "#fff1f2", border: "#fecdd3", text: "#9f1239" };
export const GRAY   = { dot: "#6b7280", bg: "#f3f4f6", text: "#1f2937" };
export const PURPLE = { primary: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" };

export const LIKELIHOOD_COLORS = {
  high:   { dot: TEAL.light,    text: TEAL.text,   bg: TEAL.bg,   border: TEAL.border },
  medium: { dot: AMBER.primary, text: AMBER.text,  bg: AMBER.bg,  border: AMBER.border },
  low:    { dot: GRAY.dot,      text: GRAY.text,   bg: GRAY.bg,   border: "#D8D6CE" },
};

export const CATEGORIES = ["All","Respiratory","GI","Neuro","Skin","Urinary","Hematology","MSK","Eye-ENT","Newborn","General","Behavioral","Emergency"];
