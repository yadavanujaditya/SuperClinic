// ─── SuperClinic Cloud Functions ─────────────────────────────────────────────
//   addSummaries   (callable)  de-identify + store the doctor's past/final summaries
//   startLearning  (callable)  queue a learning run
//   runAgentJob    (trigger)   executes queued learning runs, streams progress to the run doc,
//                              chains follow-up runs until every summary is learned
//   draftSummary   (callable)  draft a new summary from inputs + memory, verified line by line
//   nightlyLearning(schedule)  02:00 IST: queue learning for doctors with new summaries
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import Anthropic from "@anthropic-ai/sdk";
import { deidentify } from "./deidentify.js";
import { runLearning, runDrafting, LEARN_BATCH, slugCategory } from "./agents.js";
import { AgentError } from "./harness.js";

initializeApp();
const db = getFirestore();
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

setGlobalOptions({ region: "asia-south1", maxInstances: 20 });

export const LIMITS = {
  summariesPerCall: 50,
  summaryChars: [80, 60_000],
  inputChars: 80_000,
  draftsPerDay: 60,
  learnRunsPerDay: 40,
  maxLogEntries: 150,
};

const client = () => new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 3, timeout: 8 * 60 * 1000 });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD IST

function requireUser(req) {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Please sign in to use your agent.");
  return req.auth.uid;
}

// Atomically count one unit of `field` against today's quota.
async function consumeQuota(uid, field, limit) {
  const ref = db.doc(`users/${uid}/usage/${today()}`);
  await db.runTransaction(async tx => {
    const cur = (await tx.get(ref)).data()?.[field] || 0;
    if (cur >= limit) throw new HttpsError("resource-exhausted", `Daily limit reached (${limit}). It resets at midnight IST.`);
    tx.set(ref, { [field]: cur + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function recordTokens(uid, usage) {
  if (!usage) return;
  await db.doc(`users/${uid}/usage/${today()}`).set({
    inputTokens: FieldValue.increment(usage.input_tokens || 0),
    outputTokens: FieldValue.increment(usage.output_tokens || 0),
    cacheReadTokens: FieldValue.increment(usage.cache_read_input_tokens || 0),
  }, { merge: true });
}

async function countPending(uid) {
  return (await db.collection(`users/${uid}/summaries`).where("learnedAt", "==", null).count().get()).data().count;
}

async function hasActiveLearnRun(uid) {
  const since = Timestamp.fromMillis(Date.now() - 20 * 60 * 1000);
  const snap = await db.collection(`users/${uid}/agentRuns`)
    .where("kind", "==", "learn").where("status", "in", ["queued", "running"]).where("createdAt", ">", since).limit(1).get();
  return !snap.empty;
}

// ── addSummaries ─────────────────────────────────────────────────────────────
export const addSummaries = onCall({ timeoutSeconds: 60, memory: "512MiB" }, async (req) => {
  const uid = requireUser(req);
  const list = req.data?.summaries;
  if (!Array.isArray(list) || !list.length) throw new HttpsError("invalid-argument", "summaries must be a non-empty array");
  if (list.length > LIMITS.summariesPerCall) throw new HttpsError("invalid-argument", `At most ${LIMITS.summariesPerCall} summaries per upload`);

  const batch = db.batch();
  const out = [];
  for (const [i, s] of list.entries()) {
    const raw = typeof s?.text === "string" ? s.text.trim() : "";
    if (raw.length < LIMITS.summaryChars[0] || raw.length > LIMITS.summaryChars[1]) {
      throw new HttpsError("invalid-argument", `Summary ${i + 1} must be ${LIMITS.summaryChars[0]}–${LIMITS.summaryChars[1]} characters`);
    }
    const source = s.source === "final" ? "final" : "upload";
    const clean = deidentify(raw);
    const draft = typeof s.aiDraft === "string" && s.aiDraft.trim() ? deidentify(s.aiDraft.slice(0, LIMITS.summaryChars[1])) : null;
    const ref = db.collection(`users/${uid}/summaries`).doc();
    const category = slugCategory(s.category);
    batch.set(ref, {
      text: clean.text,
      aiDraft: draft ? draft.text : null,
      category: category || null,
      categorySource: category ? "doctor" : null,
      doctorLabel: slugCategory(s.doctorLabel) || null,
      source,
      title: String(s.title || "").slice(0, 120) || null,
      identifiersRemoved: clean.removed + (draft?.removed || 0),
      createdAt: FieldValue.serverTimestamp(),
      learnedAt: null,
    });
    out.push({ id: ref.id, identifiersRemoved: clean.removed + (draft?.removed || 0) });
  }
  batch.set(db.doc(`users/${uid}`), { pendingSummaries: FieldValue.increment(list.length) }, { merge: true });
  await batch.commit();
  return { added: out };
});

// ── startLearning ────────────────────────────────────────────────────────────
export const startLearning = onCall({ timeoutSeconds: 30 }, async (req) => {
  const uid = requireUser(req);
  if (await hasActiveLearnRun(uid)) throw new HttpsError("already-exists", "Your agent is already learning. Watch the progress panel.");
  const pending = await countPending(uid);
  if (!pending) throw new HttpsError("failed-precondition", "Nothing new to learn — add some summaries first.");
  await consumeQuota(uid, "learnRuns", LIMITS.learnRunsPerDay);
  const ref = await db.collection(`users/${uid}/agentRuns`).add({
    kind: "learn", status: "queued", trigger: "manual", pendingAtStart: pending,
    createdAt: FieldValue.serverTimestamp(), log: [],
  });
  return { runId: ref.id, pending };
});

// ── runAgentJob: executes queued learning runs ──────────────────────────────
export const runAgentJob = onDocumentCreated(
  { document: "users/{uid}/agentRuns/{runId}", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "1GiB", retry: false },
  async (event) => {
    const { uid } = event.params;
    const ref = event.data.ref;
    if (event.data.data().kind !== "learn") return;

    // Claim the run (guards against duplicate trigger delivery).
    const claimed = await db.runTransaction(async tx => {
      const cur = (await tx.get(ref)).data();
      if (cur?.status !== "queued") return false;
      tx.update(ref, { status: "running", startedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) return;

    let logCount = 0;
    const onEvent = async (e) => {
      if (logCount >= LIMITS.maxLogEntries) return;
      logCount++;
      // Progress logging must never break the run: drop undefined fields, swallow write errors.
      const entry = Object.fromEntries(Object.entries({ ...e, at: Date.now() }).filter(([, v]) => v !== undefined));
      try { await ref.update({ log: FieldValue.arrayUnion(entry) }); }
      catch (err) { logger.warn("Could not write run log entry", { err: err.message }); }
    };

    try {
      const snap = await db.collection(`users/${uid}/summaries`).where("learnedAt", "==", null).orderBy("createdAt").limit(LEARN_BATCH).get();
      const summaries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!summaries.length) {
        await ref.update({ status: "done", report: "Nothing new to learn.", finishedAt: FieldValue.serverTimestamp() });
        return;
      }
      await ref.update({ summaryIds: summaries.map(s => s.id) });

      const res = await runLearning({ client: client(), db, uid, summaries, onEvent });

      const batch = db.batch();
      summaries.forEach(s => batch.update(db.doc(`users/${uid}/summaries/${s.id}`), { learnedAt: FieldValue.serverTimestamp(), learnedInRun: ref.id }));
      await batch.commit();
      const remaining = await countPending(uid);
      await db.doc(`users/${uid}`).set({ pendingSummaries: remaining, lastLearnedAt: FieldValue.serverTimestamp() }, { merge: true });
      await recordTokens(uid, res.usage);
      await ref.update({
        status: "done", report: res.report, changes: res.changes, categorized: res.categorized,
        usage: res.usage, turns: res.turns, remaining, finishedAt: FieldValue.serverTimestamp(),
      });

      // Chain the next batch so 50+ summaries are learned without the doctor re-clicking.
      if (remaining > 0) {
        try {
          await consumeQuota(uid, "learnRuns", LIMITS.learnRunsPerDay);
          await db.collection(`users/${uid}/agentRuns`).add({
            kind: "learn", status: "queued", trigger: "continue", previousRun: ref.id, pendingAtStart: remaining,
            createdAt: FieldValue.serverTimestamp(), log: [],
          });
        } catch (e) { logger.warn("Not chaining learning run", { uid, reason: e.message }); }
      }
    } catch (err) {
      const message = err instanceof AgentError ? err.message : "Something went wrong while learning. Please try again.";
      logger.error("Learning run failed", { uid, runId: ref.id, err: err?.message, code: err?.code });
      await ref.update({ status: "failed", error: message, errorCode: err?.code || "internal", finishedAt: FieldValue.serverTimestamp() });
    }
  },
);

// ── draftSummary ─────────────────────────────────────────────────────────────
export const draftSummary = onCall({ secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "1GiB" }, async (req) => {
  const uid = requireUser(req);
  const { category, doctorLabel, inputs, template } = req.data || {};
  if (typeof inputs !== "string" || inputs.trim().length < 20) throw new HttpsError("invalid-argument", "Add the patient's reports or notes first (at least a few lines).");
  if (inputs.length > LIMITS.inputChars) throw new HttpsError("invalid-argument", `Inputs too long (max ${LIMITS.inputChars} characters)`);
  if (template != null && (typeof template !== "string" || template.length > LIMITS.summaryChars[1])) throw new HttpsError("invalid-argument", "Template too long");
  await consumeQuota(uid, "drafts", LIMITS.draftsPerDay);

  // Patient inputs are de-identified before reaching the AI; the doctor re-adds identifiers on the final copy.
  const clean = deidentify(inputs);
  const runRef = db.collection(`users/${uid}/agentRuns`).doc();
  await runRef.set({ kind: "draft", status: "running", category: slugCategory(category) || null, createdAt: FieldValue.serverTimestamp() });
  try {
    const res = await runDrafting({
      client: client(), db, uid, category: slugCategory(category), doctorLabel: slugCategory(doctorLabel),
      inputs: clean.text, template: typeof template === "string" ? template : "",
    });
    await recordTokens(uid, res.usage);
    await runRef.update({ status: "done", stats: res.draft.stats, usage: res.usage, turns: res.turns, memoryRead: res.memoryRead, finishedAt: FieldValue.serverTimestamp() });
    return { runId: runRef.id, draft: res.draft, identifiersRemoved: clean.removed, memoryRead: res.memoryRead };
  } catch (err) {
    logger.error("Draft failed", { uid, err: err?.message, code: err?.code });
    await runRef.update({ status: "failed", error: err?.message || "failed", finishedAt: FieldValue.serverTimestamp() });
    if (err instanceof AgentError) throw new HttpsError(err.code === "rate_limited" ? "resource-exhausted" : "internal", err.message);
    throw new HttpsError("internal", err?.message || "Drafting failed. Please try again.");
  }
});

// ── nightlyLearning ──────────────────────────────────────────────────────────
export const nightlyLearning = onSchedule({ schedule: "0 2 * * *", timeZone: "Asia/Kolkata", timeoutSeconds: 300 }, async () => {
  const snap = await db.collection("users").where("pendingSummaries", ">", 0).limit(1000).get();
  let queued = 0;
  for (const u of snap.docs) {
    if (u.data().autoLearn === false) continue;
    if (await hasActiveLearnRun(u.id)) continue;
    try {
      await consumeQuota(u.id, "learnRuns", LIMITS.learnRunsPerDay);
      await db.collection(`users/${u.id}/agentRuns`).add({ kind: "learn", status: "queued", trigger: "nightly", createdAt: FieldValue.serverTimestamp(), log: [] });
      queued++;
    } catch (e) { logger.warn("Skip nightly learning", { uid: u.id, reason: e.message }); }
  }
  logger.info("Nightly learning queued", { queued });
});
