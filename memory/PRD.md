# SuperClinic (ClinicalMind + SuperSummary) — PRD

## Original Problem Statement
"clone my git repo superlinic and make it live"
Repo provided by user: https://github.com/yadavanujaditya/SuperClinic.git

## What This App Is
A fully client-side (no backend, no database) React + Vite web app for junior doctors in
Indian government hospital OPDs. It has two modes, toggled from the top-right of the header:

1. **ClinicalMind** — clinical thinking assistant. Doctor selects a chief complaint, answers
   a sequence of questions (from a local decision-tree workflow, BM25-retrieved reference
   content, or AI when the local workflow is exhausted), sees live differential diagnoses,
   red-flag alerts, and a generated clinical note at the end.
2. **SuperSummary** — discharge-summary generator using annotated fill-in-the-blank templates
   (Neonatal Jaundice, Acute Hepatitis, Enteric Fever, AGE, CAP, Febrile Seizure, etc.)

## Architecture
- **Frontend only**: Vite + React 19, all logic client-side.
- **No backend / no MongoDB used** by this app (FastAPI + Mongo scaffold still present in
  /app/backend per platform defaults, but unused).
- **AI is "bring your own key"**: user enters their own Claude / Gemini / DeepSeek / OpenAI
  API key in the in-app Settings panel; key is stored in `localStorage` only. All AI calls
  (streaming chat + vision OCR fallback) go directly from the browser to the provider's API.
  No Emergent LLM key is used — this is intentional, per the original repo's design.
- **Offline-first**: 10 prebuilt complaints ship with full local decision-tree workflows and
  BM25-indexed clinical reference content, so the app is 100% usable without any API key.
- Data persistence: `localStorage` (API keys, private complaints, agent instructions) —
  no server-side storage for user data.

## Key Files
- `/app/frontend/src/App.jsx` — main app: Library, ComplaintEditor, Consultation,
  DiagnosisSidebar, ClinicalNote screens, ProfileMenu, SettingsPanel, ProductToggle,
  DocumentVault, ComplaintLibrary, WorkflowEditor.
- `/app/frontend/src/SuperSummary.jsx` — SuperSummary product mode + DocumentIntake.
- `/app/frontend/src/api.js` — multi-provider AI streaming (Claude/Gemini/DeepSeek/OpenAI),
  vision OCR fallback, JSON parsing helpers, prompt builders.
- `/app/frontend/src/bm25.js` — offline BM25 search engine, tokenizer, chunker.
- `/app/frontend/src/complaints.js` — SYSTEM_COMPLAINTS (10 prebuilt complaints + workflows).
- `/app/frontend/src/ocr.js` — Tesseract.js OCR pipeline w/ AI vision fallback.
- `/app/frontend/src/templates.js` — SuperSummary discharge-summary templates.
- `/app/frontend/vite.config.js` — dev server config adapted for Emergent's reverse proxy
  (host 0.0.0.0, port from `PORT` env / 3000, `allowedHosts: true`, HMR over `wss` on 443).
- `/app/frontend/package.json` — `start`/`dev` = `vite --host 0.0.0.0 --port 3000` so
  supervisor's existing `yarn start` command works unmodified.

## Migration Notes (Feb 2026)
- The original Emergent scaffold in `/app/frontend` was a CRA (craco/react-scripts) template
  with no custom code — it was fully replaced (not merged) with the cloned Vite app, since it
  was untouched boilerplate.
- `/app/backend` FastAPI + MongoDB scaffold is left untouched and running per platform
  defaults, but is not called by this app.

## Status
- Cloned repo, migrated to run under supervisor (Vite dev server on port 3000), verified live
  at the preview URL.
- Testing agent (frontend-only pass, Feb 2026): 100% success rate. All core flows verified —
  Library search/filter, complaint selection, offline BM25 + decision-tree consultation with
  red flags & live differentials, ComplaintEditor create/save-as-private, Document Vault .txt
  upload/indexing, ProductToggle (ClinicalMind ⇄ SuperSummary), ProfileMenu, SettingsPanel
  (provider selector + key-prefix validation). No console errors, no backend calls made (by
  design). No functional bugs found.
- Not yet tested: PDF upload/Open Reader/Parse-for-BM25 flow, Tag Library deep interactions,
  real AI vision OCR fallback (requires a real key, out of scope), mobile/tablet responsive
  layouts.

## Backlog / Next Steps (P1/P2)
- P1: Add `data-testid` attributes across interactive elements (complaint cards, category
  chips, product toggle, settings inputs, start-consultation button) — flagged by testing
  agent as a maintainability improvement, not a functional bug.
- P2: Split `App.jsx` (2460 lines) into smaller component files for maintainability.
- P2: Verify PDF upload / reader / BM25 parse flow and Tag Library deep interactions.
- P2: Mobile/tablet responsive QA pass.
- Backlog: Community Library sharing currently relies on manual JSON export/import (per
  original spec, "no backend for MVP") — could add a lightweight backend + MongoDB later if
  the user wants real cross-device community sharing instead of manual file exchange.
