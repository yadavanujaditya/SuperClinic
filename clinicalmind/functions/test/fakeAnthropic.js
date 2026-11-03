// A deterministic stand-in for the Claude Messages API (streaming SSE), for local
// end-to-end tests without an API key or cost. It behaves like a tiny scripted agent:
//   learn mode  → view memory, classify unlabelled summaries, write style + category notes, finish
//   draft mode  → read memory, fetch past examples, submit a draft that includes one
//                 deliberately hallucinated line (so the verifier can be seen working)
// Usage:  node test/fakeAnthropic.js [port=4010]
// Then set ANTHROPIC_BASE_URL=http://127.0.0.1:4010 for the functions emulator.
import http from "node:http";

const PORT = Number(process.argv[2] || process.env.FAKE_ANTHROPIC_PORT || 4010);
let seq = 0;
const tu = (name, input) => ({ type: "tool_use", id: `toolu_fake_${++seq}`, name, input });
const text = (t) => ({ type: "text", text: t });

const lastToolResults = (messages) => {
  const last = messages.at(-1);
  return Array.isArray(last?.content) ? last.content.filter(b => b.type === "tool_result") : [];
};
const resultText = (r) => typeof r.content === "string" ? r.content : (r.content || []).map(c => c.text || "").join("\n");
const assistantTurns = (messages) => messages.filter(m => m.role === "assistant").length;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function learnTurn(body) {
  const t = assistantTurns(body.messages);
  const first = typeof body.messages[0].content === "string" ? body.messages[0].content : "";
  const summaries = [...first.matchAll(/<summary id: (\S+) \| category: ([^|>]+?)(?: \|[^>]*)?>\n([\s\S]*?)<\/summary>/g)]
    .map(m => ({ id: m[1], category: m[2].includes("(none") ? null : m[2].trim(), text: m[3] }));
  if (t === 0) return [text("Let me check what I already know."), tu("memory", { command: "view", path: "/memories" })];
  if (t === 1) {
    const calls = [];
    for (const s of summaries.filter(s => !s.category)) {
      const guess = /bronchiolitis/i.test(s.text) ? "Bronchiolitis" : /jaundice/i.test(s.text) ? "Neonatal jaundice" : "Acute gastroenteritis";
      s.category = guess;
      calls.push(tu("set_summary_category", { summary_id: s.id, category: guess }));
    }
    const byCat = new Map();
    for (const s of summaries) {
      if (!byCat.has(s.category)) byCat.set(s.category, []);
      byCat.get(s.category).push(s);
    }
    calls.push(tu("memory", { command: "create", path: "/memories/style.md", file_text:
      `# Writing style\n- Section headings in CAPITALS (${summaries.length}/${summaries.length})\n- Vitals written on one line\n- Uses abbreviations: Inj., Tab., Syp.` }));
    for (const [cat, list] of byCat) {
      const advice = [...new Set(list.flatMap(s => s.text.split("\n").filter(l => /zinc|ors|review|follow/i.test(l)).map(l => l.trim())))].slice(0, 6);
      calls.push(tu("memory", { command: "create", path: `/memories/categories/${slug(cat)}.md`, file_text:
        `# ${cat}\nBased on ${list.length} summaries.\n## Discharge advice this doctor writes\n${advice.map(a => `- ${a} (${list.length}/${list.length})`).join("\n") || "- (none seen yet)"}` }));
    }
    calls.push(tu("memory", { command: "create", path: "/memories/README.md", file_text: `# Index\n- style.md\n${[...byCat.keys()].map(c => `- categories/${slug(c)}.md`).join("\n")}` }));
    return [text("Writing notes."), ...calls];
  }
  return [tu("finish_learning", { report: `I read ${summaries.length} summaries. I noted your section style and your usual discharge advice for each diagnosis.` })];
}

function draftTurn(body) {
  const t = assistantTurns(body.messages);
  const first = typeof body.messages[0].content === "string" ? body.messages[0].content : "";
  const category = (first.match(/Diagnosis\/category: (.+)/) || [])[1]?.trim() || "Acute gastroenteritis";
  const catPath = `/memories/categories/${slug(category)}.md`;
  if (t === 0) return [tu("memory", { command: "view", path: "/memories" })];
  if (t === 1) return [tu("memory", { command: "view", path: "/memories/style.md" }), tu("memory", { command: "view", path: catPath })];
  if (t === 2) return [tu("get_past_examples", { category })];
  // Build the draft from the actual inputs + memory the agent "read".
  const inputs = (first.match(/<inputs>\n([\s\S]*?)\n<\/inputs>/) || [])[1] || "";
  const inputLines = inputs.split("\n").map(l => l.trim()).filter(l => l && !/^[A-Z ()._-]+:$/.test(l));
  const memView = body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(b => b.type === "tool_result").map(resultText).find(r => r.includes("Discharge advice")) || "";
  const adviceLines = memView.split("\n").map(l => l.replace(/^\s*\d+\t/, "")).filter(l => l.startsWith("- ")).map(l => l.slice(2).replace(/\s*\(\d+\/\d+\)$/, ""));
  return [tu("submit_draft", {
    sections: [
      { heading: "Diagnosis", lines: [{ text: category, source: "template", evidence: "" }] },
      { heading: "Clinical summary", lines: inputLines.slice(0, 4).map(l => ({ text: l, source: "input", evidence: l })) },
      { heading: "Investigations", lines: [{ text: "Serum sodium 131 mEq/L", source: "input", evidence: "Na 131 mEq/L" }] },
      { heading: "Advice at discharge", lines: [
        ...adviceLines.slice(0, 3).map(a => ({ text: a, source: "memory", evidence: catPath })),
        { text: "Weight at discharge not provided", source: "missing", evidence: "" },
      ] },
    ],
    missing: ["Weight at discharge"],
    warnings: [],
  })];
}

function respond(res, content) {
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const stop = content.some(b => b.type === "tool_use") ? "tool_use" : "end_turn";
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", "request-id": `req_fake_${seq}` });
  send("message_start", { type: "message_start", message: { id: `msg_fake_${++seq}`, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1200, output_tokens: 1 } } });
  content.forEach((b, index) => {
    if (b.type === "text") {
      send("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } });
      send("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: b.text } });
    } else {
      send("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      send("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    send("content_block_stop", { type: "content_block_stop", index });
  });
  send("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 300 } });
  send("message_stop", { type: "message_stop" });
  res.end();
}

http.createServer((req, res) => {
  if (req.method !== "POST" || !req.url.startsWith("/v1/messages")) { res.writeHead(404).end(); return; }
  let raw = "";
  req.on("data", c => { raw += c; });
  req.on("end", () => {
    try {
      const body = JSON.parse(raw);
      const system = typeof body.system === "string" ? body.system : JSON.stringify(body.system);
      const content = system.includes("LEARN how this doctor") ? learnTurn(body) : draftTurn(body);
      // Small delay so the UI's live progress is visible.
      setTimeout(() => respond(res, content), 400);
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: String(e) } }));
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake Anthropic API on http://127.0.0.1:${PORT}`));
