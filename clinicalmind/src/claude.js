export async function callClaudeStream(messages, system, apiKey, onDelta) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      stream: true,
      system,
      messages
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          fullText += event.delta.text;
          onDelta?.(fullText);
        }
      } catch (_) {}
    }
  }
  return fullText;
}

export function parseJSON(raw) {
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (_) { return null; }
}

export function buildSystemPrompt(complaint, age, sex, retrievedContext) {
  return `Clinical thinking assistant for junior doctors, India government hospital OPD.
Patient: ${age || "?"}y ${sex || ""}. Chief complaint: ${complaint}.

CLINICAL REFERENCE (retrieved via BM25):
${retrievedContext || "No reference loaded. Use general clinical knowledge with India-specific disease prevalence."}

Output ONLY valid JSON. No markdown. No explanation. Exactly this structure:
{"question":"...","options":["...","...","...","..."],"differentials":[{"name":"...","likelihood":"high|medium|low","reasoning":"one line max"}],"red_flags":["..."],"done":false}

Rules:
- question: single most important next question to ask
- options: 3-4 short options, always end with "Not present" or "Unsure"
- differentials: max 5, ranked by likelihood, India-specific disease weighting
- red_flags: ONLY include if genuinely triggered by answers given so far. Empty array [] if none.
- done: true only after 9+ questions AND essential history is complete
- Never repeat a question already in the history
- The predefined workflow has been exhausted or the doctor gave a custom answer. Generate the next most important question.`;
}

export function buildNotePrompt(complaint, age, sex, history, differentials, redFlags) {
  const historyText = history.map((h, i) => `Q${i+1}: ${h.q}\nA: ${h.a}`).join("\n\n");
  return `You are a clinical documentation assistant. Generate a structured clinical note for an Indian government hospital OPD.

Patient: ${age}y ${sex}. Chief complaint: ${complaint}.

CONSULTATION HISTORY:
${historyText}

TOP DIFFERENTIALS: ${differentials.map(d => `${d.name} (${d.likelihood})`).join(', ')}
RED FLAGS TRIGGERED: ${redFlags.length ? redFlags.join('; ') : 'None'}

Generate a clinical note with EXACTLY these sections (use these exact headers):
CHIEF COMPLAINT
HISTORY OF PRESENT ILLNESS
PERTINENT POSITIVES
PERTINENT NEGATIVES
RED FLAGS
WORKING DIAGNOSIS / DIFFERENTIALS
SUGGESTED INVESTIGATIONS
PLAN / DISPOSITION

Be concise and clinically precise. India-specific drug names and doses. Plain text only.`;
}
