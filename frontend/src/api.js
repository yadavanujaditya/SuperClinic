// Multi-provider AI streaming — Claude, Gemini, DeepSeek, OpenAI
// NOTE: All AI calls are proxied through the backend, which uses the admin-configured
// API key server-side. Regular users never need or see an API key.

const API_URL = import.meta.env.REACT_APP_BACKEND_URL;

export const PROVIDERS = [
  { id: "claude",   name: "Claude (Anthropic)",  keyPrefix: "sk-ant-", keyHint: "sk-ant-...",  model: "claude-sonnet-4-6" },
  { id: "gemini",   name: "Gemini (Google)",      keyPrefix: "AIza",   keyHint: "AIzaSy...",   model: "gemini-2.5-pro" },
  { id: "deepseek", name: "DeepSeek",             keyPrefix: "sk-",    keyHint: "sk-...",       model: "deepseek-chat" },
  { id: "openai",   name: "OpenAI (GPT-4o)",      keyPrefix: "sk-",    keyHint: "sk-...",       model: "gpt-4o" },
];

export function getProvider(id) { return PROVIDERS.find(p => p.id === id) || PROVIDERS[0]; }

// ── Unified entry point — streams via backend proxy (admin-managed key) ────
export async function callAIStream(messages, system, provider, apiKey, onDelta) {
  const res = await fetch(`${API_URL}/api/ai/chat/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system }),
  });
  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || `AI request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += dec.decode(value, { stream: true });
    onDelta?.(full);
  }
  return full;
}

// Reads an image (dataURL) and transcribes/describes its content as plain text — used as an OCR
// fallback for handwritten or low-quality scans that Tesseract.js can't reliably read.
export async function callVisionOCR(imageDataURL, provider, apiKey) {
  const match = imageDataURL.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data");
  const [, mediaType, base64] = match;
  const prompt = "Transcribe every piece of text visible in this medical document image exactly as written, including all numbers, lab values, dates, and handwritten notes. Output plain text only, preserving line structure. Do not summarize or omit anything.";
  const res = await fetch(`${API_URL}/api/ai/vision`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64, media_type: mediaType, prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Vision OCR failed (${res.status})`);
  return data.text || "";
}

export function parseJSON(raw) {
  if (!raw) return null;
  let text = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  
  try { return JSON.parse(text); } catch (_) {}

  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch) {
    try { return JSON.parse(bracketMatch[0]); } catch (_) {}
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch (_) {}
  }

  try {
    const cleaned = braceMatch ? braceMatch[0] : text;
    const qMatch = cleaned.match(/"question"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/);
    
    let options = [];
    const optMatch = cleaned.match(/"options"\s*:\s*\[([\s\S]*?)\]/);
    if (optMatch && optMatch[1]) {
      options = optMatch[1].split(",")
        .map(s => s.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "").trim())
        .filter(Boolean);
    }
    
    let differentials = [];
    const diffMatch = cleaned.match(/"differentials"\s*:\s*\[([\s\S]*?)\]/);
    if (diffMatch && diffMatch[1]) {
      const rawObjs = diffMatch[1].match(/\{[\s\S]*?\}/g) || [];
      differentials = rawObjs.map(o => {
        try { return JSON.parse(o); } catch (__) {
          const nMatch = o.match(/"name"\s*:\s*"([\s\S]*?)"/);
          const lMatch = o.match(/"likelihood"\s*:\s*"([\s\S]*?)"/);
          if (nMatch) return { name: nMatch[1], likelihood: lMatch ? lMatch[1] : "low", reasoning: "" };
          return null;
        }
      }).filter(Boolean);
    }
    
    let red_flags = [];
    const rfMatch = cleaned.match(/"red_flags"\s*:\s*\[([\s\S]*?)\]/);
    if (rfMatch && rfMatch[1]) {
      red_flags = rfMatch[1].split(",")
        .map(s => s.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "").trim())
        .filter(Boolean);
    }
    
    const doneMatch = cleaned.match(/"done"\s*:\s*(true|false)/i);
    const done = doneMatch ? doneMatch[1].toLowerCase() === "true" : false;

    if (qMatch && qMatch[1]) {
      return {
        question: qMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
        options,
        differentials,
        red_flags,
        done
      };
    }
  } catch (___) {}

  return null;
}

export function buildSystemPrompt(complaint, age, sex, retrievedContext) {
  return `Clinical thinking assistant for junior doctors, India government hospital OPD.
Patient: ${age || "?"}y ${sex || ""}. Chief complaint: ${complaint}.

CLINICAL REFERENCE (retrieved via BM25):
${retrievedContext || "No reference loaded. Use general clinical knowledge with India-specific disease prevalence."}

Output ONLY valid JSON. No markdown. No explanation. Exactly this structure:
{"question":"...","options":["...","...","...","..."],"differentials":[{"name":"...","likelihood":"high|medium|low","reasoning":"one line max"}],"red_flags":["..."],"done":false}

Rules:
- question: single most important next question to ask
- options: 3-4 short options, always end with "Not present" or "Unsure"
- differentials: max 5, ranked by likelihood, India-specific disease weighting
- red_flags: ONLY if genuinely triggered by answers so far. Empty array [] if none.
- done: true only after 9+ questions AND essential history is complete
- Never repeat a question already in the history`;
}

export function buildNotePrompt(complaint, age, sex, history, differentials, redFlags) {
  const histText = history.map((h, i) => `Q${i+1}: ${h.q}\nA: ${h.a}`).join("\n\n");
  return `You are a clinical documentation assistant for an Indian government hospital OPD.

Patient: ${age}y ${sex}. Chief complaint: ${complaint}.

CONSULTATION HISTORY:
${histText}

TOP DIFFERENTIALS: ${differentials.map(d => `${d.name} (${d.likelihood})`).join(", ")}
RED FLAGS TRIGGERED: ${redFlags.length ? redFlags.join("; ") : "None"}

Generate a clinical note with EXACTLY these section headers:
CHIEF COMPLAINT
HISTORY OF PRESENT ILLNESS
PERTINENT POSITIVES
PERTINENT NEGATIVES
RED FLAGS
WORKING DIAGNOSIS / DIFFERENTIALS
SUGGESTED INVESTIGATIONS
PLAN / DISPOSITION

Be concise and clinically precise. India-specific drug names and doses. Plain text only.`;
}

// ── Local (offline) note generator — no API needed ──────────────────────────
export function generateLocalNote(complaint, age, sex, history, differentials, redFlags) {
  const positives = history.filter(h => {
    const a = h.a.toLowerCase();
    return !["no ","not present","unsure","absent","none","negative"].some(neg => a.startsWith(neg) || a === neg.trim());
  });
  const negatives = history.filter(h => {
    const a = h.a.toLowerCase();
    return ["no ","not present","absent","none","negative"].some(neg => a.startsWith(neg));
  });
  const top = differentials.filter(d => d.likelihood === "high");
  const working = top.length ? top.map(d => d.name).join(", ") : differentials[0]?.name || "To be determined";

  const hpi = history.slice(0, 4).map(h => `${h.q.replace(/\?$/, "")}: ${h.a}`).join(". ") + ".";

  return `CHIEF COMPLAINT
${complaint} — ${age}, ${sex}

HISTORY OF PRESENT ILLNESS
${hpi}

PERTINENT POSITIVES
${positives.slice(0, 6).map(h => `• ${h.q.replace(/\?$/, "")}: ${h.a}`).join("\n") || "• None documented"}

PERTINENT NEGATIVES
${negatives.slice(0, 4).map(h => `• ${h.q.replace(/\?$/, "")}: ${h.a}`).join("\n") || "• None documented"}

RED FLAGS
${redFlags.length ? redFlags.map(r => `⚠ ${r}`).join("\n") : "None identified during this consultation"}

WORKING DIAGNOSIS / DIFFERENTIALS
${differentials.map((d, i) => `${i + 1}. ${d.name} — ${d.likelihood} likelihood${d.reasoning ? ` (${d.reasoning})` : ""}`).join("\n") || "• To be determined based on investigations"}

SUGGESTED INVESTIGATIONS
• CBC with differential
• CRP / ESR
• As per leading differential (${working})
• Additional investigations as clinically indicated

PLAN / DISPOSITION
Working diagnosis: ${working}
${redFlags.length > 0 ? "⚠️ Red flags identified — consider urgent referral or inpatient admission\n" : ""}• Outpatient management as appropriate
• Patient education on warning signs
• Review in 48–72 hours or sooner if symptoms worsen
• Follow-up as clinically indicated

[Note generated locally — no AI used]`;
}

export const DEFAULT_GENERIC_INSTRUCTIONS = `1. Provide only the minimal core clinical details needed for a basic discharge summary. You must include Chief Complaint, brief HPI, essential vitals/labs, and short review advice. CRITICAL: The TREATMENT GIVEN section MUST detail all specific treatments administered to the patient during their stay (such as IV fluids, specific medications like antiemetics/antibiotics, oxygen therapy, or surgery). The COURSE OF TREATMENT IN HOSPITAL section must contain details of the clinical course and general hospital stay. Do NOT omit or summarize away any administered treatments.
2. Keep it concise, direct, and under 3-4 short paragraphs.
3. The DIAGNOSIS section MUST use exactly TWO separate headings in this order:

   DIAGNOSIS
   [Clinical description of the condition, e.g.: Acute Infective Hepatitis with signs of liver cell failure, ascitis]

   PRIMARY DIAGNOSIS
   ICD-10 Code: B15.9 (Hepatitis A without hepatic coma)
   ICD-10 Code: K72.0 (Acute and subacute hepatic failure)
   ICD-10 Code: R17 (Unspecified jaundice)

   ALL ICD-10 codes (primary and secondary) are listed together under PRIMARY DIAGNOSIS only. Do NOT create a separate SECONDARY DIAGNOSIS heading.
3a. Do NOT use any markdown bold syntax (**text**) anywhere in the summary. All labels and headings must be in PLAIN CAPITAL LETTERS only.
3b. For vitals, use colon-dash style: Heart Rate:- 88/min, Respiratory Rate:- 20/min, Temperature:- 98.6°F (no asterisks, no bold).
4. If there are any patient reports, laboratory investigations, or clinical tests, CRITICAL RULE: the INVESTIGATIONS section must ONLY contain tests that were actually performed AND have an available result/value. NEVER list a test that is merely "Advised", ordered, planned, pending, awaited, or has no result — omit those entirely. If no investigation has an actual result, omit the INVESTIGATIONS section completely. For the tests that DO have results, you MUST format them under the heading "INVESTIGATIONS" as a clean, aligned plain-text ASCII grid trend table (using characters like +, -, and |) instead of default Markdown. The columns MUST represent absolute calendar dates formatted in DD-MM-YYYY format (e.g. | Test Name | 07-07-2026 | 08-07-2026 | ... |) sorted in chronological increasing order. You MUST NOT use relative day descriptors like "Day 2 of Life" or "Day 3". The rows must represent individual test parameters. Do NOT include reference ranges or units as separate columns. Pad columns with spaces so vertical borders align perfectly. Compatible with word processors.
5. Do NOT use any markdown bold syntax (**text**) anywhere in the summary. All labels and headings must be in PLAIN CAPITAL LETTERS only.
5. You MUST include and use these exact clean, standard uppercase section headers:
   DIAGNOSIS
   CHIEF COMPLAINT
   HISTORY OF PRESENT ILLNESS
   INVESTIGATIONS
   TREATMENT GIVEN
   COURSE OF TREATMENT IN HOSPITAL
   TREATMENT ADVICE AT DISCHARGE
   NEXT REVIEW
6. Output ONLY the plain text summary. No introduction, markdown code fences, or comments.`;

export const DEFAULT_DETAILED_INSTRUCTIONS = `1. Provide a comprehensive, in-depth discharge summary. Elaborate fully on history (HPI), general/systemic examinations, complete investigations trends, detailed hospital course (treatments, boluses, transfusions), and structured discharge warnings/screenings.
2. Use professional medical terminology and ensure a cohesive, professional narrative.
3. The DIAGNOSIS section MUST use exactly TWO separate headings in this order:

   DIAGNOSIS
   [Clinical description of the condition, e.g.: Acute Infective Hepatitis with signs of liver cell failure, ascitis]

   PRIMARY DIAGNOSIS
   ICD-10 Code: B15.9 (Hepatitis A without hepatic coma)
   ICD-10 Code: K72.0 (Acute and subacute hepatic failure)
   ICD-10 Code: R17 (Unspecified jaundice)
   ICD-10 Code: R60.0 (Localized edema)

   ALL ICD-10 codes (primary and secondary) are listed together under PRIMARY DIAGNOSIS only. Do NOT create a separate SECONDARY DIAGNOSIS heading.
3a. Do NOT use any markdown bold syntax (**text**) anywhere in the summary. All labels and headings must be in PLAIN CAPITAL LETTERS only.
3b. For vitals, use colon-dash style: Heart Rate:- 88/min, Respiratory Rate:- 20/min, Temperature:- 98.6°F (no asterisks, no bold).
4. If there are any patient reports, laboratory investigations, or clinical tests, CRITICAL RULE: the INVESTIGATIONS section must ONLY contain tests that were actually performed AND have an available result/value. NEVER list a test that is merely "Advised", ordered, planned, pending, awaited, or has no result — omit those entirely. If no investigation has an actual result, omit the INVESTIGATIONS section completely. For the tests that DO have results, you MUST format them under the heading "INVESTIGATIONS" as a clean, aligned plain-text ASCII grid trend table (using characters like +, -, and |) instead of default Markdown. The columns MUST represent absolute calendar dates formatted in DD-MM-YYYY format (e.g. | Test Name | 07-07-2026 | 08-07-2026 | ... |) sorted in chronological increasing order. You MUST NOT use relative day descriptors like "Day 2 of Life" or "Day 3". The rows must represent individual test parameters. Do NOT include reference ranges or units as separate columns. Pad columns with spaces so vertical borders align perfectly. Compatible with word processors.
5. Do NOT use any markdown bold syntax (**text**) anywhere in the summary. All labels and headings must be in PLAIN CAPITAL LETTERS only.
5. Use clean, standard uppercase section headers:
   DIAGNOSIS
   CHIEF COMPLAINT
   HISTORY OF PRESENT ILLNESS
   GENERAL EXAMINATION
   VITALS
   SYSTEMIC EXAMINATION
   INVESTIGATIONS
   TREATMENT GIVEN
   COURSE OF TREATMENT IN HOSPITAL
   TREATMENT ADVICE AT DISCHARGE
   NEXT REVIEW
6. Output ONLY the plain text summary. No introduction, markdown code fences, or comments.`;

export function getGenericInstructions() {
  return localStorage.getItem("clinicalmind:instructions:generic") || DEFAULT_GENERIC_INSTRUCTIONS;
}

export function getDetailedInstructions() {
  return localStorage.getItem("clinicalmind:instructions:detailed") || DEFAULT_DETAILED_INSTRUCTIONS;
}
