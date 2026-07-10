import { useState, useRef, useEffect } from "react";
import { fillTemplate } from "./templates.js";
import { callAIStream, parseJSON, getGenericInstructions, getDetailedInstructions } from "./api.js";
import { saveSummaryRecord } from "./records.js";
import { RatingPrompt } from "./RatingPrompt.jsx";
import { TEAL, RED, PURPLE, Btn, Card, inputS } from "./SuperSummaryShared.jsx";
import { DocumentIntake } from "./DocumentIntake.jsx";
import { SafetyCheckPanel } from "./SafetyCheckPanel.jsx";
import { SaveAsTemplateModal } from "./SaveAsTemplateModal.jsx";

export function SuperFastAiWizard({ template, provider, apiKey, onCancel, onSaveAsTemplate, existingTemplates = [] }) {
  const [step, setStep] = useState(1); // 1: Confirm Profile, 2: Select Type, 3: Clinical Intake, 4: AI Checklist, 5: Narrative Summary
  const [wizardSaveModal, setWizardSaveModal] = useState(false);
  const [wizardSavedToast, setWizardSavedToast] = useState(false);
  const [confirmedDiagnosis, setConfirmedDiagnosis] = useState(template.diagnosis || "");
  const [confirmedAge, setConfirmedAge] = useState(() => {
    const ageSlot = template.slots.find(s => s.key === "age");
    return ageSlot ? ageSlot.default : "3 days";
  });
  const [summaryType, setSummaryType] = useState("detailed"); // template | generic | detailed
  
  // Intake Step States
  const [docs, setDocs] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [notesText, setNotesText] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const recRef = useRef(null);
  const [processingIntake, setProcessingIntake] = useState(false);

  // Structured temporary single-session patient memory
  const [patientMemory, setPatientMemory] = useState(null);

  // AI-parsed editable previews shown below each card in Step 3
  const [clinicalText, setClinicalText] = useState("");
  const [compilingClinical, setCompilingClinical] = useState(false);
  const [investigationsText, setInvestigationsText] = useState("");
  const [compilingInvestigations, setCompilingInvestigations] = useState(false);

  // Dynamic clinical gap checklist states
  const [missingChecklist, setMissingChecklist] = useState([]);
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [answers, setAnswers] = useState({});

  // Summary generation states
  const [summaryText, setSummaryText] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");
  const [savedSummaryId, setSavedSummaryId] = useState(null);

  // Auto-compile clinical docs when all uploads finish
  const prevDoneDocs = useRef(0);
  useEffect(() => {
    const doneNow = docs.filter(d => d.status === "done").length;
    const hasProcessing = docs.some(d => d.status === "processing");
    if (doneNow > 0 && !hasProcessing && doneNow !== prevDoneDocs.current && apiKey) {
      prevDoneDocs.current = doneNow;
      compileCardText(docs, "clinical");
    }
  }, [docs]);

  // Auto-compile investigation reports when all uploads finish
  const prevDoneInv = useRef(0);
  useEffect(() => {
    const doneNow = investigations.filter(d => d.status === "done").length;
    const hasProcessing = investigations.some(d => d.status === "processing");
    if (doneNow > 0 && !hasProcessing && doneNow !== prevDoneInv.current && apiKey) {
      prevDoneInv.current = doneNow;
      compileCardText(investigations, "investigations");
    }
  }, [investigations]);

  // AI helper: parse a batch of OCR docs into a structured human-readable text preview
  const compileCardText = async (docList, cardType) => {
    const readyDocs = docList.filter(d => d.status === "done" && d.ocrText);
    if (!readyDocs.length || !apiKey) return;
    if (cardType === "clinical") setCompilingClinical(true);
    else setCompilingInvestigations(true);
    const combined = readyDocs.map((d, i) => `--- Document ${i+1}: ${d.name} ---\n${d.ocrText}`).join("\n\n");
    const isInv = cardType === "investigations";
    const prompt = isInv
      ? `You are a clinical lab data parser. Parse the OCR text of lab/investigation reports for a patient (Diagnosis: ${confirmedDiagnosis}, Age: ${confirmedAge}).

TASK: Build a PIVOT TABLE where:
- Rows = individual test names (with units in brackets, e.g. "SGPT (U/L)")
- Columns = report dates in DD-MM-YYYY format, sorted in ascending order
- Cells = the result value for that test on that date (leave blank if not found)

STRICT RULES:
1. Only include test values you can CLEARLY identify in the OCR text — do NOT guess or hallucinate values.
2. If a date cannot be extracted from the report, use "Unknown" as the column header.
3. Each distinct date found in the reports becomes one column.
4. If the same test appears under both known and unknown dates, put them in separate columns.
5. Do NOT repeat test names — merge results into the same row across dates.
6. Include unit in the test name column, e.g. "SGPT (U/L)".
7. Format as a proper markdown table.

After the table, write a concise 2-3 line summary of key trends (e.g. improving, worsening, normal).

OCR TEXT:
${combined.slice(0, 7000)}

Return markdown table + summary. No JSON. No extra explanation.`
      : `You are a clinical data parser. Parse the following clinical document OCR text for a patient with diagnosis: ${confirmedDiagnosis} (Age: ${confirmedAge}).

Extract and organize as structured plain text:
- Demographics (if found)
- Chief Complaints & History
- Vitals (if found)
- Examination Findings
- Hospital Course / Treatment Given

OCR TEXT:
${combined.slice(0, 6000)}

Return organized plain text. Be concise. No JSON.`;
    try {
      let out = "";
      await callAIStream([{ role: "user", content: prompt }], "You are a precise clinical data parser. Output clean structured text.", provider, apiKey, t => { out = t; });
      if (isInv) setInvestigationsText(out.trim());
      else setClinicalText(out.trim());
    } catch (e) {
      console.warn("compileCardText failed silently:", e);
    }
    if (cardType === "clinical") setCompilingClinical(false);
    else setCompilingInvestigations(false);
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge."); return; }
    const rec = new SR(); rec.lang = "en-IN"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => setNotesText(Array.from(e.results).map(r => r[0].transcript).join(" "));
    rec.onend = () => setVoiceOn(false);
    rec.start(); recRef.current = rec; setVoiceOn(true);
  };

  // Toggles selecting multiple options and joins them as a pipe-separated string
  const toggleAnswerOption = (key, opt) => {
    setAnswers(prev => {
      const current = prev[key] || "";
      const items = current.split("|").map(x => x.trim()).filter(Boolean);
      if (items.includes(opt)) {
        const next = items.filter(x => x !== opt).join(" | ");
        return { ...prev, [key]: next };
      } else {
        const next = [...items, opt].join(" | ");
        return { ...prev, [key]: next };
      }
    });
  };

  // Memory Compiler Phase: Parse raw OCR reports & notes into temporary patient facts
  const compilePatientMemory = async () => {
    if (!apiKey) return;
    setProcessingIntake(true);
    // Use the AI-compiled & user-edited preview text if available, else fallback to raw OCR
    const docText = clinicalText.trim() || docs.filter(d => d.status === "done").map(d => d.ocrText).join("\n\n");
    const invText = investigationsText.trim() || investigations.filter(d => d.status === "done").map(d => `OCR TEXT:\n${d.ocrText}`).join("\n\n");
    const allText = [
      docText ? `PATIENT CLINICAL HISTORY/PROGRESS RECORDS:\n${docText}` : "",
      invText ? `LABORATORY REPORTS & INVESTIGATIONS:\n${invText}` : "",
      notesText.trim() ? `DOCTOR TYPED NOTES:\n${notesText}` : ""
    ].filter(Boolean).join("\n\n");

    const prompt = `You are a clinical data compiler. Parse the unstructured reports and notes below and build a structured, compiled clinical record.
DIAGNOSIS: ${confirmedDiagnosis}
AGE: ${confirmedAge}

TEXT TO PARSE:
${allText.slice(0, 6000)}

Return ONLY valid JSON matching this exact structure:
{
  "confirmedDiagnosis": "string",
  "confirmedAge": "string",
  "summaryType": "${summaryType}",
  "extractedFacts": {
    "demographics": { "sex": "male|female|other", "birthWeight": "string or unknown" },
    "symptomsAndHopi": ["symptom 1 with duration", "symptom 2"],
    "generalExamination": ["general exam findings, e.g. severe dehydration, pallor"],
    "systemicExamination": ["systemic exam findings, e.g. chest clear"],
    "vitals": { "temp": "string", "hr": "string", "rr": "string", "spo2": "string" },
    "investigations": [{"test": "test name", "result": "result value", "dateTime": "date time or unknown"}],
    "treatmentsAndCourse": ["treatments given, hospital course events, e.g., FFP transfused, phototherapy"]
  }
}
No markdown. No extra keys.`;

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a precise clinical data compiler. Output only valid JSON.",
        provider,
        apiKey,
        t => { raw = t; }
      );
      const parsed = parseJSON(raw);
      if (parsed) {
        setPatientMemory(parsed);
        await analyzeWizardGaps(parsed, answers);
        setStep(4);
      } else {
        const fallback = {
          confirmedDiagnosis,
          confirmedAge,
          summaryType,
          extractedFacts: { demographics: {}, symptomsAndHopi: [], generalExamination: [], systemicExamination: [], vitals: {}, investigations: [], treatmentsAndCourse: [] }
        };
        setPatientMemory(fallback);
        await analyzeWizardGaps(fallback, answers);
        setStep(4);
      }
    } catch (err) {
      alert("Failed to process clinical details: " + err.message);
    } finally {
      setProcessingIntake(false);
    }
  };

  // Gap Analysis Phase: Find missing details based on Mode (Template-based, Generic, Detailed)
  // Merges the user's checklistAnswers into the memory representation to avoid repeated questions.
  const analyzeWizardGaps = async (memory, currentAnswers = answers) => {
    if (!apiKey) return;
    setCheckingMissing(true);
    
    // Inject checklist answers into the memory context object for Claude to review
    const memoryWithAnswers = {
      ...memory,
      checklistAnswers: currentAnswers
    };
    
    const memoryText = JSON.stringify(memoryWithAnswers, null, 2);
    let prompt = "";

    if (summaryType === "template") {
      prompt = `You are a clinical assistant. Analyze the selected template slots, compiled patient details, and already answered questions below to find empty or unresolved blanks.
TEMPLATE SLOTS:
${template.slots.map(s => `- ${s.key}: ${s.label}${s.ocrHints?.length ? ` (${s.ocrHints.join(", ")})` : ""}`).join("\n")}

COMPILED PATIENT DETAILS & ANSWERS:
${memoryText}

Identify which template slots are still MISSING or UNRESOLVED. For each missing slot, provide:
- A short key (must match the template slot key exactly, e.g. "tsb_discharge")
- A clear label (e.g. "TSB at discharge")
- A list of typical multiple-choice options (2 to 4 options maximum) OR an empty list if it's a numeric/free-text value.

Return ONLY a valid JSON object of this structure:
{"missing": [{"key": "string", "label": "string", "options": ["opt1", "opt2", ...]}]}
Suggest ALL missing relevant parameters in a single response (up to 10-12 parameters maximum if needed). Do not drip-feed questions. Do NOT generate questions for any parameters that are already answered or known in "checklistAnswers" or "extractedFacts". No markdown.`;
    } else if (summaryType === "generic") {
      prompt = `You are a clinical assistant. For a GENERIC (minimal information) discharge summary for diagnosis "${confirmedDiagnosis}" and age "${confirmedAge}", we need to ensure the basic core clinical details are documented.
COMPILED PATIENT DETAILS & ANSWERS:
${memoryText}

Identify which minimal core parameters (e.g., primary discharge vital, key outcome parameter, feeding/activity status, or details of treatment given/hospital course) are still MISSING or UNKNOWN. For each missing core parameter, provide:
- A short key (e.g. "feeding_status", "treatment_given")
- A clear label (e.g. "Feeding status at discharge", "Course of treatment in hospital")
- A list of typical options (2 to 4 options) OR empty list for text.

Return ONLY a valid JSON object of this structure:
{"missing": [{"key": "string", "label": "string", "options": ["opt1", "opt2", ...]}]}
Suggest ALL missing core parameters in a single response (up to 10-12 parameters maximum if needed). Do not drip-feed questions. Do NOT generate questions for any parameters that are already answered or known in "checklistAnswers" or "extractedFacts". No markdown.`;
    } else {
      prompt = `You are a clinical assistant. For a DETAILED, comprehensive, academic-grade discharge summary for diagnosis "${confirmedDiagnosis}" and age "${confirmedAge}", we must check for any missing critical clinical parameters, lab results, exam findings, or screen plans.
COMPILED PATIENT DETAILS & ANSWERS:
${memoryText}

Identify which critical detailed investigations, symptom characteristics, exam findings, or treatment details are still MISSING or UNKNOWN. For each missing parameter, provide:
- A short key (e.g. "dct_result", "g6pd_status", "neuro_exam")
- A clear label (e.g. "Direct Coombs Test (DCT)", "G6PD status")
- A list of typical options (2 to 4 options) OR empty list for text.

Return ONLY a valid JSON object of this structure:
{"missing": [{"key": "string", "label": "string", "options": ["opt1", "opt2", ...]}]}
Suggest ALL missing relevant parameters in a single response (up to 10-12 parameters maximum if needed). Do not drip-feed questions. Do NOT generate questions for any parameters that are already answered or known in "checklistAnswers" or "extractedFacts". No markdown.`;
    }

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a clinical assistant identifying missing information. Output only valid JSON.",
        provider,
        apiKey,
        t => { raw = t; }
      );
      const parsed = parseJSON(raw);
      if (parsed && Array.isArray(parsed.missing)) {
        setMissingChecklist(parsed.missing);
      } else {
        setMissingChecklist([]);
      }
    } catch (err) {
      console.error("Failed to analyze gaps in wizard", err);
    } finally {
      setCheckingMissing(false);
    }
  };

  // Narrative Generation Phase
  const generateWizardSummary = async () => {
    if (!apiKey) return;
    setGeneratingSummary(true);
    setEditing(false);
    setSummaryText("✨ AI is synthesizing the final discharge summary...");

    const filledAnswersText = Object.entries(answers)
      .filter(([_, v]) => v && v.trim())
      .map(([k, v]) => {
        const item = missingChecklist.find(d => d.key === k);
        const cleanVal = v.split("|").map(x => x.trim()).filter(Boolean).join(", ");
        return `- ${item ? item.label : k}: ${cleanVal}`;
      })
      .join("\n");

    const memoryContext = JSON.stringify(patientMemory, null, 2);
    let prompt = "";

    if (summaryType === "template") {
      // Set values we have
      const defaultVals = Object.fromEntries(template.slots.map(s => [s.key, s.default]));
      const combinedAnswers = { ...defaultVals, ...answers };
      const filledTemplate = fillTemplate(template.sampleBody, combinedAnswers, template.slots);
      
      prompt = `You are a senior medical consultant. You must generate a discharge summary strictly following the template layout below, while merging in the compiled patient details and checklist answers.

TEMPLATE LAYOUT (WITH PRE-FILLED VALUES):
${filledTemplate}

COMPILED PATIENT DETAILS:
${memoryContext}

CHECKLIST ANSWERS:
${filledAnswersText}

INSTRUCTIONS:
1. Retain the exact sections and boilerplate of the TEMPLATE LAYOUT.
2. Intelligently merge the clinical details (like symptoms, examinations, investigations, treatments, clinical course) from the patient details and checklist answers into the corresponding template sections.
3. Ensure clinical cohesion. Weave findings (e.g. DCT results, FFP transfusions, dehydration history) smoothly and professionally.
4. The DIAGNOSIS section MUST use exactly TWO separate headings in this order:

   DIAGNOSIS
   [Clinical description of the condition, e.g.: Acute Infective Hepatitis with signs of liver cell failure, ascitis]

   PRIMARY DIAGNOSIS
   ICD-10 Code: B15.9 (Hepatitis A without hepatic coma)
   ICD-10 Code: K72.0 (Acute and subacute hepatic failure)
   ICD-10 Code: R17 (Unspecified jaundice)
   ICD-10 Code: R60.0 (Localized edema)

   ALL ICD-10 codes (primary and secondary) are listed together under PRIMARY DIAGNOSIS only. Do NOT create a separate SECONDARY DIAGNOSIS heading.
5a. Do NOT use any markdown bold syntax (**text**) anywhere in the summary. All labels and headings must be in PLAIN CAPITAL LETTERS only (e.g., HEART RATE, PRIMARY DIAGNOSIS).
5b. For vitals, use colon-dash style: Heart Rate:- 88/min, Respiratory Rate:- 20/min, Temperature:- 98.6°F (no asterisks, no bold).
6. If there are any patient reports, laboratory investigations, or clinical tests, CRITICAL RULE: the INVESTIGATIONS section must ONLY contain tests that were actually performed AND have an available result/value. NEVER list a test that is merely "Advised", ordered, planned, pending, awaited, or has no result — omit those entirely. If no investigation has an actual result, omit the INVESTIGATIONS section completely. For the tests that DO have results, you MUST format them under the heading "INVESTIGATIONS" as a clean, aligned plain-text ASCII grid trend table (using characters like +, -, and |) instead of default Markdown. The columns MUST represent absolute calendar dates formatted in DD-MM-YYYY format (e.g. | Test Name | 07-07-2026 | 08-07-2026 | ... |) sorted in chronological increasing order. You MUST NOT use relative day descriptors like "Day 2 of Life" or "Day 3". The rows must represent individual test parameters. Do NOT include reference ranges or units as separate columns. Pad columns with spaces so vertical borders align perfectly. Compatible with word processors.
7. Output ONLY the completed, refined discharge summary text. Do not include any introduction, formatting like markdown code blocks, or comments. Just output the final plain text summary.`;
    } else if (summaryType === "generic") {
      const genericInstructions = getGenericInstructions();
      prompt = `You are a senior medical consultant. Write a CONCISE, minimal, safe discharge summary for the patient.

CONFIRMED DIAGNOSIS: ${confirmedDiagnosis}
CONFIRMED AGE: ${confirmedAge}

COMPILED PATIENT DETAILS:
${memoryContext}

CHECKLIST ANSWERS:
${filledAnswersText}

INSTRUCTIONS:
${genericInstructions}`;
    } else {
      const detailedInstructions = getDetailedInstructions();
      prompt = `You are a senior medical consultant. Write a highly DETAILED, comprehensive, academic-grade discharge summary for this patient.

CONFIRMED DIAGNOSIS: ${confirmedDiagnosis}
CONFIRMED AGE: ${confirmedAge}

COMPILED PATIENT DETAILS:
${memoryContext}

CHECKLIST ANSWERS:
${filledAnswersText}

INSTRUCTIONS:
${detailedInstructions}`;
    }

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a senior medical consultant generating a discharge summary. Output only the final plain text summary.",
        provider,
        apiKey,
        t => {
          raw = t;
          setSummaryText(t);
        }
      );
      if (raw.trim()) {
        const saved = await saveSummaryRecord({ diagnosis: confirmedDiagnosis || template.diagnosis || template.name, template_name: template.name, source: "ai_wizard", text: raw });
        if (saved?.id) setSavedSummaryId(saved.id);
      }
    } catch (err) {
      alert("Failed to generate summary: " + err.message);
      setSummaryText("");
    } finally {
      setGeneratingSummary(false);
    }
  };

  const refineSummaryWithInstruction = async (instruction) => {
    if (!apiKey || !instruction.trim()) return;
    setGeneratingSummary(true);
    setRefinePrompt("");
    const prompt = `You are a senior medical consultant. We have generated the following discharge summary:

${summaryText}

The doctor has given the following instruction to edit/refine the summary:
"${instruction}"

Rewrite the discharge summary to incorporate the instruction. Retain the general facts, details, and layout structure of the original summary.
The DIAGNOSIS section MUST use exactly TWO separate headings:
   DIAGNOSIS
   [Clinical description of the condition]

   PRIMARY DIAGNOSIS
   ICD-10 Code: [primary code] ([primary condition name])
   ICD-10 Code: [secondary code] ([secondary condition name])
   (ALL ICD-10 codes listed under PRIMARY DIAGNOSIS only. No separate SECONDARY DIAGNOSIS heading.)
Do NOT use any markdown bold syntax (**text**) anywhere. All labels and headings must be in PLAIN CAPITAL LETTERS only. For vitals, use colon-dash style: Heart Rate:- 88/min (no asterisks). Output ONLY the updated complete plain text summary. Do not include markdown code block syntax.`;

    try {
      let raw = "";
      await callAIStream(
        [{ role: "user", content: prompt }],
        "You are a senior medical consultant editing a discharge summary. Output only the updated plain text summary.",
        provider,
        apiKey,
        t => {
          raw = t;
          setSummaryText(t);
        }
      );
    } catch (err) {
      alert("Failed to refine summary: " + err.message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      
      {/* Header with Step Tracker */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border-primary)", paddingBottom: 14 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: PURPLE.primary, background: PURPLE.bg, padding: "3px 8px", borderRadius: 12 }}>
            Step {step} of 5
          </span>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "6px 0 2px" }}>
            {step === 1 && "Confirm Patient Profile"}
            {step === 2 && "Select Summary Type"}
            {step === 3 && "Upload Reports & Notes"}
            {step === 4 && "AI Assistant: Refine Clinical Gaps"}
            {step === 5 && "Generated Discharge Summary"}
          </h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
            {step === 1 && "Confirm the diagnosis and age pre-filled from your template."}
            {step === 2 && "Choose how strictly the AI should structure the narrative."}
            {step === 3 && "Provide patient reports, investigations, and progress notes."}
            {step === 4 && "Check/fill missing critical details identified by the AI."}
            {step === 5 && "Review, edit, copy or save your final discharge summary."}
          </p>
        </div>
        <Btn testId="wizard-exit-btn" variant="ghost" small onClick={onCancel}>Exit Wizard</Btn>
      </div>

      {/* Step 1 Content */}
      {step === 1 && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Confirmed Diagnosis</label>
            <input value={confirmedDiagnosis} onChange={e => setConfirmedDiagnosis(e.target.value)} data-testid="wizard-diagnosis-input" style={inputS} placeholder="e.g. Neonatal Jaundice" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Confirmed Age</label>
            <input value={confirmedAge} onChange={e => setConfirmedAge(e.target.value)} data-testid="wizard-age-input" style={inputS} placeholder="e.g. 3 days" />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <Btn testId="wizard-step1-next-btn" onClick={() => setStep(2)}>Next →</Btn>
          </div>
        </Card>
      )}

      {/* Step 2 Content */}
      {step === 2 && (
        <Card>
          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>Select the narrative structure for the summary:</p>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, margin: "20px 0" }}>
            {[
              ...(template?.id !== "ai_mode" ? [{ type: "template", label: "📄 Template-Based", text: "Strictly follows the template boilerplate, layout, and sections. Best for formal hospital formats." }] : []),
              { type: "generic", label: "⚡ Generic", text: "Quick, minimal discharge summary. Focuses only on core diagnostics, vitals, and advice." },
              { type: "detailed", label: "🔬 Detailed", text: "Comprehensive, clinical narrative including history, full physical/neuro exam, labs, and warnings." }
            ].map(item => {
              const active = summaryType === item.type;
              return (
                <div key={item.type} onClick={() => setSummaryType(item.type)}
                  style={{
                    border: `2px solid ${active ? PURPLE.primary : "var(--color-border-primary)"}`,
                    background: active ? PURPLE.bg : "#fff",
                    borderRadius: 12, padding: 18, cursor: "pointer", transition: "all 0.2s ease-in-out",
                    boxShadow: active ? "var(--shadow-md)" : "var(--shadow-sm)"
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = PURPLE.border; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = "var(--color-border-primary)"; }}
                >
                  <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 6px", color: active ? PURPLE.primary : "var(--color-text-primary)" }}>{item.label}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>{item.text}</p>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 16 }}>
            <Btn testId="wizard-step2-back-btn" variant="ghost" onClick={() => setStep(1)}>← Back</Btn>
            <Btn testId="wizard-step2-next-btn" onClick={() => setStep(3)}>Next →</Btn>
          </div>
        </Card>
      )}

      {/* Step 3 Content */}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Card 1: Patient Clinical Details */}
          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: PURPLE.primary }}>📋 Patient Clinical Details & Notes</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
                Doctor's Clinical / Progress Notes <span style={{ fontWeight: 400 }}>(vitals, boluses, course, exceptions)</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={notesText} onChange={e => setNotesText(e.target.value)}
                  placeholder={voiceOn ? "Listening…" : "e.g., Baby admitted with severe dehydration, fluid bolus correction given, DCT positive, FFP transfused..."}
                  data-testid="wizard-notes-textarea"
                  style={{ ...inputS, minHeight: 100, resize: "vertical", flex: 1 }} />
                <button onClick={voiceOn ? () => { recRef.current?.stop(); setVoiceOn(false); } : startVoice}
                  data-testid="wizard-voice-toggle-btn"
                  style={{ padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1.5px solid ${voiceOn ? RED.primary : "var(--color-border-primary)"}`, background: voiceOn ? RED.bg : "#fff", color: voiceOn ? RED.primary : "var(--color-text-secondary)", flexShrink: 0 }}>
                  🎙 {voiceOn ? "Stop" : "Speak"}
                </button>
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Upload Clinical Documents <span style={{ fontWeight: 400 }}>(admission slips, prescriptions, progress charts)</span></label>
              <DocumentIntake docs={docs} setDocs={setDocs} provider={provider} apiKey={apiKey} />
            </div>
            {/* AI-parsed clinical preview */}
            {(compilingClinical || clinicalText) && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE.primary }}>✨ AI-Parsed Clinical Summary</span>
                  {compilingClinical && <span style={{ fontSize: 11, color: PURPLE.primary }}>⏳ Parsing…</span>}
                  {!compilingClinical && clinicalText && <span style={{ fontSize: 11, color: TEAL.primary }}>✓ Review and edit below</span>}
                </div>
                <textarea
                  value={compilingClinical ? "⏳ AI is parsing uploaded documents…" : clinicalText}
                  onChange={e => setClinicalText(e.target.value)}
                  readOnly={compilingClinical}
                  placeholder="AI-parsed clinical summary will appear here after upload. You can edit freely."
                  style={{ ...inputS, minHeight: 120, resize: "vertical", fontFamily: "monospace", fontSize: 12, background: compilingClinical ? "var(--color-background-secondary)" : "#fff" }}
                />
              </div>
            )}
          </Card>

          {/* Card 2: Patient Investigations */}
          <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: PURPLE.primary }}>🧪 Investigations & Laboratory Reports</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>Upload Lab Reports / Diagnostic Scans</label>
              <DocumentIntake docs={investigations} setDocs={setInvestigations} provider={provider} apiKey={apiKey} isInvestigation />
            </div>
            {/* AI-parsed investigations preview */}
            {(compilingInvestigations || investigationsText) && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE.primary }}>✨ AI-Parsed Investigations Table</span>
                  {compilingInvestigations && <span style={{ fontSize: 11, color: PURPLE.primary }}>⏳ Parsing…</span>}
                  {!compilingInvestigations && investigationsText && <span style={{ fontSize: 11, color: TEAL.primary }}>✓ Review below — dates as columns, tests as rows</span>}
                </div>
                {compilingInvestigations ? (
                  <div style={{ padding: 12, background: "var(--color-background-secondary)", borderRadius: 8, fontSize: 12, color: PURPLE.primary }}>⏳ AI is parsing lab reports…</div>
                ) : (() => {
                  const lines = investigationsText.split("\n").filter(l => l.trim().startsWith("|"));
                  const dataLines = lines.filter(l => !/^\|[\s:|-]+\|/.test(l));
                  const rows = dataLines.map(l =>
                    l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim())
                  );
                  if (rows.length < 2) return (
                    <textarea value={investigationsText} onChange={e => setInvestigationsText(e.target.value)}
                      placeholder="AI-parsed investigations table will appear here after upload."
                      data-testid="wizard-investigations-textarea-fallback"
                      style={{ ...inputS, minHeight: 140, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} />
                  );
                  const headers = rows[0];
                  const bodyRows = rows.slice(1);
                  return (
                    <>
                      <div style={{ overflowX: "auto", borderRadius: 8, border: "1.5px solid var(--color-border-primary)" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                          <thead>
                            <tr style={{ background: "var(--color-background-secondary)" }}>
                              {headers.map((h, i) => (
                                <th key={i} style={{
                                  padding: "8px 12px", textAlign: i === 0 ? "left" : "center",
                                  fontWeight: 700, borderBottom: "2px solid var(--color-border-secondary)",
                                  whiteSpace: "nowrap", color: "var(--color-text-primary)"
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {bodyRows.map((row, ri) => (
                              <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "var(--color-background-secondary)" }}>
                                {headers.map((_, ci) => {
                                  const cell = row[ci] ?? "";
                                  const isPositive = /positive/i.test(cell);
                                  const isNegative = /negative/i.test(cell);
                                  return (
                                    <td key={ci} style={{
                                      padding: "7px 12px",
                                      textAlign: ci === 0 ? "left" : "center",
                                      borderBottom: "1px solid var(--color-border-primary)",
                                      whiteSpace: "nowrap",
                                      fontWeight: ci === 0 ? 600 : 400,
                                      color: isPositive ? "#b91c1c" : isNegative ? "#15803d" : "var(--color-text-primary)",
                                    }}>{cell || <span style={{ color: "#ccc" }}>—</span>}</td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: 11, color: "var(--color-text-secondary)", cursor: "pointer" }}>✏️ Edit raw table</summary>
                        <textarea value={investigationsText} onChange={e => setInvestigationsText(e.target.value)}
                          data-testid="wizard-investigations-raw-textarea"
                          style={{ ...inputS, minHeight: 100, fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, marginTop: 6 }} />
                      </details>
                    </>
                  );
                })()}
              </div>
            )}
          </Card>

          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 10 }}>
            <Btn testId="wizard-step3-back-btn" variant="ghost" onClick={() => setStep(2)}>← Back</Btn>
            <Btn testId="wizard-step3-next-btn" onClick={compilePatientMemory} disabled={processingIntake || compilingClinical || compilingInvestigations}>
              {processingIntake ? "✨ Processing details..." : "✨ Process & Next →"}
            </Btn>
          </div>
        </div>
      )}

      {/* Step 4 Content */}
      {step === 4 && (() => {
        const isInvestigation = (item) => {
          const k = (item.key || "").toLowerCase();
          const l = (item.label || "").toLowerCase();
          const keywords = [
            "investigation", "test", "result", "lab", "cbc", "tsb", "bilirubin", "ultrasound", 
            "usg", "dct", "g6pd", "crp", "wbc", "hb", "plt", "level", "serum", "urine", "blood", 
            "count", "titer", "screen", "scan", "xray", "x-ray", "hemoglobin", "platelet", 
            "creatinine", "urea", "electrolyte", "sodium", "potassium", "bilirubin", "liver", "renal"
          ];
          return keywords.some(kw => k.includes(kw) || l.includes(kw));
        };

        const gapInvestigations = missingChecklist.filter(isInvestigation);
        const gapClinical = missingChecklist.filter(item => !isInvestigation(item));

        const renderGapItem = (item) => {
          const currentVal = answers[item.key] ?? "";
          const customVal = currentVal.split("|")
            .map(x => x.trim())
            .filter(x => !item.options.some(opt => opt.trim().toLowerCase() === x.toLowerCase()))
            .filter(Boolean)
            .join(" | ");
          return (
            <div key={item.key} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>{item.label}</p>
              {item.options && item.options.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  {item.options.map(opt => {
                    const isSelected = currentVal.split("|").map(x => x.trim().toLowerCase()).includes(opt.trim().toLowerCase());
                    return (
                      <button key={opt} onClick={() => toggleAnswerOption(item.key, opt)}
                        style={{ 
                          padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                          borderColor: isSelected ? PURPLE.primary : "var(--color-border-primary)", 
                          background: isSelected ? PURPLE.bg : "#fff", 
                          color: isSelected ? PURPLE.primary : "var(--color-text-secondary)" 
                        }}>
                        {opt}
                      </button>
                    );
                  })}
                  <input value={customVal} 
                    onChange={e => {
                      const selectedOpts = currentVal.split("|").map(x => x.trim()).filter(x => item.options.some(opt => opt.toLowerCase() === x.toLowerCase()));
                      const newCustom = e.target.value;
                      const nextVal = [...selectedOpts, newCustom].filter(x => x !== "").join(" | ");
                      setAnswers(prev => ({ ...prev, [item.key]: nextVal }));
                    }}
                    data-testid={`gap-custom-${item.key}`}
                    placeholder="or custom..." style={{ ...inputS, fontSize: 12, width: 120, padding: "4px 8px" }} />
                </div>
              ) : (
                <input value={currentVal} onChange={e => setAnswers(prev => ({ ...prev, [item.key]: e.target.value }))} 
                  placeholder={`Enter ${item.label.toLowerCase()}...`}
                  data-testid={`gap-freetext-${item.key}`}
                  style={{ ...inputS, fontSize: 12, padding: "6px 10px" }} />
              )}
            </div>
          );
        };

        return (
          <Card style={{ borderLeft: `4px solid ${PURPLE.primary}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
                📋 Dynamic Gap Checklist ({summaryType.toUpperCase()} Mode)
                {checkingMissing && <span style={{ fontSize: 12, color: PURPLE.primary, fontWeight: 400, marginLeft: 8 }}>· analyzing gaps...</span>}
              </h3>
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
              Answering these parameters is optional. Click generate summary at any point.
            </p>

            {missingChecklist.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "10px 0" }}>
                {gapClinical.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: PURPLE.primary, margin: "4px 0 0" }}>📋 Clinical & Profile Gaps</p>
                    {gapClinical.map(renderGapItem)}
                  </div>
                )}
                {gapInvestigations.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--color-border-primary)", paddingTop: 14, marginTop: 10 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: PURPLE.primary, margin: 0 }}>🧪 Investigations & Lab Gaps</p>
                    <div style={{ padding: 12, background: "rgba(139,92,246,0.06)", border: "1px dashed #8B5CF6", borderRadius: 8, margin: "6px 0 10px" }}>
                      <DocumentIntake docs={investigations} setDocs={setInvestigations} provider={provider} apiKey={apiKey} isInvestigation />
                    </div>
                    {gapInvestigations.map(renderGapItem)}
                  </div>
                )}
              </div>
            ) : (
              !checkingMissing && <p style={{ fontSize: 12, color: TEAL.primary, fontWeight: 600, margin: "10px 0" }}>✓ No missing parameters identified. Ready to generate summary!</p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 14, borderTop: "1px solid var(--color-border-primary)", paddingTop: 14 }}>
              <Btn testId="wizard-step4-back-btn" variant="ghost" onClick={() => setStep(3)}>← Back</Btn>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn testId="wizard-reanalyze-gaps-btn" variant="secondary" onClick={() => analyzeWizardGaps(patientMemory, answers)} disabled={checkingMissing}>
                  ↻ Re-analyze Gaps
                </Btn>
                <Btn testId="wizard-generate-summary-btn" onClick={() => { setStep(5); generateWizardSummary(); }} disabled={checkingMissing}>
                  ✨ Generate Summary
                </Btn>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Step 5 Content */}
      {step === 5 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card style={{ padding: 20 }}>
            {generatingSummary ? (
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", textAlign: "center", padding: 40 }}>✨ Writing Discharge Summary...</p>
            ) : editing ? (
              <textarea value={summaryText} onChange={e => setSummaryText(e.target.value)}
                data-testid="wizard-summary-textarea"
                style={{ width: "100%", minHeight: 440, border: "none", outline: "none", fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, resize: "vertical" }} />
            ) : (
              <pre style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap", margin: 0 }}>{summaryText}</pre>
            )}
          </Card>
          
          {/* Custom instructions area for summary refinement */}
          {!generatingSummary && summaryText.trim() && (
            <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, background: "rgba(91,91,219,0.02)", border: `1.5px solid ${PURPLE.border}` }}>
              <label style={{ fontSize: 13, fontWeight: 700, display: "block", color: PURPLE.text }}>
                ✨ Refine summary with custom AI instruction:
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea 
                  value={refinePrompt} 
                  onChange={e => setRefinePrompt(e.target.value)}
                  placeholder="e.g., Add a warning to avoid heavy lifting, emphasize strict rest, or rephrase clinical course..."
                  data-testid="wizard-refine-prompt-textarea"
                  style={{ ...inputS, minHeight: 50, resize: "vertical", fontSize: 12, flex: 1, padding: "6px 10px" }}
                />
                <Btn 
                  testId="wizard-refine-summary-btn"
                  small
                  disabled={generatingSummary || !refinePrompt.trim()} 
                  onClick={() => refineSummaryWithInstruction(refinePrompt)} 
                >
                  Refine Summary
                </Btn>
              </div>
            </Card>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn testId="wizard-adjust-details-btn" variant="secondary" small onClick={() => setStep(4)} disabled={generatingSummary}>
              ← Adjust Details (Step 4)
            </Btn>
            <Btn testId="wizard-edit-summary-btn" variant="secondary" small onClick={() => setEditing(v => !v)} disabled={generatingSummary}>
              {editing ? "Done Editing" : "✏️ Edit Summary Text"}
            </Btn>
            <Btn testId="wizard-copy-summary-btn" variant="secondary" small onClick={() => { navigator.clipboard?.writeText(summaryText); setCopied(true); setTimeout(() => setCopied(false), 2000); }} disabled={generatingSummary}>
              {copied ? "✓ Copied!" : "Copy Summary"}
            </Btn>
            <Btn testId="wizard-download-txt-btn" variant="secondary" small onClick={() => {
              const filename = `${confirmedDiagnosis.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_discharge_summary.txt`;
              const element = document.createElement("a");
              const file = new Blob([summaryText], { type: "text/plain;charset=utf-8" });
              element.href = URL.createObjectURL(file);
              element.download = filename;
              document.body.appendChild(element);
              element.click();
              document.body.removeChild(element);
            }} disabled={generatingSummary}>
              📥 Download TXT
            </Btn>
            <Btn testId="wizard-save-template-btn" onClick={() => setWizardSaveModal(true)} disabled={generatingSummary || !summaryText.trim()}>
              💾 Save as Template
            </Btn>
            {wizardSavedToast && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#0F6E56", background: "#E1F5EE", border: "1px solid #9FE1CB", borderRadius: 20, padding: "4px 12px", animation: "fadeSlideIn 0.25s ease" }}>
                ✅ Template saved!
              </span>
            )}
            {wizardSaveModal && (
              <SaveAsTemplateModal
                defaultName={template.name + " (AI copy)"}
                existingTemplates={existingTemplates}
                onConfirm={(chosenName) => {
                  setWizardSaveModal(false);
                  onSaveAsTemplate({ ...template, id: "", name: chosenName, source: "private", sampleBody: summaryText, slots: [] });
                  setWizardSavedToast(true);
                  setTimeout(() => setWizardSavedToast(false), 3000);
                }}
                onClose={() => setWizardSaveModal(false)}
              />
            )}
          </div>

          {!generatingSummary && summaryText.trim() && (
            <SafetyCheckPanel getText={() => summaryText} diagnosis={confirmedDiagnosis} provider={provider} apiKey={apiKey} />
          )}
        </div>
      )}
      {savedSummaryId && <RatingPrompt recordType="summary" recordId={savedSummaryId} onDismiss={() => setSavedSummaryId(null)} />}
    </div>
  );
}

