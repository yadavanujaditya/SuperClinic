// ─── Patient de-identification ───────────────────────────────────────────────
// Runs on the server before any summary is stored or shown to the AI, and on
// every memory write. Removes direct identifiers (DPDP Act 2023): names in
// labelled fields, hospital numbers, phone, email, Aadhaar, address, DOB.
// Clinical content (age, weight, diagnosis, labs, drugs) is kept — the agent
// needs it to learn.

const REDACTED = "[REDACTED]";

// "Label: value" lines whose value is an identifier. Matched case-insensitively at
// the start of a line or after a separator, value runs to end of line or next "  "/"|".
const LABELS = [
  "patient'?s? name", "name of (?:the )?patient", "name", "child'?s? name", "baby of", "b/o",
  "father'?s? name", "mother'?s? name", "guardian'?s? name", "husband'?s? name", "s/o", "d/o", "w/o", "c/o",
  "uhid", "uh ?id", "cr ?no\\.?", "c\\.r\\. ?no\\.?", "ip ?no\\.?", "ipd ?no\\.?", "op ?no\\.?", "opd ?no\\.?",
  "reg(?:istration)? ?no\\.?", "mrd ?no\\.?", "mr ?no\\.?", "hospital ?no\\.?", "admission ?no\\.?", "bed ?no\\.?",
  "abha(?: ?(?:id|no\\.?|number))?", "aadhaa?r(?: ?(?:no\\.?|number))?",
  "address", "addr\\.?", "village", "mohalla", "residence",
  "mobile(?: ?no\\.?)?", "phone(?: ?no\\.?)?", "contact(?: ?no\\.?| number)?", "ph\\.? ?no\\.?",
  "email", "e-mail", "d\\.?o\\.?b\\.?", "date of birth",
];
const LABEL_RE = new RegExp(
  `(^|[\\n|;]\\s*|\\s{2,})(${LABELS.join("|")})\\s*[:\\-–=]\\s*([^\\n|;]*?)(?=\\s{2,}|[|;]|\\n|$)`,
  "gim",
);

const PATTERNS = [
  // Indian mobile numbers, optional +91 / 0 prefix
  { re: /(?<!\d\.?)(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\.?\d)/g, label: "phone" },
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, label: "email" },
  // Aadhaar: 12 digits, often grouped 4-4-4 (first digit 2-9)
  { re: /(?<!\d\.?)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\.?\d)/g, label: "aadhaar" },
  // ABHA: 14 digits, often 2-4-4-4
  { re: /(?<!\d\.?)\d{2}-\d{4}-\d{4}-\d{4}(?!\.?\d)/g, label: "abha" },
  // PIN code next to a place word ("Rohtak 124001")
  { re: /\b(?:pin(?:code)?\s*[:-]?\s*)\d{6}\b/gi, label: "pin" },
];

export function deidentify(text) {
  if (typeof text !== "string" || !text) return { text: "", removed: 0 };
  let removed = 0;
  let out = text.replace(LABEL_RE, (m, pre, label, value) => {
    if (!value.trim() || value.trim() === REDACTED) return m;
    removed++;
    return `${pre}${label}: ${REDACTED}`;
  });
  for (const { re } of PATTERNS) {
    out = out.replace(re, () => { removed++; return REDACTED; });
  }
  return { text: out, removed };
}

// Lightweight check used to refuse memory writes that still look identifying.
export function looksIdentifying(text) {
  return deidentify(text).removed > 0;
}
