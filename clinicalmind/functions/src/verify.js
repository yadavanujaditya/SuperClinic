// ─── Draft verification (anti-hallucination) ─────────────────────────────────
// Every line of a draft claims a source. We check the claim mechanically:
//   input    → the evidence quote must appear in the doctor's inputs, and every
//              number in the line must appear in the inputs
//   memory   → the cited memory file must exist and have been read this run, and
//              every number in the line must appear in that file or the inputs
//   template → every number must appear in the template (or inputs)
//   missing  → placeholder; never contains invented values
// Lines that fail are downgraded to source "unverified" with a reason, so the
// UI can flag them in red for the doctor to check.

const norm = (s) => String(s || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

// Numbers as written ("7.5", "1,50,000", "38.5") normalised to plain digits/decimal.
export function extractNumbers(s) {
  return (String(s || "").match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map(n => n.replace(/,/g, ""))
    .map(n => n.includes(".") ? String(parseFloat(n)) : String(parseInt(n, 10)))
    .filter(n => n !== "NaN");
}

function numbersCovered(line, ...sources) {
  const have = new Set(sources.flatMap(extractNumbers));
  const missing = extractNumbers(line).filter(n => !have.has(n));
  return missing;
}

/**
 * @param {{sections:{heading:string, lines:{text:string, source:string, evidence:string}[]}[], missing:string[], warnings:string[]}} draft
 * @param {{inputs:string, template:string, memoryFiles:Record<string,string>, readPaths:Set<string>}} ctx
 */
export function verifyDraft(draft, { inputs, template, memoryFiles, readPaths }) {
  const inputN = norm(inputs);
  const stats = { input: 0, memory: 0, template: 0, missing: 0, unverified: 0 };

  const sections = (draft.sections || []).map(sec => ({
    heading: sec.heading,
    lines: (sec.lines || []).map(line => {
      const out = { text: line.text, source: line.source, evidence: line.evidence || "", verified: true, reason: "" };
      const fail = (reason) => { out.verified = false; out.reason = reason; out.claimedSource = out.source; out.source = "unverified"; };

      if (line.source === "input") {
        const ev = norm(line.evidence);
        if (!ev) fail("no quote from your inputs was given");
        else if (!inputN.includes(ev)) fail("the quoted text is not in your reports/notes");
        else {
          const miss = numbersCovered(line.text, inputs);
          if (miss.length) fail(`number(s) ${miss.join(", ")} not found in your inputs`);
        }
      } else if (line.source === "memory") {
        const path = String(line.evidence || "").trim();
        const file = memoryFiles[path];
        if (!file) fail(`cites memory file "${path}" which does not exist`);
        else if (!readPaths.has(path)) fail(`cites memory file "${path}" without having read it`);
        else {
          const miss = numbersCovered(line.text, file, inputs);
          if (miss.length) fail(`number(s) ${miss.join(", ")} not in your memory or inputs`);
        }
      } else if (line.source === "template") {
        const miss = numbersCovered(line.text, template, inputs);
        if (miss.length) fail(`number(s) ${miss.join(", ")} not in the template or inputs`);
      } else if (line.source === "missing") {
        // Placeholders are fine; strip any invented numbers defensively.
        if (extractNumbers(line.text).length && numbersCovered(line.text, inputs, template).length) {
          out.text = line.text.replace(/\d[\d,]*(?:\.\d+)?/g, "___");
        }
      } else {
        fail(`unknown source "${line.source}"`);
      }
      stats[out.source] = (stats[out.source] || 0) + 1;
      return out;
    }),
  }));

  return { sections, missing: draft.missing || [], warnings: draft.warnings || [], stats };
}

export function draftToText(verified) {
  return verified.sections.map(s =>
    `${s.heading.toUpperCase()}\n` + s.lines.map(l => l.source === "missing" ? `[${l.text}]` : l.text).join("\n"),
  ).join("\n\n");
}
