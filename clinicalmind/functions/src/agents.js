// ─── The two SuperSummary agents ─────────────────────────────────────────────
//  learn  — reads a batch of the doctor's de-identified summaries, classifies
//           them, and maintains the doctor's /memories notes (style, per-
//           diagnosis and per-consultant preferences, what they add / remove).
//  draft  — writes a new discharge summary using ONLY the doctor's inputs, their
//           memory notes, past examples and template; every line carries a source,
//           which verify.js then checks.
import { z } from "zod";
import { runAgent, ToolError } from "./harness.js";
import { FirestoreMemoryStore } from "./memoryStore.js";
import { verifyDraft } from "./verify.js";

export const LEARN_BATCH = 10;

export function slugCategory(c) {
  return String(c || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

// ── Learn ────────────────────────────────────────────────────────────────────
const LEARN_SYSTEM = `You are the personal documentation assistant of one doctor (paediatrics, Indian government hospital). Your job right now is to LEARN how this doctor writes discharge summaries, by reading their past summaries and keeping well-organised notes in your memory directory. A separate drafting step will later rely only on these notes, so they must be accurate, specific and useful.

Memory layout (keep it tidy; create files as needed):
- /memories/README.md — short index: which files exist, what each covers, how many summaries each is based on.
- /memories/style.md — doctor-wide habits: section order and headings, abbreviations, formatting (e.g. vitals on one line), tone, length, standard phrases.
- /memories/categories/<diagnosis>.md — one file per diagnosis/patient category (e.g. neonatal-jaundice.md, acute-gastroenteritis.md): what this doctor always includes, usual investigations reported, usual treatment and discharge advice (drugs with the doses/durations they actually write), follow-up timing, typical phrases, and what they leave out.
- /memories/doctors/<consultant>.md — only when summaries are labelled with a consultant/unit whose preferences differ.
- /memories/edits.md — lessons from AI drafts the doctor corrected: what they added, removed or reworded, and why it matters.

How to learn well:
- Always start by viewing /memories to see what you already know, and read the files you are about to change. Update existing notes rather than duplicating them.
- Record patterns, not individual cases. Tag each rule with how often you have seen it, e.g. "(7/8 summaries)", and update the counts as more summaries arrive. Mark one-off observations as "(seen once — unconfirmed)".
- When a summary contradicts a note, update the note to reflect the change (newer summaries reflect current practice) rather than keeping both.
- For summaries with source "final" and an AI draft attached, compare the two carefully: what the doctor added, deleted or changed is the most valuable signal. Write these into /memories/edits.md and the relevant category file.
- If a summary has no category, decide the most specific sensible diagnosis category and call set_summary_category. Reuse existing category names when they fit.
- Never write patient identifiers (names, hospital numbers, phone, address, dates of birth) or patient-specific facts into memory. Write the general rule instead ("documents bilirubin with day of life"), not the case ("baby had bilirubin 18.2").
- Do not invent medical content that is not in the summaries.

When you have processed every summary in this batch, call finish_learning with a short plain-language report for the doctor of what you learned or changed.`;

const setCategorySchema = z.object({ summary_id: z.string().min(1), category: z.string().min(2).max(80) });
const finishLearnSchema = z.object({ report: z.string().min(1).max(4000) });

export async function runLearning({ client, db, uid, summaries, onEvent, signal }) {
  const memory = new FirestoreMemoryStore(db, uid, { actor: "agent" });
  const byId = new Map(summaries.map(s => [s.id, s]));
  const categorized = new Map();

  const tools = {
    set_summary_category: {
      description: "Assign a diagnosis/patient category to one of the summaries in this batch (used when it has none, or the existing one is clearly wrong).",
      inputSchema: { type: "object", properties: { summary_id: { type: "string" }, category: { type: "string", description: "Short diagnosis category, e.g. 'Neonatal jaundice'" } }, required: ["summary_id", "category"], additionalProperties: false },
      schema: setCategorySchema,
      run: async ({ summary_id, category }) => {
        if (!byId.has(summary_id)) throw new ToolError(`summary_id ${summary_id} is not in this batch`);
        const c = slugCategory(category);
        await db.doc(`users/${uid}/summaries/${summary_id}`).update({ category: c, categorySource: "agent" });
        categorized.set(summary_id, c);
        return { content: `Summary ${summary_id} categorised as "${c}".` };
      },
    },
    finish_learning: {
      description: "Call once, after all summaries in this batch are reflected in memory. Ends the learning session.",
      inputSchema: { type: "object", properties: { report: { type: "string", description: "Plain-language report for the doctor: what was learned or changed." } }, required: ["report"], additionalProperties: false },
      schema: finishLearnSchema,
      run: async ({ report }) => ({ content: "Learning session finished.", done: true, value: { report } }),
    },
  };

  const batchText = summaries.map(s => {
    const meta = [`id: ${s.id}`, `category: ${s.category || "(none — please classify)"}`, s.doctorLabel ? `consultant/unit: ${s.doctorLabel}` : null, `source: ${s.source}`].filter(Boolean).join(" | ");
    const draft = s.aiDraft ? `\n<ai_draft_before_doctor_edits>\n${s.aiDraft}\n</ai_draft_before_doctor_edits>` : "";
    return `<summary ${meta}>\n${s.text}${draft}\n</summary>`;
  }).join("\n\n");

  const result = await runAgent({
    client, signal, onEvent, memory, tools,
    system: LEARN_SYSTEM,
    effort: "high",
    maxTurns: 60,
    messages: [{ role: "user", content: `Here are ${summaries.length} discharge summaries written by me (already de-identified). Learn from them and update your memory.\n\n${batchText}` }],
  });

  return {
    report: result.value?.report || result.text || "Learning finished.",
    finished: result.finished,
    categorized: Object.fromEntries(categorized),
    changes: memory.changes,
    usage: result.usage,
    turns: result.turns,
  };
}

// ── Draft ────────────────────────────────────────────────────────────────────
const DRAFT_SYSTEM = `You draft discharge summaries for one doctor, in exactly their style. You must not hallucinate: every line you write needs a source, and an automated checker will verify each claim. Unverifiable lines are shown to the doctor in red.

Your sources, and the only places content may come from:
- "input": the reports and notes the doctor gave for THIS patient. Put an exact, verbatim quote from the inputs in "evidence" (short, but enough to support the line). Every number in the line (lab values, weights, days, doses) must appear in the inputs.
- "memory": the doctor's own habits from your memory files (standard advice, usual drugs and doses, follow-up timing, phrasing). Put the memory file path in "evidence", e.g. /memories/categories/acute-gastroenteritis.md. You must have viewed that file in this session, and any number must appear in that file.
- "template": fixed wording from the doctor's template (evidence can be "").
- "missing": something the summary needs that the inputs don't contain — write what is needed (e.g. "Discharge weight not provided"), never a guessed value. Also list it in "missing".

Process:
1. View /memories, then read /memories/style.md, the category file for this diagnosis, edits.md, and the consultant file if one is given. Use get_past_examples to see 1–2 of the doctor's real summaries for this category.
2. Write the summary following the doctor's section order and style. One line per fact or sentence.
3. Patient-specific facts (history, findings, labs, treatment given, course) must come from the inputs only. Memory provides habits and standard advice, never facts about this patient.
4. Put genuine clinical concerns (e.g. an abnormal value not addressed, a dose that looks wrong for the weight) in "warnings".
5. Call submit_draft once with the complete draft. Memory is read-only here.`;

const lineSchema = z.object({
  text: z.string().min(1),
  source: z.enum(["input", "memory", "template", "missing"]),
  evidence: z.string(),
});
const draftSchema = z.object({
  sections: z.array(z.object({ heading: z.string().min(1), lines: z.array(lineSchema) })).min(1),
  missing: z.array(z.string()),
  warnings: z.array(z.string()),
});

const DRAFT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections", "missing", "warnings"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["heading", "lines"],
        properties: {
          heading: { type: "string" },
          lines: {
            type: "array",
            items: {
              type: "object", additionalProperties: false, required: ["text", "source", "evidence"],
              properties: {
                text: { type: "string" },
                source: { type: "string", enum: ["input", "memory", "template", "missing"] },
                evidence: { type: "string", description: "input: verbatim quote from inputs; memory: memory file path; template/missing: may be empty" },
              },
            },
          },
        },
      },
    },
    missing: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
};

export async function runDrafting({ client, db, uid, category, doctorLabel, inputs, template, onEvent, signal }) {
  const memory = new FirestoreMemoryStore(db, uid, { readOnly: true, actor: "agent" });

  const tools = {
    get_past_examples: {
      description: "Fetch up to 2 of this doctor's own past discharge summaries (de-identified) for a category, to copy their structure and wording.",
      inputSchema: { type: "object", properties: { category: { type: "string" } }, required: ["category"], additionalProperties: false },
      schema: z.object({ category: z.string().min(1) }),
      run: async ({ category: cat }) => {
        const snap = await db.collection(`users/${uid}/summaries`).where("category", "==", slugCategory(cat)).orderBy("createdAt", "desc").limit(6).get();
        const docs = snap.docs.map(d => d.data()).sort((a, b) => (b.source === "final") - (a.source === "final")).slice(0, 2);
        if (!docs.length) return { content: `No past summaries in category "${cat}". Rely on /memories/style.md.` };
        return { content: docs.map((d, i) => `<example ${i + 1}>\n${d.text}\n</example>`).join("\n\n") };
      },
    },
    submit_draft: {
      description: "Submit the finished draft. Call exactly once, at the end.",
      inputSchema: DRAFT_INPUT_SCHEMA,
      schema: draftSchema,
      run: async (draft) => ({ content: "Draft received.", done: true, value: draft }),
    },
  };

  const user = [
    `Draft a discharge summary.`,
    `Diagnosis/category: ${category || "(not given — infer from inputs)"}`,
    doctorLabel ? `Consultant/unit: ${doctorLabel}` : null,
    template ? `<template>\n${template}\n</template>` : `No template given — follow the doctor's usual structure from memory.`,
    `<inputs>\n${inputs}\n</inputs>`,
  ].filter(Boolean).join("\n\n");

  const result = await runAgent({
    client, signal, onEvent, memory, tools,
    system: DRAFT_SYSTEM,
    effort: "high",
    maxTurns: 25,
    messages: [{ role: "user", content: user }],
  });
  if (!result.finished) throw new ToolError("The agent stopped without submitting a draft. Please try again.");

  const files = await memory.listAll();
  const memoryFiles = Object.fromEntries(files.map(f => [f.path, f.content]));
  const verified = verifyDraft(result.value, { inputs, template: template || "", memoryFiles, readPaths: memory.readPaths });
  return { draft: verified, usage: result.usage, turns: result.turns, memoryRead: [...memory.readPaths] };
}
