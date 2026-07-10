import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// SpeedMD — real-time lane racer over a filterable medical MCQ bank.
// Flow: setup (pick exam/subject/year/etc) → playing → over.
// Each question runs in two calm, un-exhausting phases:
//   • READ  — the question shows with a countdown; only sparse hazards/power-ups
//             drift down so you drive & read without pressure (no strikes here).
//   • ANSWER— the four options drop one at a time, interleaved with the odd
//             obstacle; steer/drag the car into the correct one to score.
// The car is driven by dragging it (touch or mouse); keyboard also works.

const LANES = 4;
const HIGH_SCORE_KEY = "speedmd_highscore";
const TRACK_H = 460;
const CAR_BOTTOM = TRACK_H - 62;              // resting position near the bottom
const CAR_TOP = Math.round(TRACK_H * 0.30);   // furthest forward the car can dash
const CAR_STEP = 66;                          // keyboard vertical nudge
const HIT_BAND = 34;
const HAZARD_ICONS = ["🪨", "🚧", "🛢️", "⚠️", "🚗", "🛑"];
const SLOW_MS = 4500;
const SLOW_FACTOR = 0.55;

const EXAM_OPTS = [
  { v: "upscCms", label: "UPSC CMS" },
  { v: "haryanapractice", label: "Haryana Practice" },
  { v: "haryanamo", label: "Haryana MO" },
];
const DIFF_OPTS = [{ v: "E", label: "Easy" }, { v: "M", label: "Medium" }, { v: "H", label: "Hard" }];
const WEIGHT_OPTS = [{ v: "H", label: "High yield" }, { v: "M", label: "Medium" }, { v: "L", label: "Low" }];
const PAPER_OPTS = [{ v: "1", label: "Paper 1" }, { v: "2", label: "Paper 2" }];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Continuous difficulty params keyed by questions resolved. Everything ramps
// gently so early game is relaxed and readable, late game is quicker.
function difficultyParams(n) {
  const tier = n < 8 ? "E" : n < 26 ? "M" : "H";
  const targetTravelMs = Math.max(2600, 4400 - n * 34);  // block descent time (readable)
  const speed = CAR_BOTTOM / targetTravelMs;
  const optionGap = Math.max(680, 1250 - n * 12);        // time between option drops
  const cooldownMs = Math.max(500, 1300 - n * 18);       // clear-road beat between Qs
  return { tier, speed, optionGap, cooldownMs };
}

// generous reading time (ms) before options start dropping — scales with how
// much text there is, and eases down a little as the run progresses
function readPhaseMs(q, n) {
  const load = q.q.length + q.o.reduce((s, o) => s + o.length, 0);
  const base = 4200 + load * 11;               // ~5.5s short … ~8s long
  const shrink = Math.max(0.55, 1 - n * 0.012);
  return Math.round(Math.max(2800, Math.min(9000, base * shrink)));
}

let uid = 1;

export default function SpeedMD({ onClose }) {
  const [bank, setBank] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup | playing | over

  const [selExam, setSelExam] = useState(() => new Set());
  const [selSubj, setSelSubj] = useState(() => new Set());
  const [selDiff, setSelDiff] = useState(() => new Set());
  const [selWeight, setSelWeight] = useState(() => new Set());
  const [selPaper, setSelPaper] = useState(() => new Set());
  const [selYear, setSelYear] = useState(() => new Set());

  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [lane, setLane] = useState(1);
  const [carY, setCarY] = useState(CAR_BOTTOM);
  const [tilt, setTilt] = useState(0);
  const [obstacles, setObstacles] = useState([]);
  const [banner, setBanner] = useState(null);
  const [flash, setFlash] = useState(null);
  const [qDone, setQDone] = useState(0);
  const [carHit, setCarHit] = useState(null);
  const [message, setMessage] = useState(null);
  const [popup, setPopup] = useState(null);
  const [shield, setShield] = useState(false);
  const [slowActive, setSlowActive] = useState(false);
  const [readFrac, setReadFrac] = useState(0); // 0..1 countdown during read phase (0 = options now)

  const poolsRef = useRef(null);
  const cursorRef = useRef({ E: 0, M: 0, H: 0, all: 0 });
  const laneRef = useRef(1);
  const carYRef = useRef(CAR_BOTTOM);
  const tiltTimerRef = useRef(null);
  const qDoneRef = useRef(0);
  const phaseRef = useRef("setup");
  const waveRef = useRef(null);   // { waveId, resolved, answerAt, optionsSpawned }
  const rafRef = useRef(null);
  const lastReadSpawnRef = useRef(0);
  const nextWaveAtRef = useRef(0);
  const needsRespawnRef = useRef(false);
  const shieldRef = useRef(false);
  const slowUntilRef = useRef(0);
  const dragRef = useRef(false);
  const msgTimerRef = useRef(null);
  const popupTimerRef = useRef(null);

  useEffect(() => { laneRef.current = lane; }, [lane]);
  useEffect(() => { carYRef.current = carY; }, [carY]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { shieldRef.current = shield; }, [shield]);

  useEffect(() => {
    try { setBest(Number(localStorage.getItem(HIGH_SCORE_KEY) || 0)); } catch {}
    fetch("/speedmd_questions.json")
      .then(r => { if (!r.ok) throw new Error("bad response"); return r.json(); })
      .then(data => setBank(data))
      .catch(() => setLoadError(true));
  }, []);

  const subjOpts = useMemo(() => {
    if (!bank) return [];
    const c = {};
    for (const q of bank) c[q.s] = (c[q.s] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([v]) => ({ v, label: v }));
  }, [bank]);
  const yearOpts = useMemo(() => {
    if (!bank) return [];
    const set = new Set();
    for (const q of bank) if (q.y) set.add(q.y);
    return Array.from(set).sort((a, b) => Number(b) - Number(a)).map(v => ({ v, label: v }));
  }, [bank]);

  const matchesFacets = useCallback((q) => {
    if (selExam.size && !selExam.has(q.e)) return false;
    if (selSubj.size && !selSubj.has(q.s)) return false;
    if (selDiff.size && !selDiff.has(q.d)) return false;
    if (selWeight.size && !selWeight.has(q.w)) return false;
    if (selPaper.size && !selPaper.has(q.p)) return false;
    if (selYear.size && !selYear.has(q.y)) return false;
    return true;
  }, [selExam, selSubj, selDiff, selWeight, selPaper, selYear]);
  const filtered = useMemo(() => (bank ? bank.filter(matchesFacets) : []), [bank, matchesFacets]);
  const toggle = (setFn) => (v) => setFn(prev => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });

  const pickQuestion = useCallback((tier) => {
    const pools = poolsRef.current;
    let list = pools[tier];
    if (!list || list.length === 0) { list = pools.all; tier = "all"; }
    let cur = cursorRef.current[tier];
    if (cur >= list.length) { pools[tier] = shuffle(list); list = pools[tier]; cur = 0; }
    cursorRef.current[tier] = cur + 1;
    return list[cur];
  }, []);

  const showMessage = (text, kind) => {
    clearTimeout(msgTimerRef.current);
    const id = uid++;
    setMessage({ text, kind, id });
    msgTimerRef.current = setTimeout(() => setMessage(m => (m?.id === id ? null : m)), 1000);
  };
  const showPopup = (text, laneIdx, good) => {
    clearTimeout(popupTimerRef.current);
    const id = uid++;
    setPopup({ text, lane: laneIdx, id, good });
    popupTimerRef.current = setTimeout(() => setPopup(p => (p?.id === id ? null : p)), 650);
  };

  // Begin a question: show the stem, start the READ countdown. Options are NOT
  // spawned yet — the tick loop drops them once the read phase elapses.
  const spawnQuestionWave = useCallback((now) => {
    const q = pickQuestion(difficultyParams(qDoneRef.current).tier);
    const waveId = uid++;
    const readMs = readPhaseMs(q, qDoneRef.current);
    waveRef.current = { waveId, resolved: false, answerAt: now + readMs, readMs, optionsSpawned: false, q };
    setBanner({ q: q.q, subject: q.s, year: q.y });
    setReadFrac(1);
  }, [pickQuestion]);

  // Drop the 4 options (staggered) plus a couple of interleaved hazards.
  const spawnAnswerBlocks = useCallback((wave, now) => {
    const q = wave.q;
    const p = difficultyParams(qDoneRef.current);
    const order = shuffle([0, 1, 2, 3]);
    const dropOrder = shuffle([0, 1, 2, 3]);
    const blocks = order.map((optIdx, laneIdx) => ({
      id: uid++, waveId: wave.waveId, kind: "answer", lane: laneIdx, letter: "ABCD"[laneIdx],
      text: q.o[optIdx], correct: optIdx === q.a,
      spawnedAt: now + dropOrder.indexOf(laneIdx) * p.optionGap,
    }));
    // an obstacle slides in between the option drops (…option A, hazard, option B…)
    const interleaved = [];
    for (let k = 0; k < 3; k++) {
      if (qDoneRef.current < 3 && Math.random() < 0.5) continue; // ease newcomers in
      interleaved.push({
        id: uid++, waveId: -1, kind: "hazard", lane: Math.floor(Math.random() * LANES),
        icon: HAZARD_ICONS[Math.floor(Math.random() * HAZARD_ICONS.length)],
        spawnedAt: now + (k + 0.5) * p.optionGap,
      });
    }
    setObstacles(list => [...list, ...blocks, ...interleaved]);
  }, []);

  const finishGame = useCallback(() => {
    phaseRef.current = "over";
    setPhase("over");
    setObstacles([]);
    setScore(s => {
      try {
        const prev = Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
        if (s > prev) { localStorage.setItem(HIGH_SCORE_KEY, String(s)); setBest(s); }
      } catch {}
      return s;
    });
  }, []);

  const registerStrike = useCallback(() => {
    setStrikes(st => {
      const n = st + 1;
      if (n >= 3) setTimeout(() => finishGame(), 260);
      return n;
    });
  }, [finishGame]);

  const resolveHit = useCallback((ob, now) => {
    if (ob.kind === "power") {
      if (ob.power === "slow") {
        slowUntilRef.current = now + SLOW_MS;
        setSlowActive(true);
        setTimeout(() => { if (performance.now() >= slowUntilRef.current) setSlowActive(false); }, SLOW_MS + 60);
        showMessage("Slow-mo! 🐌", "good"); showPopup("🐌", ob.lane, true);
      } else if (ob.power === "shield") {
        setShield(true); showMessage("Shield up! 🛡️", "good"); showPopup("🛡️", ob.lane, true);
      }
      setFlash("good"); setCarHit("good");
      setTimeout(() => { setFlash(f => f === "good" ? null : f); setCarHit(h => h === "good" ? null : h); }, 240);
      return;
    }
    if (ob.kind === "hazard") {
      if (shieldRef.current) {
        setShield(false); showMessage("Shield saved you! 🛡️", "good"); showPopup("blocked", ob.lane, true);
        setCarHit("good"); setTimeout(() => setCarHit(h => h === "good" ? null : h), 240);
        return;
      }
      // during the READ phase hazards only cost points — never a strike, so
      // reading is relaxed; strikes come from the answer phase / wrong answers
      const inReadPhase = waveRef.current && !waveRef.current.optionsSpawned;
      setScore(s => Math.max(0, s - (inReadPhase ? 3 : 6)));
      setStreak(0);
      setFlash("bad"); setCarHit("bad");
      showMessage(inReadPhase ? "Bump! 💥" : "Hazard hit! 💥", "bad");
      showPopup(inReadPhase ? "-3" : "-6", ob.lane, false);
      if (!inReadPhase) registerStrike();
      setTimeout(() => { setFlash(f => f === "bad" ? null : f); setCarHit(h => h === "bad" ? null : h); }, 240);
      return;
    }
    // answer block
    const wave = waveRef.current;
    if (!wave || wave.waveId !== ob.waveId || wave.resolved) return;
    if (ob.correct) {
      wave.resolved = true;
      const p = difficultyParams(qDoneRef.current);
      const speedBonus = Math.round(p.speed * 120);
      const reactionBonus = Math.max(0, Math.round((2600 - (now - ob.spawnedAt)) / 45));
      const gained = 12 + speedBonus + reactionBonus;
      setScore(s => s + gained);
      setStreak(s => s + 1);
      setFlash("good"); setCarHit("good");
      showMessage("Correct! 🎯", "good"); showPopup(`+${gained}`, ob.lane, true);
      qDoneRef.current += 1;
      setQDone(qDoneRef.current);
      nextWaveAtRef.current = now + p.cooldownMs;
      setTimeout(() => { setFlash(f => f === "good" ? null : f); setCarHit(h => h === "good" ? null : h); }, 240);
    } else {
      if (shieldRef.current) {
        setShield(false); showMessage("Shield saved you! 🛡️", "good"); showPopup("blocked", ob.lane, true);
        setCarHit("good"); setTimeout(() => setCarHit(h => h === "good" ? null : h), 240);
        return;
      }
      setScore(s => Math.max(0, s - 8));
      setStreak(0);
      setFlash("bad"); setCarHit("bad");
      showMessage("Wrong answer ✕", "bad"); showPopup("-8", ob.lane, false);
      registerStrike();
      setTimeout(() => { setFlash(f => f === "bad" ? null : f); setCarHit(h => h === "bad" ? null : h); }, 240);
    }
  }, [registerStrike]);

  const startGame = () => {
    if (!filtered || filtered.length < 4) return;
    const byTier = { E: [], M: [], H: [] };
    for (const q of filtered) if (byTier[q.d]) byTier[q.d].push(q);
    poolsRef.current = { E: shuffle(byTier.E), M: shuffle(byTier.M), H: shuffle(byTier.H), all: shuffle(filtered) };
    cursorRef.current = { E: 0, M: 0, H: 0, all: 0 };
    uid = 1;
    qDoneRef.current = 0;
    waveRef.current = null;
    needsRespawnRef.current = false;
    slowUntilRef.current = 0;
    shieldRef.current = false;
    setScore(0); setStrikes(0); setStreak(0); setQDone(0); setLane(1);
    setCarY(CAR_BOTTOM); setTilt(0);
    setObstacles([]); setMessage(null); setPopup(null); setShield(false); setSlowActive(false); setReadFrac(0);
    laneRef.current = 1; carYRef.current = CAR_BOTTOM;
    phaseRef.current = "playing";
    setPhase("playing");
    const now = performance.now();
    lastReadSpawnRef.current = now;
    nextWaveAtRef.current = now;
    spawnQuestionWave(now);
  };

  // main game loop
  useEffect(() => {
    if (phase !== "playing") return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const now = performance.now();
      const p = difficultyParams(qDoneRef.current);
      const speed = now < slowUntilRef.current ? p.speed * SLOW_FACTOR : p.speed;
      if (now >= slowUntilRef.current && slowActive) setSlowActive(false);

      const wave = waveRef.current;
      const inRead = wave && !wave.optionsSpawned && !wave.resolved;
      // options begin dropping once the read phase elapses
      if (wave && !wave.optionsSpawned && !wave.resolved && now >= wave.answerAt) {
        wave.optionsSpawned = true;
        spawnAnswerBlocks(wave, now);
        setReadFrac(0);
      }
      if (inRead) {
        const frac = Math.max(0, (wave.answerAt - now) / wave.readMs);
        setReadFrac(frac);
      }

      setObstacles(list => {
        const next = [];
        for (const ob of list) {
          const y = (now - ob.spawnedAt) * speed;
          if (!ob._hit && ob.lane === laneRef.current && y >= carYRef.current - HIT_BAND && y <= carYRef.current + HIT_BAND) {
            ob._hit = true;
            resolveHit(ob, now);
            continue;
          }
          if (y > TRACK_H + 40) {
            if (ob.kind === "answer" && ob.correct) {
              const w = waveRef.current;
              if (w && w.waveId === ob.waveId && !w.resolved) {
                w.resolved = true;
                setScore(s => Math.max(0, s - 5));
                setStreak(0);
                showMessage("Missed it! ⏱️", "bad");
                qDoneRef.current += 1;
                setQDone(qDoneRef.current);
                nextWaveAtRef.current = now + p.cooldownMs;
              }
            }
            continue;
          }
          if (y >= -60) next.push({ ...ob, y }); // hide not-yet-dropped items (future spawnedAt)
          else next.push(ob);
        }
        const resolvedWaveId = waveRef.current?.resolved ? waveRef.current.waveId : null;
        const cleaned = resolvedWaveId == null ? next : next.filter(o => !(o.kind === "answer" && o.waveId === resolvedWaveId));
        const anyAnswerLeft = cleaned.some(o => o.kind === "answer");
        needsRespawnRef.current = !anyAnswerLeft && (!waveRef.current || waveRef.current.resolved) && now >= nextWaveAtRef.current;
        return cleaned;
      });
      if (needsRespawnRef.current) { needsRespawnRef.current = false; spawnQuestionWave(now); }

      // READ phase: sparse drifting obstacles / power-ups so you drive while you read
      if (inRead && now - lastReadSpawnRef.current > 1600) {
        lastReadSpawnRef.current = now;
        const roll = Math.random();
        if (roll < 0.4) {
          const power = Math.random() < 0.5 ? "slow" : "shield";
          setObstacles(list => [...list, { id: uid++, waveId: -2, kind: "power", power, lane: Math.floor(Math.random() * LANES), icon: power === "slow" ? "🐌" : "🛡️", spawnedAt: now }]);
        } else if (roll < 0.75) {
          setObstacles(list => [...list, { id: uid++, waveId: -1, kind: "hazard", lane: Math.floor(Math.random() * LANES), icon: HAZARD_ICONS[Math.floor(Math.random() * HAZARD_ICONS.length)], spawnedAt: now }]);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // keyboard controls (desktop)
  const steer = useCallback((dir) => {
    if (phaseRef.current !== "playing") return;
    setLane(l => { const nl = Math.max(0, Math.min(LANES - 1, l + dir)); laneRef.current = nl; return nl; });
    setTilt(dir * 11);
    clearTimeout(tiltTimerRef.current);
    tiltTimerRef.current = setTimeout(() => setTilt(0), 190);
  }, []);
  const steerV = useCallback((dir) => {
    if (phaseRef.current !== "playing") return;
    setCarY(y => { const ny = Math.max(CAR_TOP, Math.min(CAR_BOTTOM, y + dir * CAR_STEP)); carYRef.current = ny; return ny; });
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (["ArrowLeft", "a", "A"].includes(e.key)) { steer(-1); e.preventDefault(); }
      else if (["ArrowRight", "d", "D"].includes(e.key)) { steer(1); e.preventDefault(); }
      else if (["ArrowUp", "w", "W"].includes(e.key)) { steerV(-1); e.preventDefault(); }
      else if (["ArrowDown", "s", "S"].includes(e.key)) { steerV(1); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steer, steerV]);

  // drag-to-drive (touch + mouse): finger position maps to nearest lane + free vertical
  const dragTo = (clientX, clientY, rect) => {
    if (phaseRef.current !== "playing") return;
    const x = clientX - rect.left, yy = clientY - rect.top;
    const nl = Math.max(0, Math.min(LANES - 1, Math.floor((x / rect.width) * LANES)));
    if (nl !== laneRef.current) {
      const dir = nl > laneRef.current ? 1 : -1;
      setTilt(dir * 11);
      clearTimeout(tiltTimerRef.current);
      tiltTimerRef.current = setTimeout(() => setTilt(0), 190);
    }
    laneRef.current = nl; setLane(nl);
    const ny = Math.max(CAR_TOP, Math.min(CAR_BOTTOM, yy));
    carYRef.current = ny; setCarY(ny);
  };
  const onPointerDown = (e) => { dragRef.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); dragTo(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); };
  const onPointerMove = (e) => { if (dragRef.current) dragTo(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()); };
  const onPointerUp = () => { dragRef.current = false; };

  const p = difficultyParams(qDone);

  const Facet = ({ title, opts, sel, onToggle }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {opts.map(o => {
          const on = sel.has(o.v);
          return (
            <button key={o.v} onClick={() => onToggle(o.v)} style={{
              padding: "6px 13px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              background: on ? "linear-gradient(135deg,#8B5CF6,#A855F7)" : "rgba(255,255,255,0.07)",
              color: on ? "#fff" : "rgba(255,255,255,0.75)",
              border: `1px solid ${on ? "transparent" : "rgba(255,255,255,0.18)"}`,
              boxShadow: on ? "0 4px 12px rgba(139,92,246,0.35)" : "none", transition: "all 0.15s",
            }}>{o.label}</button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "linear-gradient(180deg,#0f172a,#1e1b3a 55%,#3b1d6e)", zIndex: 900, display: "flex", flexDirection: "column", color: "#fff", overflowY: "auto" }} className="anim-fade">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏎️</span>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>SpeedMD</h1>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0 }}>Drag your car into the right answer</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {phase === "playing" && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Score {score}</div>
              {shield && <span title="Shield active" style={{ fontSize: 16 }}>🛡️</span>}
              {slowActive && <span title="Slow-mo" style={{ fontSize: 16 }}>🐌</span>}
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map(i => <span key={i} style={{ fontSize: 16, opacity: i < strikes ? 1 : 0.25 }}>💥</span>)}
              </div>
            </>
          )}
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}>✕ Close</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: phase === "setup" ? "flex-start" : "center", padding: "16px", minHeight: 0 }}>
        {loadError && (
          <div style={{ textAlign: "center", maxWidth: 420, marginTop: 40 }}>
            <p style={{ fontSize: 15, marginBottom: 10 }}>Couldn't load the question bank.</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Make sure speedmd_questions.json is reachable, then try again.</p>
          </div>
        )}

        {!loadError && phase === "setup" && (
          <div style={{ width: "100%", maxWidth: 640 }} className="anim-fade-up">
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 46, marginBottom: 6 }}>🏁</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>Build your race</h2>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", margin: 0 }}>Pick any filters — leave a group empty to include all. Then race through the questions.</p>
            </div>
            {!bank ? (
              <p style={{ textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Loading question bank…</p>
            ) : (
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "18px 20px" }}>
                <Facet title="Exam" opts={EXAM_OPTS} sel={selExam} onToggle={toggle(setSelExam)} />
                <Facet title="Difficulty" opts={DIFF_OPTS} sel={selDiff} onToggle={toggle(setSelDiff)} />
                <Facet title="Exam weightage" opts={WEIGHT_OPTS} sel={selWeight} onToggle={toggle(setSelWeight)} />
                <Facet title="Paper" opts={PAPER_OPTS} sel={selPaper} onToggle={toggle(setSelPaper)} />
                <Facet title="Subject" opts={subjOpts} sel={selSubj} onToggle={toggle(setSelSubj)} />
                <Facet title="Year" opts={yearOpts} sel={selYear} onToggle={toggle(setSelYear)} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                    <b style={{ color: filtered.length >= 4 ? "#4ade80" : "#f87171", fontSize: 16 }}>{filtered.length}</b> questions match
                    {(selExam.size || selSubj.size || selDiff.size || selWeight.size || selPaper.size || selYear.size) > 0 && (
                      <button onClick={() => { setSelExam(new Set()); setSelSubj(new Set()); setSelDiff(new Set()); setSelWeight(new Set()); setSelPaper(new Set()); setSelYear(new Set()); }}
                        style={{ marginLeft: 10, fontSize: 12, color: "#c4b5fd", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Reset</button>
                    )}
                  </div>
                  <button onClick={startGame} disabled={filtered.length < 4} style={{
                    padding: "12px 30px", borderRadius: 12, fontSize: 15, fontWeight: 800,
                    background: filtered.length >= 4 ? "linear-gradient(135deg,#8B5CF6,#A855F7)" : "#475569",
                    color: "#fff", border: "none", cursor: filtered.length >= 4 ? "pointer" : "default",
                    boxShadow: filtered.length >= 4 ? "0 8px 22px rgba(139,92,246,0.4)" : "none",
                  }}>Start Race 🏎️</button>
                </div>
                {filtered.length < 4 && <p style={{ fontSize: 12, color: "#f87171", margin: "10px 0 0" }}>Need at least 4 matching questions — loosen your filters.</p>}
                {best > 0 && <p style={{ fontSize: 12, color: "#fbbf24", margin: "10px 0 0" }}>🏆 Best score: {best}</p>}
              </div>
            )}
            <p style={{ textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.45)", marginTop: 16 }}>
              Drag your car with your finger (or mouse) — read the question while you cruise, then slide into the right option as the four drop in. Grab 🐌 slow-mo &amp; 🛡️ shield, dodge 🚧 hazards. Three strikes ends the run.
            </p>
          </div>
        )}

        {!loadError && phase === "playing" && (
          <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 12 }}>
            {banner && (
              <div style={{
                background: flash === "good" ? "rgba(34,197,94,0.15)" : flash === "bad" ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${flash === "good" ? "rgba(34,197,94,0.5)" : flash === "bad" ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.15)"}`,
                borderRadius: 14, padding: "14px 20px 12px", minHeight: 60, display: "flex", flexDirection: "column", gap: 8,
                alignItems: "center", justifyContent: "center", textAlign: "center", transition: "background 0.2s, border-color 0.2s", position: "relative",
              }}>
                <p style={{ fontSize: "clamp(14px, 2.4vw, 17px)", fontWeight: 700, lineHeight: 1.4, margin: 0, wordBreak: "break-word" }}>{banner.q}</p>
                {readFrac > 0 && (
                  <div style={{ width: "100%", maxWidth: 320 }}>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginBottom: 3, letterSpacing: 0.3 }}>READING — options drop in {(readFrac * (waveRef.current?.readMs || 0) / 1000).toFixed(1)}s</div>
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${readFrac * 100}%`, background: "linear-gradient(90deg,#8B5CF6,#A855F7)", transition: "width 0.1s linear" }} />
                    </div>
                  </div>
                )}
                {message && (
                  <div key={message.id} className="anim-fade" style={{
                    position: "absolute", top: -14, right: 14, padding: "5px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 800,
                    background: message.kind === "good" ? "#22c55e" : "#ef4444", color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                  }}>{message.text}</div>
                )}
              </div>
            )}

            <div
              style={{ position: "relative", height: TRACK_H, borderRadius: 16, overflow: "hidden", background: "linear-gradient(180deg,#1e293b,#334155)", touchAction: "none", cursor: "grab", userSelect: "none" }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp}
            >
              <div style={{ position: "absolute", inset: 0, display: "flex" }}>
                {Array.from({ length: LANES }).map((_, i) => (
                  <div key={i} style={{ flex: 1, background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", borderRight: i < LANES - 1 ? "2px dashed rgba(255,255,255,0.15)" : "none" }} />
                ))}
              </div>
              <div key={Math.round(p.speed * 1000) + (slowActive ? 1 : 0)} style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", opacity: 0.3 }}>
                <div style={{ position: "absolute", inset: "-100% 0 0 0", backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.5) 0 2px, transparent 2px 60px)", animation: `roadScroll ${Math.max(0.3, (slowActive ? 8 : 4.5) * p.speed)}s linear infinite` }} />
              </div>

              {obstacles.map(ob => ((ob.y ?? -60) >= -55) && (
                <div key={ob.id} style={{ position: "absolute", top: ob.y ?? -60, left: `${(ob.lane / LANES) * 100}%`, width: `${100 / LANES}%`, padding: "0 5px", boxSizing: "border-box", pointerEvents: "none" }}>
                  {ob.kind === "answer" ? (
                    <div style={{
                      background: "rgba(255,255,255,0.96)", color: "#1e1b3a", borderRadius: 10, padding: "8px 7px",
                      fontSize: "clamp(11px, 1.6vw, 13px)", fontWeight: 700, textAlign: "center", boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
                      lineHeight: 1.25, minHeight: 46, wordBreak: "break-word", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{ob.letter}. {ob.text}</div>
                  ) : (
                    <div style={{ fontSize: 30, textAlign: "center", filter: ob.kind === "power" ? "drop-shadow(0 0 8px #a855f7)" : "none" }}>{ob.icon}</div>
                  )}
                </div>
              ))}

              {popup && (
                <div key={popup.id} style={{
                  position: "absolute", top: carY - 30, left: `${(popup.lane / LANES) * 100 + 100 / LANES / 2}%`, transform: "translateX(-50%)",
                  fontSize: 20, fontWeight: 800, color: popup.good ? "#4ade80" : "#f87171",
                  textShadow: "0 2px 6px rgba(0,0,0,0.5)", animation: "popupFloat 0.65s ease-out forwards", pointerEvents: "none",
                }}>{popup.text}</div>
              )}

              <div style={{ position: "absolute", top: carY, left: `${(lane / LANES) * 100}%`, width: `${100 / LANES}%`, display: "flex", justifyContent: "center", transition: "left 0.12s cubic-bezier(0.4,0,0.2,1), top 0.1s linear", pointerEvents: "none" }}>
                <div style={{ animation: "carIdle 1.2s ease-in-out infinite" }}>
                  <div style={{
                    fontSize: 36, transform: `${carHit === "good" ? "scale(1.35)" : carHit === "bad" ? "scale(0.85)" : "scale(1)"} rotate(${tilt + (carHit === "bad" ? -10 : 0)}deg)`,
                    filter: shield ? "drop-shadow(0 0 10px #38bdf8)" : carHit === "good" ? "drop-shadow(0 0 12px #22c55e)" : carHit === "bad" ? "drop-shadow(0 0 12px #ef4444)" : "drop-shadow(0 2px 6px rgba(0,0,0,0.4))",
                    transition: "transform 0.15s, filter 0.15s",
                  }}>🏎️</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.6)", flexWrap: "wrap", gap: 6 }}>
              <span>{readFrac > 0 ? "📖 Reading…" : "🏁 Answer!"}</span>
              <span>Streak: {streak}</span>
              <span>{banner?.subject ? `${banner.subject}${banner.year ? " · " + banner.year : ""}` : ""}</span>
            </div>
            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>Drag anywhere on the track to move your car</p>
          </div>
        )}

        {!loadError && phase === "over" && (
          <div style={{ textAlign: "center", maxWidth: 420 }} className="anim-fade-up">
            <div style={{ fontSize: 56, marginBottom: 10 }}>🏁</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Race over!</h2>
            <p style={{ fontSize: 32, fontWeight: 800, color: "#A855F7", margin: "6px 0" }}>{score} pts</p>
            {score >= best && score > 0 && <p style={{ fontSize: 13, color: "#fbbf24", marginBottom: 10 }}>🏆 New best score!</p>}
            {score < best && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>Best: {best}</p>}
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 22 }}>Questions answered: {qDone}</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={startGame} style={{ padding: "12px 26px", borderRadius: 10, fontSize: 14, fontWeight: 800, background: "linear-gradient(135deg,#8B5CF6,#A855F7)", color: "#fff", border: "none", cursor: "pointer" }}>Race Again 🔁</button>
              <button onClick={() => setPhase("setup")} style={{ padding: "12px 26px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}>Change filters</button>
              <button onClick={onClose} style={{ padding: "12px 26px", borderRadius: 10, fontSize: 14, fontWeight: 700, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}>Exit</button>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes roadScroll { from { transform: translateY(0); } to { transform: translateY(60px); } }
        @keyframes popupFloat { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -34px); } }
        @keyframes carIdle { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      `}</style>
    </div>
  );
}
