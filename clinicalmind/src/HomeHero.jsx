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
