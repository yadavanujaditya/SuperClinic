// ─── ClinicFlow Notebook — ask your own books, see exactly where each point comes from ──
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth.jsx";
import { askNotebook, watchBooks, uploadBook, deleteBook } from "./notebookApi.js";
import { friendlyCallError } from "../agent/agentApi.js";

const C = {
  teal: "#0d9488", tealBg: "#f0fdfa", tealBorder: "#99f6e4", amber: "#b45309", amberBg: "#fef3c7",
  red: "#e11d48", redBg: "#fff1f2", gray: "#64748b", grayBg: "#f1f5f9", blue: "#2563eb", blueBg: "#eff6ff",
};
const card = { background: "#fff", border: "1px solid var(--color-border-primary)", borderRadius: 14, padding: 16 };
const input = { width: "100%", padding: "9px 12px", border: "1.5px solid var(--color-border-primary)", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "var(--font-sans)", background: "#fff" };
const btn = (primary = true, extra = {}) => ({ padding: "9px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)", border: primary ? "none" : `1.5px solid ${C.tealBorder}`, background: primary ? C.teal : "#fff", color: primary ? "#fff" : C.teal, ...extra });
const LIKELY = { high: { label: "Likely", color: C.teal, bg: C.tealBg }, medium: { label: "Possible", color: C.amber, bg: C.amberBg }, low: { label: "Less likely", color: C.gray, bg: C.grayBg } };
const STAGES = ["Searching your books…", "Reading the relevant pages…", "Writing the answer with citations…", "Checking every quote against your books…"];

export default function Notebook({ prefill, onClose }) {
  const { user, ready, enabled } = useAuth();
  const [books, setBooks] = useState([]);
  const [age, setAge] = useState(prefill?.age || "");
  const [sex, setSex] = useState(prefill?.sex || "");
  const [complaints, setComplaints] = useState(prefill?.complaints || "");
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState([]); // [{ q, answer }]
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(null); // { page, quote }
  const bottomRef = useRef();

  useEffect(() => { if (user) return watchBooks(user.uid, setBooks, e => setError(e.message)); }, [user]);
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const t = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 8000);
    return () => clearInterval(t);
  }, [busy]);

  const readyBooks = books.filter(b => b.status === "ready" && b.textPages > 0);

  const ask = async (followUp) => {
    const q = followUp ? question.trim() : "";
    setBusy(true); setError("");
    try {
      const history = thread.map(t => ({ q: t.q, a: t.answer.summary.map(p => p.text).join(" ").slice(0, 1200) }));
      const answer = await askNotebook({ patient: { age, sex }, complaints: complaints.trim(), question: q, history });
      setThread(prev => [...prev, { q: q || complaints.trim(), answer }]);
      setQuestion("");
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) { setError(friendlyCallError(e)); }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--color-background-primary, #f8fafc)", overflowY: "auto" }} data-testid="notebook">
      <div style={{ background: "linear-gradient(120deg,#0f766e,#0d9488 55%,#14b8a6)", color: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 2 }}>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>← Back</button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📓 Notebook</div>
          <div style={{ fontSize: 12, color: "#ccfbf1" }}>Answers only from your books — every point shows the page and the exact text</div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "18px 16px 80px" }}>
        {!enabled ? <div style={card}>The notebook needs the Firebase backend — see FIREBASE.md.</div>
          : !ready ? <div style={card}>Loading…</div>
          : !user ? <div style={{ ...card, textAlign: "center" }}><strong>Sign in to use your notebook.</strong><p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "6px 0 0" }}>Your books are stored privately in your account. Profile icon (top right) → Sign in.</p></div>
          : (
            <div className="nb-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 290px) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
              <style>{`@media (max-width: 800px){ .nb-grid{ grid-template-columns: 1fr !important; } }`}</style>
              <BookShelf uid={user.uid} books={books} />

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={card}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 140px 1fr", gap: 8, marginBottom: 10 }} className="nb-pt">
                    <style>{`@media (max-width: 560px){ .nb-pt{ grid-template-columns: 1fr 1fr !important; } .nb-pt > :last-child{ grid-column: 1 / -1; } }`}</style>
                    <input data-testid="nb-age" value={age} onChange={e => setAge(e.target.value)} placeholder="Age (e.g. 4 months)" style={input} />
                    <select value={sex} onChange={e => setSex(e.target.value)} style={input}>
                      <option value="">Sex</option><option>Male</option><option>Female</option>
                    </select>
                    <input data-testid="nb-complaints" value={complaints} onChange={e => setComplaints(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !busy && complaints.trim() && readyBooks.length) ask(false); }}
                      placeholder="Complaints, e.g. cough for 5 days, fever for 10 days" style={input} />
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button data-testid="nb-ask" style={btn()} disabled={busy || !complaints.trim() || !readyBooks.length} onClick={() => ask(false)}>
                      {busy ? "Working…" : "📓 Ask my books"}
                    </button>
                    {!readyBooks.length && <span style={{ fontSize: 12.5, color: C.amber }}>Upload a book on the left first.</span>}
                    {busy && <span data-testid="nb-stage" style={{ fontSize: 13, color: C.teal }}>{STAGES[stage]}</span>}
                  </div>
                  {error && <p data-testid="nb-error" style={{ color: C.red, fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
                </div>

                {thread.map((t, i) => <AnswerCard key={i} q={t.q} answer={t.answer} onOpen={setViewer} last={i === thread.length - 1} />)}
                <div ref={bottomRef} />

                {thread.length > 0 && (
                  <div style={{ ...card, display: "flex", gap: 8 }}>
                    <input data-testid="nb-followup" value={question} onChange={e => setQuestion(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !busy && question.trim()) ask(true); }}
                      placeholder="Ask a follow-up, e.g. What dose of paracetamol? When to admit?" style={input} />
                    <button style={btn()} disabled={busy || !question.trim()} onClick={() => ask(true)}>Ask</button>
                  </div>
                )}
              </div>
            </div>
          )}
      </div>
      {viewer && <PageViewer viewer={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

function BookShelf({ uid, books }) {
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef();
  const onFiles = async (files) => {
    for (const f of Array.from(files)) {
      if (!/\.pdf$/i.test(f.name)) { setMsg(`${f.name}: only PDF books are supported.`); continue; }
      setMsg("");
      try {
        const r = await uploadBook(uid, f, (i, n) => setProgress({ name: f.name, i, n }));
        setMsg(r.textPages ? `${f.name}: ${r.textPages} of ${r.pageCount} pages indexed.` : `${f.name}: no text found — this looks like a scanned book. Scanned books aren't supported yet.`);
      } catch (e) { setMsg(`${f.name}: upload failed (${e.message}).`); }
      setProgress(null);
    }
  };
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>📚 My books</div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>Your own PDFs (Nelson, Ghai, IAP, hospital protocols). Private to your account.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {books.map(b => (
          <div key={b.id} data-testid="nb-book" style={{ background: "var(--color-background-secondary)", borderRadius: 9, padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</div>
              <div style={{ fontSize: 11, color: b.status === "ready" ? (b.textPages ? C.teal : C.amber) : C.gray }}>
                {b.status !== "ready" ? "Uploading…" : b.textPages ? `${b.textPages} pages indexed` : "Scanned — no text"}
              </div>
            </div>
            <button title="Remove" onClick={() => { if (window.confirm(`Remove "${b.title}" from your notebook?`)) deleteBook(uid, b.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.gray }}>🗑</button>
          </div>
        ))}
      </div>
      {progress && <p data-testid="nb-upload-progress" style={{ fontSize: 12, color: C.teal, margin: "8px 0 0" }}>Reading {progress.name}… page {progress.i}/{progress.n}</p>}
      {msg && <p data-testid="nb-upload-msg" style={{ fontSize: 12, margin: "8px 0 0", color: /failed|scanned|only PDF/.test(msg) ? C.amber : C.teal }}>{msg}</p>}
      <button style={btn(false, { width: "100%", marginTop: 10 })} disabled={!!progress} onClick={() => fileRef.current?.click()}>+ Upload PDF</button>
      <input data-testid="nb-upload" ref={fileRef} type="file" accept="application/pdf,.pdf" multiple style={{ display: "none" }} onChange={e => { onFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function AnswerCard({ q, answer, onOpen: openViewer }) {
  const s = answer.stats || {};
  // Attach the cited page's text (returned by the server) so the viewer can highlight the quote.
  const onOpen = (v) => openViewer(v.page ? { ...v, text: answer.pages?.[`${v.page.bookId}:${v.page.page}`]?.text } : v);
  return (
    <div style={card} data-testid="nb-answer">
      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginBottom: 8 }}>🩺 {q}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, background: C.tealBg, color: C.teal, borderRadius: 12, padding: "3px 10px" }}>✓ {s.verified || 0} points backed by your books</span>
        {s.failed > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, background: C.redBg, color: C.red, borderRadius: 12, padding: "3px 10px" }}>⚠ {s.failed} citation problem{s.failed === 1 ? "" : "s"}</span>}
        {s.uncited > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, background: C.grayBg, color: C.gray, borderRadius: 12, padding: "3px 10px" }}>{s.uncited} general knowledge</span>}
      </div>
      <Section title="Summary" points={answer.summary} onOpen={onOpen} />
      {answer.differentials?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <SectionTitle>Differentials</SectionTitle>
          {answer.differentials.map((d, i) => {
            const l = LIKELY[d.likelihood] || LIKELY.low;
            return (
              <div key={i} data-testid="nb-diff" style={{ border: "1px solid var(--color-border-primary)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <strong style={{ fontSize: 14.5 }}>{d.name}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, color: l.color, background: l.bg, borderRadius: 10, padding: "2px 8px" }}>{l.label}</span>
                </div>
                {d.points.map((p, j) => <Point key={j} p={p} onOpen={onOpen} />)}
              </div>
            );
          })}
        </div>
      )}
      <Section title="Ask / examine next" points={answer.askNext} onOpen={onOpen} />
      <Section title="Red flags to rule out" points={answer.redFlags} onOpen={onOpen} red />
      {answer.notInBooks?.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, background: C.amberBg, color: C.amber, borderRadius: 8, padding: "8px 10px" }}>
          <strong>Not covered by your books:</strong>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{answer.notInBooks.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

const SectionTitle = ({ children }) => <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, color: "var(--color-text-secondary)", margin: "0 0 6px", textTransform: "uppercase" }}>{children}</div>;

function Section({ title, points, onOpen, red }) {
  if (!points?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <SectionTitle>{title}</SectionTitle>
      {points.map((p, i) => <Point key={i} p={p} onOpen={onOpen} red={red} />)}
    </div>
  );
}

function Point({ p, onOpen, red }) {
  const border = p.status === "failed" ? C.red : p.status === "uncited" ? "#cbd5e1" : red ? C.red : C.teal;
  return (
    <div data-testid={`nb-point-${p.status}`} style={{ borderLeft: `3px solid ${border}`, padding: "4px 10px", margin: "5px 0", background: p.status === "failed" ? C.redBg : "transparent", borderRadius: 4 }}>
      <div style={{ fontSize: 13.5 }}>
        {p.text}
        {p.status === "uncited" && <span style={{ fontSize: 11, color: C.gray, marginLeft: 6 }}>(general knowledge — not from your books)</span>}
      </div>
      {p.citations.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {p.citations.map((c, i) => (
            <button key={i} data-testid={c.verified ? "nb-cite-ok" : "nb-cite-bad"} onClick={() => c.verified ? onOpen({ page: c, quote: c.quote }) : onOpen({ bad: c })}
              title={c.verified ? `“${c.quote}”` : c.reason}
              style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 12, padding: "2px 9px", cursor: "pointer", fontFamily: "var(--font-sans)",
                border: `1px solid ${c.verified ? C.tealBorder : "#fecdd3"}`, background: c.verified ? C.tealBg : C.redBg, color: c.verified ? C.teal : C.red }}>
              {c.verified ? "✓" : "⚠"} {c.book ? `${shortTitle(c.book)}, p. ${c.page}` : c.passageId}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const shortTitle = (t) => t.length > 28 ? t.slice(0, 26) + "…" : t;

// Shows the full page text with the quoted sentence highlighted.
function PageViewer({ viewer, onClose }) {
  const { page, quote, bad, text } = viewer;
  const parts = useMemo(() => (text ? highlight(text, quote) : null), [text, quote]);
  const markRef = useRef();
  useEffect(() => { markRef.current?.scrollIntoView({ block: "center" }); }, [parts]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} data-testid="nb-page" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-primary)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            {bad ? <strong style={{ color: C.red }}>⚠ Citation could not be verified</strong>
              : <><strong>{page.book}</strong><span style={{ color: "var(--color-text-secondary)" }}> · page {page.page}</span></>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          {bad ? (
            <>
              <p style={{ margin: "0 0 8px" }}>The notebook claimed this quote from <code>{bad.passageId}</code>{bad.book ? ` (${bad.book}, p. ${bad.page})` : ""}:</p>
              <blockquote style={{ margin: 0, padding: "8px 12px", background: C.redBg, borderRadius: 8 }}>“{bad.quote}”</blockquote>
              <p style={{ margin: "10px 0 0", color: C.red }}>Problem: {bad.reason}. Don't rely on this point without checking your book.</p>
            </>
          ) : parts ? parts.map((x, i) => x.hit
            ? <mark key={i} ref={markRef} data-testid="nb-highlight" style={{ background: "#fde68a", padding: "1px 2px", borderRadius: 3 }}>{x.text}</mark>
            : <span key={i}>{x.text}</span>)
            : <p>Page text unavailable.</p>}
        </div>
      </div>
    </div>
  );
}

// Find the quote in the page text, tolerant to whitespace/line-break differences.
function highlight(text, quote) {
  const words = String(quote || "").trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return [{ text }];
  const re = new RegExp(words.join("[\\s\\u00ad-]+"), "i");
  const m = re.exec(text);
  if (!m) return [{ text }];
  return [{ text: text.slice(0, m.index) }, { text: m[0], hit: true }, { text: text.slice(m.index + m[0].length) }];
}
