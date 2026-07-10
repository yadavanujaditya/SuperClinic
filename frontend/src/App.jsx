import { useState, useRef, useEffect } from "react";
import { BM25 } from "./bm25.js";
import SuperSummary from "./SuperSummary.jsx";
import HomeHero, { CardCarousel, IllustConsult, IllustDifferential, IllustDocs, IllustScan, IllustLibrary, IllustSafety, IllustGame, IllustDnb, AppFooter } from "./HomeHero.jsx";
import { useAuth } from "./AuthContext.jsx";
import { listBooks, listTags } from "./supermemory.js";
import { LoginModal } from "./AuthScreens.jsx";
import { Card, ShareLinkRow } from "./UIPrimitives.jsx";
import { SettingsPanel } from "./SettingsPanel.jsx";
import { ProductToggle, ProfileMenu } from "./ProfileMenu.jsx";
import { LibraryScreen } from "./LibraryScreen.jsx";
import { ConsultationScreen } from "./ConsultationScreen.jsx";
import { NoteScreen } from "./NoteScreen.jsx";

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
