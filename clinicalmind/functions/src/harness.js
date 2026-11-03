// ─── Agent harness ───────────────────────────────────────────────────────────
// A manual tool-use loop over the Claude Messages API (streaming), with:
//   • Claude's built-in memory tool, backed by FirestoreMemoryStore
//   • custom tools validated with zod (eager input streaming → we validate)
//   • turn limit, refusal / max_tokens handling, server-side model fallback
//   • an event callback for live progress + a usage tally for cost tracking
import Anthropic from "@anthropic-ai/sdk";
import { MemoryError } from "./memoryStore.js";

export const MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_JSON_RETRIES = 2;

export class AgentError extends Error {
  constructor(message, code = "agent_error") { super(message); this.code = code; }
}

/**
 * @param {object} opts
 * @param {Anthropic} opts.client
 * @param {string} opts.system
 * @param {Anthropic.MessageParam[]} opts.messages      initial conversation
 * @param {import("./memoryStore.js").FirestoreMemoryStore} [opts.memory]
 * @param {Record<string, {description:string, inputSchema:object, schema:import("zod").ZodTypeAny, run:(input:any)=>Promise<{content:string, done?:boolean, value?:any}>}>} [opts.tools]
 * @param {"low"|"medium"|"high"|"xhigh"|"max"} [opts.effort]
 * @param {number} [opts.maxTurns]
 * @param {(e:object)=>void|Promise<void>} [opts.onEvent]
 * @param {AbortSignal} [opts.signal]
 */
export async function runAgent({ client, system, messages, memory, tools = {}, effort = "high", maxTurns = 40, maxTokens = 32000, onEvent = () => {}, signal }) {
  const toolDefs = [];
  if (memory) toolDefs.push({ type: "memory_20250818", name: "memory" });
  for (const [name, t] of Object.entries(tools)) {
    toolDefs.push({ name, description: t.description, input_schema: t.inputSchema, eager_input_streaming: true });
  }

  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const convo = [...messages];
  let jsonRetries = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (signal?.aborted) throw new AgentError("run cancelled", "cancelled");

    let message;
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: maxTokens,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort },
        // Stable system + tools prefix → cache it across turns of the loop.
        cache_control: { type: "ephemeral" },
        system,
        tools: toolDefs,
        messages: convo,
      }, { signal });
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        if (err instanceof Anthropic.AuthenticationError) throw new AgentError("AI service key is invalid or missing on the server", "config");
        if (err instanceof Anthropic.RateLimitError) throw new AgentError("AI service is busy (rate limited). Try again in a minute.", "rate_limited");
        throw new AgentError(`AI service error (${err.status ?? "network"}): ${err.message}`, "upstream");
      }
      // Tool input could not be parsed (eager input streaming) → re-issue the turn.
      if (jsonRetries++ < MAX_JSON_RETRIES) { await onEvent({ type: "retry", turn, reason: "unparseable tool input" }); turn--; continue; }
      throw err;
    }

    for (const k of Object.keys(usage)) usage[k] += message.usage?.[k] ?? 0;

    if (message.stop_reason === "refusal") {
      throw new AgentError("The AI declined this request. Try rephrasing or removing unusual content.", "refusal");
    }

    const text = message.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    if (text) await onEvent({ type: "text", turn, text: text.slice(0, 600) });

    if (message.stop_reason === "pause_turn") {
      convo.push({ role: "assistant", content: message.content });
      continue;
    }

    const toolUses = message.content.filter(b => b.type === "tool_use");
    if (!toolUses.length) {
      return { stopReason: message.stop_reason, text, usage, turns: turn, finished: false, messages: convo };
    }
    if (message.stop_reason === "max_tokens") {
      throw new AgentError("The AI ran out of room mid-step; try fewer summaries per run.", "max_tokens");
    }

    convo.push({ role: "assistant", content: message.content });

    // Run every tool call of this turn, then return all results in ONE user message.
    const results = [];
    let finish = null;
    for (const tu of toolUses) {
      const { content, isError, done, value } = await runTool(tu, memory, tools);
      await onEvent({ type: "tool", turn, name: tu.name, summary: describeCall(tu), ok: !isError, ...(isError ? { error: content.slice(0, 300) } : {}) });
      results.push({ type: "tool_result", tool_use_id: tu.id, content, ...(isError ? { is_error: true } : {}) });
      if (done && !isError) finish = { value };
    }
    convo.push({ role: "user", content: results });

    if (finish) return { stopReason: "tool_finish", value: finish.value, usage, turns: turn, finished: true, messages: convo };
  }
  throw new AgentError(`The agent did not finish within ${maxTurns} steps.`, "max_turns");
}

async function runTool(tu, memory, tools) {
  try {
    if (tu.name === "memory") {
      if (!memory) return { content: "memory tool is not available", isError: true };
      return { content: await memory.execute(tu.input) };
    }
    const tool = tools[tu.name];
    if (!tool) return { content: `unknown tool: ${tu.name}`, isError: true };
    const parsed = tool.schema.safeParse(tu.input);
    if (!parsed.success) {
      return { content: `Invalid input for ${tu.name}: ${parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}. Fix and call again.`, isError: true };
    }
    const r = await tool.run(parsed.data);
    return { content: r.content, done: r.done, value: r.value };
  } catch (e) {
    if (e instanceof MemoryError || e instanceof ToolError) return { content: e.message, isError: true };
    throw e;
  }
}

export class ToolError extends Error {}

function describeCall(tu) {
  const i = tu.input || {};
  if (tu.name === "memory") {
    const p = i.path || (i.old_path ? `${i.old_path} → ${i.new_path}` : "");
    return `${i.command} ${p}`.trim();
  }
  if (tu.name === "set_summary_category") return `classified ${i.summary_id} as "${i.category}"`;
  return tu.name;
}
