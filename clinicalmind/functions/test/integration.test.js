// Integration tests against the Firestore emulator with a scripted fake Claude client.
// Run: npm run test:integration   (starts the Firestore emulator for the duration)
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { FirestoreMemoryStore, MemoryError } from "../src/memoryStore.js";
import { runLearning, runDrafting } from "../src/agents.js";
import { runAgent, AgentError } from "../src/harness.js";

process.env.GCLOUD_PROJECT ||= "demo-superclinic";
initializeApp({ projectId: "demo-superclinic" });
const db = getFirestore();
const uid = "test-" + Date.now();

// Fake Anthropic client: each call to stream() pops the next scripted turn.
// A turn is a function (params) => array of content blocks (+ optional stop_reason).
function fakeClient(turns) {
  const calls = [];
  return {
    calls,
    beta: { messages: { stream(params) {
      calls.push(structuredClone(params));
      const turn = turns.shift();
      if (!turn) throw new Error("fake client: no more scripted turns");
      const out = turn(params);
      const content = Array.isArray(out) ? out : out.content;
      const stop_reason = out.stop_reason || (content.some(b => b.type === "tool_use") ? "tool_use" : "end_turn");
      return { finalMessage: async () => ({ content, stop_reason, usage: { input_tokens: 100, output_tokens: 50 } }) };
    } } },
  };
}
let n = 0;
const tool = (name, input) => ({ type: "tool_use", id: `tu_${++n}`, name, input });
const mem = (input) => tool("memory", input);

before(async () => {
  await db.doc(`users/${uid}`).set({ pendingSummaries: 0 });
});

test("memory store implements the memory tool commands", async () => {
  const m = new FirestoreMemoryStore(db, uid);
  assert.match(await m.execute({ command: "view", path: "/memories" }), /empty/);
  await m.execute({ command: "create", path: "/memories/style.md", file_text: "# Style\nVitals on one line\nAbbrev: Inj." });
  assert.match(await m.execute({ command: "view", path: "/memories/style.md" }), /^\s+1\t# Style\n\s+2\tVitals on one line/);
  assert.match(await m.execute({ command: "view", path: "/memories/style.md", view_range: [2, 2] }), /^\s+2\tVitals on one line$/);
  await m.execute({ command: "str_replace", path: "/memories/style.md", old_str: "Abbrev: Inj.", new_str: "Writes 'Inj.' not 'Injection' (3/3)" });
  await m.execute({ command: "insert", path: "/memories/style.md", insert_line: 1, insert_text: "Headings in CAPS" });
  assert.equal((await m.get("/memories/style.md")).content, "# Style\nHeadings in CAPS\nVitals on one line\nWrites 'Inj.' not 'Injection' (3/3)");
  await m.execute({ command: "create", path: "/memories/categories/tmp.md", file_text: "x" });
  await m.execute({ command: "rename", old_path: "/memories/categories/tmp.md", new_path: "/memories/categories/age.md" });
  assert.match(await m.execute({ command: "view", path: "/memories" }), /\/memories\/categories\/age\.md[\s\S]*\/memories\/style\.md/);
  await m.execute({ command: "delete", path: "/memories/categories" });
  assert.equal(await m.get("/memories/categories/age.md"), null);
  // Identifiers are stripped from memory writes
  const r = await m.execute({ command: "create", path: "/memories/leak.md", file_text: "Mother's name: Sita\nCall 9876543210" });
  assert.match(r, /identifier/);
  assert.ok(!(await m.get("/memories/leak.md")).content.includes("9876543210"));
  await m.execute({ command: "delete", path: "/memories/leak.md" });
  // Errors are surfaced as MemoryError (sent back to the model as is_error)
  await assert.rejects(m.execute({ command: "view", path: "/etc/passwd" }), MemoryError);
  await assert.rejects(m.execute({ command: "str_replace", path: "/memories/style.md", old_str: "nope", new_str: "x" }), /did not appear/);
  await assert.rejects(new FirestoreMemoryStore(db, uid, { readOnly: true }).execute({ command: "create", path: "/memories/a.md", file_text: "x" }), /read-only/);
});

test("learning agent classifies summaries and writes memory", async () => {
  const col = db.collection(`users/${uid}/summaries`);
  const s1 = await col.add({ text: "DIAGNOSIS: Acute gastroenteritis with some dehydration\nADVICE: ORS, Zinc 20 mg OD x 14 days", category: null, source: "upload", createdAt: FieldValue.serverTimestamp(), learnedAt: null });
  const s2 = await col.add({ text: "DIAGNOSIS: AGE\nADVICE: ORS, Zinc 20 mg x 14 days. Review SOS.", category: "Acute gastroenteritis", source: "final", aiDraft: "ADVICE: ORS", createdAt: FieldValue.serverTimestamp(), learnedAt: null });
  const summaries = [{ id: s1.id, ...(await s1.get()).data() }, { id: s2.id, ...(await s2.get()).data() }];

  const fc = fakeClient([
    () => [{ type: "text", text: "Checking memory." }, mem({ command: "view", path: "/memories" })],
    () => [
      tool("set_summary_category", { summary_id: s1.id, category: "Acute gastroenteritis" }),
      tool("set_summary_category", { summary_id: "not-in-batch", category: "X" }),
      mem({ command: "create", path: "/memories/categories/acute-gastroenteritis.md", file_text: "# Acute gastroenteritis\n- Advice: ORS + Zinc 20 mg OD x 14 days (2/2)\n- Adds 'Review SOS' when AI omits it (1 edit)" }),
    ],
    (params) => {
      // Parallel tool results must come back in ONE user message, with the bad id flagged as an error.
      const last = params.messages.at(-1);
      assert.equal(last.role, "user");
      assert.equal(last.content.length, 3);
      assert.equal(last.content[1].is_error, true);
      return [tool("finish_learning", { report: "Learned your AGE discharge advice." })];
    },
  ]);
  const events = [];
  const res = await runLearning({ client: fc, db, uid, summaries, onEvent: e => events.push(e) });

  assert.equal(res.report, "Learned your AGE discharge advice.");
  assert.deepEqual(res.categorized, { [s1.id]: "Acute gastroenteritis" });
  assert.equal((await s1.get()).data().category, "Acute gastroenteritis");
  assert.ok((await db.doc(`users/${uid}/memories/${encodeURIComponent("/memories/categories/acute-gastroenteritis.md")}`).get()).exists);
  assert.ok(events.some(e => e.type === "tool" && e.summary.startsWith("create /memories/categories")));
  // Request shape: memory tool declared, model + fallback + adaptive thinking, AI draft shown to the agent
  const p = fc.calls[0];
  assert.equal(p.model, "claude-opus-5-5");
  assert.deepEqual(p.tools[0], { type: "memory_20250818", name: "memory" });
  assert.equal(p.fallbacks, "default");
  assert.deepEqual(p.thinking, { type: "adaptive" });
  assert.match(p.messages[0].content, /<ai_draft_before_doctor_edits>/);
});

test("drafting agent output is verified line by line", async () => {
  const m = new FirestoreMemoryStore(db, uid);
  await m.execute({ command: "create", path: "/memories/style.md", file_text: "Sections: DIAGNOSIS, INVESTIGATIONS, ADVICE" });
  const inputs = "Hb 10.4 g/dL, TLC 13200. 6 loose stools/day. Weight 8 kg.";
  const fc = fakeClient([
    () => [mem({ command: "view", path: "/memories/categories/acute-gastroenteritis.md" }), mem({ command: "view", path: "/memories/style.md" })],
    () => [mem({ command: "create", path: "/memories/sneaky.md", file_text: "x" })], // must be refused (read-only)
    (params) => {
      assert.equal(params.messages.at(-1).content[0].is_error, true);
      return [tool("get_past_examples", { category: "Acute gastroenteritis" })];
    },
    (params) => {
      assert.match(params.messages.at(-1).content[0].content, /Zinc 20 mg/); // past example returned
      return [tool("submit_draft", {
        sections: [
          { heading: "Investigations", lines: [
            { text: "Hb 10.4 g/dL, TLC 13200", source: "input", evidence: "Hb 10.4 g/dL, TLC 13200" },
            { text: "Serum Na 131 mEq/L", source: "input", evidence: "Na 131" },
          ] },
          { heading: "Advice", lines: [
            { text: "ORS + Zinc 20 mg OD x 14 days", source: "memory", evidence: "/memories/categories/acute-gastroenteritis.md" },
            { text: "Discharge weight not given", source: "missing", evidence: "" },
          ] },
        ],
        missing: ["Discharge weight"], warnings: [],
      })];
    },
  ]);
  const res = await runDrafting({ client: fc, db, uid, category: "Acute gastroenteritis", inputs, template: "" });
  const lines = res.draft.sections.flatMap(s => s.lines);
  assert.deepEqual(lines.map(l => l.source), ["input", "unverified", "memory", "missing"]);
  assert.match(lines[1].reason, /not in your reports/);
  assert.equal(await m.get("/memories/sneaky.md"), null);
  assert.ok(res.memoryRead.includes("/memories/style.md"));
});

test("harness: invalid custom-tool input is returned as an error, refusal and max turns stop the run", async () => {
  const { z } = await import("zod");
  const tools = { submit: { description: "d", inputSchema: { type: "object" }, schema: z.object({ n: z.number() }), run: async (i) => ({ content: "ok", done: true, value: i }) } };
  let fc = fakeClient([
    () => [tool("submit", { n: "not a number" })],
    (params) => { assert.match(params.messages.at(-1).content[0].content, /Invalid input for submit/); return [tool("submit", { n: 3 })]; },
  ]);
  const r = await runAgent({ client: fc, system: "s", messages: [{ role: "user", content: "go" }], tools });
  assert.deepEqual(r.value, { n: 3 });

  fc = fakeClient([() => ({ content: [], stop_reason: "refusal" })]);
  await assert.rejects(runAgent({ client: fc, system: "s", messages: [{ role: "user", content: "go" }], tools }), (e) => e instanceof AgentError && e.code === "refusal");

  fc = fakeClient([() => [mem({ command: "view", path: "/memories" })], () => [mem({ command: "view", path: "/memories" })]]);
  await assert.rejects(runAgent({ client: fc, system: "s", messages: [{ role: "user", content: "go" }], memory: new FirestoreMemoryStore(db, uid), maxTurns: 2 }), (e) => e.code === "max_turns");
});
