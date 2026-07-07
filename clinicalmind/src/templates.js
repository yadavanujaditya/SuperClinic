// ─── SuperSummary — annotated-sample templates (v4) ────────────────────────────
// A template is a REAL discharge summary (sampleBody) with a handful of words marked
// as fill-in slots ({{key}}). Everything not marked is fixed boilerplate, printed
// verbatim every time. Each slot carries a `default` (the original highlighted text)
// so the summary is complete out of the box and only changed slots update.
//
// Slot: { key, label, question, mandatory, default, ocrHints: [] }
// Fixed section sequence: DIAGNOSIS → CHIEF COMPLAINT → HOPI → GENERAL EXAMINATION →
// VITALS → SYSTEMIC EXAMINATION → TREATMENT GIVEN → COURSE OF TREATMENT IN HOSPITAL →
// TREATMENT ADVICE AT DISCHARGE → NEXT REVIEW.

export const SECTION_SEQUENCE = [
  "DIAGNOSIS", "CHIEF COMPLAINT", "HISTORY OF PRESENT ILLNESS",
  "GENERAL EXAMINATION", "VITALS", "SYSTEMIC EXAMINATION",
  "TREATMENT GIVEN", "COURSE OF TREATMENT IN HOSPITAL",
  "TREATMENT ADVICE AT DISCHARGE", "NEXT REVIEW",
];

const slot = (key, label, def, opts = {}) => ({
  key, label, default: def,
  question: opts.question || label + "?",
  mandatory: opts.mandatory ?? false,
  ocrHints: opts.ocrHints || [],
  options: opts.options || [],   // if non-empty, this blank is answered with chips (+ custom text)
});

export const SYSTEM_TEMPLATES = [
  {
    id: "tpl_neonatal_jaundice",
    name: "Neonatal Jaundice",
    diagnosis: "Neonatal Jaundice",
    category: "Newborn",
    source: "system",
    slots: [
      slot("age", "Age", "3 days", { mandatory: true }),
      slot("sex", "Sex", "male", { mandatory: true, options: ["male", "female"] }),
      slot("complaint_duration", "Duration of complaint", "2 days", { mandatory: true }),
      slot("kramer", "Icterus (Kramer zone)", "zone 3"),
      slot("birth_weight", "Birth weight (kg)", "3.0", { ocrHints: ["birth weight", "wt"] }),
      slot("hr", "Heart rate", "140", { ocrHints: ["hr", "pulse"] }),
      slot("rr", "Respiratory rate", "45", { ocrHints: ["rr", "resp"] }),
      slot("temp", "Temperature", "37°C", { ocrHints: ["temp"] }),
      slot("spo2", "SpO2", "98", { ocrHints: ["spo2", "saturation"] }),
      slot("tsb_admission", "TSB at admission", "8.2", { mandatory: true, ocrHints: ["tsb", "total bilirubin", "t.bil"] }),
      slot("tsb_discharge", "TSB at discharge", "2.1", { mandatory: true, ocrHints: ["tsb", "total bilirubin", "t.bil"] }),
      slot("photo_days", "Duration of phototherapy", "2 days"),
      slot("review_days", "Review after", "5 days"),
    ],
    sampleBody: `DIAGNOSIS
Neonatal Jaundice

CHIEF COMPLAINT
Yellowish discoloration of skin and eyes for {{complaint_duration}}.

HISTORY OF PRESENT ILLNESS
{{age}} old {{sex}} neonate, admitted with the above-mentioned complaint for routine newborn care. No history of fever, lethargy, or poor feeding.

GENERAL EXAMINATION
Baby active and afebrile. Icterus present up to {{kramer}}. No pallor, no cyanosis, no oedema. Birth weight - {{birth_weight}} kg.

VITALS
HR {{hr}}/MIN, RR {{rr}}/MIN, TEMP {{temp}}, SPO2 {{spo2}}%

SYSTEMIC EXAMINATION
CHEST - B/L AIR ENTRY EQUAL, NO ADDED SOUNDS
CVS - S1 S2 AUDIBLE, NO MURMUR
CNS - ACTIVITY, CRY, TONE NORMAL
P/A - SOFT, NON-TENDER, NO ORGANOMEGALY

TREATMENT GIVEN
Phototherapy given for {{photo_days}} along with supportive care and breastfeeding support.

COURSE OF TREATMENT IN HOSPITAL
Baby admitted in nursery. Total serum bilirubin monitored — {{tsb_admission}} mg/dL at admission, declining to {{tsb_discharge}} mg/dL at discharge. Baby remained euthermic and euglycemic throughout the stay, feeding well. Being discharged in a stable condition.

TREATMENT ADVICE AT DISCHARGE
Continue exclusive breastfeeding on demand. Watch for lethargy, poor feeding, high-pitched cry, or worsening yellowish discoloration — return immediately if present. Routine immunization as per schedule.

NEXT REVIEW
Pediatric OPD after {{review_days}} for repeat bilirubin if clinically indicated.`,
  },
  {
    id: "tpl_acute_hepatitis",
    name: "Acute Infective Hepatitis",
    diagnosis: "Acute Infective Hepatitis",
    category: "GI",
    source: "system",
    slots: [
      slot("age", "Age", "14 years", { mandatory: true }),
      slot("sex", "Sex", "male", { mandatory: true, options: ["male", "female"] }),
      slot("complaint_duration", "Duration of complaint", "5 days", { mandatory: true }),
      slot("hr", "Heart rate", "92", { ocrHints: ["hr", "pulse"] }),
      slot("rr", "Respiratory rate", "20", { ocrHints: ["rr", "resp"] }),
      slot("temp", "Temperature", "99°F", { ocrHints: ["temp"] }),
      slot("tsb_admission", "TSB at admission", "8.2", { mandatory: true, ocrHints: ["tsb", "total bilirubin"] }),
      slot("tsb_discharge", "TSB at discharge", "2.1", { mandatory: true, ocrHints: ["tsb", "total bilirubin"] }),
      slot("sgpt_admission", "SGPT at admission", "780", { ocrHints: ["sgpt", "alt"] }),
      slot("sgpt_discharge", "SGPT at discharge", "168", { ocrHints: ["sgpt", "alt"] }),
      slot("etiology", "Etiology (serology)", "Anti-HAV IgM positive (Hepatitis A)", { ocrHints: ["anti-hav", "hbsag", "hepatitis"] }),
      slot("liver_span", "Liver span below costal margin", "2 cm"),
      slot("review_days", "Review after", "1 week"),
    ],
    sampleBody: `DIAGNOSIS
Acute Infective Hepatitis

CHIEF COMPLAINT
Yellowish discoloration of eyes and dark-colored urine for {{complaint_duration}}.

HISTORY OF PRESENT ILLNESS
{{age}} old {{sex}} patient, admitted with the above-mentioned complaint associated with nausea, vomiting, and loss of appetite. No history of altered sensorium or bleeding manifestations.

GENERAL EXAMINATION
Conscious, oriented, icterus present. No pallor, no cyanosis, no oedema. No flapping tremor (asterixis) elicited.

VITALS
HR {{hr}}/MIN, RR {{rr}}/MIN, TEMP {{temp}}

SYSTEMIC EXAMINATION
P/A - SOFT, LIVER PALPABLE {{liver_span}} BELOW RIGHT COSTAL MARGIN, NON-TENDER, NO SPLENOMEGALY
CVS - S1 S2 AUDIBLE, NO MURMUR
CHEST - B/L AIR ENTRY EQUAL, NO ADDED SOUNDS
CNS - CONSCIOUS, ORIENTED, NO FLAPPING TREMOR

TREATMENT GIVEN
Managed conservatively with IV fluids, antiemetics, and a low-fat easily digestible diet. Hepatotoxic drugs withheld.

COURSE OF TREATMENT IN HOSPITAL
Serology: {{etiology}}. Liver function tests monitored — Total bilirubin declined from {{tsb_admission}} to {{tsb_discharge}} mg/dL and SGPT from {{sgpt_admission}} to {{sgpt_discharge}} U/L, a satisfactory downward trend. No signs of hepatic decompensation or encephalopathy at any point. Being discharged in a stable condition, accepting orals well.

TREATMENT ADVICE AT DISCHARGE
Adequate rest, low-fat high-carbohydrate diet, adequate hydration. Strict avoidance of hepatotoxic drugs including unsupervised paracetamol. Household contacts advised on safe drinking water and hand hygiene.

NEXT REVIEW
OPD after {{review_days}} with repeat LFT.`,
  },
  {
    id: "tpl_enteric_fever",
    name: "Enteric Fever",
    diagnosis: "Enteric Fever",
    category: "General",
    source: "system",
    slots: [
      slot("age", "Age", "8 years", { mandatory: true }),
      slot("sex", "Sex", "male", { mandatory: true, options: ["male", "female"] }),
      slot("fever_duration", "Duration of fever", "6 days", { mandatory: true }),
      slot("hr", "Heart rate", "110", { ocrHints: ["hr", "pulse"] }),
      slot("rr", "Respiratory rate", "22", { ocrHints: ["rr"] }),
      slot("temp", "Temperature", "101°F", { ocrHints: ["temp"] }),
      slot("widal", "Widal titre", "O 1:180, H 1:160", { ocrHints: ["widal", "titre"] }),
      slot("tlc", "TLC", "18000", { mandatory: true, ocrHints: ["tlc", "wbc"] }),
      slot("antibiotic", "Antibiotic given", "IV Ceftriaxone"),
      slot("afebrile", "Afebrile for", "48 hours"),
      slot("review_days", "Review after", "5 days"),
    ],
    sampleBody: `DIAGNOSIS
Enteric Fever

CHIEF COMPLAINT
High-grade fever for {{fever_duration}}.

HISTORY OF PRESENT ILLNESS
{{age}} old {{sex}} patient, admitted with the above-mentioned complaint associated with malaise and loss of appetite. No history of bleeding, altered sensorium, or abdominal distension.

GENERAL EXAMINATION
Conscious, oriented, febrile at admission. No pallor, no icterus, no oedema. Coated tongue present.

VITALS
HR {{hr}}/MIN, RR {{rr}}/MIN, TEMP {{temp}}

SYSTEMIC EXAMINATION
P/A - SOFT, MILD SPLENOMEGALY, NON-TENDER
CVS - S1 S2 AUDIBLE, NO MURMUR
CHEST - B/L AIR ENTRY EQUAL, NO ADDED SOUNDS
CNS - CONSCIOUS, ORIENTED, NO DEFICIT

TREATMENT GIVEN
{{antibiotic}} along with antipyretics and supportive care.

COURSE OF TREATMENT IN HOSPITAL
Widal test {{widal}}, TLC {{tlc}}/mm3 — consistent with enteric fever. Patient improved gradually and became afebrile for {{afebrile}} prior to discharge. No complications noted. Being discharged in a stable condition, tolerating orals well.

TREATMENT ADVICE AT DISCHARGE
Complete the full course of antibiotics. Adequate hydration and soft, easily digestible diet. Maintain hand hygiene and safe drinking water practices. Watch for recurrence of fever, abdominal pain, or GI bleeding.

NEXT REVIEW
OPD after {{review_days}}.`,
  },
  {
    id: "tpl_age_child",
    name: "Acute Gastroenteritis (Child)",
    diagnosis: "Acute Gastroenteritis",
    category: "GI",
    source: "system",
    slots: [
      slot("age", "Age", "2 years", { mandatory: true }),
      slot("sex", "Sex", "male", { mandatory: true, options: ["male", "female"] }),
      slot("duration", "Duration of symptoms", "2 days", { mandatory: true }),
      slot("hr", "Heart rate", "120", { ocrHints: ["hr", "pulse"] }),
      slot("rr", "Respiratory rate", "28", { ocrHints: ["rr"] }),
      slot("temp", "Temperature", "37°C", { ocrHints: ["temp"] }),
      slot("dehydration", "Dehydration at admission", "some dehydration"),
      slot("fluids", "Fluids given", "IV fluids, then ORS"),
      slot("review_days", "Review after", "3 days"),
    ],
    sampleBody: `DIAGNOSIS
Acute Gastroenteritis

CHIEF COMPLAINT
Loose stools and vomiting for {{duration}}.

HISTORY OF PRESENT ILLNESS
{{age}} old {{sex}} child, admitted with the above-mentioned complaint. No history of blood in stool, high-grade fever, or seizures.

GENERAL EXAMINATION
Child irritable at admission with {{dehydration}}. No pallor, no icterus, no oedema.

VITALS
HR {{hr}}/MIN, RR {{rr}}/MIN, TEMP {{temp}}

SYSTEMIC EXAMINATION
P/A - SOFT, NON-TENDER, NO ORGANOMEGALY
CVS - S1 S2 AUDIBLE, NO MURMUR
CHEST - B/L AIR ENTRY EQUAL, NO ADDED SOUNDS
CNS - CONSCIOUS, ACTIVE, NO DEFICIT

TREATMENT GIVEN
Rehydration with {{fluids}}, zinc supplementation, and supportive care.

COURSE OF TREATMENT IN HOSPITAL
Child rehydrated and monitored. Vomiting settled and oral intake resumed well. No electrolyte disturbance or complications noted. Being discharged in a stable, well-hydrated condition.

TREATMENT ADVICE AT DISCHARGE
Continue ORS after every loose stool. Continue age-appropriate diet — do not withhold food. Zinc for 14 days. Watch for decreased urine output, lethargy, sunken eyes, or blood in stool.

NEXT REVIEW
OPD after {{review_days}} or sooner if not improving.`,
  },
  {
    id: "tpl_cap",
    name: "Community-Acquired Pneumonia",
    diagnosis: "Community-Acquired Pneumonia",
    category: "Respiratory",
    source: "system",
    slots: [
      slot("age", "Age", "3 years", { mandatory: true }),
      slot("sex", "Sex", "male", { mandatory: true, options: ["male", "female"] }),
      slot("duration", "Duration of symptoms", "3 days", { mandatory: true }),
      slot("hr", "Heart rate", "130", { ocrHints: ["hr", "pulse"] }),
      slot("rr", "Respiratory rate", "50", { ocrHints: ["rr"] }),
      slot("temp", "Temperature", "101°F", { ocrHints: ["temp"] }),
      slot("spo2_admission", "SpO2 at admission", "92", { mandatory: true, ocrHints: ["spo2", "saturation"] }),
      slot("spo2_discharge", "SpO2 at discharge", "98", { ocrHints: ["spo2", "saturation"] }),
      slot("antibiotic", "Antibiotic given", "IV Ceftriaxone"),
      slot("review_days", "Review after", "5 days"),
    ],
    sampleBody: `DIAGNOSIS
Community-Acquired Pneumonia

CHIEF COMPLAINT
Fever, cough, and fast breathing for {{duration}}.

HISTORY OF PRESENT ILLNESS
{{age}} old {{sex}} child, admitted with the above-mentioned complaint. No history of cyanosis, seizures, or inability to feed.

GENERAL EXAMINATION
Child febrile with respiratory distress at admission — subcostal retractions present. No cyanosis, no oedema.

VITALS
HR {{hr}}/MIN, RR {{rr}}/MIN, TEMP {{temp}}, SPO2 {{spo2_admission}}%

SYSTEMIC EXAMINATION
CHEST - CREPITATIONS PRESENT, DECREASED AIR ENTRY ON AFFECTED SIDE
CVS - S1 S2 AUDIBLE, NO MURMUR
P/A - SOFT, NON-TENDER
CNS - CONSCIOUS, ACTIVE

TREATMENT GIVEN
{{antibiotic}}, oxygen support as required, antipyretics, and supportive care.

COURSE OF TREATMENT IN HOSPITAL
Child treated and monitored. Respiratory distress settled and SpO2 improved to {{spo2_discharge}}% on room air. Became afebrile and started feeding well. Being discharged in a stable condition.

TREATMENT ADVICE AT DISCHARGE
Complete the full course of antibiotics. Adequate nutrition and hydration. Watch for fast breathing, chest indrawing, inability to feed, or lethargy. Ensure pneumococcal vaccination if due.

NEXT REVIEW
OPD after {{review_days}}.`,
  },
  {
    id: "tpl_febrile_seizure",
    name: "Febrile Seizure",
    diagnosis: "Febrile Seizure",
    category: "Neuro",
    source: "system",
    slots: [
      slot("age", "Age", "2 years", { mandatory: true }),
      slot("sex", "Sex", "male", { mandatory: true, options: ["male", "female"] }),
      slot("seizure_duration", "Seizure duration", "less than 5 minutes"),
      slot("hr", "Heart rate", "120", { ocrHints: ["hr", "pulse"] }),
      slot("rr", "Respiratory rate", "26", { ocrHints: ["rr"] }),
      slot("temp", "Temperature", "102°F", { ocrHints: ["temp"] }),
      slot("fever_source", "Source of fever", "upper respiratory tract infection"),
      slot("review_days", "Review after", "1 week"),
    ],
    sampleBody: `DIAGNOSIS
Simple Febrile Seizure

CHIEF COMPLAINT
An episode of seizure with fever.

HISTORY OF PRESENT ILLNESS
{{age}} old {{sex}} child, admitted following a seizure episode lasting {{seizure_duration}} in the setting of fever due to {{fever_source}}. No history of prior afebrile seizures or neurological deficit.

GENERAL EXAMINATION
Child conscious and active post-ictally. Febrile. No pallor, no icterus, no oedema.

VITALS
HR {{hr}}/MIN, RR {{rr}}/MIN, TEMP {{temp}}

SYSTEMIC EXAMINATION
CNS - CONSCIOUS, ORIENTED, NO FOCAL DEFICIT, NO MENINGEAL SIGNS
CHEST - B/L AIR ENTRY EQUAL, NO ADDED SOUNDS
CVS - S1 S2 AUDIBLE, NO MURMUR
P/A - SOFT, NON-TENDER

TREATMENT GIVEN
Antipyretics and supportive care. Fever source treated appropriately.

COURSE OF TREATMENT IN HOSPITAL
Child observed for recurrence — remained seizure-free during the stay. Became afebrile and fully conscious with no residual neurological deficit. Being discharged in a stable condition.

TREATMENT ADVICE AT DISCHARGE
Antipyretics (Paracetamol) for fever control. Parent education on seizure first-aid and when to seek emergency care. Watch for recurrent seizures, prolonged seizure (>5 min), or altered sensorium.

NEXT REVIEW
Pediatric OPD after {{review_days}}; refer to Neurology if recurrent or complex.`,
  },
];

export function emptyTemplate() {
  return { id: "", name: "", diagnosis: "", category: "General", source: "private", sampleBody: "", slots: [] };
}

// Split a sampleBody into an ordered list of parts: {type:'text', text} | {type:'slot', key}
export function parseTemplateParts(body) {
  const parts = [];
  if (!body) return parts;
  const re = /\{\{(\w+)\}\}/g;
  let last = 0, m;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push({ type: "text", text: body.slice(last, m.index) });
    parts.push({ type: "slot", key: m[1] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
  return parts;
}

// Fill {{key}} with the entered value, else the slot's default, else a visible placeholder.
export function fillTemplate(body, values, slots) {
  if (!body) return "";
  const defaults = Object.fromEntries((slots || []).map(s => [s.key, s.default]));
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = values[key];
    if (v != null && v !== "") return v;
    if (defaults[key]) return defaults[key];
    return `[${key}]`;
  });
}
