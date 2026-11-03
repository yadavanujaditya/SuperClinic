// Pure unit tests (no emulator needed): node --test test/unit.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deidentify } from "../src/deidentify.js";
import { verifyDraft, extractNumbers, draftToText } from "../src/verify.js";
import { normalizePath, MemoryError } from "../src/memoryStore.js";

test("deidentify removes labelled identifiers and keeps clinical content", () => {
  const src = `Name: Baby of Sunita Devi
UHID: 2023045678   Age: 4 months   Weight: 5.6 kg
Father's Name - Ramesh Kumar
Address: Village Kheri, Rohtak
Mobile: 9876543210
DIAGNOSIS: Acute bronchiolitis
SpO2 92% on room air, RR 58/min. Hb 10.2 g/dL, TLC 12400.
Platelets 2,10,000. Discharged on day 5.`;
  const { text, removed } = deidentify(src);
  assert.ok(removed >= 5, `removed ${removed}`);
  for (const bad of ["Sunita", "2023045678", "Ramesh", "Kheri", "9876543210"]) assert.ok(!text.includes(bad), `still contains ${bad}`);
  for (const keep of ["4 months", "5.6 kg", "Acute bronchiolitis", "SpO2 92%", "RR 58/min", "Hb 10.2", "TLC 12400", "2,10,000", "day 5"]) assert.ok(text.includes(keep), `lost ${keep}`);
});

test("deidentify catches unlabelled phone, email, aadhaar", () => {
  const { text, removed } = deidentify("Call +91 98765 43210 or mail a.b@x.in. Aadhaar 2345 6789 0123. Dose 15 mg/kg.");
  assert.equal(removed, 3);
  assert.ok(text.includes("15 mg/kg"));
  assert.ok(!/98765|a\.b@x|2345 6789/.test(text));
});

test("deidentify does not touch drug/clinical 'name' mid-line", () => {
  const { text, removed } = deidentify("Drug name: Amoxicillin 250 mg TDS x 5 days");
  assert.equal(removed, 0);
  assert.equal(text, "Drug name: Amoxicillin 250 mg TDS x 5 days");
});

test("extractNumbers normalises Indian grouping and decimals", () => {
  assert.deepEqual(extractNumbers("Plt 1,50,000; Hb 10.20; day 05"), ["150000", "10.2", "5"]);
});

test("verifyDraft accepts grounded lines and flags hallucinated ones", () => {
  const inputs = "CBC: Hb 9.8 g/dL, TLC 15600. Stool: watery, 8 episodes/day. Weight 7 kg.";
  const memoryFiles = { "/memories/categories/age.md": "Discharge advice: ORS after each loose stool; Zinc 20 mg OD x 14 days." };
  const draft = {
    sections: [
      { heading: "Investigations", lines: [
        { text: "Hb 9.8 g/dL, TLC 15600", source: "input", evidence: "Hb 9.8 g/dL, TLC 15600" },
        { text: "Hb 11.2 g/dL", source: "input", evidence: "Hb 9.8 g/dL" },                 // number not in inputs
        { text: "Serum sodium normal", source: "input", evidence: "Na 138" },              // quote not in inputs
      ] },
      { heading: "Advice", lines: [
        { text: "Zinc 20 mg OD x 14 days", source: "memory", evidence: "/memories/categories/age.md" },
        { text: "ORS 75 ml/kg", source: "memory", evidence: "/memories/categories/age.md" }, // 75 not in memory/inputs
        { text: "Review after 7 days", source: "memory", evidence: "/memories/style.md" },    // file doesn't exist
        { text: "Discharge weight not provided", source: "missing", evidence: "" },
      ] },
    ],
    missing: ["Discharge weight"], warnings: [],
  };
  const v = verifyDraft(draft, { inputs, template: "", memoryFiles, readPaths: new Set(["/memories/categories/age.md"]) });
  const lines = v.sections.flatMap(s => s.lines);
  assert.deepEqual(lines.map(l => l.source), ["input", "unverified", "unverified", "memory", "unverified", "unverified", "missing"]);
  assert.match(lines[1].reason, /11\.2/);
  assert.match(lines[2].reason, /not in your reports/);
  assert.match(lines[5].reason, /does not exist/);
  assert.equal(v.stats.unverified, 4);
  assert.match(draftToText(v), /\[Discharge weight not provided\]/);
});

test("verifyDraft rejects memory citations the agent never read", () => {
  const v = verifyDraft(
    { sections: [{ heading: "A", lines: [{ text: "Follow up in OPD", source: "memory", evidence: "/memories/style.md" }] }], missing: [], warnings: [] },
    { inputs: "x", template: "", memoryFiles: { "/memories/style.md": "Follow up in OPD" }, readPaths: new Set() },
  );
  assert.equal(v.sections[0].lines[0].source, "unverified");
});

test("normalizePath confines paths to /memories", () => {
  assert.equal(normalizePath("/memories/categories/age.md"), "/memories/categories/age.md");
  assert.equal(normalizePath("memories//style.md/"), "/memories/style.md");
  for (const bad of ["/etc/passwd", "/memories/../x", "/memoriesx/a", "/memories/a\u0000b", ""]) {
    assert.throws(() => normalizePath(bad), MemoryError, bad);
  }
});
