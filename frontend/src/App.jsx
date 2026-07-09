import { useState, useRef, useEffect } from "react";
import { BM25, chunkText, buildRetrievalQuery, highlightTerms } from "./bm25.js";
import { PROVIDERS, getProvider, callAIStream, parseJSON, buildSystemPrompt, buildNotePrompt, generateLocalNote, getGenericInstructions, getDetailedInstructions } from "./api.js";
import { SYSTEM_COMPLAINTS } from "./complaints.js";
import SuperSummary, { DocumentIntake } from "./SuperSummary.jsx";
import HomeHero, { CardCarousel, IllustConsult, IllustDifferential, IllustDocs, IllustScan, IllustLibrary, IllustSafety, IllustGame, IllustDnb, AppFooter } from "./HomeHero.jsx";
import { useAuth } from "./AuthContext.jsx";
import { saveCaseRecord } from "./records.js";
import { RecordsModal } from "./RecordsModal.jsx";
import { AdminDashboard } from "./AdminDashboard.jsx";
import { RatingPrompt } from "./RatingPrompt.jsx";
import { publishWorkflow, listCommunityWorkflows, rateWorkflow } from "./community.js";
import { listBooks, uploadBook, downloadBook, deleteBook, listTags, upsertTagSource, removeTagSourceRemote, deleteTagRemote } from "./supermemory.js";
import { LoginModal } from "./AuthScreens.jsx";

// ─── Design tokens ────────────────────────────────────────────────────────────
const TEAL  = { primary: "#0d9488", light: "#14b8a6", bg: "#f0fdfa", border: "#99f6e4", text: "#115e59" };
const AMBER = { primary: "#d97706", bg: "#fef3c7", border: "#fde68a", text: "#78350f" };
const RED   = { primary: "#e11d48", bg: "#fff1f2", border: "#fecdd3", text: "#9f1239" };
const GRAY  = { dot: "#6b7280", bg: "#f3f4f6", text: "#1f2937" };

const PURPLE = { primary: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" };

const LIKELIHOOD_COLORS = {
  high:   { dot: TEAL.light,    text: TEAL.text,   bg: TEAL.bg,   border: TEAL.border },
  medium: { dot: AMBER.primary, text: AMBER.text,  bg: AMBER.bg,  border: AMBER.border },
  low:    { dot: GRAY.dot,      text: GRAY.text,   bg: GRAY.bg,   border: "#D8D6CE" },
};

const CATEGORIES = ["All","Respiratory","GI","Neuro","Skin","Urinary","Hematology","MSK","Eye-ENT","Newborn","General","Behavioral","Emergency"];

// ─── Shared components ────────────────────────────────────────────────────────
function Btn({ children, onClick, variant = "primary", disabled, small, style: s = {}, testId, ...rest }) {
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

function Badge({ children, color = TEAL }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: color.bg, color: color.text, border: `1px solid ${color.border}` }}>
      {children}
    </span>
  );
}

function Card({ children, style: s = {}, onClick, testId, className }) {
  return (
    <div data-testid={testId} className={className} style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 12,
      padding: 16, boxShadow: "var(--shadow-sm)", ...s }} onClick={onClick}>
      {children}
    </div>
  );
}

// Shareable vanity link row (e.g. "yourapp.com/moproprep") — copies a link that instantly
// redirects to the partner site, so users can share it without needing to be logged in.
function ShareLinkRow({ path, testId, accent }) {
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

// ─── PDF utilities ────────────────────────────────────────────────────────────
async function initPDFJS() {
  if (window.pdfjsLib) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

async function openPDFDoc(buf) {
  await initPDFJS();
  // slice(0) copies the ArrayBuffer so PDF.js can transfer it without detaching the original
  return window.pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
}

async function renderPDFPage(pdfDoc, pageNum, canvas, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
}

async function extractPageText(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const content = await page.getTextContent();
  return content.items.map(it => it.str).join(" ");
}

async function extractAllText(buf) {
  const pdf = await openPDFDoc(buf);
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) text += await extractPageText(pdf, i) + "\n\n";
  return text;
}

// Render a page to an offscreen canvas and return it as a data URL (used to snapshot pages for the Tag Library)
async function renderPageToDataURL(pdfDoc, pageNum, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

// Crop a rectangle (in the same pixel space as `canvas`) out of an already-rendered canvas
function cropCanvasToDataURL(canvas, rect) {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(rect.w)); off.height = Math.max(1, Math.round(rect.h));
  off.getContext("2d").drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, off.width, off.height);
  return off.toDataURL("image/png");
}

// Extract only the text whose glyphs fall inside `rect` (in the same pixel space as a page rendered at `scale`)
async function extractRegionText(pdfDoc, pageNum, scale, rect) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent();
  const items = content.items.map(it => {
    const [x, yBottom] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
    const h = Math.hypot(it.transform[2], it.transform[3]) || (it.height || 10) * scale;
    const w = (it.width || 0) * scale;
    return { str: it.str, x, y: yBottom - h, w, h };
  });
  const overlaps = items.filter(it =>
    it.x < rect.x + rect.w && it.x + it.w > rect.x && it.y < rect.y + rect.h && it.y + it.h > rect.y
  );
  overlaps.sort((a, b) => a.y - b.y || a.x - b.x);
  return overlaps.map(it => it.str).join(" ");
}

// Resolve the embedded outline/bookmarks (chapters/sections) into a flat list of { title, page, depth }
async function getPDFChapters(pdfDoc) {
  let outline;
  try { outline = await pdfDoc.getOutline(); } catch { return []; }
  if (!outline || !outline.length) return [];
  const resolvePage = async (item) => {
    try {
      let dest = item.dest;
      if (typeof dest === "string") dest = await pdfDoc.getDestination(dest);
      if (Array.isArray(dest) && dest[0]) return (await pdfDoc.getPageIndex(dest[0])) + 1;
    } catch {}
    return null;
  };
  const flatten = async (items, depth) => {
    const out = [];
    for (const item of items) {
      out.push({ title: item.title, page: await resolvePage(item), depth });
      if (item.items?.length) out.push(...await flatten(item.items, depth + 1));
    }
    return out;
  };
  return flatten(outline, 0);
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({ open, onClose, provider, setProvider, currentKey, setCurrentKey }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const API_URL = import.meta.env.REACT_APP_BACKEND_URL;

  const [genericInst, setGenericInst] = useState("");
  const [detailedInst, setDetailedInst] = useState("");
  const [saved, setSaved] = useState(false);

  // Admin AI-config state
  const [aiConfig, setAiConfig] = useState({ configured: false, provider: null, masked_key: null });
  const [aiProviderDraft, setAiProviderDraft] = useState("claude");
  const [aiKeyDraft, setAiKeyDraft] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSavedMsg, setAiSavedMsg] = useState(false);

  useEffect(() => {
    setGenericInst(getGenericInstructions());
    setDetailedInst(getDetailedInstructions());
    if (open && isAdmin) {
      fetch(`${API_URL}/api/admin/ai-config`, { credentials: "include" })
        .then(r => r.json())
        .then(data => { setAiConfig(data); setAiProviderDraft(data.provider || "claude"); })
        .catch(() => {});
    }
  }, [open, isAdmin]);

  const saveAiConfig = async () => {
    setAiError(""); setAiSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/ai-config`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: aiProviderDraft, api_key: aiKeyDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save");
      setAiConfig(data);
      setAiKeyDraft("");
      setAiSavedMsg(true);
      setTimeout(() => setAiSavedMsg(false), 2000);
      setCurrentKey(); // trigger sibling refresh of AI status for all users
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiSaving(false);
    }
  };

  const removeAiConfig = async () => {
    if (!window.confirm("Remove the AI key? Users will lose access to AI features until a new key is added.")) return;
    await fetch(`${API_URL}/api/admin/ai-config`, { method: "DELETE", credentials: "include" });
    setAiConfig({ configured: false, provider: null, masked_key: null });
    setCurrentKey();
  };

  const saveInstructions = () => {
    localStorage.setItem("clinicalmind:instructions:generic", genericInst);
    localStorage.setItem("clinicalmind:instructions:detailed", detailedInst);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputS = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box" };

  return (
    <>
      {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 99 }} />}
      <div style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 380, background: "#fff",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.12)", zIndex: 100, padding: 28, overflowY: "auto",
        transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.25s ease",
        display: "flex", flexDirection: "column", gap: 24 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Settings</h2>
          <button data-testid="settings-close-btn" onClick={onClose} style={{ fontSize: 20, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>

        {/* AI key — admin manages centrally, regular users just see status */}
        {isAdmin ? (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>
              AI Provider &amp; Key <span style={{ fontWeight: 400, color: PURPLE.primary }}>(Admin only)</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {PROVIDERS.map(pr => (
                <button key={pr.id} data-testid={`settings-provider-${pr.id}-btn`} onClick={() => setAiProviderDraft(pr.id)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font-sans)",
                    border: `1.5px solid ${aiProviderDraft === pr.id ? TEAL.primary : "var(--color-border-primary)"}`,
                    background: aiProviderDraft === pr.id ? TEAL.bg : "#fff", color: aiProviderDraft === pr.id ? TEAL.primary : "var(--color-text-primary)" }}>
                  <span>{pr.name}</span>
                  {aiConfig.configured && aiConfig.provider === pr.id && <span style={{ fontSize: 11, background: TEAL.primary, color: "#fff", padding: "2px 7px", borderRadius: 10 }}>✓ Active</span>}
                </button>
              ))}
            </div>
            {aiConfig.configured && (
              <p data-testid="settings-current-masked-key" style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 8px", fontFamily: "var(--font-mono)" }}>
                Current key: {aiConfig.masked_key} (hidden — not shown in full for security)
              </p>
            )}
            <input data-testid="settings-api-key-input" type="password" value={aiKeyDraft} onChange={e => setAiKeyDraft(e.target.value)}
              placeholder={getProvider(aiProviderDraft).keyHint}
              style={{ ...inputS, marginBottom: 8 }} />
            {aiError && <p data-testid="settings-key-error-msg" style={{ fontSize: 12, color: RED.primary, margin: "0 0 8px" }}>{aiError}</p>}
            {aiSavedMsg && <p data-testid="settings-key-saved-msg" style={{ fontSize: 12, color: TEAL.primary, margin: "0 0 8px" }}>✓ Saved successfully</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Btn testId="settings-save-key-btn" onClick={saveAiConfig} disabled={!aiKeyDraft.trim() || aiSaving} small>{aiSaving ? "Saving…" : "Save Key"}</Btn>
              {aiConfig.configured && (
                <button data-testid="settings-remove-key-btn" onClick={removeAiConfig}
                  style={{ fontSize: 12, color: RED.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  Remove key
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ background: currentKey ? TEAL.bg : AMBER.bg, border: `1px solid ${currentKey ? TEAL.border : AMBER.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <p data-testid="settings-ai-status-readonly" style={{ fontSize: 13, color: currentKey ? TEAL.text : AMBER.text, margin: 0, lineHeight: 1.6 }}>
              {currentKey
                ? `✅ AI is enabled — managed centrally by your administrator (${getProvider(provider).name}).`
                : "⚠️ AI features aren't configured yet. Ask your administrator to add an API key."}
            </p>
          </div>
        )}

        {/* Personal AI prompt customization — stored locally per-browser, available to any user */}
        <div style={{ borderTop: "1px solid var(--color-border-primary)", paddingTop: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px", color: TEAL.primary }}>Customize AI Instructions</h3>
          
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Generic Mode Instructions</label>
            <textarea
              data-testid="settings-generic-instructions-textarea"
              value={genericInst}
              onChange={e => setGenericInst(e.target.value)}
              rows={8}
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", resize: "vertical" }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Detailed Mode Instructions</label>
            <textarea
              data-testid="settings-detailed-instructions-textarea"
              value={detailedInst}
              onChange={e => setDetailedInst(e.target.value)}
              rows={8}
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 11, fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Btn testId="settings-save-instructions-btn" onClick={saveInstructions} small>Save Instructions</Btn>
            <button
              data-testid="settings-reset-instructions-btn"
              onClick={() => {
                if (window.confirm("Are you sure you want to reset instructions to default?")) {
                  localStorage.removeItem("clinicalmind:instructions:generic");
                  localStorage.removeItem("clinicalmind:instructions:detailed");
                  setGenericInst(getGenericInstructions());
                  setDetailedInst(getDetailedInstructions());
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                }
              }}
              style={{ background: "none", border: "none", color: RED.primary, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 500 }}
            >
              Reset to Default
            </button>
          </div>
        </div>

        <div style={{ background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <p style={{ fontSize: 13, color: TEAL.text, margin: 0, lineHeight: 1.6 }}>
            <strong>No API key needed</strong> for built-in complaints. The 10 prebuilt workflows run entirely offline — AI is optional for enrichment.
          </p>
        </div>

        <div style={{ borderTop: "1px solid var(--color-border-primary)", paddingTop: 20 }}>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            <strong>ClinicFlow</strong><br />
            Built for doctors in Indian OPDs.<br /><br />
            All processing is local. Your patient data never leaves your device.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Workflow Node Editor ─────────────────────────────────────────────────────
function WorkflowEditor({ nodes, entryNode, onChange }) {
  const [selectedId, setSelectedId] = useState(entryNode || nodes[0]?.id || "");
  const iS = { width: "100%", padding: "7px 10px", border: "1.5px solid var(--color-border-primary)", borderRadius: 7, fontSize: 13, outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box" };
  const allIds = nodes.map(n => n.id);
  const selected = nodes.find(n => n.id === selectedId);

  const updateNode = (id, patch) => onChange({ nodes: nodes.map(n => n.id === id ? { ...n, ...patch } : n), entryNode });
  const updateOption = (nodeId, optIdx, patch) => {
    const node = nodes.find(n => n.id === nodeId);
    const opts = node.options.map((o, i) => i === optIdx ? { ...o, ...patch } : o);
    updateNode(nodeId, { options: opts });
  };
  const addOption = (nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    updateNode(nodeId, { options: [...node.options, { label: "New option", next: "END", tags: [] }] });
  };
  const removeOption = (nodeId, optIdx) => {
    const node = nodes.find(n => n.id === nodeId);
    updateNode(nodeId, { options: node.options.filter((_, i) => i !== optIdx) });
  };
  const addNode = () => {
    const id = "node_" + Date.now();
    const newNode = { id, question: "New question?", options: [{ label: "Yes", next: "END", tags: [] }, { label: "No", next: "END", tags: [] }] };
    onChange({ nodes: [...nodes, newNode], entryNode: entryNode || id });
    setSelectedId(id);
  };
  const removeNode = (id) => {
    const remaining = nodes.filter(n => n.id !== id);
    const newEntry = entryNode === id ? (remaining[0]?.id || "") : entryNode;
    onChange({ nodes: remaining, entryNode: newEntry });
    setSelectedId(remaining[0]?.id || "");
  };

  return (
    <div style={{ display: "flex", gap: 12, height: 440 }}>
      {/* Node list */}
      <div style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)" }}>NODES</span>
          <button data-testid="workflow-add-node-btn" onClick={addNode} style={{ fontSize: 12, fontWeight: 700, color: TEAL.primary, background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>+ Add</button>
        </div>
        {nodes.map(n => (
          <div key={n.id} data-testid={`workflow-node-${n.id}-item`} onClick={() => setSelectedId(n.id)}
            style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${selectedId === n.id ? TEAL.primary : "var(--color-border-primary)"}`,
              background: selectedId === n.id ? TEAL.bg : "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: selectedId === n.id ? TEAL.primary : "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{n.id}</span>
              {entryNode === n.id && <span style={{ fontSize: 9, background: TEAL.primary, color: "#fff", padding: "1px 5px", borderRadius: 4 }}>ENTRY</span>}
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-primary)", margin: "3px 0 0", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.question}</p>
          </div>
        ))}
      </div>

      {/* Node detail editor */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {!selected ? (
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: 20 }}>Select a node to edit, or add a new one.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>NODE ID</label>
                <input data-testid="workflow-node-id-input" style={{ ...iS, fontFamily: "var(--font-mono)", width: 140 }} value={selected.id}
                  onChange={e => {
                    const newId = e.target.value.replace(/\s/g, "_");
                    // Update all references to this id in other nodes' options
                    const updated = nodes.map(n => ({
                      ...n,
                      id: n.id === selected.id ? newId : n.id,
                      options: n.options.map(o => ({ ...o, next: o.next === selected.id ? newId : o.next }))
                    }));
                    onChange({ nodes: updated, entryNode: entryNode === selected.id ? newId : entryNode });
                    setSelectedId(newId);
                  }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", paddingBottom: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
                  <input data-testid="workflow-entry-node-checkbox" type="checkbox" checked={entryNode === selected.id}
                    onChange={() => onChange({ nodes, entryNode: selected.id })}
                    style={{ marginRight: 4 }} />
                  Entry node
                </label>
                <button data-testid="workflow-delete-node-btn" onClick={() => removeNode(selected.id)}
                  style={{ fontSize: 12, color: RED.primary, background: RED.bg, border: `1px solid ${RED.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  Delete node
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>QUESTION</label>
              <textarea data-testid="workflow-question-textarea" style={{ ...iS, minHeight: 60, resize: "vertical" }} value={selected.question}
                onChange={e => updateNode(selected.id, { question: e.target.value })} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)" }}>OPTIONS ({selected.options.length})</label>
                <button data-testid="workflow-add-option-btn" onClick={() => addOption(selected.id)}
                  style={{ fontSize: 12, color: TEAL.primary, background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  + Option
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selected.options.map((opt, i) => (
                  <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input data-testid={`workflow-option-${i}-label-input`} style={{ ...iS, flex: 1 }} value={opt.label} placeholder="Option label"
                        onChange={e => updateOption(selected.id, i, { label: e.target.value })} />
                      <button data-testid={`workflow-option-${i}-remove-btn`} onClick={() => removeOption(selected.id, i)}
                        style={{ fontSize: 14, color: RED.primary, background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>✕</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>NEXT NODE</label>
                        <select data-testid={`workflow-option-${i}-next-select`} style={{ ...iS, borderColor: opt.next === "END" && nodes.length > 1 ? AMBER.border : undefined }} value={opt.next}
                          onChange={e => updateOption(selected.id, i, { next: e.target.value })}>
                          <option value="END">END (finish consultation)</option>
                          <option value="AI">AI (call AI for next Q)</option>
                          {allIds.filter(id => id !== selected.id).map(id => <option key={id} value={id}>{id}</option>)}
                        </select>
                        {opt.next === "END" && nodes.length > 1 && (
                          <p style={{ fontSize: 10, color: AMBER.text, margin: "3px 0 0", fontWeight: 600 }}>⚠ Unlinked — leads to END. Link to a node to continue the flow.</p>
                        )}
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>TAGS (comma-sep)</label>
                        <input data-testid={`workflow-option-${i}-tags-input`} style={iS} value={(opt.tags || []).join(", ")} placeholder="e.g. rigors, chills"
                          onChange={e => updateOption(selected.id, i, { tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: RED.text, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input data-testid={`workflow-option-${i}-redflag-checkbox`} type="checkbox" checked={!!opt.redFlag}
                          onChange={e => updateOption(selected.id, i, { redFlag: e.target.checked })} />
                        🚨 Red flag
                      </label>
                    </div>
                    {opt.redFlag && (
                      <input data-testid={`workflow-option-${i}-redflag-message-input`} style={{ ...iS, fontSize: 12, borderColor: RED.border }} value={opt.redFlagMessage || ""}
                        placeholder="Red flag message shown to doctor…"
                        onChange={e => updateOption(selected.id, i, { redFlagMessage: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Complaint Editor ─────────────────────────────────────────────────────────
function ComplaintEditor({ complaint, onSave, onClose, tagLibrary = [], noAiNotice, pdfDocs = [], pdfBuffers, onAddTagSource }) {
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState(complaint || {
    name: "", category: "General", ageGroup: "all", clinicalContent: "",
    redFlagKeywords: [], commonDifferentials: [], tags: [], source: "private", author: ""
  });
  const [rfInput, setRfInput] = useState((form.redFlagKeywords || []).join(", "));
  const [diffInput, setDiffInput] = useState((form.commonDifferentials || []).join(", "));
  const [tagInput, setTagInput] = useState((form.tags || []).join(", "));
  const [workflow, setWorkflow] = useState(form.workflow || { nodes: [], entryNode: "" });
  const [diffWeights, setDiffWeights] = useState(form.diffWeights || {});
  const [tagRefs, setTagRefs] = useState(form.tagRefs || []);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagDoc, setNewTagDoc] = useState(pdfDocs.find(d => d.isPdf)?.name || "");
  const [newTagPage, setNewTagPage] = useState("");
  const [newTagBusy, setNewTagBusy] = useState(false);

  const createInlineTag = async () => {
    const doc = pdfDocs.find(d => d.name === newTagDoc);
    const page = parseInt(newTagPage);
    if (!newTagLabel.trim() || !doc || !page || page < 1 || page > (doc.numPages || 1)) return;
    setNewTagBusy(true);
    try {
      const buf = pdfBuffers?.current?.get(doc.name);
      if (!buf) return;
      const pdf = await openPDFDoc(buf);
      const text = await extractPageText(pdf, page);
      const image = await renderPageToDataURL(pdf, page);
      const id = onAddTagSource(newTagLabel.trim(), doc.name, page, text, image);
      setTagRefs(prev => prev.includes(id) ? prev : [...prev, id]);
      setNewTagLabel(""); setNewTagPage("");
    } finally { setNewTagBusy(false); }
  };

  const inputS = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box" };

  const save = () => {
    const now = new Date().toISOString();
    const saved = {
      ...form,
      id: form.id || form.name.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(),
      redFlagKeywords: rfInput.split(",").map(s => s.trim()).filter(Boolean),
      commonDifferentials: diffInput.split(",").map(s => s.trim()).filter(Boolean),
      tags: tagInput.split(",").map(s => s.trim()).filter(Boolean),
      source: "private",
      createdAt: form.createdAt || now,
      editedAt: now,
    };
    if (workflow.nodes.length > 0) saved.workflow = workflow;
    if (Object.keys(diffWeights).length > 0) saved.diffWeights = diffWeights;
    if (tagRefs.length > 0) saved.tagRefs = tagRefs;
    onSave(saved);
  };

  const TABS = [{ id: "details", label: "Details" }, { id: "workflow", label: `Workflow (${workflow.nodes.length} nodes)` }, { id: "content", label: "Clinical Content" }, { id: "weights", label: "Weights" }];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 820 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{complaint ? `Edit: ${complaint.name}` : "Create New Complaint"}</h2>
          <button data-testid="complaint-editor-close-btn" onClick={onClose} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>

        {complaint?.source === "system" && (
          <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: AMBER.text }}>
            System complaints are read-only. Saving creates a private fork with your changes.
          </div>
        )}

        {noAiNotice && (
          <div style={{ background: AMBER.bg, border: `1px solid ${AMBER.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: AMBER.text }}>
            ⚠ No API key configured — the extracted PDF text was dropped into Clinical Content as-is. Fill in Name, Category, and Differentials manually, or add an API key in ⚙️ Settings for automatic extraction next time.
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1.5px solid var(--color-border-primary)", paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} data-testid={`complaint-editor-tab-${t.id}-btn`} onClick={() => setTab(t.id)}
              style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "var(--font-sans)",
                borderBottom: tab === t.id ? `2.5px solid ${TEAL.primary}` : "2.5px solid transparent",
                background: "none", color: tab === t.id ? TEAL.primary : "var(--color-text-secondary)", marginBottom: -1.5 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Details tab */}
        {tab === "details" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Complaint Name</label>
              <input data-testid="complaint-editor-name-input" style={inputS} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Fever with Cough" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Category</label>
                <select data-testid="complaint-editor-category-select" style={inputS} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.slice(1).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Age Group</label>
                <select data-testid="complaint-editor-age-group-select" style={inputS} value={form.ageGroup} onChange={e => setForm(f => ({ ...f, ageGroup: e.target.value }))}>
                  {["all","pediatric","neonatal","adult"].map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Red Flag Keywords <span style={{ fontWeight: 400, fontSize: 12 }}>(comma-separated — triggers alert if patient mentions these)</span></label>
              <input data-testid="complaint-editor-redflags-input" style={inputS} value={rfInput} onChange={e => setRfInput(e.target.value)} placeholder="e.g. petechiae, neck stiff, cyanosis" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Common Differentials <span style={{ fontWeight: 400, fontSize: 12 }}>(comma-separated — shown in sidebar)</span></label>
              <input data-testid="complaint-editor-differentials-input" style={inputS} value={diffInput} onChange={e => setDiffInput(e.target.value)} placeholder="e.g. Malaria, Dengue, Typhoid" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>Tags</label>
              <input data-testid="complaint-editor-tags-input" style={inputS} value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="e.g. fever, rash" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
                Book References <span style={{ fontWeight: 400, fontSize: 12 }}>(attach tags from your PDF Tag Library — shown in the consultation sidebar)</span>
              </label>
              {tagLibrary.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>No tags yet.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {tagLibrary.map(t => {
                    const on = tagRefs.includes(t.id);
                    return (
                      <button key={t.id} type="button" data-testid={`complaint-editor-tagref-${t.id}-toggle`}
                        onClick={() => setTagRefs(prev => on ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                        style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "var(--font-sans)",
                          border: `1.5px solid ${on ? TEAL.primary : "var(--color-border-primary)"}`,
                          background: on ? TEAL.bg : "#fff", color: on ? TEAL.primary : "var(--color-text-secondary)" }}>
                        {on ? "✓ " : "🏷 "}{t.label} <span style={{ opacity: 0.6 }}>({t.sources.length})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Inline tag creator — create a new tag right from here, no need to open the PDF reader first */}
              {pdfDocs.filter(d => d.isPdf).length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Upload a PDF in the Document Vault to create book-reference tags.</p>
              ) : (
                <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>NEW TAG LABEL</label>
                    <input data-testid="complaint-editor-new-tag-label-input" style={{ ...inputS, padding: "7px 10px", fontSize: 13 }} value={newTagLabel} onChange={e => setNewTagLabel(e.target.value)}
                      placeholder="e.g. Fever" list="complaint-editor-tag-labels" />
                    <datalist id="complaint-editor-tag-labels">
                      {tagLibrary.map(t => <option key={t.id} value={t.label} />)}
                    </datalist>
                  </div>
                  <div style={{ minWidth: 140 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>PDF</label>
                    <select data-testid="complaint-editor-new-tag-doc-select" style={{ ...inputS, padding: "7px 10px", fontSize: 13 }} value={newTagDoc} onChange={e => setNewTagDoc(e.target.value)}>
                      {pdfDocs.filter(d => d.isPdf).map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 70 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>PAGE</label>
                    <input data-testid="complaint-editor-new-tag-page-input" type="number" style={{ ...inputS, padding: "7px 10px", fontSize: 13 }} value={newTagPage} onChange={e => setNewTagPage(e.target.value)} min={1} />
                  </div>
                  <button data-testid="complaint-editor-new-tag-add-btn" type="button" onClick={createInlineTag} disabled={newTagBusy || !newTagLabel.trim() || !newTagPage}
                    style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: newTagBusy ? "default" : "pointer", border: "none",
                      background: TEAL.primary, color: "#fff", fontFamily: "var(--font-sans)", opacity: (!newTagLabel.trim() || !newTagPage) ? 0.5 : 1 }}>
                    {newTagBusy ? "Adding…" : "+ Add Tag"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Workflow tab */}
        {tab === "workflow" && (
          <div>
            <div style={{ background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: TEAL.text }}>
              Build a structured question tree. Each node is one question. Options can branch to other nodes, end the consultation (<strong>END</strong>), or hand off to AI (<strong>AI</strong>). The <strong>entry node</strong> is the first question shown.
            </div>
            {workflow.nodes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ fontSize: 32, marginBottom: 10 }}>🌳</p>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 16 }}>No workflow yet. Add your first question node to get started.</p>
                <Btn testId="complaint-editor-create-first-node-btn" onClick={() => {
                  const id = "q1";
                  setWorkflow({ nodes: [{ id, question: "First question?", options: [{ label: "Yes", next: "END", tags: [] }, { label: "No", next: "END", tags: [] }] }], entryNode: id });
                }}>+ Create First Node</Btn>
              </div>
            ) : (
              <WorkflowEditor nodes={workflow.nodes} entryNode={workflow.entryNode}
                onChange={setWorkflow} />
            )}
          </div>
        )}

        {/* Weights tab */}
        {tab === "weights" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: TEAL.text }}>
              For each differential, specify which answer tags <strong>increase</strong> or <strong>decrease</strong> its likelihood score. Tags come from the options in your workflow nodes. Scores: each increase-tag match adds +2, each decrease-tag match subtracts -1. High ≥ 8, Medium ≥ 4.
            </div>
            {diffInput.split(",").map(s => s.trim()).filter(Boolean).map(diag => {
              const w = diffWeights[diag] || { tags_increase: [], tags_decrease: [] };
              return (
                <div key={diag} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{diag}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: TEAL.text, display: "block", marginBottom: 4 }}>↑ INCREASE TAGS (comma-sep)</label>
                      <input data-testid={`weights-${diag}-increase-input`} style={inputS} value={(w.tags_increase || []).join(", ")} placeholder="e.g. rigors, chills"
                        onChange={e => setDiffWeights(dw => ({ ...dw, [diag]: { ...w, tags_increase: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: RED.text, display: "block", marginBottom: 4 }}>↓ DECREASE TAGS (comma-sep)</label>
                      <input data-testid={`weights-${diag}-decrease-input`} style={inputS} value={(w.tags_decrease || []).join(", ")} placeholder="e.g. rash, bleeding"
                        onChange={e => setDiffWeights(dw => ({ ...dw, [diag]: { ...w, tags_decrease: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } }))} />
                    </div>
                  </div>
                </div>
              );
            })}
            {!diffInput.trim() && (
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Add differentials in the Details tab first — they'll appear here for weight configuration.</p>
            )}
          </div>
        )}

        {/* Clinical content tab */}
        {tab === "content" && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 6 }}>
              Clinical Reference Content <span style={{ fontWeight: 400, fontSize: 12 }}>(BM25-indexed — used as AI context and for the diagnosis sidebar)</span>
            </label>
            <textarea data-testid="complaint-editor-content-textarea" className="premium-textarea" style={{ minHeight: 320, resize: "vertical" }}
              value={form.clinicalContent}
              onChange={e => setForm(f => ({ ...f, clinicalContent: e.target.value }))}
              placeholder="Paste clinical reference text here — differentials, red flags, investigations, treatment. Plain text is fine." />
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--color-border-primary)", flexWrap: "wrap" }}>
          <Btn testId="complaint-editor-cancel-btn" variant="ghost" onClick={onClose} small>Cancel</Btn>
          <Btn testId="complaint-editor-export-json-btn" variant="secondary" small onClick={() => {
            const data = { ...form, redFlagKeywords: rfInput.split(",").map(s => s.trim()).filter(Boolean), workflow };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${form.name || "complaint"}.json`; a.click();
          }}>Export JSON</Btn>
          <Btn testId="complaint-editor-save-btn" onClick={save} disabled={!form.name}>Save as Private</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── SuperMemory (collapsed Document Vault) ──────────────────────────────────
export function DocumentVault({ pdfDocs, setPdfDocs, idx, tagLibrary, setTagLibrary, pdfBuffers, onOpenReader, onOpenTagLibrary, defaultExpanded = false }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(null);
  const [parsing, setParsing] = useState(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const fileRef = useRef();

  const processFile = async (file) => {
    const name = file.name;
    if (pdfDocs.find(d => d.name === name)) return;
    setLoading(name);
    try {
      const isPdf = file.type === "application/pdf";
      if (isPdf) {
        const buf = await file.arrayBuffer();
        await initPDFJS();
        const pdf = await window.pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
        pdfBuffers.current.set(name, buf);
        setPdfDocs(prev => [...prev, { name, numPages: pdf.numPages, isPdf: true, parsed: false }]);
        try {
          const saved = await uploadBook(file, pdf.numPages);
          setPdfDocs(prev => prev.map(d => d.name === name ? { ...d, bookId: saved.id } : d));
        } catch (e) { console.error("Could not save book to your profile:", e); }
      } else {
        const text = await file.text();
        const chunks = chunkText(text, name);
        idx.add(chunks);
        setPdfDocs(prev => [...prev, { name, numPages: 0, isPdf: false, parsed: true, chunks: chunks.length }]);
      }
    } catch (e) { console.error(`Could not load ${name}:`, e); }
    finally { setLoading(null); }
  };

  const parseDoc = async (doc) => {
    const buf = pdfBuffers.current.get(doc.name);
    if (!buf) return;
    setParsing(doc.name);
    try {
      const text = await extractAllText(buf);
      const chunks = chunkText(text, doc.name);
      idx.add(chunks);
      setPdfDocs(prev => prev.map(d => d.name === doc.name ? { ...d, parsed: true, chunks: chunks.length } : d));
    } finally { setParsing(null); }
  };

  const removeDoc = (name) => {
    const doc = pdfDocs.find(d => d.name === name);
    pdfBuffers.current.delete(name);
    setPdfDocs(prev => prev.filter(d => d.name !== name));
    setTagLibrary(prev => prev
      .map(t => ({ ...t, sources: t.sources.filter(s => s.docName !== name) }))
      .filter(t => t.sources.length > 0));
    if (doc?.bookId) deleteBook(doc.bookId).catch(() => {});
  };

  const totalDocs = pdfDocs.length;
  const totalTags = tagLibrary.length;

  if (!expanded) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 2 }}>
          <CardCarousel accent={PURPLE.primary} height={110} slides={[IllustLibrary, IllustDocs]} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: PURPLE.primary, display: "inline-flex", alignItems: "center", gap: 6 }}>✨ SuperMemory</h3>
          <span style={{ fontSize: 10, background: PURPLE.bg, color: PURPLE.primary, padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>AI INDEXED</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.45 }}>
          Forgotten asthma algorithm in OPD? Not anymore. Create your custom tags from your books and just review your custom tags.
        </p>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
          📄 {totalDocs} book{totalDocs !== 1 ? "s" : ""} uploaded · 🏷️ {totalTags} custom tag{totalTags !== 1 ? "s" : ""}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button 
            data-testid="supermemory-manage-books-btn"
            onClick={() => setExpanded(true)}
            style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${PURPLE.border}`, background: PURPLE.bg, color: PURPLE.primary, cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            📥 Manage Books & Tags
          </button>
          {totalTags > 0 && (
            <button 
              data-testid="supermemory-view-tag-library-btn"
              onClick={onOpenTagLibrary}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--color-border-primary)", background: "#fff", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)" }}
            >
              📚 View Tag Library
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: PURPLE.primary, display: "inline-flex", alignItems: "center", gap: 6 }}>✨ SuperMemory</h3>
        <button data-testid="supermemory-collapse-btn" onClick={() => setExpanded(false)} style={{ fontSize: 12, fontWeight: 600, color: PURPLE.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>Collapse ✕</button>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Manage your medical books and protocol library</p>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {tagLibrary.length > 0 && (
            <button data-testid="document-vault-tag-library-btn" onClick={onOpenTagLibrary} style={{ fontSize: 12, fontWeight: 600, color: TEAL.primary, background: "none", border: "none", cursor: "pointer" }}>📚 Tag Library ({tagLibrary.length})</button>
          )}
          {pdfDocs.length > 0 && (
            <button data-testid="document-vault-clear-all-btn" onClick={() => { setPdfDocs([]); setTagLibrary([]); pdfBuffers.current.clear(); idx.clear(); }}
              style={{ fontSize: 12, color: RED.primary, background: "none", border: "none", cursor: "pointer" }}>Clear all</button>
          )}
        </div>
      </div>
      <div data-testid="document-vault-dropzone" onDrop={e => { e.preventDefault(); setDragging(false); Array.from(e.dataTransfer.files).forEach(processFile); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? TEAL.primary : "var(--color-border-secondary)"}`, borderRadius: 10,
          padding: "20px 16px", textAlign: "center", cursor: "pointer",
          background: dragging ? TEAL.bg : "var(--color-background-secondary)", transition: "all 0.15s" }}>
        <input data-testid="document-vault-file-input" ref={fileRef} type="file" multiple accept=".txt,.md,.pdf" style={{ display: "none" }}
          onChange={e => { Array.from(e.target.files).forEach(processFile); e.target.value = ""; }} />
        {loading ? <p style={{ fontSize: 13, color: TEAL.primary, margin: 0 }}>Loading {loading}…</p> : (
          <>
            <p style={{ fontSize: 22, margin: "0 0 5px" }}>📄</p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Drop .txt, .md, or .pdf · click to browse</p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "4px 0 0", opacity: 0.6 }}>PDFs are stored locally — not parsed until you choose</p>
          </>
        )}
      </div>
      {pdfDocs.map((doc, i) => (
        <div key={i} data-testid={`document-vault-doc-${i}-item`} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>
                {doc.isPdf ? `${doc.numPages} pages` : "Text document"}
                {doc.parsed && <span style={{ marginLeft: 6, color: TEAL.primary, fontWeight: 600 }}>· {doc.chunks} chunks indexed</span>}
              </p>
            </div>
            <button data-testid={`document-vault-doc-${i}-remove-btn`} onClick={() => removeDoc(doc.name)}
              style={{ fontSize: 14, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", flexShrink: 0, marginLeft: 8 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {doc.isPdf && (
              <button data-testid={`document-vault-doc-${i}-open-reader-btn`} onClick={() => onOpenReader(doc)}
                style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${TEAL.border}`, background: TEAL.bg, color: TEAL.primary, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                📖 Open Reader
              </button>
            )}
            {doc.isPdf && !doc.parsed && (
              <button data-testid={`document-vault-doc-${i}-parse-btn`} onClick={() => parseDoc(doc)} disabled={parsing === doc.name}
                style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: "1.5px solid var(--color-border-primary)", background: "#fff", color: "var(--color-text-secondary)", cursor: "pointer", fontFamily: "var(--font-sans)", opacity: parsing === doc.name ? 0.6 : 1 }}>
                {parsing === doc.name ? "Parsing…" : "🔍 Parse for BM25 search"}
              </button>
            )}
            {doc.parsed && <span style={{ fontSize: 11, color: TEAL.primary, fontWeight: 600, alignSelf: "center" }}>✓ Indexed for search</span>}
          </div>
          {tagLibrary.some(t => t.sources.some(s => s.docName === doc.name)) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, paddingTop: 2 }}>
              {tagLibrary.flatMap(t =>
                t.sources.filter(s => s.docName === doc.name).map(s => (
                  <button key={`${t.id}-${s.page}`} data-testid={`document-vault-tag-${t.id}-p${s.page}-btn`} onClick={() => onOpenReader(doc, s.page)}
                    style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, border: "1.5px solid #B3D4F5", background: "#E8F4FF", color: "#1A5C9A", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    📖 {t.label} p.{s.page}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Complaint Library ────────────────────────────────────────────────────────
function ComplaintCard({ complaint, selected, onEdit, onSelect, onPublish }) {
  const [hov, setHov] = useState(false);
  const hasWorkflow = !!complaint.workflow;
  return (
    <div data-testid={`complaint-card-${complaint.id}`} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: selected ? TEAL.bg : "#fff", border: `1.5px solid ${selected ? TEAL.primary : hov ? TEAL.border : "var(--color-border-primary)"}`,
        borderRadius: 10, padding: 12, transition: "all 0.15s", cursor: "pointer" }}
      onClick={onSelect}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: hasWorkflow ? TEAL.primary : AMBER.primary, flexShrink: 0, marginTop: 4 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {onPublish && (
            <button data-testid={`complaint-card-${complaint.id}-publish-btn`} onClick={e => { e.stopPropagation(); onPublish(); }} title="Publish to Community"
              style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 2 }}>🌐</button>
          )}
          <button data-testid={`complaint-card-${complaint.id}-edit-btn`} onClick={e => { e.stopPropagation(); onEdit(); }}
            style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 2 }}>✏️</button>
        </div>
      </div>
      <p style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)", margin: "0 0 6px", lineHeight: 1.4 }}>{complaint.name}</p>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", padding: "2px 6px", borderRadius: 4 }}>{complaint.category}</span>
    </div>
  );
}

function ComplaintLibrary({ selected, setSelected, onEdit, customComplaints, onModeChange, onPublish, onImport }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [tab, setTab] = useState("AI");
  const [communityItems, setCommunityItems] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [myRating, setMyRating] = useState({});

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleTab = (t) => {
    setTab(t);
    onModeChange?.(t === "AI");
    if (t === "AI") setSelected(null);
    if (t === "Community" && communityItems.length === 0) {
      setCommunityLoading(true);
      listCommunityWorkflows().then(setCommunityItems).catch(() => setCommunityItems([])).finally(() => setCommunityLoading(false));
    }
  };

  const rateCommunityItem = async (id, stars) => {
    setMyRating(prev => ({ ...prev, [id]: stars }));
    try {
      const updated = await rateWorkflow(id, stars);
      setCommunityItems(prev => prev.map(i => i.id === id ? updated : i));
    } catch { /* silent */ }
  };

  const source = tab === "System" ? SYSTEM_COMPLAINTS : tab === "AI" || tab === "Community" ? [] : customComplaints.filter(c => c.source === "private");

  const filtered = source.filter(c => {
    const matchCat = cat === "All" || c.category === cat;
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.tags || []).some(t => t.includes(q));
    return matchCat && matchSearch;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: TEAL.primary }}>Complaint Library</h3>
        {tab !== "AI" && <Btn testId="complaint-library-new-btn" small onClick={() => onEdit(null)}>+ New</Btn>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["System","Private","Community","AI"].map(t => (
          <button key={t} data-testid={`complaint-library-tab-${t.toLowerCase()}-btn`} onClick={() => handleTab(t)} style={{ padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
            borderColor: tab === t ? (t === "AI" ? "#A855F7" : TEAL.primary) : "var(--color-border-primary)",
            background: tab === t ? (t === "AI" ? "linear-gradient(120deg,#4c1d95,#7c3aed)" : TEAL.bg) : "#fff",
            boxShadow: tab === t && t === "AI" ? "0 3px 10px rgba(124,58,237,0.35)" : "none",
            color: tab === t ? (t === "AI" ? "#F3E8FF" : TEAL.primary) : "var(--color-text-secondary)" }}>
            {t === "AI" ? "✨ AI Mode" : t}
          </button>
        ))}
      </div>

      {tab === "AI" ? (
        <div style={{ background: "linear-gradient(135deg,#1e1b3a 0%,#3b1d6e 45%,#7c3aed 85%,#a855f7 100%)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 28 }}>✨</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#E0E0FF", margin: "0 0 3px" }}>Fully AI-Controlled Mode</p>
              <p style={{ fontSize: 12, color: "#9090C0", margin: 0 }}>AI generates every question, differential, and management plan. Type the chief complaint below to start.</p>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 12 }}>
            <p style={{ fontSize: 11, color: "#7070A0", margin: "0 0 6px", fontWeight: 600, letterSpacing: 0.5 }}>HOW IT WORKS</p>
            <ul style={{ fontSize: 12, color: "#9090C0", margin: 0, paddingLeft: 16, lineHeight: 2 }}>
              <li>AI asks the most clinically relevant questions</li>
              <li>Differentials update after each answer</li>
              <li>AI decides when history is complete</li>
              <li>Generates detailed note with management plan</li>
            </ul>
          </div>
          <p style={{ fontSize: 11, color: "#5050A0", margin: 0 }}>⚠ Requires an API key in ⚙️ Settings</p>
        </div>
      ) : tab === "Community" ? (
        <div data-testid="community-workflows-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {communityLoading ? <p style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>Loading…</p>
            : communityItems.length === 0 ? <p data-testid="community-workflows-empty" style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>No custom workflows published yet — publish one from your Private tab!</p>
            : communityItems.map(item => (
              <div key={item.id} data-testid={`community-workflow-${item.id}`} style={{ border: "1.5px solid var(--color-border-primary)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, margin: "0 0 2px" }}>{item.name}</p>
                    <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>by {item.owner_name} · {item.category}</p>
                  </div>
                  <button data-testid={`community-workflow-import-${item.id}`} onClick={() => onImport(item)}
                    style={{ fontSize: 11.5, fontWeight: 700, color: TEAL.primary, background: TEAL.bg, border: "none", borderRadius: 8, padding: "5px 10px", cursor: "pointer", flexShrink: 0 }}>+ Import</button>
                </div>
                <div style={{ display: "flex", gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} data-testid={`community-workflow-rate-${item.id}-${n}`} onClick={() => rateCommunityItem(item.id, n)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0, color: (myRating[item.id] || 0) >= n ? "#f59e0b" : "#e2e8f0" }}>★</button>
                  ))}
                  {item.rating_count > 0 && <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 4 }}>{item.avg_rating} ({item.rating_count})</span>}
                </div>
              </div>
            ))}
        </div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)" }}>📁 Select System / Category</label>
            <input 
              data-testid="complaint-library-mobile-category-input"
              value={cat === "All" ? "" : cat} 
              onChange={e => setCat(e.target.value.trim() ? e.target.value : "All")}
              placeholder="Type to search system (e.g. GI, Neuro)..."
              list="mobile-categories-list"
              style={{ padding: "10px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)", width: "100%", outline: "none" }}
            />
            <datalist id="mobile-categories-list">
              {CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)" }}>🩺 Search & Select Complaint</label>
            <input 
              data-testid="complaint-library-mobile-search-input"
              value={search} 
              onChange={e => {
                const val = e.target.value;
                setSearch(val);
                const matched = source.find(c => c.name.toLowerCase() === val.toLowerCase());
                if (matched) setSelected(matched);
              }}
              placeholder="Type to search & select complaint..."
              list="mobile-complaints-list"
              style={{ padding: "10px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, fontFamily: "var(--font-sans)", width: "100%", outline: "none" }}
            />
            <datalist id="mobile-complaints-list">
              {filtered.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>

          {selected && (
            <div data-testid="complaint-library-mobile-selected-badge" style={{ background: TEAL.bg, border: `1.5px solid ${TEAL.border}`, borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", animation: "fadeSlideIn 0.2s ease" }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 800, color: TEAL.primary }}>SELECTED COMPLAINT</span>
                <p style={{ fontSize: 14, fontWeight: 700, margin: "2px 0 0", color: TEAL.text }}>{selected.name}</p>
              </div>
              <span style={{ fontSize: 18 }}>✅</span>
            </div>
          )}
        </div>
      ) : (
        <>
          <input data-testid="complaint-library-search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search complaints…"
            style={{ padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)" }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIES.map(c => (
              <button key={c} data-testid={`complaint-library-category-${c.toLowerCase()}-chip`} onClick={() => setCat(c)} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                borderColor: cat === c ? TEAL.primary : "var(--color-border-primary)", background: cat === c ? TEAL.primary : "#fff", color: cat === c ? "#fff" : "var(--color-text-secondary)" }}>
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8, maxHeight: 280, overflowY: "auto" }}>
            {filtered.map(c => (
              <ComplaintCard key={c.id} complaint={c} selected={selected?.id === c.id}
                onEdit={() => onEdit(c)} onSelect={() => setSelected(c)}
                onPublish={tab === "Private" ? () => onPublish(c) : null} />
            ))}
            {!filtered.length && <p style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: 20 }}>No complaints found.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Product Toggle: ClinicFlow ⇄ SuperSummary ──────────────────────────────
function ProductToggle({ product, setProduct }) {
  const opts = [
    { id: null, label: "🏠 Home", color: "var(--color-text-primary)", bg: "var(--color-border-primary)" },
    { id: "clinicalmind", label: "ClinicFlow", color: TEAL.primary, bg: TEAL.bg },
    { id: "supersummary", label: "SuperSummary", color: PURPLE.primary, bg: PURPLE.bg },
  ];
  return (
    <div style={{ display: "flex", gap: 3, background: "var(--color-background-secondary)", borderRadius: 20, padding: 3 }}>
      {opts.map(o => (
        <button key={o.id ?? "home"} data-testid={`product-toggle-${o.id ?? "home"}-btn`} onClick={() => setProduct(o.id)}
          style={{ padding: "6px 14px", borderRadius: 18, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: "var(--font-sans)",
            background: product === o.id ? o.bg : "transparent", color: product === o.id ? o.color : "var(--color-text-secondary)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Profile Modal ────────────────────────────────────────────────────────────
function ProfileModal({ onClose, onSettings }) {
  const { user, logout } = useAuth();
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const professionLabels = { mbbs_student: "MBBS Student", resident: "Resident", consultant: "Consultant" };
  return (
    <div data-testid="profile-modal-overlay" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} className="anim-fade">
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 380, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,0.3)" }} className="anim-fade-up">
        <div style={{ background: "linear-gradient(120deg,#0d9488,#14b8a6)", padding: "32px 24px 46px", position: "relative" }}>
          <button data-testid="profile-modal-close-btn" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 28, height: 28, color: "#fff", fontSize: 15, cursor: "pointer" }}>✕</button>
          {user?.picture ? (
            <img src={user.picture} alt="" style={{ width: 76, height: 76, borderRadius: "50%", margin: "0 auto", display: "block", boxShadow: "0 8px 20px rgba(0,0,0,0.15)", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, margin: "0 auto", boxShadow: "0 8px 20px rgba(0,0,0,0.15)" }}>🧑‍⚕️</div>
          )}
        </div>
        <div style={{ padding: "0 24px 24px", marginTop: -28 }}>
          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 10px 30px rgba(0,0,0,0.08)", padding: 18, textAlign: "center" }}>
            <p data-testid="profile-modal-user-name" style={{ fontSize: 16, fontWeight: 800, margin: "0 0 2px" }}>{user?.name || "Doctor"}</p>
            <p data-testid="profile-modal-user-email" style={{ fontSize: 12.5, color: "var(--color-text-secondary)", margin: 0 }}>{user?.email}</p>
            {user?.role === "admin" && <span style={{ display: "inline-block", marginTop: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: PURPLE.primary, padding: "2px 8px", borderRadius: 10 }}>ADMIN</span>}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1, background: TEAL.bg, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: TEAL.primary, margin: 0 }}>🩺</p>
              <p data-testid="profile-modal-profession" style={{ fontSize: 10.5, color: TEAL.text, margin: "3px 0 0", fontWeight: 600 }}>{professionLabels[user?.profession] || "Profession"}</p>
            </div>
            <div style={{ flex: 1, background: PURPLE.bg, borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: PURPLE.primary, margin: 0 }}>📱</p>
              <p data-testid="profile-modal-mobile" style={{ fontSize: 10.5, color: PURPLE.text, margin: "3px 0 0", fontWeight: 600 }}>{user?.mobile_number || "No number"}</p>
            </div>
          </div>
          <button data-testid="profile-modal-open-records-btn" onClick={() => setRecordsOpen(true)} style={{ width: "100%", marginTop: 16, padding: "11px", borderRadius: 10, border: "1.5px solid var(--color-border-primary)", background: "#fff", color: "var(--color-text-primary)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            📁 My Records
          </button>
          {user?.role === "admin" && (
            <button data-testid="profile-modal-open-admin-dashboard-btn" onClick={() => setAdminOpen(true)} style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "1.5px solid " + PURPLE.border, background: PURPLE.bg, color: PURPLE.primary, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              🛠 Admin Dashboard
            </button>
          )}
          <button data-testid="profile-modal-open-settings-btn" onClick={() => { onClose(); onSettings(); }} style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "none", background: "var(--color-text-primary)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ⚙️ Open Settings
          </button>
          <button data-testid="profile-modal-logout-btn" onClick={() => { onClose(); logout(); }} style={{ width: "100%", marginTop: 8, padding: "11px", borderRadius: 10, border: "1.5px solid #fecdd3", background: "#fff", color: "#e11d48", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            🚪 Log Out
          </button>
        </div>
      </div>
      {recordsOpen && <RecordsModal onClose={() => setRecordsOpen(false)} />}
      {adminOpen && <AdminDashboard onClose={() => setAdminOpen(false)} />}
    </div>
  );
}

// ─── Profile Menu ─────────────────────────────────────────────────────────────
function ProfileMenu({ onSettings, onTagLibrary, tagCount }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const itemS = { width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "none", background: "none", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };

  if (!user) {
    return (
      <>
        <button data-testid="profile-menu-signin-btn" onClick={() => setLoginModalOpen(true)}
          style={{ padding: "8px 18px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: "1.5px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.15)", color: "#fff", fontFamily: "var(--font-sans)" }}>
          Sign In
        </button>
        {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
      </>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button data-testid="profile-menu-avatar-btn" onClick={() => setOpen(v => !v)}
        style={{ width: 38, height: 38, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.6)", background: "linear-gradient(135deg,#fff,#f0fdfa)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
        🧑‍⚕️
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#fff", borderRadius: 12,
          border: "1px solid var(--color-border-primary)", boxShadow: "0 8px 30px rgba(0,0,0,0.15)", minWidth: 200, overflow: "hidden", zIndex: 60 }}>
          <button data-testid="profile-menu-view-profile-item" onClick={() => { setOpen(false); setShowProfile(true); }} style={itemS}>
            <span>👤 View Profile</span>
          </button>
          <div style={{ height: 1, background: "var(--color-border-primary)" }} />
          <button data-testid="profile-menu-tag-library-item" onClick={() => { setOpen(false); onTagLibrary(); }} style={itemS}>
            <span>📚 Tag Library</span>
            {tagCount > 0 && <span style={{ fontSize: 11, background: TEAL.bg, color: TEAL.primary, padding: "1px 7px", borderRadius: 10, fontWeight: 700 }}>{tagCount}</span>}
          </button>
          <div style={{ height: 1, background: "var(--color-border-primary)" }} />
          <button data-testid="profile-menu-settings-item" onClick={() => { setOpen(false); onSettings(); }} style={itemS}>
            <span>⚙️ Settings</span>
          </button>
        </div>
      )}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} onSettings={onSettings} />}
    </div>
  );
}


// ─── Library Screen ───────────────────────────────────────────────────────────
function LibraryScreen({ onStart, hasKey, provider, apiKey, idx, pdfDocs, setPdfDocs, customComplaints, setCustomComplaints, setSettingsOpen, tagLibrary, setTagLibrary, pdfBuffers, product, setProduct }) {
  const [selected, setSelected] = useState(null);
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState("years");
  const age = ageValue ? `${ageValue} ${ageUnit === "years" ? (ageValue === "1" ? "year" : "years") : ageUnit === "months" ? (ageValue === "1" ? "month" : "months") : (ageValue === "1" ? "day" : "days")}` : "";
  const [sex, setSex] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [editingNoAiNotice, setEditingNoAiNotice] = useState(false);
  const [isAiMode, setIsAiMode] = useState(true);
  const [aiComplaintText, setAiComplaintText] = useState("");
  const [readerState, setReaderState] = useState(null); // { doc, initPage }
  const [creatingFromPdf, setCreatingFromPdf] = useState(false);
  const [tagLibraryOpen, setTagLibraryOpen] = useState(false);
  const [consultMode, setConsultMode] = useState("learning");

  const addTagSource = (label, docName, page, extractedText, image) => {
    const norm = label.trim().toLowerCase();
    const existing = tagLibrary.find(t => t.label.toLowerCase() === norm);
    const id = existing?.id || ("tag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6));
    setTagLibrary(prev => {
      const match = prev.find(t => t.id === id);
      if (match) {
        if (match.sources.some(s => s.docName === docName && s.page === page)) return prev;
        return prev.map(t => t.id === id ? { ...t, sources: [...t.sources, { docName, page, extractedText, image }] } : t);
      }
      return [...prev, { id, label: label.trim(), sources: [{ docName, page, extractedText, image }] }];
    });
    const docEntry = pdfDocs.find(d => d.name === docName);
    if (docEntry?.bookId) {
      upsertTagSource(id, label.trim(), { doc_id: docEntry.bookId, doc_name: docName, page, extracted_text: extractedText, image }).catch(() => {});
    }
    return id;
  };
  const removeTagSource = (tagId, docName, page) => {
    setTagLibrary(prev => prev
      .map(t => t.id === tagId ? { ...t, sources: t.sources.filter(s => !(s.docName === docName && s.page === page)) } : t)
      .filter(t => t.sources.length > 0));
    const docEntry = pdfDocs.find(d => d.name === docName);
    if (docEntry?.bookId) removeTagSourceRemote(tagId, docEntry.bookId, page).catch(() => {});
  };
  const removeTag = (tagId) => {
    setTagLibrary(prev => prev.filter(t => t.id !== tagId));
    deleteTagRemote(tagId).catch(() => {});
  };

  const saveComplaint = (c) => {
    const prev = JSON.parse(localStorage.getItem("clinicalmind:complaints") || "[]");
    const i = prev.findIndex(p => p.id === c.id);
    const next = i >= 0 ? prev.map((p, j) => j === i ? c : p) : [...prev, c];
    localStorage.setItem("clinicalmind:complaints", JSON.stringify(next));
    setCustomComplaints(next);
    setEditing(undefined);
  };

  const publishWorkflowHandler = async (c) => {
    try {
      await publishWorkflow({ name: c.name, category: c.category, tags: c.tags || [], workflow: c.workflow || {} });
      alert(`"${c.name}" published to the community! Other users can now find and rate it.`);
    } catch (err) {
      alert("Could not publish: " + err.message);
    }
  };

  const importWorkflowHandler = (item) => {
    const rec = { id: (item.name || "complaint").toLowerCase().replace(/\s+/g, "_") + "_" + Date.now(), name: item.name + " (community)", category: item.category, tags: item.tags || [], workflow: item.workflow, source: "private", createdAt: new Date().toISOString() };
    const prev = JSON.parse(localStorage.getItem("clinicalmind:complaints") || "[]");
    const next = [...prev, rec];
    localStorage.setItem("clinicalmind:complaints", JSON.stringify(next));
    setCustomComplaints(next);
    alert(`"${item.name}" imported into your Private complaints!`);
  };

  const openEdit = (c) => {
    setEditingNoAiNotice(false);
    if (c?.source === "system") {
      setEditing({ ...c, id: c.id + "_fork_" + Date.now(), source: "private", author: "", createdAt: new Date().toISOString() });
    } else { setEditing(c ?? null); }
  };

  const handleCreateComplaint = async (pages, pdfDoc, docName) => {
    setReaderState(null);
    setCreatingFromPdf(true);
    try {
      let pageText = "";
      for (const p of pages) pageText += `[Page ${p}]\n${await extractPageText(pdfDoc, p)}\n\n`;
      const textSnippet = pageText.slice(0, 3500);
      if (apiKey) {
        const prompt = `Extract a clinical complaint template from this medical textbook content.

SOURCE: ${docName}, pages ${pages.join(", ")}
CONTENT:
${textSnippet}

Return ONLY valid JSON with this exact structure:
{
  "name": "symptom-based chief complaint (patient-facing, e.g. 'Fever with Cough')",
  "category": "Respiratory|GI|Neuro|Skin|Urinary|Hematology|General|Emergency|Newborn",
  "redFlagKeywords": ["keyword1","keyword2"],
  "commonDifferentials": ["Diagnosis 1","Diagnosis 2","Diagnosis 3","Diagnosis 4","Diagnosis 5"],
  "clinicalContent": "relevant clinical text for BM25 retrieval — keep under 2000 chars"
}`;
        let raw = "";
        await callAIStream([{ role: "user", content: prompt }],
          "You are a clinical knowledge extractor. Output only valid JSON. No markdown fences.",
          provider, apiKey, t => { raw = t; });
        const parsed = parseJSON(raw);
        if (parsed) { openEdit({ ...parsed, source: "private", id: "" }); return; }
      }
      // No AI configured, or parse failed — open editor with raw text and flag the fallback
      setEditingNoAiNotice(true);
      setEditing({ name: "", category: "General", clinicalContent: textSnippet, commonDifferentials: [], redFlagKeywords: [], tags: [], source: "private", id: "" });
    } finally { setCreatingFromPdf(false); }
  };

  return (
    <div data-testid="library-screen" style={{ minHeight: "100vh" }}>
      <div className="hero-band" style={{ padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(13,148,136,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🩺</span>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#fff" }}>ClinicFlow</h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", margin: 0 }}>Indian OPD</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ProductToggle product={product} setProduct={setProduct} />
          <ProfileMenu
            onSettings={() => setSettingsOpen(true)}
            onTagLibrary={() => setTagLibraryOpen(true)}
            tagCount={tagLibrary.length}
          />
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ background: hasKey ? TEAL.bg : "var(--color-background-secondary)", border: `1.5px solid ${hasKey ? TEAL.border : "var(--color-border-primary)"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20 }}>{hasKey ? "🤖" : "📴"}</span>
          <div>
            {hasKey ? (
              <p style={{ fontSize: 14, color: TEAL.text, margin: 0 }}>
                <strong>AI mode active.</strong> Structured workflow runs first, then AI takes over for deeper clinical questions and note generation.
              </p>
            ) : (
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>
                <strong style={{ color: "var(--color-text-primary)" }}>Offline mode.</strong> All 10 complaints run fully without an API key — structured local workflow + offline note.{" "}
                <button data-testid="library-add-api-key-link" onClick={() => setSettingsOpen(true)} style={{ background: "none", border: "none", color: TEAL.primary, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 14, padding: 0 }}>Add API key →</button>
              </p>
            )}
          </div>
        </div>

        <div className="library-grid">
          <Card><DocumentVault pdfDocs={pdfDocs} setPdfDocs={setPdfDocs} idx={idx} tagLibrary={tagLibrary} setTagLibrary={setTagLibrary} pdfBuffers={pdfBuffers}
            onOpenReader={async (doc, initPage) => {
              if (!pdfBuffers.current.get(doc.name) && doc.bookId) {
                try { pdfBuffers.current.set(doc.name, await downloadBook(doc.bookId)); }
                catch (e) { alert("Could not load this book: " + e.message); return; }
              }
              setReaderState({ doc, initPage: initPage || 1 });
            }}
            onOpenTagLibrary={() => setTagLibraryOpen(true)} /></Card>
          <Card><ComplaintLibrary selected={selected} setSelected={setSelected} onEdit={openEdit} customComplaints={customComplaints} onModeChange={setIsAiMode}
            onPublish={publishWorkflowHandler} onImport={importWorkflowHandler} /></Card>
        </div>

        <Card className="start-card" style={{
          background: isAiMode ? "linear-gradient(135deg,#1e1b3a 0%,#3b1d6e 45%,#7c3aed 85%,#a855f7 100%)" : "#fff",
          border: isAiMode ? "1.5px solid #8B5CF6" : "1.5px solid var(--color-border-primary)" }}>

          {/* Complaint selector / AI text input */}
          {isAiMode ? (
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#9090C0", display: "block", marginBottom: 4 }}>Chief Complaint</label>
              <input data-testid="library-ai-complaint-input" value={aiComplaintText} onChange={e => setAiComplaintText(e.target.value)}
                placeholder="e.g. Fever for 3 days, Abdominal pain…"
                style={{ padding: "9px 12px", border: "1.5px solid #8B5CF6", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", width: "100%", background: "rgba(255,255,255,0.07)", color: "#E0E0FF", boxSizing: "border-box" }} />
            </div>
          ) : selected ? (
            <div style={{ background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 8, padding: "8px 14px" }}>
              <p style={{ fontSize: 11, color: TEAL.text, margin: "0 0 2px", fontWeight: 600 }}>Selected</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: TEAL.primary, margin: 0 }}>{selected.name}</p>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, alignSelf: "center" }}>← Select a complaint to begin</p>
          )}

          {/* Age */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Patient Age</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" min={0} data-testid="library-age-input" value={ageValue} onChange={e => setAgeValue(e.target.value)} placeholder="e.g. 6"
                style={{ padding: "9px 12px", border: `1.5px solid ${isAiMode ? "#8B5CF6" : "var(--color-border-primary)"}`, borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", width: 80,
                  background: isAiMode ? "rgba(255,255,255,0.07)" : "#fff", color: isAiMode ? "#E0E0FF" : "inherit" }} />
              <select data-testid="library-age-unit-select" value={ageUnit} onChange={e => setAgeUnit(e.target.value)}
                style={{ padding: "9px 10px", border: `1.5px solid ${isAiMode ? "#8B5CF6" : "var(--color-border-primary)"}`, borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "var(--font-sans)", cursor: "pointer",
                  background: isAiMode ? "rgba(255,255,255,0.07)" : "#fff", color: isAiMode ? "#E0E0FF" : "inherit" }}>
                <option value="years">Years</option>
                <option value="months">Months</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>

          {/* Sex */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>Sex</label>
            <div style={{ display: "flex", gap: 6 }}>
              {["Male","Female","Other"].map(s => (
                <button key={s} data-testid={`library-sex-${s.toLowerCase()}-btn`} onClick={() => setSex(s)} style={{ padding: "9px 14px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "1.5px solid", fontFamily: "var(--font-sans)",
                  borderColor: sex === s ? (isAiMode ? "#8B5CF6" : TEAL.primary) : (isAiMode ? "#3A3A6A" : "var(--color-border-primary)"),
                  background: sex === s ? (isAiMode ? "#2A2A5E" : TEAL.bg) : (isAiMode ? "rgba(255,255,255,0.04)" : "#fff"),
                  color: sex === s ? (isAiMode ? "#D8B4FE" : TEAL.primary) : (isAiMode ? "#7070A0" : "var(--color-text-secondary)") }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Consultation Mode Selector */}
          <div style={{ width: "100%", borderTop: `1px solid ${isAiMode ? "#3A3A6A" : "var(--color-border-primary)"}`, paddingTop: 16, marginTop: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", display: "block", marginBottom: 8 }}>Consultation Mode</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div 
                data-testid="library-consult-mode-learning-card"
                onClick={() => setConsultMode("learning")}
                style={{
                  padding: 12, borderRadius: 10, cursor: "pointer", border: "1.5px solid",
                  borderColor: consultMode === "learning" ? (isAiMode ? "#8B5CF6" : TEAL.primary) : (isAiMode ? "#3A3A6A" : "var(--color-border-primary)"),
                  background: consultMode === "learning" ? (isAiMode ? "#2A2A5E" : TEAL.bg) : (isAiMode ? "rgba(255,255,255,0.04)" : "#fff"),
                  transition: "all 0.15s"
                }}
              >
                <svg width="34" height="26" viewBox="0 0 48 36" style={{ marginBottom: 6 }}>
                  <path d="M4 6 C10 2 18 2 24 6 V30 C18 26 10 26 4 30 Z" fill={consultMode === "learning" ? (isAiMode ? "#8B5CF6" : TEAL.primary) : "#94a3b8"} opacity="0.85" />
                  <path d="M44 6 C38 2 30 2 24 6 V30 C30 26 38 26 44 30 Z" fill={consultMode === "learning" ? (isAiMode ? "#8B8BFF" : TEAL.light) : "#cbd5e1"} />
                  <line x1="24" y1="6" x2="24" y2="30" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
                </svg>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>📖</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: consultMode === "learning" ? (isAiMode ? "#D8B4FE" : TEAL.primary) : "var(--color-text-primary)" }}>Learning Mode</span>
                </div>
                <p style={{ fontSize: 11, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", margin: 0, lineHeight: 1.3 }}>
                  Follows the standard structured sequential clinical workflow (one question at a time).
                </p>
              </div>

              <div 
                data-testid="library-consult-mode-opd-card"
                onClick={() => {
                  if (hasKey) {
                    setConsultMode("opd");
                  } else {
                    alert("OPD Mode requires an API Key. Please add one in settings or use Learning Mode.");
                  }
                }}
                style={{
                  padding: 12, borderRadius: 10, cursor: "pointer", border: "1.5px solid",
                  borderColor: consultMode === "opd" ? (isAiMode ? "#8B5CF6" : TEAL.primary) : (isAiMode ? "#3A3A6A" : "var(--color-border-primary)"),
                  background: consultMode === "opd" ? (isAiMode ? "#2A2A5E" : TEAL.bg) : (isAiMode ? "rgba(255,255,255,0.04)" : "#fff"),
                  opacity: hasKey ? 1 : 0.6,
                  transition: "all 0.15s"
                }}
              >
                <svg width="34" height="26" viewBox="0 0 48 36" style={{ marginBottom: 6 }}>
                  <path d="M27 2 L10 20 h9 l-4 14 L33 16 h-9 Z" fill={consultMode === "opd" ? (isAiMode ? "#8B5CF6" : TEAL.primary) : "#94a3b8"} />
                  <circle cx="24" cy="18" r="16" fill="none" stroke={consultMode === "opd" ? (isAiMode ? "#8B5CF6" : TEAL.light) : "#cbd5e1"} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
                </svg>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>⚡</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: consultMode === "opd" ? (isAiMode ? "#D8B4FE" : TEAL.primary) : "var(--color-text-primary)" }}>OPD Mode</span>
                </div>
                <p style={{ fontSize: 11, color: isAiMode ? "#9090C0" : "var(--color-text-secondary)", margin: 0, lineHeight: 1.3 }}>
                  Fast-track mode. AI asks 3–4 questions simultaneously to quickly update differentials.
                </p>
              </div>
            </div>
          </div>

          {/* Start button */}
          {isAiMode ? (
            <Btn
              testId="library-start-ai-consultation-btn"
              disabled={!aiComplaintText.trim() || !age || !hasKey}
              onClick={() => onStart({
                complaint: { id: "ai_" + Date.now(), name: aiComplaintText.trim(), category: "General", source: "ai", clinicalContent: "", commonDifferentials: [], redFlagKeywords: [], tags: [] },
                age, sex, aiOnly: true, opdMode: consultMode === "opd"
              })}
              style={{ padding: "11px 28px", fontSize: 15, background: hasKey ? "#8B5CF6" : "#3A3A6A", color: "#fff" }}>
              {!hasKey ? "⚠ Add API Key First" : "✨ Start AI Consultation →"}
            </Btn>
          ) : (
            <Btn testId="library-start-consultation-btn" disabled={!selected || !age} onClick={() => onStart({ complaint: selected, age, sex, aiOnly: false, opdMode: consultMode === "opd" })} style={{ padding: "11px 28px", fontSize: 15 }}>
              Start Consultation →
            </Btn>
          )}
        </Card>
      </div>

      {editing !== undefined && (
        <ComplaintEditor complaint={editing} onSave={saveComplaint} onClose={() => setEditing(undefined)}
          tagLibrary={tagLibrary} noAiNotice={editingNoAiNotice}
          pdfDocs={pdfDocs} pdfBuffers={pdfBuffers} onAddTagSource={addTagSource} />
      )}
      {readerState && (
        <PDFReader
          docName={readerState.doc.name}
          buf={pdfBuffers.current.get(readerState.doc.name)}
          initPage={readerState.initPage || 1}
          tagLibrary={tagLibrary}
          onAddTagSource={addTagSource}
          onRemoveTagSource={removeTagSource}
          onOpenTagLibrary={() => setTagLibraryOpen(true)}
          onClose={() => setReaderState(null)}
          onCreateComplaint={handleCreateComplaint}
        />
      )}
      {tagLibraryOpen && (
        <TagLibraryModal
          tagLibrary={tagLibrary}
          pdfBuffers={pdfBuffers}
          onRemoveTag={removeTag}
          onOpenReader={async (docName, page) => {
            const doc = pdfDocs.find(d => d.name === docName);
            if (!doc) return;
            if (!pdfBuffers.current.get(doc.name) && doc.bookId) {
              try { pdfBuffers.current.set(doc.name, await downloadBook(doc.bookId)); }
              catch (e) { alert("Could not load this book: " + e.message); return; }
            }
            setTagLibraryOpen(false); setReaderState({ doc, initPage: page });
          }}
          onClose={() => setTagLibraryOpen(false)}
        />
      )}
      {creatingFromPdf && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "32px 40px", textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 8px" }}>✨ Generating complaint from PDF…</p>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>AI is extracting clinical content. Please wait.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PDF Book Reader ─────────────────────────────────────────────────────────
export function PDFReader({ docName, buf, initPage = 1, tagLibrary, onAddTagSource, onRemoveTagSource, onOpenTagLibrary, onClose, onCreateComplaint }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initPage);
  const [scale, setScale] = useState(1.5);
  const [rendering, setRendering] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [chapters, setChapters] = useState(null); // null = loading, [] = none found
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [tagLabel, setTagLabel] = useState("");
  const [tagPages, setTagPages] = useState("");
  const [tagMode, setTagMode] = useState("page"); // "page" | "region"
  const [dragStart, setDragStart] = useState(null); // display-space {x,y}
  const [dragRect, setDragRect] = useState(null); // display-space {x,y,w,h}
  const [savingTag, setSavingTag] = useState(false);
  const [leftTab, setLeftTab] = useState("chapters"); // "chapters" | "search"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [indexProgress, setIndexProgress] = useState(null); // { done, total } while extracting
  const canvasRef = useRef();
  const pageCache = useRef(new Map()); // page number -> extracted text, built lazily & reused across searches

  // Extract & cache every page's text once, so repeat searches are instant.
  const ensureIndexed = async () => {
    if (!pdfDoc) return;
    const missing = [];
    for (let p = 1; p <= numPages; p++) if (!pageCache.current.has(p)) missing.push(p);
    if (!missing.length) return;
    setIndexProgress({ done: 0, total: missing.length });
    for (let i = 0; i < missing.length; i++) {
      const p = missing[i];
      try { pageCache.current.set(p, await extractPageText(pdfDoc, p)); } catch { pageCache.current.set(p, ""); }
      if (i % 5 === 0 || i === missing.length - 1) setIndexProgress({ done: i + 1, total: missing.length });
    }
    setIndexProgress(null);
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (!q || !pdfDoc) { setSearchResults(null); return; }
    await ensureIndexed();
    const qLower = q.toLowerCase();
    const results = [];
    for (let p = 1; p <= numPages; p++) {
      const text = pageCache.current.get(p) || "";
      const lower = text.toLowerCase();
      let count = 0, idx = lower.indexOf(qLower);
      while (idx !== -1) { count++; idx = lower.indexOf(qLower, idx + qLower.length); }
      if (count > 0) {
        const at = lower.indexOf(qLower);
        const start = Math.max(0, at - 60);
        const snippet = (start > 0 ? "…" : "") + text.slice(start, at) +
          "[[" + text.slice(at, at + q.length) + "]]" + text.slice(at + q.length, at + q.length + 100) + "…";
        results.push({ page: p, count, snippet });
      }
    }
    results.sort((a, b) => b.count - a.count);
    setSearchResults(results);
  };

  useEffect(() => {
    if (!buf) { setLoadError("PDF buffer not found — try re-uploading the file."); return; }
    setLoadError(""); setChapters(null);
    openPDFDoc(buf)
      .then(async pdf => {
        setPdfDoc(pdf); setNumPages(pdf.numPages);
        setChapters(await getPDFChapters(pdf));
      })
      .catch(e => setLoadError(`Could not open PDF: ${e.message}`));
  }, [buf]);

  // Cancelable render — fixes the first-page mirror/corruption bug caused by
  // overlapping render tasks racing on the same canvas.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    let task = null;
    setRendering(true);
    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = vp.width; canvas.height = vp.height;
        task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
        await task.promise;
      } catch (e) {
        if (e?.name !== "RenderingCancelledException") console.error(e);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [pdfDoc, currentPage, scale]);

  const goTo = (p) => setCurrentPage(Math.min(numPages, Math.max(1, p)));
  const currentTags = tagLibrary.filter(t => t.sources.some(s => s.docName === docName && s.page === currentPage));
  const allDocTags = tagLibrary.filter(t => t.sources.some(s => s.docName === docName));

  // Convert a drag rectangle from displayed (CSS) pixel space into the canvas's true bitmap pixel space
  const toTrueRect = (r) => {
    const canvas = canvasRef.current;
    const box = canvas.getBoundingClientRect();
    const rx = canvas.width / box.width, ry = canvas.height / box.height;
    return { x: r.x * rx, y: r.y * ry, w: r.w * rx, h: r.h * ry };
  };

  const onCanvasMouseDown = (e) => {
    if (tagMode !== "region" || !showTagPanel) return;
    const box = canvasRef.current.getBoundingClientRect();
    const p = { x: e.clientX - box.left, y: e.clientY - box.top };
    setDragStart(p); setDragRect({ ...p, w: 0, h: 0 });
  };
  const onCanvasMouseMove = (e) => {
    if (!dragStart) return;
    const box = canvasRef.current.getBoundingClientRect();
    const p = { x: e.clientX - box.left, y: e.clientY - box.top };
    setDragRect({ x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y), w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y) });
  };
  const onCanvasMouseUp = () => setDragStart(null);

  const saveTag = async () => {
    if (!tagLabel.trim() || !pdfDoc) return;
    setSavingTag(true);
    try {
      if (tagMode === "region") {
        if (!dragRect || dragRect.w < 4 || dragRect.h < 4) return;
        const trueRect = toTrueRect(dragRect);
        const image = cropCanvasToDataURL(canvasRef.current, trueRect);
        const text = await extractRegionText(pdfDoc, currentPage, scale, trueRect);
        onAddTagSource(tagLabel.trim(), docName, currentPage, text, image);
        setDragRect(null);
      } else {
        const pages = tagPages.trim()
          ? tagPages.split(/[,\s]+/).map(Number).filter(n => n > 0 && n <= numPages)
          : [currentPage];
        for (const p of pages) {
          const text = await extractPageText(pdfDoc, p);
          const image = p === currentPage ? canvasRef.current.toDataURL("image/jpeg", 0.85) : await renderPageToDataURL(pdfDoc, p, scale);
          onAddTagSource(tagLabel.trim(), docName, p, text, image);
        }
      }
      setShowTagPanel(false); setTagLabel(""); setTagPages("");
    } finally { setSavingTag(false); }
  };

  const toggleSelect = (p) => setSelectedPages(prev => {
    const s = new Set(prev); s.has(p) ? s.delete(p) : s.add(p); return s;
  });

  const btnS = (active) => ({
    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: `1.5px solid ${active ? TEAL.border : "#2D3748"}`,
    background: active ? TEAL.bg : "#1A202C", color: active ? TEAL.primary : "#A0AEC0",
    fontFamily: "var(--font-sans)", transition: "all 0.15s",
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0D1117", zIndex: 500, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ background: "#161B22", borderBottom: "1px solid #21262D", padding: "10px 16px", display: "flex", gap: 10, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
        <button data-testid="pdf-reader-close-btn" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "#8B949E", flexShrink: 0 }}>✕</button>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#E6EDF3", margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>📖 {docName}</p>

        {/* Page navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button data-testid="pdf-reader-first-page-btn" onClick={() => goTo(1)} disabled={currentPage <= 1} style={{ ...btnS(false), padding: "5px 10px" }}>«</button>
          <button data-testid="pdf-reader-prev-page-btn" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} style={{ ...btnS(false), padding: "5px 10px" }}>‹</button>
          <input data-testid="pdf-reader-page-input" type="number" value={currentPage} min={1} max={numPages}
            onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= numPages) setCurrentPage(v); }}
            style={{ width: 56, textAlign: "center", padding: "5px 6px", borderRadius: 6, border: "1px solid #30363D", background: "#0D1117", color: "#E6EDF3", fontSize: 13, fontFamily: "var(--font-mono)", outline: "none" }} />
          <span style={{ color: "#6E7681", fontSize: 12 }}>/ {numPages}</span>
          <button data-testid="pdf-reader-next-page-btn" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= numPages} style={{ ...btnS(false), padding: "5px 10px" }}>›</button>
          <button data-testid="pdf-reader-last-page-btn" onClick={() => goTo(numPages)} disabled={currentPage >= numPages} style={{ ...btnS(false), padding: "5px 10px" }}>»</button>
        </div>

        {/* Zoom */}
        <select data-testid="pdf-reader-zoom-select" value={scale} onChange={e => setScale(Number(e.target.value))}
          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #30363D", background: "#0D1117", color: "#E6EDF3", fontSize: 12, cursor: "pointer" }}>
          {[0.75, 1, 1.25, 1.5, 1.75, 2].map(s => <option key={s} value={s}>{Math.round(s * 100)}%</option>)}
        </select>

        <button data-testid="pdf-reader-tag-toggle-btn" onClick={() => { setShowTagPanel(v => !v); setTagLabel(""); setTagPages(""); }}
          style={{ ...btnS(showTagPanel), borderColor: showTagPanel ? TEAL.border : "#2D3748" }}>
          🏷 Tag
        </button>
        {onOpenTagLibrary && (
          <button data-testid="pdf-reader-tag-library-btn" onClick={onOpenTagLibrary} style={btnS(false)}>📚 Tag Library</button>
        )}
        <button data-testid="pdf-reader-add-to-selection-btn" onClick={() => toggleSelect(currentPage)}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)",
            border: `1.5px solid ${selectedPages.has(currentPage) ? "#6E40C9" : "#2D3748"}`,
            background: selectedPages.has(currentPage) ? "#21183A" : "#1A202C",
            color: selectedPages.has(currentPage) ? "#A78BFA" : "#A0AEC0" }}>
          {selectedPages.has(currentPage) ? "✓ In selection" : "+ Add to selection"}
        </button>
        {selectedPages.size > 0 && (
          <button data-testid="pdf-reader-create-complaint-btn" onClick={() => onCreateComplaint([...selectedPages].sort((a, b) => a - b), pdfDoc, docName)}
            style={{ padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", border: "none", background: "#6E40C9", color: "#fff" }}>
            ✨ Create Complaint ({selectedPages.size}p) →
          </button>
        )}
      </div>

      <div className="pdf-row" style={{ overflow: "hidden" }}>
        {/* Left: Chapters / Search */}
        <div className="pdf-sidebar-left" style={{ background: "#0D1117", borderRight: "1px solid #21262D", padding: "14px 12px", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexShrink: 0 }}>
            {[["chapters", "Chapters"], ["search", "🔍 Search"]].map(([id, label]) => (
              <button key={id} data-testid={`pdf-reader-lefttab-${id}-btn`} onClick={() => setLeftTab(id)}
                style={{ flex: 1, fontSize: 12, fontWeight: 600, padding: "6px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)",
                  background: leftTab === id ? "#1A2E3D" : "transparent", color: leftTab === id ? "#58A6FF" : "#8B949E" }}>
                {label}
              </button>
            ))}
          </div>

          {leftTab === "chapters" ? (
            chapters === null ? (
              <p style={{ fontSize: 12, color: "#484F58" }}>Loading…</p>
            ) : chapters.length === 0 ? (
              <p style={{ fontSize: 12, color: "#484F58" }}>No table of contents found in this PDF. Use page navigation above.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {chapters.map((c, i) => (
                  <button key={i} data-testid={`pdf-reader-chapter-${i}-btn`} disabled={c.page == null} onClick={() => goTo(c.page)}
                    style={{ textAlign: "left", fontSize: 12, padding: "5px 8px", paddingLeft: 8 + c.depth * 12, borderRadius: 6, border: "none", cursor: c.page == null ? "default" : "pointer",
                      background: c.page === currentPage ? "#1A2E3D" : "transparent",
                      color: c.page == null ? "#3D4451" : c.page === currentPage ? "#58A6FF" : "#8B949E",
                      fontFamily: "var(--font-sans)", lineHeight: 1.4 }}>
                    {c.title}{c.page != null && <span style={{ color: "#484F58", marginLeft: 4 }}>· p.{c.page}</span>}
                  </button>
                ))}
              </div>
            )
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: 0 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input data-testid="pdf-reader-search-input" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") runSearch(); }}
                  placeholder="Search this book…" autoFocus
                  style={{ flex: 1, padding: "7px 10px", border: "1px solid #30363D", borderRadius: 6, fontSize: 13, background: "#161B22", color: "#E6EDF3", fontFamily: "var(--font-sans)", outline: "none" }} />
                <button data-testid="pdf-reader-search-go-btn" onClick={runSearch} disabled={!searchQuery.trim() || !!indexProgress}
                  style={{ padding: "7px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: TEAL.primary, color: "#fff", fontFamily: "var(--font-sans)", opacity: !searchQuery.trim() ? 0.5 : 1 }}>
                  Go
                </button>
              </div>
              {indexProgress && (
                <p style={{ fontSize: 11, color: "#6E7681", margin: 0 }}>
                  Indexing book… {indexProgress.done}/{indexProgress.total} pages (first search only — instant after)
                </p>
              )}
              {searchResults !== null && !indexProgress && (
                <p style={{ fontSize: 11, color: "#6E7681", margin: 0 }}>
                  {searchResults.length} page{searchResults.length !== 1 ? "s" : ""} matched
                </p>
              )}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {searchResults?.map(r => (
                  <button key={r.page} data-testid={`pdf-reader-search-result-p${r.page}-btn`} onClick={() => goTo(r.page)}
                    style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid #21262D", cursor: "pointer", background: r.page === currentPage ? "#1A2E3D" : "#161B22", fontFamily: "var(--font-sans)" }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#58A6FF", margin: "0 0 3px" }}>p.{r.page} <span style={{ color: "#6E7681", fontWeight: 400 }}>· {r.count} match{r.count !== 1 ? "es" : ""}</span></p>
                    <p style={{ fontSize: 11, color: "#8B949E", margin: 0, lineHeight: 1.4 }}>
                      {r.snippet.split(/\[\[|\]\]/).map((part, i) => i % 2 === 1
                        ? <mark key={i} style={{ background: "#3B4A00", color: "#F0E68C", padding: "0 1px", borderRadius: 2 }}>{part}</mark>
                        : <span key={i}>{part}</span>
                      )}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="pdf-center" style={{ overflowY: "auto", overflowX: "auto", padding: "28px 24px", background: "#0D1117", position: "relative", alignItems: "flex-start", justifyContent: "center" }}>
          {loadError ? (
            <div style={{ color: "#F87171", fontSize: 14, marginTop: 60, textAlign: "center", maxWidth: 400 }}>
              <p style={{ fontSize: 24, margin: "0 0 12px" }}>⚠️</p>
              <p style={{ margin: 0 }}>{loadError}</p>
            </div>
          ) : !pdfDoc ? (
            <div style={{ color: "#8B949E", fontSize: 14, marginTop: 60 }}>Loading PDF…</div>
          ) : (
            <>
              {rendering && (
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "#8B949E", fontSize: 13, background: "rgba(13,17,23,0.8)", padding: "8px 16px", borderRadius: 8, zIndex: 2 }}>Rendering…</div>
              )}
              <div style={{ position: "relative", lineHeight: 0 }}>
                <canvas data-testid="pdf-reader-canvas" ref={canvasRef}
                  onMouseDown={onCanvasMouseDown} onMouseMove={onCanvasMouseMove} onMouseUp={onCanvasMouseUp} onMouseLeave={onCanvasMouseUp}
                  style={{ borderRadius: 4, boxShadow: "0 12px 40px rgba(0,0,0,0.7)", maxWidth: "100%", cursor: tagMode === "region" && showTagPanel ? "crosshair" : "default" }} />
                {tagMode === "region" && showTagPanel && dragRect && (
                  <div style={{ position: "absolute", left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h,
                    border: "2px dashed #A78BFA", background: "rgba(167,139,250,0.15)", pointerEvents: "none" }} />
                )}
              </div>
            </>
          )}
        </div>

        {/* Right panel */}
        <div className="pdf-sidebar-right" style={{ background: "#161B22", borderLeft: "1px solid #21262D", padding: "16px 14px", overflowY: "auto", gap: 16 }}>

          {/* Tag form */}
          {showTagPanel && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#0D1117", borderRadius: 10, padding: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6E7681", margin: 0, letterSpacing: 0.5 }}>TAG PAGES</p>

              <div style={{ display: "flex", gap: 4 }}>
                {[["page", "Whole page"], ["region", "Select area"]].map(([id, label]) => (
                  <button key={id} data-testid={`pdf-reader-tagmode-${id}-btn`} onClick={() => { setTagMode(id); setDragRect(null); setDragStart(null); }}
                    style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "6px 4px", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font-sans)",
                      border: `1px solid ${tagMode === id ? "#A78BFA" : "#30363D"}`,
                      background: tagMode === id ? "#21183A" : "transparent", color: tagMode === id ? "#A78BFA" : "#8B949E" }}>
                    {label}
                  </button>
                ))}
              </div>

              <input data-testid="pdf-reader-tag-label-input" value={tagLabel} onChange={e => setTagLabel(e.target.value)} placeholder="Label, e.g. Fever" list="tag-library-labels"
                style={{ padding: "7px 10px", border: "1px solid #30363D", borderRadius: 6, fontSize: 13, background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--font-sans)", outline: "none" }} />
              <datalist id="tag-library-labels">
                {tagLibrary.map(t => <option key={t.id} value={t.label} />)}
              </datalist>
              <p style={{ fontSize: 10, color: "#484F58", margin: 0 }}>Reuse an existing tag name to add this page under it, from any PDF.</p>

              {tagMode === "page" ? (
                <input data-testid="pdf-reader-tag-pages-input" value={tagPages} onChange={e => setTagPages(e.target.value)} placeholder={`Pages (blank = current p.${currentPage})`}
                  style={{ padding: "7px 10px", border: "1px solid #30363D", borderRadius: 6, fontSize: 12, background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--font-sans)", outline: "none" }} />
              ) : (
                <p style={{ fontSize: 11, color: dragRect ? "#A78BFA" : "#6E7681", margin: 0 }}>
                  {dragRect && dragRect.w > 4 ? `Selection: ${Math.round(dragRect.w)}×${Math.round(dragRect.h)}px` : "Drag on the page image to select an area."}
                </p>
              )}

              <button data-testid="pdf-reader-save-tag-btn" onClick={saveTag} disabled={savingTag || (tagMode === "region" && (!dragRect || dragRect.w < 4))}
                style={{ padding: "7px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", background: TEAL.primary, color: "#fff", border: "none", fontFamily: "var(--font-sans)",
                  opacity: (tagMode === "region" && (!dragRect || dragRect.w < 4)) ? 0.5 : 1 }}>
                {savingTag ? "Saving…" : "Save Tag (auto-extracts image + text)"}
              </button>
            </div>
          )}

          {/* Tags on current page */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6E7681", margin: "0 0 8px", letterSpacing: 0.5 }}>THIS PAGE (p.{currentPage})</p>
            {currentTags.length === 0
              ? <p style={{ fontSize: 12, color: "#484F58" }}>No tags. Click 🏷 Tag above.</p>
              : currentTags.map((t, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", background: "#0D1117", borderRadius: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#58A6FF", fontWeight: 600 }}>🏷 {t.label}</span>
                  <button data-testid={`pdf-reader-currentpage-tag-${i}-remove-btn`} onClick={() => onRemoveTagSource(t.id, docName, currentPage)}
                    style={{ fontSize: 11, color: "#E24B4A", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              ))
            }
          </div>

          {/* All tags in doc */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6E7681", margin: "0 0 8px", letterSpacing: 0.5 }}>ALL TAGS IN BOOK</p>
            {allDocTags.length === 0
              ? <p style={{ fontSize: 12, color: "#484F58" }}>None yet.</p>
              : allDocTags.map((t, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#E6EDF3", margin: "0 0 5px" }}>{t.label}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {t.sources.filter(s => s.docName === docName).map(s => (
                      <button key={s.page} data-testid={`pdf-reader-alltags-${t.id}-p${s.page}-btn`} onClick={() => goTo(s.page)}
                        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: `1px solid ${currentPage === s.page ? TEAL.primary : "#30363D"}`,
                          background: currentPage === s.page ? TEAL.bg : "#0D1117", color: currentPage === s.page ? TEAL.primary : "#8B949E", cursor: "pointer", fontFamily: "var(--font-mono)" }}>
                        p.{s.page}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            }
          </div>

          {/* Selection summary */}
          {selectedPages.size > 0 && (
            <div style={{ marginTop: "auto", borderTop: "1px solid #21262D", paddingTop: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#6E7681", margin: "0 0 6px", letterSpacing: 0.5 }}>SELECTED PAGES</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                {[...selectedPages].sort((a, b) => a - b).map(p => (
                  <button key={p} data-testid={`pdf-reader-selected-p${p}-btn`} onClick={() => toggleSelect(p)}
                    style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #6E40C9", background: "#21183A", color: "#A78BFA", cursor: "pointer" }}>
                    p.{p} ✕
                  </button>
                ))}
              </div>
              <button data-testid="pdf-reader-clear-selection-btn" onClick={() => setSelectedPages(new Set())}
                style={{ fontSize: 11, color: "#6E7681", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-sans)" }}>
                Clear selection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tag Library Browser ──────────────────────────────────────────────────────
export function TagLibraryModal({ tagLibrary, pdfBuffers, onOpenReader, onRemoveTag, onClose }) {
  const [selectedId, setSelectedId] = useState(tagLibrary[0]?.id || null);
  const [lightbox, setLightbox] = useState(null); // image src
  const selected = tagLibrary.find(t => t.id === selectedId);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "min(880px, 100%)", height: "min(600px, 90vh)", display: "flex", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>
        {/* Tag list */}
        <div style={{ width: 260, borderRight: "1px solid var(--color-border-primary)", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "16px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>📚 Tag Library</p>
            <button data-testid="tag-library-modal-close-btn" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
          </div>
          {tagLibrary.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "0 16px" }}>No tags yet. Open a PDF reader and tag some pages.</p>
          ) : tagLibrary.map(t => (
            <div key={t.id} data-testid={`tag-library-modal-tag-${t.id}-item`} onClick={() => setSelectedId(t.id)}
              style={{ padding: "10px 16px", cursor: "pointer", borderLeft: `3px solid ${selectedId === t.id ? TEAL.primary : "transparent"}`,
                background: selectedId === t.id ? TEAL.bg : "transparent", display: "flex", gap: 10, alignItems: "center" }}>
              {t.sources[0]?.image && (
                <img src={t.sources[0].image} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4, border: "1px solid var(--color-border-primary)", flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: selectedId === t.id ? TEAL.primary : "var(--color-text-primary)" }}>{t.label}</p>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>{t.sources.length} page{t.sources.length !== 1 ? "s" : ""} · {new Set(t.sources.map(s => s.docName)).size} book(s)</p>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {!selected ? (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Select a tag to see all its pages.</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>🏷 {selected.label}</h3>
                <button onClick={() => onRemoveTag(selected.id)}
                  style={{ fontSize: 12, color: RED.primary, background: RED.bg, border: `1px solid ${RED.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  Delete tag
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selected.sources.map((s, i) => (
                  <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: TEAL.primary, margin: 0 }}>{s.docName} — p.{s.page}</p>
                      <button onClick={() => onOpenReader(s.docName, s.page)}
                        disabled={!pdfBuffers.current.has(s.docName)}
                        style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: `1px solid ${TEAL.border}`, background: TEAL.bg, color: TEAL.primary, cursor: pdfBuffers.current.has(s.docName) ? "pointer" : "not-allowed", opacity: pdfBuffers.current.has(s.docName) ? 1 : 0.4, fontFamily: "var(--font-sans)" }}>
                        📖 View in PDF
                      </button>
                    </div>
                    {s.image && (
                      <img src={s.image} alt="" onClick={() => setLightbox(s.image)}
                        style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 6, border: "1px solid var(--color-border-primary)", cursor: "zoom-in", display: "block", marginBottom: 8 }} />
                    )}
                    <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5, maxHeight: 90, overflowY: "auto" }}>
                      {s.extractedText ? s.extractedText.slice(0, 400) + (s.extractedText.length > 400 ? "…" : "") : "No text extracted."}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 6 }} />
        </div>
      )}
    </div>
  );
}

// ─── Page Viewer Modal ────────────────────────────────────────────────────────
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
function ConsultationScreen({ session, idx, provider, apiKey, onEnd, onNote, tagLibrary, pdfBuffers, setSettingsOpen }) {
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

// ─── Clinical Note ────────────────────────────────────────────────────────────
function NoteScreen({ session, history, differentials, redFlags, provider, apiKey, onNewPatient }) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiUsed, setAiUsed] = useState(false);
  const [savedCaseId, setSavedCaseId] = useState(null);

  useEffect(() => {
    (async () => {
      if (!apiKey) {
        // Fully offline note
        const localNote = generateLocalNote(session.complaint.name, session.age, session.sex, history, differentials, redFlags);
        setNote(localNote);
        setLoading(false);
        const saved = await saveCaseRecord({ complaint: session.complaint.name, age: session.age, sex: session.sex, history, differentials, red_flags: redFlags, note_text: localNote });
        if (saved?.id) setSavedCaseId(saved.id);
        return;
      }
      setAiUsed(true);
      try {
        let finalNote = "";
        await callAIStream(
          [{ role: "user", content: buildNotePrompt(session.complaint.name, session.age, session.sex, history, differentials, redFlags) }],
          "You are a clinical documentation assistant for Indian government hospitals. Output structured clinical notes only.",
          provider, apiKey, t => { finalNote = t; setNote(t); }
        );
        const saved = await saveCaseRecord({ complaint: session.complaint.name, age: session.age, sex: session.sex, history, differentials, red_flags: redFlags, note_text: finalNote });
        if (saved?.id) setSavedCaseId(saved.id);
      } catch (e) {
        // Fallback to local note on API error
        const localNote = generateLocalNote(session.complaint.name, session.age, session.sex, history, differentials, redFlags);
        setNote(localNote + `\n\n[AI error: ${e.message} — local note generated]`);
        setAiUsed(false);
        const saved = await saveCaseRecord({ complaint: session.complaint.name, age: session.age, sex: session.sex, history, differentials, red_flags: redFlags, note_text: localNote });
        if (saved?.id) setSavedCaseId(saved.id);
      } finally { setLoading(false); }
    })();
  }, []);

  const providerName = getProvider(provider)?.name || provider;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid var(--color-border-primary)", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px" }}>Clinical Note</h2>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
            {history.length} questions · {session.complaint.name} · {session.age} · {session.sex}
            {aiUsed && !loading && <span style={{ marginLeft: 8, color: TEAL.primary, fontWeight: 600 }}>· via {providerName}</span>}
            {!aiUsed && !loading && <span style={{ marginLeft: 8, color: GRAY.text, fontWeight: 600 }}>· local (offline)</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn testId="copy-note-btn" small variant="ghost" onClick={() => navigator.clipboard?.writeText(note)}>Copy</Btn>
          <Btn testId="new-patient-btn" small onClick={onNewPatient}>New Patient</Btn>
        </div>
      </div>
      <div style={{ flex: 1, padding: 24, maxWidth: 760, margin: "0 auto", width: "100%" }}>
        {redFlags.length > 0 && (
          <div style={{ background: RED.bg, border: `1.5px solid ${RED.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: RED.text, margin: "0 0 6px" }}>🚨 Red Flags Triggered</p>
            {redFlags.map((rf, i) => <p key={i} style={{ fontSize: 13, color: RED.text, margin: "2px 0" }}>• {rf}</p>)}
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <p style={{ fontSize: 16, color: "var(--color-text-secondary)" }}>
              {aiUsed ? `Generating note via ${providerName}…` : "Generating local note…"}
            </p>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1.5px solid var(--color-border-primary)", borderRadius: 12, padding: 24 }}>
            <pre style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--color-text-primary)", margin: 0 }}>{note}</pre>
          </div>
        )}
      </div>
      {savedCaseId && <RatingPrompt recordType="case" recordId={savedCaseId} onDismiss={() => setSavedCaseId(null)} />}
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function App() {
  const { user } = useAuth();
  const [product, setProduct] = useState(null); // null = Home Screen, "clinicalmind" | "supersummary"
  const [phase, setPhase] = useState("library");
  const [provider, setProvider] = useState("claude");
  const [apiKey, setApiKey] = useState(""); // truthy only when backend AI is configured ("backend-managed" sentinel)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [noteData, setNoteData] = useState(null);
  const [pdfDocs, setPdfDocs] = useState([]);
  const [customComplaints, setCustomComplaints] = useState(() => {
    try { return JSON.parse(localStorage.getItem("clinicalmind:complaints") || "[]"); } catch { return []; }
  });
  const [tagLibrary, setTagLibrary] = useState([]);
  const pdfBuffers = useRef(new Map());
  const idx = useRef(new BM25()).current;

  const refreshAiStatus = () => {
    const API_URL = import.meta.env.REACT_APP_BACKEND_URL;
    fetch(`${API_URL}/api/ai/status`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setProvider(data.provider || "claude");
        setApiKey(data.configured ? "backend-managed" : "");
      })
      .catch(() => setApiKey(""));
  };

  useEffect(() => { refreshAiStatus(); }, []);

  // Hydrate SuperMemory (uploaded books + custom tags) from the backend on login,
  // so a user's library follows them across devices/sessions instead of resetting.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [books, tags] = await Promise.all([listBooks(), listTags()]);
        setPdfDocs(books.map(b => ({ name: b.name, numPages: b.num_pages, isPdf: true, parsed: false, bookId: b.id })));
        setTagLibrary(tags.map(t => ({
          id: t.id, label: t.label,
          sources: t.sources.map(s => ({ docName: s.doc_name, page: s.page, extractedText: s.extracted_text, image: s.image })),
        })));
      } catch (e) { console.error("Could not load your SuperMemory library:", e); }
    })();
  }, [user]);

  // Guests can browse the home page freely — this gate only fires when they try to
  // actually use a feature (launch a tool / open an external partner link).
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const requireAuth = (action) => {
    if (user) { action(); return; }
    setLoginModalOpen(true);
  };

  // Provider/key are now managed centrally by the admin — these are no-ops for regular
  // users and are only reachable via the admin-only settings UI, which calls refreshAiStatus().
  const handleProviderChange = () => {};
  const handleKeyChange = () => { refreshAiStatus(); };

  const goNote = (history, differentials, redFlags) => { setNoteData({ history, differentials, redFlags }); setPhase("note"); };
  const reset = () => { setSession(null); setNoteData(null); setPhase("library"); };

  return (
    <>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        provider={provider}
        setProvider={handleProviderChange}
        currentKey={apiKey}
        setCurrentKey={handleKeyChange}
      />
      {product === null && (
        <div style={{ minHeight: "100vh", background: "var(--color-background-primary)", display: "flex", flexDirection: "column" }}>
          {/* Header — premium gradient */}
          <div className="hero-band" style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(13,148,136,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 26 }}>⚡</span>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "#fff", letterSpacing: "-0.5px" }}>ClinicFlow</h1>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", margin: 0, fontWeight: 500 }}>Comprehensive Clinical Intelligence Suite</p>
              </div>
            </div>
            <ProfileMenu onSettings={() => setSettingsOpen(true)} onTagLibrary={() => setProduct("clinicalmind")} tagCount={tagLibrary.length} />
          </div>

          {/* Main Dashboard Cards Container */}
          <div style={{ flex: 1, padding: "32px 20px 0", width: "100%", maxWidth: 1040, margin: "0 auto" }}>
            {/* Animated premium hero carousel */}
            <HomeHero />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>Choose your workspace</h2>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>Two tools, one clinical suite — pick where you want to start.</p>
              </div>
            </div>

            <div className="library-grid anim-fade-up" style={{ width: "100%", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
              {/* Card 1: ClinicFlow */}
              <Card testId="home-card-clinicflow" onClick={() => requireAuth(() => setProduct("clinicalmind"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(13, 148, 136, 0.15)" }} className="premium-card">
                <div style={{ background: "#f0fdfa", borderBottom: "1px solid rgba(13, 148, 136, 0.08)" }}>
                  <CardCarousel accent="#0d9488" slides={[IllustConsult, IllustDifferential, IllustSafety]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🩺</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-teal-primary)", margin: 0 }}>ClinicFlow</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 20px 0", flex: 1 }}>
                    Interactive clinical consultations, patient history taking, differentials weighting, and automated clinical documentation designed for Indian OPDs.
                  </p>
                  <button data-testid="launch-clinicflow-btn" style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "var(--color-teal-primary)", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(13, 148, 136, 0.2)" }}>
                    Launch ClinicFlow →
                  </button>
                </div>
              </Card>

              {/* Card 2: SuperSummary */}
              <Card testId="home-card-supersummary" onClick={() => requireAuth(() => setProduct("supersummary"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(124, 58, 237, 0.15)" }} className="premium-card">
                <div style={{ background: "#f5f3ff", borderBottom: "1px solid rgba(124, 58, 237, 0.08)" }}>
                  <CardCarousel accent="#7c3aed" slides={[IllustDocs, IllustScan]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>📋</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-purple-primary, #7c3aed)", margin: 0 }}>SuperSummary</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 20px 0", flex: 1 }}>
                    Advanced discharge summary generator. Create templates, parse intake documents via OCR, review safety checklists, and save/export results.
                  </p>
                  <button data-testid="launch-supersummary-btn" style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(124, 58, 237, 0.2)" }}>
                    Launch SuperSummary →
                  </button>
                </div>
              </Card>

              {/* Card 3: SuperMemory — opens as its own page in a new tab, own login gate too */}
              <Card testId="home-card-supermemory" onClick={() => requireAuth(() => window.open("/supermemory", "_blank"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(245, 158, 11, 0.2)" }} className="premium-card">
                <div style={{ background: "#fff7ed", borderBottom: "1px solid rgba(245, 158, 11, 0.1)" }}>
                  <CardCarousel accent="#f59e0b" slides={[IllustLibrary, IllustDocs]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>✨</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#b45309", margin: 0 }}>SuperMemory</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 20px 0", flex: 1 }}>
                    Your textbooks and hospital protocols, AI-indexed. Upload once, then search or jump to the exact page mid-consult — fully offline.
                  </p>
                  <button data-testid="open-supermemory-btn" style={{ alignSelf: "flex-start", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#f59e0b", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(245, 158, 11, 0.25)" }}>
                    Open SuperMemory →
                  </button>
                </div>
              </Card>
            </div>

            {/* Our Other Apps — MoProPrep & DnbProPrep, each with a shareable vanity link */}
            <div style={{ marginTop: 40, marginBottom: 18 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-text-primary)", margin: 0 }}>Our Other Apps</h2>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>Sister platforms from the same team — share these links with your friends.</p>
            </div>
            <div className="library-grid anim-fade-up" style={{ width: "100%", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
              {/* Card 4: MoProPrep — external gamified learning platform */}
              <Card testId="home-card-moproprep" onClick={() => requireAuth(() => window.open("https://www.moproprep.in/", "_blank", "noopener,noreferrer"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(8, 145, 178, 0.2)" }} className="premium-card">
                <div style={{ background: "#ecfeff", borderBottom: "1px solid rgba(8, 145, 178, 0.1)" }}>
                  <CardCarousel accent="#0891b2" slides={[IllustGame]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🎮</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0891b2", margin: 0 }}>MoProPrep</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 14px 0", flex: 1 }}>
                    Learn medicine the fun way — a gamified prep platform with quizzes, streaks, and challenges. Opens in a new tab.
                  </p>
                  <ShareLinkRow path="/moproprep" testId="moproprep" accent="#0891b2" />
                  <button data-testid="play-learn-btn" style={{ alignSelf: "flex-start", marginTop: 12, padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#0891b2", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(8, 145, 178, 0.25)" }}>
                    Play & Learn ↗
                  </button>
                </div>
              </Card>

              {/* Card 5: DnbProPrep — external DNB exam prep platform */}
              <Card testId="home-card-dnbproprep" onClick={() => requireAuth(() => window.open("https://dnbproprep.com/", "_blank", "noopener,noreferrer"))} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: "100%", cursor: "pointer", border: "1px solid rgba(79, 70, 229, 0.2)" }} className="premium-card">
                <div style={{ background: "#eef2ff", borderBottom: "1px solid rgba(79, 70, 229, 0.1)" }}>
                  <CardCarousel accent="#4f46e5" slides={[IllustDnb]} />
                </div>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🎓</span>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: "#4f46e5", margin: 0 }}>DnbProPrep</h3>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6, margin: "0 0 14px 0", flex: 1 }}>
                    Focused DNB exam preparation — structured practice and review material. Opens in a new tab.
                  </p>
                  <ShareLinkRow path="/dnbproprep" testId="dnbproprep" accent="#4f46e5" />
                  <button data-testid="prep-dnb-btn" style={{ alignSelf: "flex-start", marginTop: 12, padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 10px rgba(79, 70, 229, 0.25)" }}>
                    Prep for DNB ↗
                  </button>
                </div>
              </Card>
            </div>
          </div>
          <AppFooter />
          {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
        </div>
      )}
      {product === "supersummary" && (
        <div style={{ minHeight: "100vh" }}>
          <div style={{ background: "linear-gradient(120deg,#6E40C9,#9333EA)", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(124,58,237,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>📋</span>
              <div>
                <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#fff" }}>SuperSummary</h1>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", margin: 0 }}>Discharge summaries — templates + OCR intake</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ProductToggle product={product} setProduct={setProduct} />
              <ProfileMenu onSettings={() => setSettingsOpen(true)} onTagLibrary={() => setProduct("clinicalmind")} tagCount={tagLibrary.length} />
            </div>
          </div>
          <SuperSummary provider={provider} apiKey={apiKey} setSettingsOpen={setSettingsOpen} />
        </div>
      )}
      {product === "clinicalmind" && phase === "library" && (
        <LibraryScreen
          onStart={s => { setSession(s); setPhase("consultation"); }}
          hasKey={!!apiKey}
          provider={provider}
          apiKey={apiKey}
          idx={idx}
          pdfDocs={pdfDocs}
          setPdfDocs={setPdfDocs}
          customComplaints={customComplaints}
          setCustomComplaints={setCustomComplaints}
          setSettingsOpen={setSettingsOpen}
          tagLibrary={tagLibrary}
          setTagLibrary={setTagLibrary}
          pdfBuffers={pdfBuffers}
          product={product}
          setProduct={setProduct}
        />
      )}
      {product === "clinicalmind" && phase === "consultation" && session && (
        <ConsultationScreen
          session={session}
          idx={idx}
          provider={provider}
          apiKey={apiKey}
          onEnd={reset}
          onNote={goNote}
          tagLibrary={tagLibrary}
          pdfBuffers={pdfBuffers}
          setSettingsOpen={setSettingsOpen}
        />
      )}
      {product === "clinicalmind" && phase === "note" && noteData && session && (
        <NoteScreen
          session={session}
          history={noteData.history}
          differentials={noteData.differentials}
          redFlags={noteData.redFlags}
          provider={provider}
          apiKey={apiKey}
          onNewPatient={reset}
        />
      )}
    </>
  );
}
