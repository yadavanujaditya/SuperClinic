# SuperClinic (ClinicFlow + SuperSummary) — PRD

## Original Problem Statement
1. "clone my git repo superlinic and make it live" — Repo: https://github.com/yadavanujaditya/SuperClinic.git
2. Follow-up: "Add data-testid attributes... Verify PDF/BM25/Tag Library flow + mobile pass"
3. Follow-up: "i have commit some changes to my git (branch feat/premium-home-and-summary-fixes)... make sure our latest version is live"

## What This App Is
A fully client-side (no backend, no database) React + Vite web app for junior doctors in
Indian government hospital OPDs, now rebranded as a multi-tool suite:
- **Home Hero**: animated carousel + "Choose your workspace" grid with 5 cards:
  - **ClinicFlow** (formerly "ClinicalMind") — clinical Q&A consultation assistant with local
    BM25 decision-tree workflows + AI-assisted mode, differentials, red flags, note generation.
  - **SuperSummary** — discharge-summary generator with fill-in-the-blank templates + AI wizard.
  - **SuperMemory** — currently routes to the same ClinicFlow screen (shares the tag/reference
    library panel) — not yet a distinct feature (confirmed by testing, same onClick handler as
    ClinicFlow in the user's own source code).
  - **MoProPrep** / **DnbProPrep** — external gamified quiz links (open in new tab, e.g.
    https://www.moproprep.in/).
- Profile avatar (top-right) → dropdown → View Profile / Tag Library / Settings.

## Architecture
- **Frontend only**: Vite + React 19, all logic client-side. No backend/MongoDB used.
- **AI is "bring your own key"**: user's own Claude/Gemini/DeepSeek/OpenAI key, entered in
  Settings, stored in `localStorage`. All AI calls go directly browser → provider API.
- **Offline-first**: 10 prebuilt complaints with local decision trees + BM25 search; app fully
  usable with zero API key.
- Deployment-specific config (kept stable across all git pulls from user's repo):
  `/app/frontend/package.json` → `start`/`dev` = `vite --host 0.0.0.0 --port 3000`;
  `/app/frontend/vite.config.js` → `host:0.0.0.0, allowedHosts:true, hmr wss/443` — required
  for Emergent's reverse proxy; NOT present in the user's own repo, must be re-applied after
  every future pull if package.json/vite.config.js get overwritten.

## Sync History (Feb 2026)
1. Initial clone (commit `c5800c6`, "Initial commit") — migrated Vite app into
   `/app/frontend`, replacing the CRA scaffold. Verified live.
2. Added `data-testid` to nearly all interactive elements in `App.jsx`/`SuperSummary.jsx` +
   `useIsMobile()` responsive fixes (header wrap, consultation grid stacking, PDFReader
   mobile stacking). All verified via testing agent (iteration_1/2/3).
3. **Pulled latest from branch `feat/premium-home-and-summary-fixes`** (6 new commits,
   `54f5339` HEAD) — replaced `App.jsx`, `SuperSummary.jsx`, `api.js`, `claude.js`,
   `index.css`, added new `HomeHero.jsx` + 2 PNG assets. This **overwrote** all data-testid
   attributes and mobile fixes from step 2 (expected — user's repo doesn't have them).
   `bm25.js`, `complaints.js`, `ocr.js`, `templates.js`, `main.jsx`, `package.json`,
   `vite.config.js` were unchanged. Verified live via testing agent (iteration_4,
   95% success, zero crashes/console errors).

## Status (as of latest sync)
- Live and fully functional: Home Hero carousel, all 5 workspace cards, ClinicFlow
  consultation flow (offline + AI mode), SuperSummary templates + AI wizard, Profile modal,
  Footer. No backend calls (by design). No blocking bugs.
- Known non-blocking items (from user's own source, not altered by agent):
  - "Open SuperMemory" card currently routes to the same ClinicFlow screen (shared onClick
    handler) rather than a distinct SuperMemory view — may be intentional/WIP on user's side.
  - `data-testid` attributes are currently absent again after the latest pull (were fully
    re-added once before in step 2, then overwritten by the user's own commit).
  - `App.jsx` (3011 lines) / `SuperSummary.jsx` (2254 lines) exceed the recommended
    per-file size — flagged by testing agent as a maintainability note only.

## Backlog / Next Steps (P1/P2)
- P1 (on request only): Re-add `data-testid` attributes to the new HomeHero/App/SuperSummary
  structure if the user wants automated testing support again.
- P2: Ask user whether "SuperMemory" is meant to be a distinct feature or is intentionally an
  alias entry point into ClinicFlow's reference/tag library.
- P2: Split `App.jsx`/`SuperSummary.jsx` into smaller modules (pattern already started with
  `HomeHero.jsx`).
- Reminder for future git pulls: always re-check/re-apply `package.json` "start" script and
  `vite.config.js` `allowedHosts`/`hmr` settings if those files come back changed from the
  user's repo, since the user's own repo defaults (`vite`, no allowedHosts) won't work behind
  Emergent's reverse proxy.
