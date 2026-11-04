// ─── ClinicFlow Notebook agent ───────────────────────────────────────────────
// The doctor types the patient's complaints ("cough 5 days, fever 10 days") or a
// question. The agent searches the doctor's own books, reads the relevant pages and
// answers with citations: every point carries passage IDs + verbatim quotes.
// verifyNotebookAnswer() then checks each quote against the actual page text, so
// the doctor only sees "✓ verified" citations that really exist in their books.
import { z } from "zod";
import { runAgent, ToolError } from "./harness.js";
import { normText } from "./books.js";

const NOTEBOOK_SYSTEM = `You are the doctor's personal notebook for their own medical books (like NotebookLM). A paediatric patient is in front of the doctor in an Indian government hospital OPD. You answer ONLY from the doctor's books, and you show exactly where every point comes from.

How to work:
- Search the books several times with different queries: the complaints in textbook terms, the likely diagnoses, the age group (newborn / infant / child), red flags, and investigations. Read whole pages (read_page) when a passage looks important.
- Think like a clinician about what these complaints together suggest for this age, but every clinical point you state must be supported by a passage you actually retrieved.
- For each point give one or more citations: the passage_id exactly as shown (e.g. B1-p412-2) and a SHORT verbatim quote (5–35 words) copied character-for-character from that passage. An automated checker rejects quotes that are not on that page.
- If the books do not cover something important, say so in not_in_books instead of guessing. Only if it is essential for safety may you add a point with no citations; it will be shown to the doctor as "general knowledge — not from your books".
- Be concise and practical: what it likely is, why (from the books), what to ask or examine next, which red flags to rule out.

Finish by calling submit_answer exactly once.`;

const citation = z.object({ passage_id: z.string().min(1), quote: z.string().min(1) });
const point = z.object({ text: z.string().min(1), citations: z.array(citation) });
const answerSchema = z.object({
  summary: z.array(point),
  differentials: z.array(z.object({ name: z.string().min(1), likelihood: z.enum(["high", "medium", "low"]), points: z.array(point) })),
  ask_next: z.array(point),
  red_flags: z.array(point),
  not_in_books: z.array(z.string()),
});

const POINT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["text", "citations"],
  properties: {
    text: { type: "string" },
    citations: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["passage_id", "quote"],
        properties: { passage_id: { type: "string", description: "e.g. B1-p412-2, exactly as shown in search results" }, quote: { type: "string", description: "5–35 words copied verbatim from that passage" } } },
    },
  },
};
const ANSWER_INPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["summary", "differentials", "ask_next", "red_flags", "not_in_books"],
  properties: {
    summary: { type: "array", items: POINT_SCHEMA, description: "2–5 points: what these complaints mean for this patient, per the books" },
    differentials: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "likelihood", "points"],
        properties: { name: { type: "string" }, likelihood: { type: "string", enum: ["high", "medium", "low"] }, points: { type: "array", items: POINT_SCHEMA } } },
    },
    ask_next: { type: "array", items: POINT_SCHEMA, description: "history questions / examination findings to check next" },
    red_flags: { type: "array", items: POINT_SCHEMA },
    not_in_books: { type: "array", items: { type: "string" } },
  },
};

const fmtPassage = (index, p) => `[${p.id}] (${index.title(p.bookId)}, page ${p.page})\n${p.text}`;

export async function runNotebook({ client, index, patient = {}, complaints = "", question = "", history = [], onEvent, signal }) {
  const seen = new Set(); // passage IDs actually shown to the model

  const tools = {
    search_books: {
      description: "Search the doctor's books. Returns the best-matching passages with their passage_id, book and page. Use textbook terms; try several queries.",
      inputSchema: { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string" }, limit: { type: "integer", description: "1–10, default 8" } } },
      schema: z.object({ query: z.string().min(2), limit: z.number().int().min(1).max(10).optional() }),
      run: async ({ query, limit }) => {
        const hits = index.search(query, limit || 8);
        hits.forEach(h => seen.add(h.id));
        if (!hits.length) return { content: `No passages found for "${query}". Try other words (synonyms, the textbook name of the condition).` };
        return { content: hits.map(h => fmtPassage(index, h)).join("\n\n---\n\n") };
      },
    },
    read_page: {
      description: "Read the whole page that a passage comes from (all its passages with their IDs).",
      inputSchema: { type: "object", additionalProperties: false, required: ["passage_id"], properties: { passage_id: { type: "string" } } },
      schema: z.object({ passage_id: z.string().min(1) }),
      run: async ({ passage_id }) => {
        const p = index.byId.get(passage_id);
        if (!p) throw new ToolError(`Unknown passage_id ${passage_id}. Use an ID from search results.`);
        const all = index.pagePassages(p.bookId, p.page);
        all.forEach(x => seen.add(x.id));
        return { content: `${index.title(p.bookId)}, page ${p.page}:\n\n` + all.map(x => `[${x.id}]\n${x.text}`).join("\n\n") };
      },
    },
    submit_answer: {
      description: "Submit the final cited answer. Call exactly once, at the end.",
      inputSchema: ANSWER_INPUT_SCHEMA,
      schema: answerSchema,
      run: async (answer) => ({ content: "Answer received.", done: true, value: answer }),
    },
  };

  const books = [...index.books.values()].map(b => `${b.label}: ${b.title} (${b.pages.size} pages)`).join("\n");
  const prior = history.slice(-3).map((h, i) => `Earlier question ${i + 1}: ${h.q}\nEarlier answer (short): ${h.a}`).join("\n\n");
  const user = [
    `Doctor's books:\n${books}`,
    `Patient: ${[patient.age && `age ${patient.age}`, patient.sex].filter(Boolean).join(", ") || "not specified"}`,
    complaints && `Complaints: ${complaints}`,
    question && `Doctor's question: ${question}`,
    prior && `Earlier in this consultation:\n${prior}`,
  ].filter(Boolean).join("\n\n");

  const result = await runAgent({
    client, signal, onEvent, tools,
    system: NOTEBOOK_SYSTEM,
    effort: "high",
    maxTurns: 20,
    messages: [{ role: "user", content: user }],
  });
  if (!result.finished) throw new ToolError("The notebook stopped without an answer. Please try again.");
  return { answer: verifyNotebookAnswer(result.value, index, seen), usage: result.usage, turns: result.turns };
}

// ── Citation verification ────────────────────────────────────────────────────
export function verifyNotebookAnswer(answer, index, seen) {
  const pages = {};      // "bookId:page" → { bookId, title, page, text }
  const stats = { verified: 0, failed: 0, uncited: 0 };

  const checkCitation = (c) => {
    const p = index.byId.get(c.passage_id);
    const out = { passageId: c.passage_id, quote: c.quote, verified: false, reason: "" };
    if (!p) { out.reason = "this passage does not exist in your books"; return out; }
    out.bookId = p.bookId; out.page = p.page; out.book = index.title(p.bookId);
    if (!seen.has(c.passage_id)) { out.reason = "the notebook cited a passage it never retrieved"; return out; }
    const pageText = index.pageText(p.bookId, p.page) || "";
    const q = normText(c.quote);
    if (q.split(" ").length < 3) { out.reason = "quote too short to check"; return out; }
    if (!normText(pageText).includes(q)) { out.reason = "this exact text is not on that page"; return out; }
    out.verified = true;
    pages[`${p.bookId}:${p.page}`] = { bookId: p.bookId, title: out.book, page: p.page, text: pageText };
    return out;
  };

  const checkPoint = (pt) => {
    const citations = pt.citations.map(checkCitation);
    const ok = citations.filter(c => c.verified).length;
    const status = !citations.length ? "uncited" : ok === citations.length ? "verified" : ok ? "partial" : "failed";
    if (status === "uncited") stats.uncited++; else if (status === "failed") stats.failed++; else stats.verified++;
    return { text: pt.text, status, citations };
  };

  return {
    summary: answer.summary.map(checkPoint),
    differentials: answer.differentials.map(d => ({ name: d.name, likelihood: d.likelihood, points: d.points.map(checkPoint) })),
    askNext: answer.ask_next.map(checkPoint),
    redFlags: answer.red_flags.map(checkPoint),
    notInBooks: answer.not_in_books,
    pages,
    stats,
  };
}
