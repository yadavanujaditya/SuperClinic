# ClinicalMind — Master Product Specification
> Give this entire document to an LLM. It should produce a fully functional React JSX single-file app with zero clarification needed.

---

## 1. WHAT YOU ARE BUILDING

A clinical thinking assistant for junior doctors in Indian government hospital OPDs. The doctor selects one or more chief complaints (e.g. Fever alone, or Fever + Vomiting + Abdominal Pain together). When multiple complaints are selected, their clinical reference content and red flag sets are merged before BM25 indexing, and the AI is instructed to prioritize questions that differentiate across all active complaints simultaneously.

**Core architectural principle — AI is an assistant, not the engine:**
The system runs on a predefined local workflow first. Each complaint has a structured question sequence, branching logic, red flag triggers, and differential update rules — all stored locally and executed entirely in the browser with zero API calls. The AI (Claude) is only invoked in two cases: (1) when the doctor's answer falls outside the predefined workflow branches, or (2) when the doctor explicitly wants an AI-generated question. This makes the app functional offline, eliminates per-question latency, and keeps API costs near zero. Think of it as: local algorithm runs the consultation 90% of the time; AI handles the edge cases.

**Speed is the single non-negotiable requirement:**
Every interaction must feel instant. BM25 retrieval under 1ms. Sidebar opens in under 5ms. Prebuilt workflow questions appear with zero network wait. The app must work on a 4G connection in a government hospital with intermittent internet. Every design and architecture decision is subordinate to this requirement.

**Platform targets:**
- Browser (primary — Chrome, Edge, Safari)
- Mobile (responsive web, touch-optimised)
- Desktop app (Electron wrapper — same codebase, packaged for offline use)

**Document intelligence:**
When a doctor uploads any text, PDF, or image file, the system does not silently index it. Instead, it presents a parsed preview and asks: "Let AI generate a clinical workflow from this document, or build one manually?" If AI is chosen, Claude analyses the document and proposes a structured question sequence, branching logic, and differential list — which the doctor reviews and approves before it becomes active. Every extracted complaint from an uploaded document requires explicit user confirmation before being saved.

**Community knowledge base:**
Doctors can publish their edited complaints to a Community Library — a separate browsable page showing complaint cards with author name, specialty tag, rating, and usage count. Community complaints can be filtered by author, complaint name, specialty, or top-rated. Any complaint (system or community) can be forked into a private copy. The original always remains untouched at its source.

The knowledge base is two-layered:
- **Prebuilt**: 100 common pediatric complaints with India-specific clinical reference content baked in
- **User-uploaded**: doctor uploads their own .txt, .md, or PDF files (textbooks, protocols) which are indexed alongside or instead of prebuilt content

Retrieval is done using BM25 entirely in the browser — sub-millisecond, no server, no data leaves the device. The ONLY external call is to the Claude API for question generation and note writing.

Clicking any diagnosis in the differentials panel opens an instant sidebar showing the most relevant passages from the doctor's uploaded documents, with matched terms highlighted.

---

## 2. TECH STACK — EXACT

- **Framework**: React (JSX, functional components, hooks only — no class components)
- **Styling**: Inline styles only using CSS variables for theming. Use `var(--color-text-primary)`, `var(--color-background-secondary)`, `var(--color-border-primary)` etc.
- **Font**: DM Sans from Google Fonts (`https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap`)
- **Monospace**: `'DM Mono', 'Courier New', monospace` for clinical notes
- **BM25**: Implemented from scratch in pure JS — no npm package
- **PDF parsing**: PDF.js from CDN (`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`)
- **Voice**: Web Speech API (browser built-in, no external service)
- **LLM**: Claude API — `claude-sonnet-4-20250514`, streaming, max_tokens 500
- **Storage**: localStorage for API key and saved/edited complaints
- **No other dependencies**

---

## 3. APP SCREENS (5 total)

### Screen 1: LIBRARY
Entry screen. Two sections side by side (on desktop) or stacked (mobile):

**Left — Document Vault**
- Drag-and-drop upload zone accepting `.txt`, `.md`, `.pdf`
- Shows indexed files with chunk count
- Total chunks counter
- "Clear all" button

**Right — Complaint Library**
- Search box (filters the 100 complaints in real time)
- Category filter chips: All / Respiratory / GI / Neuro / Skin / Urinary / Hematology / MSK / Eye-ENT / Newborn / General / Behavioral / Emergency
- Grid of complaint cards (name + category tag)
- Each card has: Edit pencil icon, Use button
- "Create new complaint" button at top right
- Toggle: show System | Private | Community complaints

**Below both sections:**
- Patient age input (years or months for infants — if <2 entered, label as "months")
- Sex selector
- "Start Consultation" primary button — disabled until complaint is selected

### Screen 2: COMPLAINT EDITOR (modal overlay)
Opens when doctor clicks edit on any complaint, or "Create new". Full-screen modal.

Fields:
- **Name** (text input)
- **Category** (dropdown: Respiratory / GI / Neuro / Skin / Urinary / Hematology / MSK / Eye-ENT / Newborn / General / Behavioral / Emergency)
- **Age group** (All / Pediatric / Neonatal / Adult)
- **Clinical Reference Content** (large textarea — this is the text that gets chunked and BM25 indexed. Plain text. No markdown required but supported.)
- **Red Flag Keywords** (comma-separated tags input — visual chips)
- **Common Differentials** (comma-separated — used as seed for Claude context)
- **Tags** (comma-separated — for search)

Action buttons:
- **Save as Private** — saves to localStorage under key `complaints:private`
- **Export as JSON** — downloads a `.json` file of this complaint
- **Make Public** — exports as JSON with a banner: "Share this file with other doctors. Future versions will sync automatically."
- **Cancel**

System complaints (prebuilt) are read-only but show a "Fork & Edit" button instead of Edit — forking creates a private copy.

### Screen 3: CONSULTATION
Split layout: left 2/3 = question flow, right 1/3 = differentials panel.

**Header bar:**
- Patient summary pill (age, sex)
- Complaint name pill
- Question counter (Q3/~12)
- BM25 retrieval latency badge (e.g. "0.4ms")
- "Generate Note" button (enabled after Q4)
- "End" ghost button

**Red Flag Alert Bar** (only visible when triggered):
- Red background, warning icon
- Lists each red flag on its own line
- Stays visible until cleared

**History Scroll** (collapsible, max 150px height):
- Shows all Q&A pairs answered so far
- Auto-scrolls to bottom
- Dimmed styling — secondary information

**Current Question Card:**
- Large, prominent question text (16px, weight 500)
- While loading: animated dot + "Retrieving context…" text
- The question itself appears immediately when streaming starts (show it even if partial — use streaming text directly)

**Answer Options:**
- Quick-tap buttons, full width, rounded
- On hover: teal border + light teal background
- Always 3–4 options maximum
- Last option always "Not present" or "Unsure"

**Voice Input:**
- "🎙 Speak" button — starts continuous Web Speech API (lang: en-IN)
- Live transcript shown in green box as doctor speaks
- "Use this →" button applies transcript as custom answer
- Red animated dot while recording

**Custom Text Input:**
- Input field + → submit button
- Enter key submits

**Differentials Panel (right column):**
- Header: "Differentials · tap to explore"
- Each differential is a CLICKABLE CARD
- Card shows: colored dot (green/amber/gray by likelihood), diagnosis name, likelihood badge, one-line reasoning
- Clicking opens the Sidebar (Screen 4)
- Hover state: teal border, light teal fill

**Retrieved Context Panel (below differentials):**
- Header: "Context used · Xms"
- Shows top 2 retrieved chunk previews (source filename + 2-line text preview)
- Small, de-emphasized styling

### Screen 4: DIAGNOSIS SIDEBAR (slide-in panel)
Opens from the right when any differential is clicked. Does NOT make an API call — pure BM25.

- Width: 360px on desktop, full width on mobile
- Smooth slide animation (transform translateX, 250ms ease)
- Backdrop overlay (click to close)

**Contents:**
- Diagnosis name (large, bold)
- "Retrieved from your documents · Xms" in teal — or "Using prebuilt reference" if no uploads
- Close button (✕)
- Number of matching sections found
- Up to 5 chunk cards, each showing:
  - Source filename (or "Prebuilt — [complaint name]")
  - BM25 relevance score badge
  - Full chunk text with matched terms highlighted in yellow (#FFF176)
- If no chunks found: "Upload Harrison's, Nelson's, or your hospital protocol to see relevant sections here."
- Footer: "Click any diagnosis to instantly search your documents — no API call."

### Screen 5: CLINICAL NOTE
Full screen.

**Header:**
- "Clinical Note" title
- Consultation summary (X questions, complaint, age, sex)
- "Copy" button
- "New Patient" button

**Note body:**
- Monospace font
- Pre-formatted sections:
  ```
  CHIEF COMPLAINT
  HISTORY OF PRESENT ILLNESS
  PERTINENT POSITIVES
  PERTINENT NEGATIVES
  RED FLAGS
  WORKING DIAGNOSIS / DIFFERENTIALS
  SUGGESTED INVESTIGATIONS
  PLAN / DISPOSITION
  ```
- While generating: centered loading text

**Red flags summary card** (if any triggered during consultation)

---

## 4. SETTINGS PANEL

Accessible via a gear icon (⚙) in the top-right corner of the Library screen. Slides in from right as a panel.

**API Key section:**
- Label: "Claude API Key (stored locally on your device only)"
- Password input field (type="password")
- Show/hide toggle
- "Save Key" button — saves to localStorage under key `clinicalmind:apikey`
- Validation: check key starts with `sk-ant-` — show error if not
- Green checkmark + "Key saved" if valid and present
- Link: "Get your free API key at console.anthropic.com"

**Display section:**
- Nothing else for now — keep it minimal

**About section:**
- "ClinicalMind — Built for junior doctors in Indian government hospitals"
- "All processing is local. Your patient data never leaves your device."

---

## 5. BM25 IMPLEMENTATION (copy exactly)

```javascript
const STOP_WORDS = new Set(["the","a","an","is","are","was","were","be","been","have","has","had","do","does","will","would","could","should","may","might","can","to","of","in","for","on","with","at","by","from","as","into","and","or","but","if","then","when","where","which","who","that","this","these","those","it","its","they","them","we","you","i","my","he","she","her","his","not","no"]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function chunkText(text, source) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 80);
  const chunks = [];
  let buffer = "", bufferLen = 0;
  for (const para of paragraphs) {
    const len = tokenize(para).length;
    if (bufferLen + len > 350 && buffer) {
      chunks.push({ text: buffer.trim(), tokens: tokenize(buffer), source });
      buffer = para; bufferLen = len;
    } else {
      buffer += (buffer ? "\n\n" : "") + para;
      bufferLen += len;
    }
  }
  if (buffer.trim()) chunks.push({ text: buffer.trim(), tokens: tokenize(buffer), source });
  return chunks;
}

class BM25 {
  constructor() { this.docs = []; this.df = {}; this.avgdl = 1; }

  add(chunks) {
    this.docs.push(...chunks);
    this.df = {};
    let total = 0;
    this.docs.forEach(d => {
      total += d.tokens.length;
      new Set(d.tokens).forEach(t => { this.df[t] = (this.df[t] || 0) + 1; });
    });
    this.avgdl = this.docs.length ? total / this.docs.length : 1;
  }

  clear() { this.docs = []; this.df = {}; this.avgdl = 1; }

  search(query, k = 5) {
    if (!this.docs.length) return [];
    const qt = tokenize(query);
    if (!qt.length) return [];
    const N = this.docs.length;
    return this.docs
      .map(doc => {
        const freq = {};
        doc.tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
        let score = 0;
        for (const t of qt) {
          const tf = freq[t] || 0;
          if (!tf) continue;
          const idf = Math.log((N - (this.df[t] || 0) + 0.5) / ((this.df[t] || 0) + 0.5) + 1);
          score += idf * (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * doc.tokens.length / this.avgdl));
        }
        return { ...doc, score };
      })
      .filter(x => x.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
```

---

## 6. CLAUDE STREAMING API PATTERN (copy exactly)

```javascript
async function callClaudeStream(messages, system, apiKey, onDelta) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      stream: true,
      system,
      messages
    })
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text;
          onDelta?.(fullText);
        }
      } catch (_) {}
    }
  }
  return fullText;
}

function parseJSON(raw) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (_) { return null; }
}
```

---

## 7. CLAUDE SYSTEM PROMPT FOR CONSULTATION

Keep this prompt short to save tokens. Build it dynamically:

```javascript
function buildSystemPrompt(complaint, age, sex, retrievedContext) {
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
- red_flags: ONLY include if genuinely triggered by answers given so far. Empty array [] if none.
- done: true only after 9+ questions AND essential history is complete
- Never repeat a question already in the history`;
}
```

---

## 8. CLINICAL NLP KEYWORD EXTRACTOR

```javascript
const CLINICAL_KEYWORDS = [
  "fever","pain","cough","vomiting","nausea","diarrhea","diarrhoea","headache",
  "rash","bleeding","jaundice","breathlessness","dyspnea","chills","rigors",
  "myalgia","arthralgia","vertigo","dysuria","burning","micturition","hematuria",
  "melena","hematemesis","seizure","convulsion","syncope","pallor","edema","swelling",
  "continuous","intermittent","remittent","sudden","gradual","colicky","burning",
  "stabbing","throbbing","nocturnal","high-grade","low-grade","severe","mild",
  "acute","chronic","purulent","discharge","frequency","urgency","stridor",
  "wheeze","croup","petechiae","purpura","lymphadenopathy","hepatomegaly","splenomegaly"
];

function extractClinicalTerms(text) {
  const lower = text.toLowerCase();
  return CLINICAL_KEYWORDS.filter(k => lower.includes(k));
}

function buildRetrievalQuery(complaint, historyAnswers) {
  const combined = [complaint, ...historyAnswers].join(" ");
  const terms = extractClinicalTerms(combined);
  return [complaint, ...new Set(terms)].join(" ");
}
```

---

## 9. PDF PARSING (PDF.js)

Load PDF.js from CDN in a useEffect. Parse PDF to text page by page:

```javascript
async function parsePDF(file) {
  // Load PDF.js if not already loaded
  if (!window.pdfjsLib) {
    await new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = resolve;
      document.head.appendChild(script);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    fullText += pageText + "\n\n";
  }

  return fullText;
}
```

---

## 10. DATA MODELS

### Complaint Object
```javascript
{
  id: "string — slugified name e.g. fever_pediatric",
  name: "string — display name e.g. Fever",
  category: "Respiratory|GI|Neuro|Skin|Urinary|Hematology|MSK|Eye-ENT|Newborn|General|Behavioral|Emergency",
  ageGroup: "all|pediatric|neonatal|adult",
  source: "system|private|community",
  author: "string — 'ClinicalMind' for system, or display name for user",
  version: 1,
  clinicalContent: "string — full reference text, will be chunked by BM25",
  redFlagKeywords: ["string"],
  commonDifferentials: ["string"],
  tags: ["string"],
  createdAt: "ISO string",
  editedAt: "ISO string"
}
```

### Consultation Session
```javascript
{
  id: "string — timestamp",
  complaintId: "string",
  complaintName: "string",
  patientAge: "string",
  patientSex: "string",
  history: [{ q: "question", a: "answer" }],
  differentials: [{ name, likelihood, reasoning }],
  redFlags: ["string"],
  note: "string",
  startedAt: "ISO string",
  completedAt: "ISO string"
}
```

### localStorage Keys
```javascript
"clinicalmind:apikey"          // string — Claude API key
"clinicalmind:complaints"      // JSON array — private/community complaints
"clinicalmind:sessions"        // JSON array — last 20 sessions (optional)
```

---

## 11. THE 100 PREBUILT PEDIATRIC COMPLAINTS

Store as a constant array `SYSTEM_COMPLAINTS`. Each must have a `clinicalContent` string of at least 400 words covering: essential history points, red flags, common differentials (India-weighted), examination clues, and key investigations.

### Full list by category:

**RESPIRATORY (15)**
1. Fever with Cough
2. Breathlessness / Difficulty Breathing
3. Wheeze
4. Stridor
5. Croup
6. Sore Throat / Tonsillitis
7. Upper Respiratory Tract Infection (URTI)
8. Pneumonia-like Illness
9. Bronchiolitis (Infant)
10. Whooping Cough / Pertussis
11. Pulmonary TB Suspect
12. Ear Pain / Otitis Media
13. Nasal Discharge / Sinusitis
14. Epistaxis (Nosebleed)
15. Allergic Rhinitis

**GASTROINTESTINAL (15)**
16. Fever without Focus
17. Vomiting
18. Acute Diarrhea
19. Bloody Diarrhea / Dysentery
20. Abdominal Pain — Acute
21. Abdominal Pain — Recurrent / Chronic
22. Constipation
23. Abdominal Distension
24. Jaundice
25. Poor Feeding (Infant)
26. Worm Infestation
27. Gastroenteritis / Food Poisoning
28. Acute Liver Failure Signs
29. Hematemesis / Blood in Vomit
30. Failure to Thrive / Weight Faltering

**NEUROLOGICAL (10)**
31. Febrile Seizure
32. Afebrile Seizure / Epilepsy
33. Meningitis Suspect
34. Altered Consciousness / Encephalopathy
35. Headache
36. Developmental Delay
37. Acute Weakness / Flaccid Paralysis
38. Increased Intracranial Pressure Signs
39. Syncope / Fainting
40. Behavioral Change / Acute Psychosis

**SKIN (10)**
41. Fever with Rash
42. Rash without Fever
43. Urticaria / Allergic Rash
44. Chickenpox
45. Measles
46. Skin Abscess / Boil / Cellulitis
47. Scabies
48. Fungal Skin Infection (Tinea)
49. Atopic Dermatitis / Eczema
50. Impetigo

**GENITOURINARY (5)**
51. Burning Urination / UTI
52. Hematuria / Blood in Urine
53. Scrotal Swelling / Pain
54. Edema / Nephrotic Suspect
55. Enuresis / Bedwetting

**HEMATOLOGICAL / ONCOLOGICAL (5)**
56. Pallor / Anemia
57. Bleeding Tendency / Thrombocytopenia Suspect
58. Lymphadenopathy (Lymph Node Swelling)
59. Petechiae / Purpura
60. Suspected Malignancy / Unexplained Weight Loss

**MUSCULOSKELETAL (5)**
61. Limping / Refusal to Walk
62. Joint Pain / Swelling / Arthritis
63. Bone Pain
64. Acute Muscle Weakness
65. Neck Pain / Stiffness

**EYE AND ENT (5)**
66. Red Eye / Conjunctivitis
67. Eye Discharge / Neonatal Conjunctivitis
68. Ear Discharge / Otorrhoea
69. Sudden Hearing Loss
70. Foreign Body (Ear / Nose / Eye)

**NEWBORN AND YOUNG INFANT SPECIFIC (10)**
71. Neonatal Fever
72. Neonatal Jaundice
73. Excessive Crying / Colic
74. Feeding Difficulty / Poor Latch
75. Neonatal Sepsis Signs
76. Respiratory Distress — Newborn
77. Umbilical Problems (Discharge / Redness)
78. Birth Asphyxia Concerns
79. Neonatal Rash
80. Low Birth Weight / Preterm Follow-up

**GENERAL AND SYSTEMIC (10)**
81. Fever — General (All Ages)
82. Unexplained Weight Loss
83. Excessive Fatigue / Weakness
84. Malnutrition / SAM / MAM
85. Polyuria / Polydipsia (Diabetes Suspect)
86. Generalized Edema
87. Loss of Appetite / Anorexia
88. Night Sweats / TB Suspect
89. Anaphylaxis / Severe Allergic Reaction
90. Dengue Suspect

**BEHAVIORAL AND DEVELOPMENTAL (5)**
91. Speech and Language Delay
92. Autism Spectrum Concern
93. ADHD / Hyperactivity
94. School Refusal / Childhood Anxiety
95. Encopresis / Soiling

**INJURIES AND EMERGENCIES (5)**
96. Head Injury / Trauma
97. Poisoning / Ingestion
98. Burn
99. Snake Bite / Scorpion Sting
100. Near Drowning / Submersion

### Example of full clinicalContent for complaint #51 (Burning Urination / UTI):

```
URINARY TRACT INFECTION — PEDIATRIC CLINICAL REFERENCE
India OPD Guide

ESSENTIAL HISTORY POINTS (in priority order):
1. Age of child — neonates and young infants present atypically (fever without localizing signs)
2. Dysuria — burning or pain on urination (may present as crying during micturition in young children)
3. Frequency — increased urination frequency
4. Urgency — sudden urge to urinate
5. Fever — high-grade fever especially in upper UTI / pyelonephritis
6. Flank or loin pain (older children — suggests pyelonephritis)
7. Suprapubic pain / tenderness
8. Foul-smelling or cloudy urine
9. Hematuria — blood in urine (suggests cystitis or upper UTI)
10. Urinary incontinence or new onset bedwetting
11. Poor feeding and irritability in infants
12. Vomiting (common in pyelonephritis)
13. Previous UTI episodes — recurrent UTI suggests anatomical anomaly
14. Constipation history (constipation predisposes to UTI in children)
15. Circumcision status in males (uncircumcised boys under 1 year have higher UTI risk)
16. Catheterization history
17. Vesicoureteral reflux (VUR) history or family history of renal anomalies
18. Toilet training status and hygiene practices

RED FLAGS — REQUIRES URGENT ATTENTION:
- Fever > 39°C with UTI symptoms in child under 2 years → high risk pyelonephritis
- Sepsis signs: toxic appearance, poor perfusion, altered sensorium
- Recurrent UTI in a male child of any age → must rule out anatomical anomaly
- Recurrent UTI in female under 3 years → renal ultrasound needed
- Failure to respond to antibiotics after 48 hours
- Bilateral flank pain + fever (bilateral pyelonephritis)
- Hypertension detected with UTI → suspect renal scarring

COMMON DIFFERENTIALS:
1. Lower UTI / Cystitis — dysuria, frequency, urgency, no fever or low-grade fever
2. Upper UTI / Pyelonephritis — high fever, systemic illness, flank pain, vomiting
3. Vulvovaginitis — discharge, redness, dysuria without frequency (girls)
4. Urethritis — discharge, dysuria
5. Pinworm / Threadworm — perianal itching, dysuria in girls
6. Chemical irritation (soaps, bubble bath) — dysuria without fever
7. Dysfunctional voiding / Overactive bladder — frequency and urgency, no infection
8. Appendicitis — can mimic UTI with dysuria + abdominal pain
9. Renal calculi (uncommon in children but possible) — hematuria + colicky pain
10. Tuberculosis of urinary tract (chronic, recurrent, sterile pyuria)

EXAMINATION CLUES:
- Suprapubic tenderness → cystitis
- Costovertebral angle tenderness → pyelonephritis
- Abdominal mass → hydronephrosis
- Blood pressure → check in all children with UTI
- Growth parameters → faltering growth with recurrent UTI suggests chronic kidney disease
- Genitalia → phimosis in boys, labial adhesions or discharge in girls
- Spine → sacral dimple or hair tuft suggesting neurogenic bladder

KEY INVESTIGATIONS:
- Urine microscopy and culture (clean catch midstream) — gold standard. >10 WBC/hpf = pyuria
- Dipstick: leucocyte esterase + nitrite = high specificity for UTI
- Blood culture if febrile UTI / pyelonephritis in child under 3 months
- CBC, CRP — if systemic illness
- Renal function tests if recurrent UTI or renal involvement suspected
- Ultrasound kidneys and bladder — for any UTI in male, first UTI in child under 2, recurrent UTI, or poor response to treatment
- VCUG (voiding cystourethrogram) — only after ultrasound abnormality, to rule out VUR
- DMSA scan — gold standard for renal scarring (not routine OPD)

TREATMENT NOTES (India context):
- Uncomplicated lower UTI in older children: oral cotrimoxazole or nitrofurantoin 5–7 days
- Febrile UTI / pyelonephritis: cephalosporin (cefixime oral or ceftriaxone IV depending on severity)
- Neonatal UTI: always admit for IV antibiotics
- Antibiotic choice should follow local resistance patterns — E. coli resistance to amoxicillin is high in India
- Prophylaxis: consider for children with VUR grade III+ or recurrent UTI (nitrofurantoin once daily)
- Adequate hydration, regular voiding, treat constipation
```

### Example of clinicalContent for complaint #31 (Febrile Seizure):

```
FEBRILE SEIZURE — PEDIATRIC CLINICAL REFERENCE
India OPD / Emergency Guide

DEFINITION:
Seizure occurring in a child aged 6 months to 5 years, associated with fever (>38°C), without evidence of intracranial infection or electrolyte imbalance, and no prior afebrile seizures.

ESSENTIAL HISTORY POINTS:
1. Age of child at first seizure (peak 18 months; rare <6 months or >5 years)
2. Temperature at time of seizure — usually rises rapidly
3. Seizure type: focal vs generalized? One side of body or both?
4. Duration of seizure — under 15 minutes (simple) vs over 15 minutes (complex)
5. Number of seizures in this febrile illness (one = simple, more than one = complex)
6. Recovery: was the child alert and normal within 30 minutes?
7. Post-ictal state: confusion, prolonged drowsiness, weakness (Todd's paralysis)?
8. Current level of consciousness
9. Source of fever: cough, cold, ear pain, diarrhea, rash
10. Vaccination history — recent MMR or DTP in last 2 weeks (vaccine fever)
11. Family history of febrile seizures (strong genetic component)
12. Family history of epilepsy
13. Prior febrile seizures — how many, same age, same pattern
14. Developmental history — any concerns about milestones
15. Birth history — asphyxia, prematurity, NICU stay

RED FLAGS — THESE ARE NOT SIMPLE FEBRILE SEIZURES:
- Focal seizure / Todd's paralysis post-ictally → possible structural brain pathology
- Seizure lasting more than 15 minutes → status epilepticus risk, requires hospital
- More than one seizure in 24 hours → complex febrile seizure, needs admission
- Child not returning to normal within 1 hour → altered consciousness, rule out meningitis/encephalitis
- Neck stiffness, bulging fontanelle, petechial rash → meningitis MUST be ruled out
- Seizure in child under 6 months or over 5 years → NOT a typical febrile seizure
- No fever despite history suggesting seizure → afebrile seizure, different workup
- Focal neurological deficit persisting → urgent CT/MRI
- Abnormal eye movements (nystagmus, gaze deviation) → CNS pathology

DIFFERENTIALS:
1. Simple febrile seizure (most common — generalized, <15 min, full recovery)
2. Complex febrile seizure (focal, prolonged, multiple in one illness)
3. Bacterial meningitis (meningismus, purpuric rash, toxic appearance)
4. Viral meningoencephalitis (gradual, behavioral change, altered consciousness)
5. Cerebral malaria (P. falciparum, endemic area, fever + seizure = EMERGENCY)
6. Hyponatremia / electrolyte imbalance (gastroenteritis with excess water intake)
7. Hypoglycemia (check glucose immediately in any seizing child)
8. Epilepsy with fever as a trigger
9. Breath-holding spell (younger infants, no fever, triggered by crying)
10. Rigors misidentified as seizure (consciousness maintained during rigors)

EXAMINATION:
- Full neurological exam — tone, reflexes, fontanelle (if open), cranial nerves
- Neck stiffness / Kernig's / Brudzinski's sign — meningism
- Fundoscopy if possible — papilledema suggests raised ICP
- Petechiae / purpura — meningococcal disease
- Skin: neurocutaneous markers (café-au-lait, ash-leaf spots) → epilepsy syndromes
- Growth parameters

KEY INVESTIGATIONS:
- Blood glucose (STAT, bedside — hypoglycemia must be excluded immediately)
- CBC, CRP — look for bacterial source of fever
- Sodium, calcium, magnesium — electrolytes if prolonged or atypical
- Blood culture if toxic-looking
- Malaria smear / RDT in endemic area
- LP (lumbar puncture): NOT routinely needed for simple febrile seizure. MUST do if: child <12 months, meningismus present, prolonged seizure, post-ictal confusion >1 hour
- EEG: NOT needed acutely for simple febrile seizure
- CT brain: NOT routine. Only if focal signs, raised ICP, complex seizure with unclear aetiology

MANAGEMENT PRINCIPLES:
- Acute: ABC, positioning, oxygen, IV/rectal diazepam if seizure >5 minutes
- Identify and treat fever source
- Reassure parents — 98% of simple febrile seizures are benign and self-limiting
- Recurrence risk: 30-35% have another febrile seizure; 2-3% develop epilepsy
- Anti-epileptic prophylaxis NOT recommended routinely for simple febrile seizures
- Educate family: diazepam rectal/nasal for home use if prolonged seizures
```

Generate equally detailed clinicalContent for all remaining 98 complaints following this exact format and level of clinical detail, with India-specific disease prevalence and drug availability considered throughout.

---

## 12. DESIGN SYSTEM

```javascript
// Primary accent
const TEAL = { primary: "#0F6E56", light: "#1D9E75", bg: "#E1F5EE", border: "#9FE1CB", text: "#085041" };
// Warning
const AMBER = { primary: "#EF9F27", bg: "#FAEEDA", border: "#FAC775", text: "#633806" };
// Danger
const RED = { primary: "#E24B4A", bg: "#FCEBEB", border: "#F7C1C1", text: "#791F1F" };
// Neutral
const GRAY = { dot: "#888780", bg: "#F1EFE8", text: "#444441" };

// Likelihood → color mapping
const LIKELIHOOD_COLORS = {
  high:   { dot: TEAL.light,    text: TEAL.text,   bg: TEAL.bg },
  medium: { dot: AMBER.primary, text: AMBER.text,  bg: AMBER.bg },
  low:    { dot: GRAY.dot,      text: GRAY.text,   bg: GRAY.bg },
};

// Highlight color for matched BM25 terms
const HIGHLIGHT_BG = "#FFF176";
```

---

## 13. COMPONENT ARCHITECTURE

```
App
├── SettingsPanel (slide-in, always available via gear icon)
├── Screen: Library
│   ├── DocumentVault (upload, index, clear)
│   ├── ComplaintLibrary (search, filter, grid)
│   │   └── ComplaintCard (name, category, edit, use)
│   └── PatientForm (age, sex, start button)
├── Screen: ComplaintEditor (modal)
│   └── RedFlagChips
├── Screen: Consultation
│   ├── ConsultationHeader
│   ├── RedFlagAlert
│   ├── HistoryScroll
│   ├── QuestionCard
│   ├── OptionButtons
│   ├── VoiceInput
│   ├── CustomTextInput
│   ├── DifferentialsPanel
│   │   └── DifferentialCard (clickable → opens Sidebar)
│   └── RetrievedContextPanel
├── Screen: DiagnosisSidebar (slide-in overlay)
│   └── Highlighted (text + yellow term highlighting)
└── Screen: ClinicalNote
```

---

## 14. STATE MANAGEMENT

Use a single `useReducer` at the App level (or multiple `useState` hooks — either is fine). Key state:

```javascript
// Global
const [phase, setPhase] = useState("library"); // "library" | "consultation" | "note"
const [apiKey, setApiKey] = useState(() => localStorage.getItem("clinicalmind:apikey") || "");
const [settingsOpen, setSettingsOpen] = useState(false);

// Index
const [idx] = useState(() => new BM25());
const [uploadedDocs, setUploadedDocs] = useState([]);
const [activeComplaint, setActiveComplaint] = useState(null); // full complaint object

// Patient
const [patientAge, setPatientAge] = useState("");
const [patientSex, setPatientSex] = useState("");

// Consultation
const [history, setHistory] = useState([]);
const [currentQuestion, setCurrentQuestion] = useState(null);
const [options, setOptions] = useState([]);
const [differentials, setDifferentials] = useState([]);
const [redFlags, setRedFlags] = useState([]);
const [retrieved, setRetrieved] = useState([]);
const [retrieveMs, setRetrieveMs] = useState(null);
const [loading, setLoading] = useState(false);

// Sidebar
const [sidebar, setSidebar] = useState({ open: false, diagnosis: "", chunks: [], ms: null });

// Note
const [clinicalNote, setClinicalNote] = useState("");

// Complaints
const [customComplaints, setCustomComplaints] = useState(() => {
  try { return JSON.parse(localStorage.getItem("clinicalmind:complaints") || "[]"); } 
  catch (_) { return []; }
});
```

---

## 15. CONSULTATION FLOW LOGIC

```
startConsultation():
  1. Chunk activeComplaint.clinicalContent → add to idx (if not already there)
  2. Chunk all uploaded docs → add to idx
  3. BM25 search: query = complaint name
  4. Build system prompt with top-2 retrieved chunks
  5. Call Claude streaming → parse JSON → set question/options/diffs/redFlags
  6. setPhase("consultation")

answerQuestion(answer):
  1. Push {q: currentQuestion, a: answer} to history
  2. Build retrieval query: buildRetrievalQuery(complaintName, last 7 answers)
  3. BM25 search → update retrieved state
  4. Build history string (last 7 Q&As only)
  5. Call Claude streaming → parse JSON
  6. If done:true OR history.length >= 13 → generateNote()
  7. Else → update question/options/diffs/redFlags

openSidebar(diagnosisName):
  1. Build query: diagnosisName + " symptoms diagnosis signs treatment"
  2. BM25 search (k=5) → instant
  3. setSidebar({ open: true, diagnosis, chunks, ms })
  // NO API CALL

generateNote():
  1. setPhase("note")
  2. Build prompt from full history + retrieved chunks
  3. Call Claude (non-streaming for note is fine)
  4. setClinicalNote(result)
```

---

## 16. ERROR HANDLING

- If API key missing or invalid when starting consultation: show inline error on the question card — "Add your Claude API key in Settings (⚙) to continue"
- If API call fails: show retry button on the question card — "API error. Tap to retry."
- If PDF.js fails to parse a PDF: show toast — "Could not parse PDF. Try saving as a text file."
- If BM25 has no chunks (no documents, no prebuilt selected): still work — pass empty string to Claude context and Claude uses general knowledge

---

## 17. PERFORMANCE REQUIREMENTS

- BM25 retrieval: must complete in under 5ms for up to 2000 chunks
- First streaming token from Claude: appears in UI within 800ms of request
- Sidebar open animation: 250ms CSS transition
- PDF parse (100 pages): must not block UI — use async/await with progress indicator showing "Parsing page X of Y"
- App must be usable on a 4G connection (1–5 Mbps) — the only network calls are the Claude API calls

---

## 18. WHAT NOT TO DO

- DO NOT use any state management library (Redux, Zustand, Jotai)
- DO NOT use any CSS framework (Tailwind, Bootstrap, Material UI)
- DO NOT use any pre-built component library
- DO NOT use React Router — single page, phase-based navigation
- DO NOT call an external embedding API for RAG — BM25 only
- DO NOT store patient data in any external service
- DO NOT make the API key visible in the UI by default (type="password")
- DO NOT use `alert()` or `confirm()` — use inline UI feedback only
- DO NOT generate the clinical note until the doctor explicitly requests it OR history.length >= 13
- DO NOT show more than 5 differentials at once
- DO NOT animate elements in a way that delays interaction (no loading spinners that block buttons)

---

## 19. FINAL OUTPUT REQUIREMENTS

The output must be a single `.jsx` file that:
1. Runs as a React component with `export default`
2. Contains all 100 complaint objects with full clinicalContent inline
3. Contains the BM25 class, tokenize, chunkText functions
4. Contains the Claude streaming function
5. Contains all 5 screens and the settings panel
6. Has no external dependencies except React hooks and the CDN fonts/PDF.js loaded dynamically
7. Works immediately when dropped into a React JSX artifact or Vite project
8. Has the API key read from localStorage — the app is unusable without it and shows a clear prompt to add it

---

---

## 20. WORKFLOW ENGINE — LOCAL-FIRST, AI AS FALLBACK

Each complaint object contains a `workflow` field — a structured decision tree that runs entirely in the browser:

```javascript
// Workflow node structure
{
  id: "node_001",
  question: "How long has the fever been?",
  options: [
    { label: "Less than 3 days",  next: "node_002", tags: ["short_duration"] },
    { label: "3–7 days",          next: "node_003", tags: ["medium_duration"] },
    { label: "More than 7 days",  next: "node_004", tags: ["prolonged_fever"], redFlag: false },
    { label: "More than 14 days", next: "node_005", tags: ["chronic_fever"],   redFlag: true, redFlagMessage: "Fever >14 days — consider TB, malaria, occult infection" }
  ],
  redFlagTriggers: [],   // evaluated regardless of which option is chosen
  updateDifferentials: true
}
```

### Execution logic:
1. Load complaint → start at `workflow.entryNode`
2. Doctor taps an option → follow the `next` pointer → render next node instantly (0ms, no API)
3. If a node's `next` is `"AI"` → call Claude with current history and retrieved context
4. If doctor types a custom answer that doesn't match any option → call Claude
5. If `redFlag: true` on any selected option → fire the red flag alert immediately, no API needed
6. Differentials update according to `diffWeights` map stored in the complaint — also local

### AI fallback triggers (only these cause an API call):
- Custom typed answer
- Node explicitly marked `next: "AI"`
- Doctor reaches the end of predefined branches but consultation is not complete
- Doctor taps "Ask AI instead" button on any question

### Differential weighting (local):
Each complaint stores a `diffWeights` object. As the doctor answers, the engine adds/subtracts weights locally:
```javascript
diffWeights: {
  "Malaria P. vivax":  { "tags_increase": ["rigors","intermittent","3-7days"], "tags_decrease": ["no_fever_pattern"] },
  "Dengue":            { "tags_increase": ["myalgia","rash","thrombocytopenia_sx"], "tags_decrease": ["rigors"] },
  "Typhoid":           { "tags_increase": ["prolonged_fever","constipation","relative_bradycardia"] }
}
```
Differentials panel updates after each answer with no API call — ranked by accumulated weight score.

---

## 21. DOCUMENT VAULT INTELLIGENCE

### Upload flow:
1. Doctor drops a file (PDF / .txt / .md / image)
2. System parses it (PDF.js for PDFs, FileReader for text, browser image display for images)
3. Show a "Document Preview" panel — first 500 chars of extracted text, or the image itself
4. Present two options:
   - **"Let AI build the workflow"** → call Claude once with the full extracted text → Claude returns a structured complaint object (name, question nodes, differentials, red flags) → show it in the Complaint Editor for doctor to review and approve
   - **"Build manually"** → open blank Complaint Editor pre-filled with the document's raw text as clinicalContent

### AI workflow generation prompt:
```
You are a clinical workflow builder. Given the following medical reference text, extract and generate a structured clinical complaint workflow in JSON.

Output exactly:
{
  "name": "complaint name",
  "category": "category",
  "clinicalContent": "full reference text cleaned",
  "redFlagKeywords": ["keyword1"],
  "commonDifferentials": ["diagnosis1"],
  "tags": ["tag1"],
  "workflow": {
    "entryNode": "node_001",
    "nodes": [
      { "id": "node_001", "question": "...", "options": [...] }
    ]
  }
}

Generate 8–14 question nodes covering essential history. Each node must have 3–4 options. Mark options that trigger red flags. India-specific disease prevalence.
```

### Complaint confirmation:
After AI generates the workflow OR doctor uploads any document that appears to contain multiple complaint sections, show a "Confirm Extracted Complaints" screen:
- List each detected complaint as a card with a checkbox
- Doctor reviews, unchecks any they don't want, edits names
- Tapping a complaint opens the Complaint Editor for that one
- "Save All Confirmed" button saves the checked ones to private library

### Image references:
When an image is uploaded:
- Show a preview thumbnail in the Document Vault
- Option A: "Use as visual reference only" — image stored and associated with a complaint; visible in sidebar when that complaint is active
- Option B: "Extract text from image (OCR)" — call Claude vision API with the image to extract text, then treat as a text document
- In the sidebar, if a complaint has an associated image, show a "View Image" button that opens the image in a lightbox

### Auto-tagging in background:
As the consultation progresses and the doctor's answers accumulate, run a background BM25 query (every 3 answers) against all uploaded documents. Automatically surface the top-matching document in the sidebar "Context used" panel. No doctor action required — relevant sources float up automatically as the history deepens.

### Document-to-card mapping:
Each document chunk carries metadata about which differential diagnoses it is most relevant to. This is computed at index time:
```javascript
// At index time, for each chunk, compute which complaints/diagnoses it best matches
chunk.autoTags = idx.search(SYSTEM_COMPLAINTS.map(c => c.name).join(" "), 3).map(r => r.source);
```
When doctor clicks a differential, the sidebar first shows chunks whose `autoTags` include that diagnosis, before falling back to BM25 scoring.

---

## 22. COMMUNITY LIBRARY PAGE (separate screen)

Add a sixth screen: `"community"` phase.

### Layout:
- Header: "Community Library" + search box + filter bar
- Filter bar chips: All / Specialty / Top Rated / Recently Added / By Author
- Author search dropdown (type to search authors)
- Complaint grid — same card style as personal library but with extra metadata:
  - Author name + specialty badge
  - Star rating (1–5, doctor can rate after using)
  - Usage count ("Used by 142 doctors")
  - "Fork" button (creates private copy)
  - "Use" button (uses directly without forking)

### Data model for community complaint:
```javascript
{
  ...complaintObject,
  source: "community",
  author: "Dr. Priya Mehta",
  authorSpecialty: "Paediatrics",
  institution: "AIIMS Patna",   // optional, user-provided
  rating: 4.2,
  ratingCount: 38,
  usageCount: 142,
  publishedAt: "ISO string",
  version: 3,
  changelog: "Added dengue pathway, updated UTI antibiotics per 2024 guidelines"
}
```

### For MVP — no backend:
- Community complaints are distributed as JSON files that doctors share
- Import: "Import community complaint" button → file picker for .json
- Export/Publish: "Make Public" → downloads a .json with community metadata
- Future: replace with a cloud API endpoint

### Forking:
- Clicking "Fork" on any community or system complaint creates a private copy under a new ID
- The fork's `forkedFrom` field stores the original complaint's ID and author
- Editing a fork never touches the original

---

## 23. PLATFORM TARGETS

### Browser (primary):
- Chrome 90+, Edge 90+, Safari 15+, Firefox 88+
- Web Speech API only available on Chrome/Edge — show a graceful message on Firefox/Safari: "Voice input requires Chrome or Edge"
- All BM25 and workflow logic in browser JS, no server

### Mobile (responsive web):
- Breakpoint: < 640px = mobile layout
- Consultation screen: stack left/right columns vertically, differentials below questions
- Sidebar: full-width overlay on mobile
- Touch targets: minimum 44px height for all tap targets
- Voice input is the primary input method on mobile — "Speak" button prominently displayed

### Desktop app (Electron):
- Same React codebase wrapped in Electron
- Advantage: true offline support, local file system access for saving complaints
- SQLite (via better-sqlite3) for complaint and session storage instead of localStorage
- Desktop app checks for localStorage and falls back to SQLite if available
- Build target: Windows (.exe) and macOS (.dmg)
- Note: Electron packaging is out of scope for the initial JSX file — spec the web app first, note that it will be wrapped in Electron for desktop

---

## 24. CACHING AND OFFLINE STRATEGY

### IndexedDB for large data (use idb-keyval or raw IndexedDB):
```javascript
// Store complaint library (can be large with 100 prebuilts + community)
await idb.set("complaints:system", SYSTEM_COMPLAINTS);
await idb.set("complaints:private", privateComplaints);

// Cache BM25 index snapshot for fast reload
await idb.set("bm25:snapshot", { docs: idx.docs, df: idx.df, avgdl: idx.avgdl });
```

### localStorage for small/frequent data:
```javascript
"clinicalmind:apikey"        // API key
"clinicalmind:settings"      // User preferences
"clinicalmind:lastcomplaint" // Last used complaint ID for quick resume
```

### Service Worker (PWA):
- Cache the app shell (HTML, JS, CSS, fonts) so the app loads from cache on next visit
- This makes the app load in under 1 second even on slow connections after first visit
- Complaints and index are served from IndexedDB, not network

### BM25 index pre-warming:
- At app startup, in a Web Worker (background thread), load all complaint clinicalContent, chunk it, and build the BM25 index
- This happens in the background while the doctor is on the Library screen
- By the time consultation starts, the index is already built — 0ms retrieval from first question

### Session caching:
- Last 20 consultation sessions stored in IndexedDB
- Each session: full Q&A history, differentials, note, timestamp
- Accessible from a "Recent Consultations" view (secondary feature, not blocking launch)

---

## 25. FULL DIAGNOSIS MANAGEMENT AND WORKUP

Each differential in the system must have, accessible from the sidebar, a complete management section. This is stored as part of the complaint's `clinicalContent` but structured with explicit section headers:

```
## DIAGNOSIS: [Diagnosis Name]

### DIAGNOSTIC CRITERIA
[Standard criteria — cite textbook if applicable]

### CONFIRMATORY INVESTIGATIONS
[Specific tests to confirm this diagnosis]

### IMMEDIATE MANAGEMENT
[First-line actions in an OPD setting]

### COMPLETE WORKUP
[Full investigation panel, imaging, specialist referral indications]

### WARNING SIGNS — WHEN TO ESCALATE
[Specific signs that require hospital admission or emergency referral]

### TREATMENT (India context)
[Drug names, doses, duration — aligned with Indian drug availability and resistance patterns]

### STANDARD REFERENCE
[Textbook citation: e.g. Nelson's Textbook of Paediatrics 21e, Chapter X; or IAP Guidelines 2023]
```

When the doctor clicks a diagnosis in the sidebar, if the retrieved chunk contains one of these sections, it is displayed with section headers styled distinctly (bold, colored). If the chunk only contains reference text without a management section, a button appears: **"Get full workup"** — this makes a single Claude API call asking for the complete management of that diagnosis in the Indian pediatric context, and caches the result to IndexedDB so the same query never hits the API twice.

### Standard reference citations:
The following references should be cited in clinicalContent where applicable:
- Nelson's Textbook of Paediatrics (21st edition) — for all pediatric complaints
- IAP (Indian Academy of Pediatrics) standard treatment guidelines — India-specific protocols
- IMNCI (Integrated Management of Neonatal and Childhood Illness) — for under-5 complaints
- WHO Pocket Book for Hospital Care of Children — for resource-limited settings
- Harrison's Principles of Internal Medicine — for general medicine complaints
- Standard Treatment Workflows (STW) issued by Ministry of Health and Family Welfare, India

---

## 26. SCREENS — UPDATES TO SECTION 3

### Add to Screen 1 (LIBRARY):
- Complaint cards now show a colored border if they have a complete local workflow (green) vs AI-only (amber) vs no workflow (gray)
- Multi-select mode: long-press any complaint card to enter multi-select, then select additional cards. "Start with X complaints" button appears at bottom.
- "Recent" section at top showing last 3 used complaints for quick access

### Add Screen 6: COMMUNITY LIBRARY
- Separate tab/nav item
- As described in Section 22

### Update Screen 2 (COMPLAINT EDITOR):
- Add "Workflow Builder" tab alongside the current fields tab
- Workflow Builder: visual list of question nodes, each expandable. Add node, edit question/options, set branching logic, mark red flag options.
- "Test Workflow" button: runs through the workflow in a mini-preview pane

### Update Screen 4 (DIAGNOSIS SIDEBAR):
- If the clicked diagnosis has a management section in the retrieved chunks, show it with styled headers
- "Get full workup" button if management section is absent
- "View source image" button if an image reference is associated
- Chunks are pre-sorted at click time: management sections first, then reference text, then general mentions

---

## 27. WHAT CHANGED FROM PREVIOUS SECTIONS (reconciliation notes)

- **Section 3 Screen 1**: Complaint cards now show workflow status. Multi-select enabled.
- **Section 3 Screen 2**: Complaint Editor now has a Workflow Builder tab.
- **Section 5 (BM25)**: Index is now pre-warmed in a Web Worker at startup. `chunkText` adds `autoTags` to each chunk at index time.
- **Section 7 (Claude system prompt)**: AI is only called when workflow branches are exhausted or a custom answer is given. The system prompt should include: "The predefined workflow has been exhausted or the doctor gave a custom answer. Generate the next most important question."
- **Section 15 (Consultation flow)**: `answerQuestion()` now checks `currentNode.options` first. If the answer matches a predefined option, follow `next` pointer locally. Only call Claude if `next === "AI"` or answer is custom.
- **Section 16 (Error handling)**: Add: if workflow node not found, fall back to AI silently without showing an error.

---

*End of specification.*
