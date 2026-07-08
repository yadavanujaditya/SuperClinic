import { useState, useEffect, useRef } from "react";

// Friendly animated "Dr. Flow" mascot — floats, blinks, waves, with a beating heart + ECG.
function Mascot() {
  return (
    <svg viewBox="0 0 220 220" width="200" height="200" className="anim-float" style={{ overflow: "visible" }}>
      {/* soft glow */}
      <circle cx="110" cy="112" r="86" fill="rgba(255,255,255,0.10)" />
      <circle cx="110" cy="112" r="70" fill="rgba(255,255,255,0.14)" />
      {/* head */}
      <circle cx="110" cy="96" r="52" fill="#FFFFFF" />
      {/* hair / cap */}
      <path d="M60 88 A50 50 0 0 1 160 88 L160 78 A50 40 0 0 0 60 78 Z" fill="#0d9488" />
      <rect x="102" y="52" width="16" height="16" rx="3" fill="#0d9488" />
      <rect x="106" y="46" width="8" height="10" rx="2" fill="#14b8a6" />
      {/* eyes */}
      <ellipse className="hero-mascot-eye" cx="92" cy="96" rx="6" ry="8" fill="#1A2E3D" />
      <ellipse className="hero-mascot-eye" cx="128" cy="96" rx="6" ry="8" fill="#1A2E3D" />
      {/* cheeks */}
      <circle cx="80" cy="112" r="7" fill="#FBCFE8" opacity="0.8" />
      <circle cx="140" cy="112" r="7" fill="#FBCFE8" opacity="0.8" />
      {/* smile */}
      <path d="M96 116 Q110 130 124 116" stroke="#1A2E3D" strokeWidth="4" fill="none" strokeLinecap="round" />
      {/* stethoscope */}
      <path d="M84 138 C80 168 120 172 122 148" stroke="#334155" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle className="hero-heart" cx="122" cy="150" r="10" fill="#e11d48" />
      <path className="hero-heart" d="M122 146 l-3 -3 a2 2 0 0 0 -3 3 l6 6 l6 -6 a2 2 0 0 0 -3 -3 z" fill="#fff" />
      {/* waving hand */}
      <g className="hero-hand">
        <circle cx="162" cy="126" r="12" fill="#FFFFFF" />
      </g>
      {/* ECG strip under mascot */}
      <g transform="translate(30,182)">
        <rect x="0" y="0" width="160" height="26" rx="8" fill="rgba(255,255,255,0.9)" />
        <path className="hero-ecg" d="M6 13 H40 l6 -9 l7 18 l6 -9 H90 l6 -9 l7 18 l6 -9 H154"
          stroke="#0d9488" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

const SLIDES = [
  {
    tag: "60% of your OPD is repeat cases",
    title: "Stop re-typing the same consultation.",
    body: "ClinicFlow turns your most common complaints into guided, one-tap workflows — structured history, live differentials, and a ready note in seconds.",
    icon: "🩺",
  },
  {
    tag: "Discharge summaries eat your evenings",
    title: "Summaries that write themselves.",
    body: "SuperSummary uses your own real summary as the template. Snap a few report photos — AI fills every blank and drafts the whole thing. You just verify.",
    icon: "📋",
  },
  {
    tag: "Never lose the leading diagnosis",
    title: "Differentials that update as you ask.",
    body: "Every answer re-weights the differential list in real time, with red-flag alerts — so the dangerous diagnosis never slips past you.",
    icon: "🎯",
  },
  {
    tag: "Your textbooks, at the point of care",
    title: "Your reference library, one tap away.",
    body: "Upload Nelson's, Harrison's, or your hospital protocol. Tag pages, search instantly, and jump to the exact page mid-consult — fully offline.",
    icon: "📚",
  },
];

export default function HomeHero() {
  const [i, setI] = useState(0);
  const timer = useRef(null);
  const start = () => { stop(); timer.current = setInterval(() => setI(v => (v + 1) % SLIDES.length), 5000); };
  const stop = () => { if (timer.current) clearInterval(timer.current); };
  useEffect(() => { start(); return stop; }, []);
  const go = (n) => { setI(n); start(); };

  const s = SLIDES[i];

  return (
    <div className="hero-band" style={{ borderRadius: 22, padding: "clamp(20px, 4vw, 36px)", marginBottom: 32, boxShadow: "0 20px 50px rgba(13,148,136,0.22)", position: "relative", overflow: "hidden" }}>
      {/* floating decorative blobs */}
      <div className="anim-float-slow" style={{ position: "absolute", top: -40, right: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
      <div className="anim-float" style={{ position: "absolute", bottom: -50, left: "40%", width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

      <div style={{ display: "flex", alignItems: "center", gap: "clamp(16px, 4vw, 48px)", flexWrap: "wrap", position: "relative", zIndex: 1 }}>
        {/* Mascot */}
        <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "center", minWidth: 200, margin: "0 auto" }}>
          <Mascot />
        </div>

        {/* Rotating copy */}
        <div style={{ flex: "1 1 340px", color: "#fff", minWidth: 280 }}>
          <div key={i} className="anim-fade-up">
            <div className="hero-glass" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 14, color: "#fff" }}>
              <span style={{ fontSize: 15 }}>{s.icon}</span> {s.tag}
            </div>
            <h2 style={{ fontSize: "clamp(22px, 3.4vw, 34px)", fontWeight: 900, margin: "0 0 12px", letterSpacing: "-0.6px", lineHeight: 1.12 }}>{s.title}</h2>
            <p style={{ fontSize: "clamp(13px, 1.5vw, 16px)", lineHeight: 1.65, margin: 0, color: "rgba(255,255,255,0.92)", maxWidth: 560 }}>{s.body}</p>
          </div>

          {/* dots */}
          <div style={{ display: "flex", gap: 8, marginTop: 24, alignItems: "center" }}>
            {SLIDES.map((_, n) => (
              <span key={n} onClick={() => go(n)} className="hero-dot"
                style={{ height: 8, width: n === i ? 26 : 8, borderRadius: 8, background: n === i ? "#fff" : "rgba(255,255,255,0.45)" }} />
            ))}
            <span style={{ marginLeft: 10, fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{i + 1} / {SLIDES.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small illustrated slide art (self-contained SVG — no external image deps) ──
function IllustBase({ bg, children }) {
  return (
    <svg viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <rect width="300" height="200" fill={bg} />
      {children}
    </svg>
  );
}
export function IllustConsult() {
  return (
    <IllustBase bg="#f0fdfa">
      <circle cx="150" cy="100" r="70" fill="#ccfbf1" />
      <circle cx="118" cy="86" r="30" fill="#fff" />
      <path d="M88 150 q30 -34 60 0 z" fill="#0d9488" />
      <rect x="150" y="60" width="86" height="70" rx="10" fill="#fff" stroke="#99f6e4" strokeWidth="2" />
      <rect x="162" y="74" width="62" height="6" rx="3" fill="#0d9488" />
      <rect x="162" y="88" width="46" height="6" rx="3" fill="#99f6e4" />
      <rect x="162" y="102" width="54" height="6" rx="3" fill="#99f6e4" />
      <circle cx="205" cy="118" r="8" fill="#14b8a6" />
    </IllustBase>
  );
}
export function IllustDifferential() {
  return (
    <IllustBase bg="#ecfeff">
      <circle cx="150" cy="100" r="52" fill="none" stroke="#0d9488" strokeWidth="3" strokeDasharray="4 6" />
      <circle cx="150" cy="70" r="10" fill="#0d9488" />
      <circle cx="120" cy="120" r="8" fill="#14b8a6" />
      <circle cx="180" cy="120" r="8" fill="#5eead4" />
      <path d="M150 70 L120 120 M150 70 L180 120 M120 120 L180 120" stroke="#0d9488" strokeWidth="2" opacity="0.5" />
      <rect x="60" y="150" width="180" height="10" rx="5" fill="#fff" />
      <rect x="60" y="150" width="120" height="10" rx="5" fill="#0d9488" />
    </IllustBase>
  );
}
export function IllustDocs() {
  return (
    <IllustBase bg="#f5f3ff">
      <rect x="90" y="50" width="70" height="96" rx="6" fill="#fff" stroke="#c4b5fd" strokeWidth="2" transform="rotate(-8 125 98)" />
      <rect x="120" y="60" width="80" height="100" rx="6" fill="#fff" stroke="#7c3aed" strokeWidth="2" />
      <rect x="135" y="76" width="50" height="6" rx="3" fill="#7c3aed" />
      <rect x="135" y="90" width="50" height="5" rx="2.5" fill="#ddd6fe" />
      <rect x="135" y="100" width="34" height="5" rx="2.5" fill="#ddd6fe" />
      <circle cx="196" cy="140" r="16" fill="#7c3aed" />
      <path d="M189 140 l5 5 l10 -11" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </IllustBase>
  );
}
export function IllustScan() {
  return (
    <IllustBase bg="#faf5ff">
      <rect x="80" y="50" width="90" height="110" rx="8" fill="#fff" stroke="#c4b5fd" strokeWidth="2" />
      <rect x="94" y="66" width="62" height="6" rx="3" fill="#a78bfa" />
      <rect x="94" y="80" width="46" height="5" rx="2.5" fill="#e9d5ff" />
      <rect x="94" y="92" width="54" height="5" rx="2.5" fill="#e9d5ff" />
      <rect x="94" y="104" width="40" height="5" rx="2.5" fill="#e9d5ff" />
      <rect x="170" y="70" width="60" height="80" rx="8" fill="#7c3aed" opacity="0.9" />
      <path d="M180 84 h40 M180 98 h40 M180 112 h28" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="205" cy="132" r="10" fill="#fff" />
      <path d="M201 132 l3 3 l6 -7" stroke="#7c3aed" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </IllustBase>
  );
}
export function IllustLibrary() {
  return (
    <IllustBase bg="#fff7ed">
      <rect x="70" y="120" width="24" height="50" rx="2" fill="#f59e0b" />
      <rect x="98" y="100" width="24" height="70" rx="2" fill="#fbbf24" />
      <rect x="126" y="80" width="24" height="90" rx="2" fill="#f59e0b" />
      <rect x="154" y="110" width="24" height="60" rx="2" fill="#fde68a" />
      <circle cx="205" cy="90" r="34" fill="#fff" stroke="#f59e0b" strokeWidth="2" />
      <circle cx="196" cy="82" r="10" fill="none" stroke="#f59e0b" strokeWidth="3" />
      <line x1="204" y1="90" x2="216" y2="102" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
    </IllustBase>
  );
}
export function IllustSafety() {
  return (
    <IllustBase bg="#fef2f2">
      <path d="M150 40 L200 58 V100 C200 132 178 154 150 164 C122 154 100 132 100 100 V58 Z" fill="#fee2e2" stroke="#e11d48" strokeWidth="2.5" />
      <path d="M132 100 l14 14 l24 -30" stroke="#e11d48" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </IllustBase>
  );
}

export function IllustGame() {
  return (
    <IllustBase bg="#ecfeff">
      <circle cx="150" cy="95" r="58" fill="#cffafe" />
      <path d="M110 80 h80 a10 10 0 0 1 10 10 v18 a18 18 0 0 1 -18 18 h-6 l-10 14 h-32 l-10 -14 h-6 a18 18 0 0 1 -18 -18 v-18 a10 10 0 0 1 10 -10 Z" fill="#0891b2" />
      <circle cx="132" cy="100" r="6" fill="#fff" />
      <circle cx="168" cy="100" r="6" fill="#fff" />
      <rect x="122" y="94" width="10" height="4" rx="2" fill="#0891b2" />
      <rect x="126" y="90" width="4" height="12" rx="2" fill="#0891b2" />
      <circle cx="150" cy="46" r="16" fill="#fbbf24" />
      <path d="M150 38 l3.2 6.5 7.2 1 -5.2 5 1.2 7.2 -6.4 -3.4 -6.4 3.4 1.2 -7.2 -5.2 -5 7.2 -1 Z" fill="#fff" />
    </IllustBase>
  );
}

// Small auto-rotating illustration carousel used inside a card (replaces a single static image).
export function CardCarousel({ slides, accent = "#0d9488", height = 170 }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(v => (v + 1) % slides.length), 3200);
    return () => clearInterval(t);
  }, [slides.length]);
  return (
    <div style={{ position: "relative", height, overflow: "hidden" }}>
      {slides.map((Slide, n) => (
        <div key={n} style={{ position: "absolute", inset: 0, opacity: n === i ? 1 : 0, transition: "opacity 0.6s ease" }}>
          <Slide />
        </div>
      ))}
      <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
        {slides.map((_, n) => (
          <span key={n} style={{ width: n === i ? 16 : 6, height: 6, borderRadius: 4, background: n === i ? accent : "rgba(0,0,0,0.15)", transition: "all 0.3s" }} />
        ))}
      </div>
    </div>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────────────────
export function AppFooter() {
  return (
    <footer style={{ marginTop: 48, borderTop: "1px solid var(--color-border-primary)", background: "#fff" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 20px", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, margin: 0, color: "var(--color-text-primary)" }}>ClinicFlow</p>
            <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>Built for junior doctors in Indian government hospitals — all processing stays on your device.</p>
          </div>
        </div>
        <a href="https://t.me/yadavanujaditya" target="_blank" rel="noopener noreferrer"
          className="lift-on-hover"
          style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "10px 18px", borderRadius: 30,
            background: "linear-gradient(120deg,#2AABEE,#229ED9)", color: "#fff", fontWeight: 700, fontSize: 13.5, boxShadow: "0 8px 20px rgba(34,158,217,0.28)" }}>
          <svg width="20" height="20" viewBox="0 0 496 512" fill="#fff"><path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm121.8 169.9l-40.7 191.8c-3.1 13.8-11.1 17.2-22.6 10.7l-62.5-46.1-30.1 29c-3.3 3.3-6.1 6.1-12.6 6.1l4.5-63.9L328 178.1c5.1-4.5-1.1-7-7.9-2.5L163.6 274l-61.2-19.1c-13.3-4.2-13.6-13.3 2.8-19.7l239.4-92.3c11.1-4 20.8 2.7 17.2 19.5z"/></svg>
          Chat on Telegram
        </a>
      </div>
      <div style={{ borderTop: "1px solid var(--color-border-primary)", padding: "14px 20px", textAlign: "center" }}>
        <p style={{ fontSize: 11.5, color: "var(--color-text-secondary)", margin: 0 }}>© {new Date().getFullYear()} ClinicFlow · Made with care for India's frontline doctors</p>
      </div>
    </footer>
  );
}
