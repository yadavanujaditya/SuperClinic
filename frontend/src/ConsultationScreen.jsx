import { useState, useRef, useEffect } from "react";
import { chunkText, buildRetrievalQuery, highlightTerms } from "./bm25.js";
import { callAIStream, parseJSON, buildSystemPrompt } from "./api.js";
import { DocumentIntake } from "./DocumentIntake.jsx";
import { TEAL, AMBER, RED, LIKELIHOOD_COLORS } from "./theme.js";
import { Btn, Badge, Card } from "./UIPrimitives.jsx";
import { openPDFDoc } from "./pdfUtils.js";

function PageViewer({ docName, page, pdfBuffers, onClose }) {
  const canvasRef = useRef();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const buf = pdfBuffers?.current?.get(docName);
        if (!buf) {
          if (active) setError("PDF buffer not found. Re-upload the document to enable page preview.");
          return;
        }
        const pdf = await openPDFDoc(buf);
        if (!active) return;
        const pg = await pdf.getPage(page);
        if (!active) return;
        const viewport = pg.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pg.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      } catch (e) {
        if (active) setError(`Could not render page: ${e.message}`);
      }
    })();
    return () => { active = false; };
  }, [docName, page]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: "90vw", maxHeight: "90vh", overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>📖 {docName} — Page {page}</p>
          <button onClick={onClose} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>
        {error ? <p style={{ fontSize: 13, color: RED.text }}>{error}</p> : <canvas ref={canvasRef} style={{ maxWidth: "100%", borderRadius: 6, border: "1px solid var(--color-border-primary)" }} />}
      </div>
    </div>
  );
}

// ─── Diagnosis Sidebar ────────────────────────────────────────────────────────
function DiagnosisSidebar({ sidebar, onClose, query, complaintTags, pdfBuffers }) {
  const [pageViewer, setPageViewer] = useState(null); // { docName, page }
  return (
    <>
      {sidebar.open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 49 }} />}
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: "min(380px, 100vw)",
        background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", zIndex: 50, overflowY: "auto",
        transform: sidebar.open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s ease",
        padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>{sidebar.diagnosis}</h2>
            <p style={{ fontSize: 12, color: TEAL.primary, margin: 0 }}>
              {sidebar.ms != null ? `Retrieved in ${sidebar.ms}ms · ` : ""}{sidebar.chunks?.length || 0} sections
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
        {complaintTags?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", margin: 0, letterSpacing: 0.5 }}>BOOK REFERENCES</p>
            {complaintTags.flatMap(t => t.sources.map((s, i) => (
              <div key={`${t.id}-${i}`} style={{ background: "#E8F4FF", border: "1px solid #B3D4F5", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1A5C9A" }}>🏷 {t.label} — {s.docName} p.{s.page}</span>
                  <button onClick={() => setPageViewer({ docName: s.docName, page: s.page })}
                    style={{ fontSize: 11, fontWeight: 600, color: "#1A5C9A", background: "#fff", border: "1px solid #B3D4F5", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    View in PDF
                  </button>
                </div>
                {s.image && (
                  <img src={s.image} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 6, border: "1px solid #B3D4F5", display: "block", marginBottom: 8 }} />
                )}
                <p style={{ fontSize: 12, color: "#1A5C9A", margin: 0, lineHeight: 1.5, maxHeight: 100, overflowY: "auto" }}>
                  {s.extractedText ? s.extractedText.slice(0, 400) + (s.extractedText.length > 400 ? "…" : "") : "No text extracted."}
                </p>
              </div>
            )))}
          </div>
        )}
        {sidebar.chunks?.length > 0 ? sidebar.chunks.map((chunk, i) => (
          <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>{chunk.source}</span>
              <span style={{ fontSize: 11, background: TEAL.bg, color: TEAL.text, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{chunk.score?.toFixed(2)}</span>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}
              dangerouslySetInnerHTML={{ __html: highlightTerms(chunk.text, (sidebar.diagnosis + " " + (query || "")).trim()).replace(/\n/g, "<br/>") }} />
          </div>
        )) : (
          <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 20, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Upload Harrison's, Nelson's, or your hospital protocol to see relevant sections here.
            </p>
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--color-border-primary)" }}>
          Instant BM25 search — no API call.
        </p>
      </div>
      <style>{`mark { background: #FFF176; padding: 0 2px; border-radius: 2px; }`}</style>
      {pageViewer && <PageViewer docName={pageViewer.docName} page={pageViewer.page} pdfBuffers={pdfBuffers} onClose={() => setPageViewer(null)} />}
    </>
  );
}

// ─── SuperTags Card ──────────────────────────────────────────────────────────
function SuperTagsCard({ tagLibrary, idx, complaintName, history, pdfBuffers }) {
  const [matches, setMatches] = useState([]);
  const [pageViewer, setPageViewer] = useState(null);

  useEffect(() => {
    const historyAnswers = history.map(h => h.a).join(" ");
    const q = (complaintName + " " + historyAnswers).toLowerCase().trim();
    if (!q) {
      setMatches([]);
      return;
    }

    const words = q.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0) {
      setMatches([]);
      return;
    }

    const matchedTags = tagLibrary.filter(tag => {
      const tagLabel = tag.label.toLowerCase();
      const matchesLabel = words.some(w => tagLabel.includes(w));
      const matchesSourceText = tag.sources.some(src => 
        words.some(w => src.extractedText?.toLowerCase().includes(w))
      );
      return matchesLabel || matchesSourceText;
    });

    let directChunks = [];
    if (idx && typeof idx.search === "function") {
      try {
        directChunks = idx.search(q, 3) || [];
      } catch (e) {
        console.error(e);
      }
    }

    const combinedMatches = [];

    matchedTags.forEach(t => {
      t.sources.forEach((src) => {
        combinedMatches.push({
          type: "tag",
          label: `🏷 ${t.label}`,
          source: src.docName,
          page: src.page,
          text: src.extractedText || "No text.",
          image: src.image
        });
      });
    });

    directChunks.forEach(chunk => {
      const isDuplicate = combinedMatches.some(m => m.source === chunk.source && m.text.includes(chunk.text.slice(0, 50)));
      if (!isDuplicate) {
        combinedMatches.push({
          type: "chunk",
          label: `📖 Relatable Passage`,
          source: chunk.source,
          page: chunk.page || 1,
          text: chunk.text,
          score: chunk.score
        });
      }
    });

    setMatches(combinedMatches.slice(0, 3));
  }, [tagLibrary, idx, complaintName, history]);

  return (
    <div style={{ marginTop: 16, borderTop: "1.5px solid var(--color-border-primary)", paddingTop: 16 }}>
      <div style={{ background: "#F3EEFF", border: "1.5px solid #D8C7FF", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#3E2570", display: "inline-flex", alignItems: "center", gap: 4 }}>✨ SuperTags</span>
          <span style={{ fontSize: 9, background: "#6E40C9", color: "#fff", padding: "2px 6px", borderRadius: 10, fontWeight: 700 }}>AI FILTERED</span>
        </div>
        <p style={{ fontSize: 11, color: "#3E2570", margin: "0 0 12px", lineHeight: 1.4, opacity: 0.85 }}>
          Upload multiple books and from them create your custom tags, and view them at any time from your OPD.
        </p>

        {matches.length === 0 ? (
          <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0, fontStyle: "italic" }}>
            No matching tags or book passages found for the current context.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.map((item, index) => (
              <div key={index} style={{ background: "#fff", border: "1px solid #D8C7FF", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#6E40C9" }}>{item.label}</span>
                  <button 
                    data-testid={`supertag-view-page-${index}`}
                    onClick={() => setPageViewer({ docName: item.source, page: item.page })}
                    style={{ fontSize: 10, fontWeight: 600, color: "#6E40C9", background: "#F3EEFF", border: "1px solid #D8C7FF", borderRadius: 5, padding: "1px 6px", cursor: "pointer" }}
                  >
                    p.{item.page} ↗
                  </button>
                </div>
                {item.image && (
                  <img src={item.image} alt="" style={{ maxWidth: "100%", maxHeight: 100, borderRadius: 4, marginBottom: 4, display: "block" }} />
                )}
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.4, maxHeight: 60, overflowY: "auto" }}>
                  {item.text.slice(0, 180)}{item.text.length > 180 ? "…" : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {pageViewer && (
        <PageViewer 
          docName={pageViewer.docName} 
          page={pageViewer.page} 
          pdfBuffers={pdfBuffers} 
          onClose={() => setPageViewer(null)} 
        />
      )}
    </div>
  );
}

// ─── Differentials Panel ──────────────────────────────────────────────────────
function DifferentialsPanel({ differentials, onClickDiag }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", margin: 0, letterSpacing: 0.5 }}>DIFFERENTIALS · TAP TO EXPLORE</p>
      {!differentials.length && <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Differentials will appear as you answer questions.</p>}
      {differentials.map((d, i) => {
        const col = LIKELIHOOD_COLORS[d.likelihood] || LIKELIHOOD_COLORS.low;
        return (
          <div key={i} data-testid={`differential-item-${i}`} onClick={() => onClickDiag(d.name)}
            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
              background: col.bg, border: `1.5px solid ${col.border}`, transition: "all 0.15s" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: col.dot, flexShrink: 0, marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <p style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)", margin: 0 }}>{d.name}</p>
                <span style={{ fontSize: 11, fontWeight: 700, color: col.text, flexShrink: 0 }}>{(d.likelihood || "low").toUpperCase()}</span>
              </div>
              {d.reasoning && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 0", lineHeight: 1.4 }}>{d.reasoning}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Option Button ────────────────────────────────────────────────────────────
function OptionButton({ label, onClick, testId }) {
  const [hov, setHov] = useState(false);
  return (
    <button data-testid={testId} onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: "100%", padding: "12px 16px", textAlign: "left", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer",
        border: `1.5px solid ${hov ? TEAL.border : "var(--color-border-primary)"}`,
        background: hov ? TEAL.bg : "#fff", color: "var(--color-text-primary)", transition: "all 0.15s", fontFamily: "var(--font-sans)" }}>
      {label}
    </button>
  );
}

// ─── Consultation Screen ──────────────────────────────────────────────────────
export function ConsultationScreen({ session, idx, provider, apiKey, onEnd, onNote, tagLibrary, pdfBuffers, setSettingsOpen }) {
  const { complaint, age, sex, aiOnly, opdMode } = session;
  const complaintTags = (complaint.tagRefs || []).map(id => tagLibrary.find(t => t.id === id)).filter(Boolean);

  const [history, setHistory] = useState([]);
  const [currentQ, setCurrentQ] = useState("");
  const [options, setOptions] = useState([]);
  const [differentials, setDifferentials] = useState(
    (complaint.commonDifferentials || []).slice(0, 5).map(name => ({ name, likelihood: "low", reasoning: "" }))
  );
  const [redFlags, setRedFlags] = useState([]);
  const [retrieved, setRetrieved] = useState([]);
  const [retrieveMs, setRetrieveMs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [streamText, setStreamText] = useState("");
  const [nodeData, setNodeData] = useState(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceTx, setVoiceTx] = useState("");
  const [customIn, setCustomIn] = useState("");
  const [weightMap, setWeightMap] = useState({});
  const [sidebar, setSidebar] = useState({ open: false, diagnosis: "", chunks: [], ms: null });
  const [opdQuestions, setOpdQuestions] = useState([]);
  const [opdAnswers, setOpdAnswers] = useState({});
  
  // Discussion Mode states
  const [discussionMode, setDiscussionMode] = useState(false);
  const [discussionDocs, setDiscussionDocs] = useState([]);
  const processedDocs = useRef(new Set());

  const histRef = useRef(null);
  const recRef = useRef(null);
  // track current state in ref so closures in handleAnswer can access latest values
  const diffsRef = useRef(differentials);
  const redFlagsRef = useRef(redFlags);
  useEffect(() => { diffsRef.current = differentials; }, [differentials]);
  useEffect(() => { redFlagsRef.current = redFlags; }, [redFlags]);

  // Auto-send clinical reports to AI once uploaded and parsed
  useEffect(() => {
    if (!discussionMode) return;
    const completed = discussionDocs.filter(d => d.status === "done" && !processedDocs.current.has(d.id));
    if (completed.length === 0) return;
    completed.forEach(d => processedDocs.current.add(d.id));
    
    const text = completed.map(d => `Uploaded report: ${d.name}`).join(", ");
    const nextHist = [...history, { q: `System: Uploaded and analyzed reports: ${completed.map(c => c.name).join(", ")}`, a: "Reports attached to clinical context." }];
    setHistory(nextHist);
    askAI(nextHist);
  }, [discussionDocs.map(d => `${d.id}:${d.status}`).join(",")]);

  useEffect(() => {
    if (complaint.clinicalContent) {
      idx.add(chunkText(complaint.clinicalContent, `Prebuilt — ${complaint.name}`));
    }
    // AI-only mode: skip local workflow entirely
    if (aiOnly) { askAI([]); return; }
    if (opdMode) { askAI([]); return; }
    if (complaint.workflow?.nodes) {
      const entry = complaint.workflow.nodes.find(n => n.id === complaint.workflow.entryNode);
      if (entry) {
        setNodeData(entry);
        setCurrentQ(entry.question);
        let entryOpts = entry.options.map(o => o.label);
        if (entry.id && entry.id.endsWith("_handoff")) {
          entryOpts = [...entryOpts, "💬 Discuss further with AI (upload reports & chat)"];
        }
        setOptions(entryOpts);
        return;
      }
    }
    askAI([]);
  }, []);

  useEffect(() => { if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight; }, [history]);

  const doRetrieval = (hist) => {
    const q = buildRetrievalQuery(complaint.name, hist.map(h => h.a));
    const t0 = performance.now();
    const res = idx.search(q, 3);
    setRetrieved(res); setRetrieveMs((performance.now() - t0).toFixed(1));
    return res.map(r => r.text).join("\n\n---\n\n");
  };

  const askAI = async (hist) => {
    if (!apiKey) {
      setError("No API key configured. Add one in ⚙️ Settings to let AI continue the interview — or generate a note now from what's been answered so far.");
      return;
    }
    setLoading(true); setError(""); setStreamText("");
    
    const context = doRetrieval(hist);
    const reportsText = discussionDocs.filter(d => d.status === "done" && d.ocrText).map(d => `REPORT [${d.name}]: ${d.ocrText}`).join("\n\n");
    const combinedContext = [context, reportsText ? `UPLOADED CLINICAL REPORTS:\n${reportsText}` : ""].filter(Boolean).join("\n\n");

    const msgs = hist.length
      ? hist.flatMap((h, i) => [{ role: "user", content: `Q${i+1}: ${h.q}` }, { role: "assistant", content: `Answer: ${h.a}` }])
      : [];

    let systemPrompt = buildSystemPrompt(complaint.name, age, sex, combinedContext);
    if (opdMode) {
      systemPrompt = `Clinical thinking assistant for junior doctors, India government hospital OPD.
Patient: ${age || "?"}y ${sex || ""}. Chief complaint: ${complaint.name}.

CLINICAL REFERENCE (retrieved via BM25):
${combinedContext}

You are in OPD Mode (fast-track). Instead of one question, you MUST generate exactly 3 to 4 distinct, parallel questions to narrow down the differentials.
Output ONLY valid JSON. No markdown. No explanation. Exactly this structure:
{
  "opd_questions": [
    { "key": "unique_short_key", "question": "Question text here?", "options": ["opt1", "opt2", "opt3", "Not present"] }
  ],
  "differentials": [{"name":"...","likelihood":"high|medium|low","reasoning":"one line max"}],
  "red_flags": ["..."],
  "done": false
}

Rules for opd_questions:
- "key": unique alphanumeric key for the question, e.g. "fever_dur"
- "question": concise clinical question to ask
- "options": 3-4 short options, always ending with "Not present" or "Unsure". If it is open-ended or numeric, options can be []
- Never duplicate questions already in the history.
- If consultation is complete, set "done": true and empty opd_questions [].`;
    } else if (discussionMode) {
      systemPrompt = `Interactive clinical discussion assistant for junior doctors, India government hospital OPD.
Patient: ${age || "?"}y ${sex || ""}. Chief complaint: ${complaint.name}.

CLINICAL REFERENCE & UPLOADED REPORTS:
${combinedContext}

Output ONLY valid JSON. No markdown. No explanation. Exactly this structure:
{"question":"[Your response to the doctor's follow-up question or reports analysis. Keep it clinical, structured, helpful and brief.]","options":[],"differentials":[{"name":"...","likelihood":"high|medium|low","reasoning":"one line max"}],"red_flags":["..."],"done":false}

Rules:
- question: your response to the doctor's typed follow-up or report uploaded. Make sure to review the UPLOADED CLINICAL REPORTS if present!
- options: ALWAYS return [] (empty array) in discussion mode.
- differentials: max 5, updated and ranked based on new information, India-specific weighting.
- red_flags: ONLY if triggered.
- done: false.`;
    }

    if (msgs.length === 0) {
      msgs.push({ role: "user", content: "Let's begin the clinical discussion. Summarize what we know so far." });
    } else {
      msgs.push({ role: "user", content: "Discuss the latest update / answer the doctor's question." });
    }

    try {
      let raw = "";
      await callAIStream(msgs, systemPrompt, provider, apiKey, t => { raw = t; setStreamText(t); });
      const parsed = parseJSON(raw);
      if (parsed) {
        if (opdMode) {
          setOpdQuestions(parsed.opd_questions || []);
        } else {
          setCurrentQ(parsed.question || "");
          let nextOpts = parsed.options || [];
          if (parsed.done && hist.length >= 9) {
            nextOpts = [
              "Generate note with current findings",
              "💬 Discuss further with AI (upload reports & chat)"
            ];
          }
          setOptions(nextOpts);
        }
        if (parsed.differentials?.length) setDifferentials(parsed.differentials.slice(0, 5));
        if (parsed.red_flags?.length) setRedFlags(p => [...new Set([...p, ...parsed.red_flags])]);
      } else { setError("Could not parse AI response. Tap to retry."); }
    } catch (e) { setError(`${e.message}. Tap to retry.`); }
    finally { setLoading(false); setStreamText(""); setNodeData(null); }
  };

  const applyWeights = (tags) => {
    const dw = complaint.diffWeights || {};
    const map = { ...weightMap };
    Object.entries(dw).forEach(([diag, rule]) => {
      if (!map[diag]) map[diag] = 0;
      (rule.tags_increase || []).forEach(t => { if (tags.includes(t)) map[diag] += 2; });
      (rule.tags_decrease || []).forEach(t => { if (tags.includes(t)) map[diag] -= 1; });
    });
    setWeightMap(map);
    const sorted = Object.entries(map).sort(([,a],[,b]) => b-a).slice(0,5)
      .map(([name, score]) => ({ name, likelihood: score >= 8 ? "high" : score >= 4 ? "medium" : "low",
        reasoning: diffsRef.current.find(d => d.name === name)?.reasoning || "" }));
    if (sorted.length) setDifferentials(sorted);
    return sorted;
  };

  const handleAnswer = (answer, nodeOpt = null) => {
    if (answer === "Generate note with current findings") {
      onNote(history, differentials, redFlags);
      return;
    }
    if (answer === "💬 Discuss further with AI (upload reports & chat)") {
      setDiscussionMode(true);
      const nextHist = [...history, { q: currentQ, a: answer }];
      setHistory(nextHist);
      setOptions([]);
      setTimeout(() => {
        askAI(nextHist);
      }, 100);
      return;
    }

    const hist = [...history, { q: currentQ, a: answer }];
    setHistory(hist); setCustomIn(""); setVoiceTx("");
    const tags = nodeOpt?.tags || [];
    const newRedFlags = [...redFlagsRef.current];
    if (nodeOpt?.redFlag) {
      const msg = nodeOpt.redFlagMessage;
      if (!newRedFlags.includes(msg)) newRedFlags.push(msg);
      setRedFlags(newRedFlags);
    }
    const al = answer.toLowerCase();
    (complaint.redFlagKeywords || []).forEach(kw => {
      if (al.includes(kw.toLowerCase())) {
        const msg = `Red flag: "${kw}" reported`;
        if (!newRedFlags.includes(msg)) { newRedFlags.push(msg); setRedFlags([...newRedFlags]); }
      }
    });
    const updatedDiffs = applyWeights(tags);
    const nextId = nodeOpt?.next;
    if (nextId === "END") {
      if (apiKey) {
        askAI(hist);
      } else {
        onNote(hist, updatedDiffs.length ? updatedDiffs : diffsRef.current, newRedFlags);
      }
      return;
    }
    if (nextId && nextId !== "AI" && complaint.workflow?.nodes) {
      const next = complaint.workflow.nodes.find(n => n.id === nextId);
      if (next) {
        setNodeData(next);
        setCurrentQ(next.question);
        let nextOpts = next.options.map(o => o.label);
        if (next.id && next.id.endsWith("_handoff")) {
          nextOpts = [...nextOpts, "💬 Discuss further with AI (upload reports & chat)"];
        }
        setOptions(nextOpts);
        return;
      }
    }
    askAI(hist);
  };

  const openSidebar = (diag) => {
    const t0 = performance.now();
    const chunks = idx.search(diag + " symptoms diagnosis treatment signs", 5);
    setSidebar({ open: true, diagnosis: diag, chunks, ms: (performance.now() - t0).toFixed(1) });
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge."); return; }
    const rec = new SR(); rec.lang = "en-IN"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => setVoiceTx(Array.from(e.results).map(r => r[0].transcript).join(" "));
    rec.onend = () => setVoiceOn(false);
    rec.start(); recRef.current = rec; setVoiceOn(true);
  };

  return (
    <div className="consultation-root" style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-background-primary)" }}>
      <div className="consultation-header" style={{ background: "#fff", borderBottom: "1px solid var(--color-border-primary)", padding: "12px 20px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
        <span style={{ fontSize: 20 }}>🩺</span>
        <Badge color={TEAL}>{age} · {sex}</Badge>
        <Badge color={{ bg: "#F0F0F0", text: "#333", border: "#DDD" }}>{complaint.name}</Badge>
        <Badge color={{ bg: "#F0F0F0", text: "#333", border: "#DDD" }}>Q{history.length + 1}</Badge>
        {aiOnly && <Badge color={{ bg: "#4c1d95", text: "#F3E8FF", border: "#A855F7" }}>✨ AI Mode</Badge>}
        {retrieveMs && <span style={{ fontSize: 11, color: TEAL.primary, fontWeight: 600 }}>⚡ {retrieveMs}ms</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Btn testId="generate-note-btn" small variant="secondary" disabled={history.length < 4} onClick={() => onNote(history, differentials, redFlags)}>Generate Note</Btn>
          <Btn testId="end-consultation-btn" small variant="ghost" onClick={onEnd}>End</Btn>
        </div>
      </div>

      {redFlags.length > 0 && (
        <div style={{ background: RED.bg, borderBottom: `1px solid ${RED.border}`, padding: "10px 20px", display: "flex", gap: 10, alignItems: "flex-start", flexShrink: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🚨</span>
          <div>{redFlags.map((rf, i) => <p key={i} style={{ fontSize: 13, color: RED.text, margin: "2px 0", fontWeight: 600 }}>{rf}</p>)}</div>
        </div>
      )}

      <div className="consultation-layout" style={{ flex: 1, overflow: "hidden" }}>
        <div className="consultation-main" style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {history.length > 0 && (
            <div ref={histRef} style={{ maxHeight: 150, overflowY: "auto", background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 14px" }}>
              {history.map((h, i) => (
                <div key={i} style={{ marginBottom: 8, opacity: 0.75 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", margin: "0 0 1px" }}>Q{i+1}: {h.q}</p>
                  <p style={{ fontSize: 13, color: "var(--color-text-primary)", margin: 0 }}>→ {h.a}</p>
                </div>
              ))}
            </div>
          )}

          <Card style={{ padding: 20 }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>⏳</span>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>
                  {(() => {
                    if (!streamText) return "Thinking…";
                    try {
                      const cleaned = streamText.replace(/```json|```/g, "").trim();
                      const match = cleaned.match(/"question"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
                      if (match && match[1]) {
                        return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                      }
                    } catch (e) {}
                    return "Thinking…";
                  })()}
                </p>
              </div>
            ) : error ? (
              <div>
                <p style={{ fontSize: 14, color: AMBER.text, fontWeight: 500, margin: "0 0 12px" }}>{error}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {history.length >= 4 && (
                    <Btn testId="generate-note-offline-btn" small onClick={() => onNote(history, differentials, redFlags)}>Generate Note Offline →</Btn>
                  )}
                  {!apiKey && setSettingsOpen && (
                    <Btn testId="add-api-key-btn" small variant="secondary" onClick={() => setSettingsOpen(true)}>⚙️ Add API Key</Btn>
                  )}
                </div>
              </div>
            ) : opdMode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: TEAL.primary, display: "flex", alignItems: "center", gap: 6 }}>⚡ OPD Fast-Track (Ask parallel questions)</p>
                {opdQuestions.length === 0 ? (
                  <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>Loading questions...</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {opdQuestions.map((qObj, index) => {
                      const ans = opdAnswers[qObj.key] || "";
                      const opts = qObj.options || [];
                      return (
                        <div key={qObj.key || index} style={{ borderBottom: index < opdQuestions.length - 1 ? "1px solid var(--color-border-primary)" : "none", paddingBottom: index < opdQuestions.length - 1 ? 14 : 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 8px", color: "var(--color-text-primary)", lineHeight: 1.4 }}>{index + 1}. {qObj.question}</p>
                          
                          {opts.length > 0 && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                              {opts.map(opt => {
                                const active = ans === opt;
                                return (
                                  <button
                                    key={opt}
                                    data-testid={`opd-option-${qObj.key}-${opt}`}
                                    onClick={() => setOpdAnswers(prev => ({ ...prev, [qObj.key]: opt }))}
                                    style={{
                                      padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid", fontFamily: "var(--font-sans)",
                                      borderColor: active ? TEAL.primary : "var(--color-border-primary)",
                                      background: active ? TEAL.bg : "#fff",
                                      color: active ? TEAL.primary : "var(--color-text-secondary)",
                                      transition: "all 0.15s"
                                    }}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <input
                            data-testid={`opd-answer-input-${qObj.key}`}
                            value={ans}
                            onChange={e => setOpdAnswers(prev => ({ ...prev, [qObj.key]: e.target.value }))}
                            placeholder={opts.length > 0 ? "Or type a custom answer..." : "Type answer..."}
                            style={{
                              width: "100%", padding: "8px 12px", border: "1.5px solid var(--color-border-primary)",
                              borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "var(--font-sans)",
                              background: "#fff", color: "var(--color-text-primary)"
                            }}
                          />
                        </div>
                      );
                    })}
                    
                    <Btn 
                      testId="submit-opd-answers-btn"
                      disabled={Object.keys(opdAnswers).length === 0} 
                      onClick={() => {
                        const newHist = [...history];
                        opdQuestions.forEach(qObj => {
                          const ans = opdAnswers[qObj.key];
                          if (ans && ans.trim()) {
                            newHist.push({ q: qObj.question, a: ans.trim() });
                          }
                        });
                        setHistory(newHist);
                        setOpdAnswers({});
                        askAI(newHist);
                      }}
                      style={{ alignSelf: "flex-end", marginTop: 8 }}
                    >
                      ⚡ Submit OPD Answers ({Object.keys(opdAnswers).length})
                    </Btn>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 16, fontWeight: 500, margin: 0, lineHeight: 1.6 }}>
                {currentQ || "Loading first question…"}
              </p>
            )}
          </Card>

          {discussionMode && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 14, border: "1px solid var(--color-border-primary)" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>📑 Upload Case Reports / Photos to Discuss</label>
              <DocumentIntake docs={discussionDocs} setDocs={setDiscussionDocs} provider={provider} apiKey={apiKey} />
            </div>
          )}

          {!loading && !error && !opdMode && options.map((opt, i) => (
            <OptionButton key={i} testId={`option-btn-${i}`} label={opt} onClick={() => handleAnswer(opt, nodeData?.options?.find(o => o.label === opt))} />
          ))}

          {!opdMode && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button data-testid="voice-toggle-btn" onClick={voiceOn ? () => { recRef.current?.stop(); setVoiceOn(false); } : startVoice}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
                      border: `1.5px solid ${voiceOn ? RED.primary : "var(--color-border-primary)"}`,
                      background: voiceOn ? RED.bg : "#fff", color: voiceOn ? RED.primary : "var(--color-text-secondary)" }}>
                    {voiceOn && <span style={{ width: 8, height: 8, borderRadius: "50%", background: RED.primary, animation: "pulse 1s infinite" }} />}
                    🎙 {voiceOn ? "Stop" : "Speak"}
                  </button>
                  {voiceTx && !voiceOn && (
                    <button data-testid="use-voice-transcript-btn" onClick={() => handleAnswer(voiceTx)}
                      style={{ padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
                        border: `1.5px solid ${TEAL.border}`, background: TEAL.bg, color: TEAL.primary }}>
                      Use this →
                    </button>
                  )}
                  {discussionMode && (
                    <Btn testId="generate-note-discussion-btn" small style={{ marginLeft: "auto" }} onClick={() => onNote(history, differentials, redFlags)}>
                      Generate Note ({history.length} items) →
                    </Btn>
                  )}
                </div>
                {(voiceOn || voiceTx) && (
                  <div style={{ padding: "10px 14px", background: "#F0FFF8", border: `1.5px solid ${TEAL.border}`, borderRadius: 8, fontSize: 13, color: TEAL.text, minHeight: 40 }}>
                    {voiceTx || <span style={{ opacity: 0.5 }}>Listening…</span>}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input data-testid="custom-answer-input" value={customIn} onChange={e => setCustomIn(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && customIn.trim()) handleAnswer(customIn.trim()); }}
                  placeholder="Or type a custom answer…"
                  style={{ flex: 1, padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)" }} />
                <button data-testid="send-custom-answer-btn" onClick={() => customIn.trim() && handleAnswer(customIn.trim())}
                  style={{ padding: "9px 16px", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", background: TEAL.primary, color: "#fff", fontFamily: "var(--font-sans)" }}>→</button>
              </div>
            </>
          )}

          {retrieved.length > 0 && (
            <div style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", margin: "0 0 8px", letterSpacing: 0.5 }}>CONTEXT USED · {retrieveMs}ms</p>
              {retrieved.slice(0, 2).map((r, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: TEAL.primary, margin: "0 0 2px" }}>{r.source}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.4 }}>{r.text.slice(0, 120)}…</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="consultation-sidebar" style={{ borderLeft: "1px solid var(--color-border-primary)", padding: 16, overflowY: "auto", background: "#fff" }}>
          <DifferentialsPanel differentials={differentials} onClickDiag={openSidebar} />
          <SuperTagsCard tagLibrary={tagLibrary} idx={idx} complaintName={complaint.name} history={history} pdfBuffers={pdfBuffers} />
        </div>
      </div>

      <DiagnosisSidebar sidebar={sidebar} onClose={() => setSidebar(s => ({ ...s, open: false }))}
        query={buildRetrievalQuery(complaint.name, history.map(h => h.a))} complaintTags={complaintTags} pdfBuffers={pdfBuffers} />

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
