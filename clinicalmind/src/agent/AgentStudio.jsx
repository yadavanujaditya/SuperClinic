// ─── My Agent — SuperSummary's learning assistant ────────────────────────────
// Teach:  add past summaries (paste / files / photos), classify them, start learning,
//         watch the agent work live.
// Memory: see, correct, add or delete what the agent has learned.
// Draft:  draft a new summary from reports + notes. Every line shows its source;
//         lines the checker could not verify are flagged red.
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth.jsx";
import { extractDocumentText } from "../ocr.js";
import { DocumentIntake, extractPdfTextQuick } from "../SuperSummary.jsx";
import {
  addSummaries, startLearning, draftSummary, friendlyCallError,
  watchSummaries, watchMemories, watchLatestLearnRun, watchProfile,
  setSummaryCategory, deleteSummary, setAutoLearn, saveMemory, deleteMemory, memoryPathValid,
  splitPasted, draftToText,
} from "./agentApi.js";

const C = {
  purple: "#7c3aed", purpleBg: "#f5f3ff", purpleBorder: "#ddd6fe",
  teal: "#0d9488", tealBg: "#f0fdfa", amber: "#b45309", amberBg: "#fef3c7",
  red: "#e11d48", redBg: "#fff1f2", blue: "#2563eb", blueBg: "#eff6ff", gray: "#64748b", grayBg: "#f1f5f9",
};
const SOURCE_STYLE = {
  input:      { label: "From your reports", color: C.teal, bg: C.tealBg, icon: "📷" },
  memory:     { label: "From your habits",  color: C.blue, bg: C.blueBg, icon: "🧠" },
  template:   { label: "Template text",     color: C.gray, bg: C.grayBg, icon: "📋" },
  missing:    { label: "Needs your input",  color: C.amber, bg: C.amberBg, icon: "✍️" },
  unverified: { label: "Could not verify",  color: C.red, bg: C.redBg, icon: "⚠️" },
};

const btn = (variant = "primary", extra = {}) => ({
  padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)",
  border: variant === "ghost" ? `1.5px solid ${C.purpleBorder}` : variant === "danger" ? `1.5px solid ${C.red}` : "none",
  background: variant === "primary" ? C.purple : "#fff",
  color: variant === "primary" ? "#fff" : variant === "danger" ? C.red : C.purple, ...extra,
});
const card = { background: "#fff", border: "1px solid var(--color-border-primary)", borderRadius: 14, padding: 18 };
const input = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "var(--font-sans)", background: "#fff" };
const fmtDate = (ts) => ts?.toDate ? ts.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const firstLine = (t) => (t || "").split("\n").map(s => s.trim()).find(s => s && !/^\[REDACTED\]$/.test(s)) || "(empty)";

export default function AgentStudio({ onBack, provider, apiKey, templates = [] }) {
  const { user, ready, enabled } = useAuth();
  const [tab, setTab] = useState("teach");
  const [summaries, setSummaries] = useState([]);
  const [memories, setMemories] = useState([]);
  const [run, setRun] = useState(null);
  const [profile, setProfile] = useState({});
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!user) return;
    const err = (e) => setLoadError(e.message);
    const unsubs = [
      watchSummaries(user.uid, setSummaries, err),
      watchMemories(user.uid, setMemories, err),
      watchLatestLearnRun(user.uid, setRun, err),
      watchProfile(user.uid, setProfile),
    ];
    return () => unsubs.forEach(u => u());
  }, [user]);

  const categories = useMemo(() => [...new Set(summaries.map(s => s.category).filter(Boolean))].sort(), [summaries]);
  const pending = summaries.filter(s => !s.learnedAt).length;

  const header = (
    <div style={{ background: "linear-gradient(120deg,#4c1d95,#7c3aed 60%,#a855f7)", borderRadius: 16, padding: "18px 20px", color: "#fff", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.18)", border: "none", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer", marginBottom: 8 }}>← Templates</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🧠 My Agent</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#ede9fe", maxWidth: 560 }}>
            Learns how <em>you</em> write summaries — from your past summaries and every correction you make — then drafts new ones using only your inputs and your habits. Every line shows where it came from.
          </p>
        </div>
        {user && (
          <div style={{ display: "flex", gap: 8 }} data-testid="agent-stats">
            {[["Summaries", summaries.length], ["Learned", summaries.length - pending], ["Memory notes", memories.length]].map(([k, v]) => (
              <div key={k} style={{ background: "rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 12px", textAlign: "center", minWidth: 70 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
                <div style={{ fontSize: 10.5, color: "#ede9fe" }}>{k}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (!enabled) return <Shell>{header}<div style={card}>The agent needs the Firebase backend. See <code>FIREBASE.md</code> to set it up.</div></Shell>;
  if (!ready) return <Shell>{header}<div style={card}>Loading…</div></Shell>;
  if (!user) return (
    <Shell>{header}
      <div style={{ ...card, textAlign: "center" }}>
        <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>Sign in to use your agent</p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Your agent's memory belongs to your account. Tap the profile icon (top right) → Sign in.</p>
      </div>
    </Shell>
  );

  return (
    <Shell>
      {header}
      {loadError && <div style={{ ...card, background: C.redBg, color: C.red, marginBottom: 12 }}>Couldn't load your data: {loadError}</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[["teach", `📚 Teach${pending ? ` (${pending} new)` : ""}`], ["memory", `🧠 Memory (${memories.length})`], ["draft", "✍️ Draft a summary"]].map(([id, label]) => (
          <button key={id} data-testid={`tab-${id}`} onClick={() => setTab(id)}
            style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)",
              border: `1.5px solid ${tab === id ? C.purple : "var(--color-border-primary)"}`, background: tab === id ? C.purpleBg : "#fff", color: tab === id ? C.purple : "var(--color-text-secondary)" }}>
            {label}
          </button>
        ))}
      </div>
      {tab === "teach" && <TeachTab uid={user.uid} summaries={summaries} categories={categories} run={run} pending={pending} profile={profile} provider={provider} apiKey={apiKey} />}
      {tab === "memory" && <MemoryTab uid={user.uid} memories={memories} />}
      {tab === "draft" && <DraftTab categories={categories} templates={templates} provider={provider} apiKey={apiKey} onTaught={() => setTab("teach")} />}
    </Shell>
  );
}

function Shell({ children }) {
  return <div style={{ maxWidth: 1000, margin: "0 auto", padding: "20px 16px 60px" }}>{children}</div>;
}

// ── Teach ────────────────────────────────────────────────────────────────────
function TeachTab({ uid, summaries, categories, run, pending, profile, provider, apiKey }) {
  const [staged, setStaged] = useState([]); // {key, text, category, doctorLabel, title, status}
  const [paste, setPaste] = useState("");
  const [defaultCategory, setDefaultCategory] = useState("");
  const [doctorLabel, setDoctorLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef();

  const stage = (items) => setStaged(prev => [...prev, ...items.map(it => ({ key: Math.random().toString(36).slice(2), category: defaultCategory, doctorLabel, ...it }))]);

  const addPasted = () => {
    const parts = splitPasted(paste);
    if (!parts.length) { setMsg({ err: true, text: "Each summary needs at least a few lines (80+ characters)." }); return; }
    stage(parts.map((text, i) => ({ text, title: `Pasted ${i + 1}` })));
    setPaste(""); setMsg(null);
  };

  const onFiles = async (files) => {
    for (const f of Array.from(files)) {
      const key = Math.random().toString(36).slice(2);
      setStaged(prev => [...prev, { key, title: f.name, text: "", status: "reading", category: defaultCategory, doctorLabel }]);
      try {
        let text = "";
        if (/\.pdf$/i.test(f.name)) text = await extractPdfTextQuick(f);
        else if (f.type.startsWith("image/")) text = (await extractDocumentText({ image: f, provider, apiKey })).text;
        else text = await f.text();
        setStaged(prev => prev.map(s => s.key === key ? { ...s, text: text.trim(), status: text.trim().length >= 80 ? "" : "short" } : s));
      } catch {
        setStaged(prev => prev.map(s => s.key === key ? { ...s, status: "failed" } : s));
      }
    }
  };

  const ready = staged.filter(s => !s.status && s.text.length >= 80);
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await addSummaries(ready.map(s => ({ text: s.text, category: s.category, doctorLabel: s.doctorLabel, title: s.title, source: "upload" })));
      const removed = r.added.reduce((a, x) => a + x.identifiersRemoved, 0);
      setStaged(prev => prev.filter(s => !ready.includes(s)));
      setMsg({ text: `Saved ${r.added.length} summar${r.added.length === 1 ? "y" : "ies"}.${removed ? ` ${removed} patient identifier(s) were removed before saving.` : ""} Now tap “Teach my agent”.` });
    } catch (e) { setMsg({ err: true, text: friendlyCallError(e) }); }
    setBusy(false);
  };

  const learn = async () => {
    setBusy(true); setMsg(null);
    try { await startLearning(); } catch (e) { setMsg({ err: true, text: friendlyCallError(e) }); }
    setBusy(false);
  };

  const learning = run && (run.status === "queued" || run.status === "running");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <datalist id="agent-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>

      <div style={card}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>1 · Add your past summaries</h3>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-text-secondary)" }}>
          Paste them, or upload text/PDF files or photos. Patient names, hospital numbers, phone numbers and addresses are removed on the server before anything is stored.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Diagnosis / category <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(blank = agent decides)</span>
            <input data-testid="teach-category" list="agent-categories" value={defaultCategory} onChange={e => setDefaultCategory(e.target.value)} placeholder="e.g. Acute gastroenteritis" style={{ ...input, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Consultant / unit <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional)</span>
            <input value={doctorLabel} onChange={e => setDoctorLabel(e.target.value)} placeholder="e.g. Unit 2" style={{ ...input, marginTop: 4 }} />
          </label>
        </div>
        <textarea data-testid="teach-paste" value={paste} onChange={e => setPaste(e.target.value)} rows={6}
          placeholder={"Paste one or more summaries here.\nSeparate summaries with a line of dashes:\n-----"}
          style={{ ...input, fontFamily: "var(--font-mono)", fontSize: 12.5, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button data-testid="teach-add-paste" style={btn("ghost")} disabled={!paste.trim()} onClick={addPasted}>+ Add pasted</button>
          <button style={btn("ghost")} onClick={() => fileRef.current?.click()}>📎 Upload files / photos</button>
          <input ref={fileRef} type="file" multiple accept=".txt,.md,.pdf,image/*" style={{ display: "none" }} onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {staged.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            {staged.map(s => (
              <div key={s.key} style={{ display: "flex", gap: 10, alignItems: "center", background: "var(--color-background-secondary)", borderRadius: 10, padding: "8px 10px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: s.status ? C.red : "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.status === "reading" ? "⏳ Reading…" : s.status === "failed" ? "Could not read this file" : s.status === "short" ? "Too little text found" : firstLine(s.text)}
                  </div>
                </div>
                <input list="agent-categories" value={s.category} placeholder="Category"
                  onChange={e => setStaged(prev => prev.map(x => x.key === s.key ? { ...x, category: e.target.value } : x))}
                  style={{ ...input, width: 190, padding: "6px 10px", fontSize: 12.5 }} />
                <button onClick={() => setStaged(prev => prev.filter(x => x.key !== s.key))} style={{ background: "none", border: "none", cursor: "pointer", color: C.gray }}>✕</button>
              </div>
            ))}
            <button data-testid="teach-save" style={btn("primary", { alignSelf: "flex-start" })} disabled={busy || !ready.length} onClick={save}>
              {busy ? "Saving…" : `Save ${ready.length} summar${ready.length === 1 ? "y" : "ies"}`}
            </button>
          </div>
        )}
        {msg && <p data-testid="teach-msg" style={{ margin: "10px 0 0", fontSize: 13, color: msg.err ? C.red : C.teal }}>{msg.text}</p>}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>2 · Let your agent learn</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
              {pending ? `${pending} summar${pending === 1 ? "y" : "ies"} not learned yet.` : "Everything is learned."} It reads 10 at a time and keeps going until all are done.
            </p>
          </div>
          <button data-testid="teach-learn" style={btn("primary")} disabled={busy || learning || !pending} onClick={learn}>
            {learning ? "Learning…" : "🧠 Teach my agent now"}
          </button>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, marginTop: 10, color: "var(--color-text-secondary)" }}>
          <input type="checkbox" checked={profile.autoLearn !== false} onChange={e => setAutoLearn(uid, e.target.checked)} />
          Also learn automatically every night (2 AM) from that day's new summaries
        </label>
        {run && <RunPanel run={run} />}
      </div>

      <SummaryList uid={uid} summaries={summaries} />
    </div>
  );
}

function RunPanel({ run }) {
  const statusText = { queued: "⏳ Waiting to start…", running: "🧠 Learning…", done: "✅ Finished", failed: "❌ Failed" }[run.status] || run.status;
  const log = (run.log || []).slice(-40);
  return (
    <div data-testid="run-panel" style={{ marginTop: 14, background: "var(--color-background-secondary)", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
        <span data-testid="run-status">{statusText}</span>
        <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", fontSize: 12 }}>{fmtDate(run.createdAt)}{run.trigger === "nightly" ? " · nightly" : run.trigger === "continue" ? " · continued" : ""}</span>
      </div>
      {log.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", fontFamily: "var(--font-mono)", fontSize: 11.5, display: "flex", flexDirection: "column", gap: 3 }}>
          {log.map((e, i) => (
            <div key={i} style={{ color: e.ok === false ? C.red : "var(--color-text-secondary)" }}>
              {e.type === "tool" ? `${e.ok === false ? "✗" : "•"} ${e.summary}${e.error ? ` — ${e.error}` : ""}` : e.type === "text" ? `💭 ${e.text}` : `↻ ${e.reason}`}
            </div>
          ))}
        </div>
      )}
      {run.report && <p data-testid="run-report" style={{ margin: "10px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{run.report}</p>}
      {run.error && <p style={{ margin: "10px 0 0", fontSize: 13, color: C.red }}>{run.error}</p>}
      {run.status === "done" && run.remaining > 0 && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>{run.remaining} more to go — continuing automatically.</p>}
    </div>
  );
}

function SummaryList({ uid, summaries }) {
  const [open, setOpen] = useState(null);
  const groups = useMemo(() => {
    const g = new Map();
    for (const s of summaries) {
      const k = s.category || "Not classified yet";
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(s);
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [summaries]);

  if (!summaries.length) return <div style={{ ...card, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>No summaries yet. Add 20–50 of your real summaries to get started — the more, the better your agent knows you.</div>;

  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Your summaries by diagnosis</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {groups.map(([cat, list]) => (
          <details key={cat} open={groups.length <= 3}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>{cat} <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>· {list.length}</span></summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {list.map(s => (
                <div key={s.id} data-testid="summary-row" style={{ border: "1px solid var(--color-border-primary)", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => setOpen(open === s.id ? null : s.id)} style={{ flex: "1 1 200px", minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-sans)" }}>
                      {s.title || firstLine(s.text)}
                    </button>
                    {s.source === "final" && <span style={{ fontSize: 10.5, fontWeight: 700, background: C.blueBg, color: C.blue, borderRadius: 10, padding: "2px 8px" }}>your correction</span>}
                    {s.categorySource === "agent" && <span title="Classified by your agent" style={{ fontSize: 10.5, background: C.purpleBg, color: C.purple, borderRadius: 10, padding: "2px 8px" }}>🧠 classified</span>}
                    <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 10, padding: "2px 8px", background: s.learnedAt ? C.tealBg : C.amberBg, color: s.learnedAt ? C.teal : C.amber }}>{s.learnedAt ? "learned" : "new"}</span>
                    <input list="agent-categories" defaultValue={s.category || ""} placeholder="Category" aria-label="Category"
                      onBlur={e => { const v = e.target.value.trim(); if (v !== (s.category || "")) setSummaryCategory(uid, s.id, v); }}
                      style={{ ...input, width: 170, padding: "5px 8px", fontSize: 12 }} />
                    <button title="Delete" onClick={() => { if (window.confirm("Delete this summary? The agent will stop using it as an example (what it already learned stays in memory).")) deleteSummary(uid, s.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.gray }}>🗑</button>
                  </div>
                  {open === s.id && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "var(--color-background-secondary)", borderRadius: 8, padding: 10, margin: "8px 0 0", maxHeight: 300, overflowY: "auto" }}>{s.text}</pre>}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ── Memory ───────────────────────────────────────────────────────────────────
function MemoryTab({ uid, memories }) {
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState("");
  const [newPath, setNewPath] = useState("");
  const [msg, setMsg] = useState("");
  const current = memories.find(m => m.path === selected);

  useEffect(() => { if (!selected && memories.length) setSelected(memories[0].path); }, [memories, selected]);
  useEffect(() => { setDraft(current?.content || ""); setMsg(""); }, [current?.path, current?.content]);

  const save = async () => {
    try { await saveMemory(uid, current.path, draft); setMsg("Saved — your agent will use this from now on."); }
    catch (e) { setMsg("Couldn't save: " + e.message); }
  };
  const create = async () => {
    const p = newPath.startsWith("/memories/") ? newPath : `/memories/${newPath.replace(/^\/+/, "")}`;
    const path = p.endsWith(".md") ? p : p + ".md";
    if (!memoryPathValid(path)) { setMsg("Use a simple name like categories/pneumonia.md (letters, numbers, - _ /)."); return; }
    try { await saveMemory(uid, path, "# Notes\n"); setSelected(path); setNewPath(""); } catch (e) { setMsg("Couldn't create: " + e.message); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 280px) minmax(0, 1fr)", gap: 14 }} className="agent-memory-grid">
      <style>{`@media (max-width: 720px){ .agent-memory-grid{ grid-template-columns: 1fr !important; } }`}</style>
      <div style={{ ...card, padding: 12 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--color-text-secondary)" }}>What your agent has learned. Correct anything that's wrong — it will follow your edits.</p>
        {!memories.length && <p style={{ fontSize: 13 }}>Empty — teach your agent first.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {memories.map(m => (
            <button key={m.path} data-testid="memory-file" onClick={() => setSelected(m.path)}
              style={{ textAlign: "left", padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontFamily: "var(--font-mono)",
                background: selected === m.path ? C.purpleBg : "transparent", color: selected === m.path ? C.purple : "var(--color-text-primary)" }}>
              {m.path.replace("/memories/", "")}
              <span style={{ display: "block", fontSize: 10.5, color: "var(--color-text-secondary)", fontFamily: "var(--font-sans)" }}>{m.updatedBy === "doctor" ? "✍️ edited by you" : "🧠 agent"} · {fmtDate(m.updatedAt)}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <input value={newPath} onChange={e => setNewPath(e.target.value)} placeholder="new-note.md" style={{ ...input, padding: "6px 8px", fontSize: 12 }} />
          <button style={btn("ghost", { padding: "6px 10px" })} disabled={!newPath.trim()} onClick={create}>+ Add</button>
        </div>
      </div>
      <div style={card}>
        {current ? (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, marginBottom: 8, wordBreak: "break-all" }}>{current.path}</div>
            <textarea data-testid="memory-editor" value={draft} onChange={e => setDraft(e.target.value)} rows={18} style={{ ...input, fontFamily: "var(--font-mono)", fontSize: 12.5, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button data-testid="memory-save" style={btn("primary")} disabled={draft === current.content || draft.length > 24000} onClick={save}>Save changes</button>
              <button style={btn("danger")} onClick={async () => { if (window.confirm(`Delete ${current.path}?`)) { await deleteMemory(uid, current.path); setSelected(null); } }}>Delete</button>
              <span style={{ fontSize: 11.5, color: draft.length > 24000 ? C.red : "var(--color-text-secondary)" }}>{draft.length.toLocaleString()} / 24,000</span>
              {msg && <span style={{ fontSize: 12.5, color: C.teal }}>{msg}</span>}
            </div>
          </>
        ) : <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Select a note.</p>}
      </div>
    </div>
  );
}

// ── Draft ────────────────────────────────────────────────────────────────────
const STAGES = ["Reading your memory…", "Looking at your past summaries…", "Writing in your style…", "Checking every line against your reports…"];

function DraftTab({ categories, templates, provider, apiKey, onTaught }) {
  const [category, setCategory] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [notes, setNotes] = useState("");
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [finalText, setFinalText] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const t = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 9000);
    return () => clearInterval(t);
  }, [busy]);

  const inputs = [notes.trim() && `CLINICAL NOTES:\n${notes.trim()}`, ...docs.filter(d => d.ocrText?.trim()).map(d => `REPORT (${d.name}):\n${d.ocrText.trim()}`)].filter(Boolean).join("\n\n");
  const template = templates.find(t => t.id === templateId);

  const run = async () => {
    setBusy(true); setError(""); setResult(null); setSaved("");
    try {
      const r = await draftSummary({ category, inputs, template: template?.sampleBody || "" });
      setResult(r);
      setFinalText(draftToText(r.draft));
    } catch (e) { setError(friendlyCallError(e)); }
    setBusy(false);
  };

  const saveFinal = async () => {
    try {
      await addSummaries([{ text: finalText, aiDraft: draftToText(result.draft), category, source: "final", title: `Final — ${category || "summary"}` }]);
      setSaved("Saved. Your agent will learn from your corrections (tonight, or tap “Teach my agent now”).");
    } catch (e) { setSaved("Couldn't save: " + friendlyCallError(e)); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <datalist id="agent-categories-d">{categories.map(c => <option key={c} value={c} />)}</datalist>
      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Diagnosis / category
            <input data-testid="draft-category" list="agent-categories-d" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Acute gastroenteritis" style={{ ...input, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Template <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>(optional)</span>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} style={{ ...input, marginTop: 4 }}>
              <option value="">Use my usual structure (from memory)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px" }}>Reports (photos / PDFs)</p>
        <DocumentIntake docs={docs} setDocs={setDocs} provider={provider} apiKey={apiKey} isInvestigation />
        <p style={{ fontSize: 12, fontWeight: 600, margin: "12px 0 6px" }}>Clinical notes</p>
        <textarea data-testid="draft-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={7}
          placeholder="History, examination, course in hospital, treatment given, condition at discharge…" style={{ ...input, resize: "vertical", fontSize: 13 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button data-testid="draft-run" style={btn("primary")} disabled={busy || inputs.length < 20} onClick={run}>{busy ? "Drafting…" : "✍️ Draft with my agent"}</button>
          {busy && <span data-testid="draft-stage" style={{ fontSize: 13, color: C.purple }}>{STAGES[stage]}</span>}
        </div>
        {error && <p data-testid="draft-error" style={{ margin: "10px 0 0", color: C.red, fontSize: 13 }}>{error}</p>}
      </div>

      {result && <DraftView result={result} />}

      {result && (
        <div style={card}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Your final copy</h3>
          <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--color-text-secondary)" }}>
            Fill the [brackets], fix anything red, add the patient's name/ID. When you save, your agent compares this with its draft and learns what you changed.
          </p>
          <textarea data-testid="draft-final" value={finalText} onChange={e => setFinalText(e.target.value)} rows={18} style={{ ...input, fontFamily: "var(--font-mono)", fontSize: 12.5, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button style={btn("ghost")} onClick={() => navigator.clipboard?.writeText(finalText)}>📋 Copy</button>
            <button data-testid="draft-save-final" style={btn("primary")} disabled={finalText.trim().length < 80} onClick={saveFinal}>💾 Save final & teach my agent</button>
            {saved && <span data-testid="draft-saved" style={{ fontSize: 12.5, color: saved.startsWith("Couldn't") ? C.red : C.teal }}>{saved} {!saved.startsWith("Couldn't") && <button onClick={onTaught} style={{ background: "none", border: "none", color: C.purple, cursor: "pointer", fontWeight: 700, padding: 0 }}>Go to Teach →</button>}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function DraftView({ result }) {
  const { draft, identifiersRemoved } = result;
  const counts = draft.stats || {};
  return (
    <div style={card} data-testid="draft-view">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries(SOURCE_STYLE).map(([k, s]) => (
          <span key={k} style={{ fontSize: 11.5, fontWeight: 700, background: s.bg, color: s.color, borderRadius: 12, padding: "3px 10px" }}>{s.icon} {s.label}: {counts[k] || 0}</span>
        ))}
      </div>
      {counts.unverified > 0 && (
        <p data-testid="draft-unverified-note" style={{ margin: "0 0 12px", fontSize: 12.5, background: C.redBg, color: C.red, borderRadius: 8, padding: "8px 10px" }}>
          ⚠️ {counts.unverified} line{counts.unverified === 1 ? "" : "s"} could not be matched to your reports or memory. Check them before signing — tap a line to see why.
        </p>
      )}
      {draft.warnings?.length > 0 && (
        <div style={{ margin: "0 0 12px", fontSize: 12.5, background: C.amberBg, color: C.amber, borderRadius: 8, padding: "8px 10px" }}>
          <strong>Clinical flags:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      {draft.sections.map((sec, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, color: "var(--color-text-secondary)", marginBottom: 4 }}>{sec.heading.toUpperCase()}</div>
          {sec.lines.map((l, j) => <DraftLine key={j} line={l} />)}
        </div>
      ))}
      {identifiersRemoved > 0 && <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>🔒 {identifiersRemoved} patient identifier(s) were removed from your inputs before they reached the AI.</p>}
    </div>
  );
}

function DraftLine({ line }) {
  const [open, setOpen] = useState(false);
  const s = SOURCE_STYLE[line.source] || SOURCE_STYLE.unverified;
  return (
    <div data-testid={`line-${line.source}`} onClick={() => setOpen(o => !o)} style={{ cursor: "pointer", borderLeft: `3px solid ${s.color}`, background: s.bg, borderRadius: 6, padding: "5px 10px", margin: "3px 0", fontSize: 13.5 }}>
      <span>{line.source === "missing" ? `[${line.text}]` : line.text}</span>
      {open && (
        <div style={{ fontSize: 11.5, color: s.color, marginTop: 4 }}>
          {s.icon} {s.label}
          {line.source === "input" && line.evidence && <> — “{line.evidence}”</>}
          {line.source === "memory" && <> — {line.evidence}</>}
          {line.source === "unverified" && <> — {line.reason}{line.evidence ? ` (claimed: “${line.evidence}”)` : ""}</>}
        </div>
      )}
    </div>
  );
}
