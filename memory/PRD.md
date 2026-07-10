# SuperClinic — Product Requirements & Status

## Original Problem Statement
- Clone git repo https://github.com/yadavanujaditya/SuperClinic.git and make it live.
- Sync latest commits from `feat/premium-home-and-summary-fixes` branch.
- Add `data-testid` attributes across all interactive elements for better testability.

## Architecture
- Frontend-only React (Vite) app. No backend/DB usage by the app itself (a placeholder FastAPI backend exists but is unused by the app).
- Runs on port 3000 via Vite dev server (`vite.config.js` configured for `0.0.0.0:3000` — DO NOT modify).
- State: localStorage (`clinicalmind:templates`, `clinicalmind:complaints`, `clinicalmind:provider`) + in-memory React state.
- AI: Claude/OpenAI calls made directly from the browser using a user-supplied API key (Settings panel). No server-side AI proxy.
- Key files:
  - `/app/frontend/src/App.jsx` (3025 lines) — Home dashboard, ClinicFlow (LibraryScreen, ConsultationScreen, NoteScreen), Settings, ProfileMenu, PDF reader/Tag Library.
  - `/app/frontend/src/SuperSummary.jsx` (2287 lines) — Discharge summary generator: TemplateLibrary, TemplateEditor, FillScreen, SuperFastAiWizard, AIModeScreen.
  - `/app/frontend/src/HomeHero.jsx` — Premium hero carousel + illustration components.

## What's Been Implemented (dated)
- **[Earlier session]** Cloned repo, fixed Vite host/port config, mobile responsive fixes (LibraryScreen/ConsultationScreen/PDFReader), synced `feat/premium-home-and-summary-fixes` branch, added data-testid to HomeHero.jsx + top half of App.jsx (~line 1–2130).
- **[This session — Feb 2026]**
  - Completed data-testid re-application across remainder of App.jsx (lines 2130–3025: ConsultationScreen, NoteScreen, home dashboard cards) — added ~40 new testids.
  - Completed data-testid across the ENTIRE SuperSummary.jsx file (previously had zero) — added ~95 testids covering TemplateLibrary, TemplateEditor, FillScreen, SuperFastAiWizard (5-step wizard), AIModeScreen.
  - Added `testId`/`className` prop forwarding to the local `Card` component in App.jsx (previously silently dropped `className`, breaking `premium-card` hover styling on home dashboard cards — now fixed as a side effect).
  - Fixed a critical syntax bug (stray `>` character at EOF of App.jsx) introduced mid-edit that caused a full blank white screen (Vite parse error). Verified fix via screenshot + curl.
  - Testing agent found & fixed 2 additional bugs: (1) local `Btn` component in SuperSummary.jsx wasn't forwarding `testId` prop to DOM (broke 42 testids silently), (2) missing `launch-supersummary-btn` testid on home card. Both fixed and re-verified.
  - Full E2E flow tested and passing: Home → ClinicFlow → Consultation Q&A → Generate Note → NoteScreen; Home → SuperSummary → Template Library → Template card → Smart Editor/AI Wizard modal → FillScreen; Template Editor CRUD; MoProPrep/DnbProPrep external link cards. Desktop (1920x1080) + mobile (390x844) both verified, zero console errors.

## [Feb 2026] Phase 1: Authentication — IMPLEMENTED
User requested a 9-point feature set converting the app from frontend-only (localStorage) to
full-stack with auth, roles, persistence, admin dashboard, and community publishing/rating.
Given the scope, this is being built in phases. **Phase 1 (auth) is complete and tested.**

- Backend: `/app/backend/database.py` (shared Mongo `db`), `/app/backend/auth.py` (all auth routes).
  - `POST /api/auth/register`, `POST /api/auth/login` — email/password, bcrypt-hashed.
  - `POST /api/auth/google/session` — Emergent-managed Google OAuth session exchange.
  - `GET /api/auth/me`, `POST /api/auth/logout`, `PUT /api/auth/profile`.
  - Session via httpOnly cookie `session_token` (7-day expiry) in `sessions` collection — unified
    mechanism for both email and Google login.
  - `ADMIN_EMAIL` env var (`adityasonofashok@gmail.com`) auto-assigns `role: "admin"` on
    first register/login with that exact email.
- Frontend: `/app/frontend/src/AuthContext.jsx` (React context: user/login/register/loginWithGoogle/
  logout/updateProfile), `/app/frontend/src/AuthScreens.jsx` (LoginSignupScreen, OnboardingModal,
  AuthGate — gates the entire app). `main.jsx` wraps `<App/>` with `<AuthProvider><AuthGate>`.
  `App.jsx`'s `ProfileModal` now shows real user name/email/profession/mobile/ADMIN badge + Logout.
  `vite.config.js` got `envPrefix: ['VITE_','REACT_APP_']` so `import.meta.env.REACT_APP_BACKEND_URL`
  works (Vite doesn't expose `REACT_APP_` vars by default).
- Onboarding: after signup/first Google login, user must pick profession (mbbs_student/resident/
  consultant) and enter mobile number before reaching the app (blocking modal).
- Tested via testing_agent_v4 (iteration_6.json): 100% pass, 0 bugs, 11/11 backend pytest +
  full Playwright regression (ClinicFlow/SuperSummary still work post-auth-gate).
- Mobile-number is currently a **profile field only** (not a login method) — full OTP/SMS-based
  mobile login was deferred pending user decision (requires Twilio integration + credentials).
- DB cleaned of all test accounts before handoff; no seeded admin exists yet — real user must
  sign up with `adityasonofashok@gmail.com` to claim admin role.

## [Feb 2026] Phases 2–7: Admin AI Proxy, SuperSummary Restructure, Persistence, Admin Dashboard, Community Publish/Rate, Rating Prompt — IMPLEMENTED
All remaining phases from the original 9-point request are now complete and tested.

- **Phase 2 (Admin-only AI key):** `/app/backend/admin_ai.py`. `GET/PUT/DELETE /api/admin/ai-config`
  (admin-only, key stored server-side, only masked form e.g. `sk-ant••••7890` ever returned).
  `GET /api/ai/status` (any user, provider name only, never the key). All AI calls now proxied via
  `POST /api/ai/chat/stream` (SSE-style plain-text stream) and `POST /api/ai/vision` (OCR), using
  the admin's server-stored key for Claude/Gemini/DeepSeek/OpenAI. Browser never sees an API key.
  Streaming error handling: since `StreamingResponse` cannot change status after commit, upstream
  errors (invalid key, network failure) are sent as an in-band `__AI_STREAM_ERROR__:<msg>` sentinel
  in the byte stream. Frontend (`api.js`) detects this prefix and throws, letting `NoteScreen` /
  `SuperFastAiWizard` correctly fall back to `generateLocalNote()` instead of silently saving an
  empty AI response. (This was flagged as a HIGH bug in iteration_7 testing and is now fixed &
  verified in code.)
- **Phase 3 (SuperSummary restructure):** AI Mode is now its own home-style card (image + CTA).
  Template Library card simplified to two tabs: "System Templates" (was "Public") + "My Templates".
  Community tab removed from the Template Library; community browsing moved to a dedicated
  `CommunityBrowserModal.jsx` reachable separately (publish/import flow), per user's clarified scope.
- **Phase 4 (Persistence):** `/app/backend/records.py` — `POST /api/records/save`,
  `GET /api/records/list` (filter by type: discharge_summary / clinical_case),
  `DELETE /api/records/{id}`. Every generated discharge summary and clinical case is auto-saved.
  Frontend: `RecordsModal.jsx` ("My Records") accessible from Profile, shows saved summaries/cases
  with view/delete.
- **Phase 5 (Admin dashboard):** `AdminDashboard.jsx`, backed by admin-only endpoints in
  `records.py`/`auth.py` — tabs for Users, Discharge Summaries, Clinical Cases, Ratings, with
  per-user breakdown of what was generated. Admin-only gated via `get_current_admin`.
  Bug fixed during testing: nested modal missing `stopPropagation` caused any inner click to close
  the whole modal tree — fixed (same pattern as `RecordsModal.jsx`/`CommunityBrowserModal.jsx`).
- **Phase 6 (Publish & rate):** `/app/backend/community.py` — `POST /api/community/publish`,
  `GET /api/community/list`, `POST /api/community/rate` (1–5 stars, per-user upsert, running
  avg/count computed server-side, not raw arrays), `DELETE /api/community/{id}` (owner-only).
  Covers both custom templates AND consultation workflows, importable by other users into their
  own "My Templates"/library. No AI dependency — fully real/working, not mocked.
- **Phase 7 (Rating prompt):** `RatingPrompt.jsx` — non-blocking modal shown after a summary/case
  is generated, 1–5 stars + optional comment, saved and visible to admin via dashboard's Ratings tab.

## Testing Status
- Phase 1 auth: testing_agent_v4 PASSED, 100%, 0 bugs (iteration_6.json).
- Prior data-testid completeness pass: PASSED after 2 bug fixes (iteration_5.json).
- Phases 2–7: testing_agent_v4 PASSED — 42/42 backend pytest (31 new + 11 pre-existing auth),
  ~95% frontend (1 bug found+fixed: AdminDashboard stopPropagation; 1 backend bug found+fixed:
  streaming AI error sentinel) (iteration_7.json).
- DB verified clean post-testing: 0 users, 0 admin_settings, 0 records, 0 community_items.

## Known Issues / Backlog
- **P2 (refactor, not urgent):** App.jsx (~3025 lines) and SuperSummary.jsx (~2287 lines) remain
  monolithic — recommend splitting into per-component files in a future pass.
- **P1 (setup, not a bug):** No admin AI key is configured yet — real user must sign up with
  `adityasonofashok@gmail.com` and add a real provider key via Profile → Settings before AI
  generation (chat/vision) will work end-to-end. Local/offline note generation works without it.

## [Jul 2026] Mobile CSS fixes, public home page, SuperMemory persistence — IMPLEMENTED
User reported 5 issues after using the deployed app; all fixed and verified via testing_agent_v4
(iteration_8.json — 100% pass, 0 blocking bugs).

1. **Mobile ConsultationScreen layout collapse (bug):** root cause was a CSS Grid auto-row-sizing
   conflict — `.consultation-sidebar`'s mobile override (`overflow-y:visible`) forced its full
   content height into the grid's row sizing, while the main question/options column (inline
   `overflow-y:auto`) was allowed to collapse toward 0 to compensate, squeezing the question and
   options into an unreadably small box. Fixed by letting the whole `.consultation-root` grow
   (`height:auto;min-height:100vh`) with a `position:sticky` header, and making the grid rows
   (`.consultation-layout`, `.consultation-main`, `.consultation-sidebar`) all `overflow:visible`
   on mobile so the page scrolls naturally as one flow instead of nesting nested scroll regions.
2. **Public home page (feature):** `AuthGate` (`AuthScreens.jsx`) no longer blocks guests — it only
   gates onboarding for logged-in users missing profession/mobile. Guests see the home page (hero +
   workspace cards) with a "Sign In" pill instead of an avatar. Clicking any feature card
   (ClinicFlow/SuperSummary/SuperMemory/MoProPrep/DnbProPrep) calls a new `requireAuth()` helper in
   `App.jsx` — if logged in, proceeds; if not, opens a non-blocking `<LoginModal>` overlay
   (`AuthScreens.jsx`) instead of a full-page redirect. After signing up/in inline, the guest must
   click the card again (no auto-resume of the pending action — by design, kept simple).
3. **"Our Other Apps" section (feature):** MoProPrep and DnbProPrep cards moved under a new
   heading below the 3 primary tool cards. Each shows a `ShareLinkRow` (copy-to-clipboard button)
   with a vanity link `<origin>/moproprep` / `<origin>/dnbproprep`. Visiting those exact paths
   (even logged out) instantly redirects via `window.location.replace()` in `main.jsx`, before
   React even mounts — bypasses login entirely, intended for sharing on social media.
4. **Mobile horizontal overflow (bug):** off-canvas Settings drawer (`position:fixed` + `transform:
   translateX(100%)` when closed) was expanding `document.documentElement.scrollWidth` beyond the
   viewport in some browsers. Fixed with a global `overflow-x:hidden` on `html, body` in index.css.
5. **SuperMemory persistence + dedicated page (feature):** PDFs uploaded in SuperMemory previously
   lived only in React state (lost on refresh). New backend `supermemory.py` (mounted at
   `/api/supermemory`) + `storage.py` (Emergent object storage wrapper) persist PDF binaries in
   object storage and metadata in `pdf_books`; custom tags created while reading persist in
   `pdf_tags` (client generates the id/label, backend mirrors it — avoids ID-reconciliation
   complexity). New `SuperMemoryPage.jsx`, opened via `window.open('/supermemory','_blank')` from
   the home card, is a standalone page (routed in `main.jsx` by pathname, no router library added)
   that independently hydrates the logged-in user's books/tags on load; reuses the existing
   exported `DocumentVault`/`TagLibraryModal`/`PDFReader` from `App.jsx`. Shows a friendly
   "sign in first" screen if opened while logged out.

### Bonus bug found & fixed (not user-reported): duplicate Google-auth user records
While cleaning up test data, found the REAL admin account (`adityasonofashok@gmail.com`) had two
duplicate user documents with the same email but different `user_id` (one with onboarding done,
one without) — created because `AuthContext.jsx`'s one-time Google `session_id` exchange effect
had no guard against React StrictMode's double-invoke, causing two concurrent
`POST /api/auth/google/session` calls to both pass a `find_one`-then-`insert_one` race. Fixed with
(a) a `useRef` "already processed" guard in `AuthContext.jsx` (per the Emergent Auth playbook's
documented StrictMode guidance), and (b) an atomic `find_one_and_update(upsert=True)` in
`auth.py`'s `google_session` handler, plus (c) a unique index on `users.email` created at backend
startup (`server.py`) as defense in depth. Duplicate merged/cleaned in DB; the real admin's
session + onboarding data preserved.

### Testing Status
- testing_agent_v4, iteration_8.json: 100% pass on all 5 targeted items (mobile CSS, public home +
  login modal, share links + vanity redirects, horizontal overflow fix, SuperMemory persistence +
  standalone page), backend 6/6 new pytest cases (`/app/backend/tests/test_supermemory.py`).
  Light regression confirmed ClinicFlow/SuperSummary/home navigation unaffected.
- Minor polish: renamed misleading "Admin: Agent Instructions" section header (in Settings, visible
  to all users — it's actually a per-browser localStorage prompt customization, not admin-gated)
  to "Customize AI Instructions" per testing agent's design-issue note.

## Known Issues / Backlog
- **RESOLVED (Feb 2026):** ~~App.jsx and SuperSummary.jsx monolithic~~ — fully refactored into 21
  focused files, see below.
- **P1 (setup, not a bug):** No admin AI provider key configured yet — sign in as
  `adityasonofashok@gmail.com` (Google) and add a real key via Profile → Settings for AI-backed
  chat/vision generation to work end-to-end. Local/offline note generation works without it.
- **Deferred, not yet started:** Payment/subscription plan discussed with user (daily free quota of
  10 discharge summaries + 10 clinical cases per user; ₹300/month paid plan for 10 summaries +
  30 cases/day; referral bonus of +5 summaries/+10 cases per month for referrers) — user pivoted to
  report the 5 bugs/features above before answering clarifying questions on exact quota/referral
  logic and payment gateway (Razorpay suggested for INR). Revisit next session.
- **RESOLVED (Feb 2026):** Production deployment failure investigated via `deployment_agent` —
  found and fixed 2 WARN-level issues (hardcoded CORS origin, hardcoded storage URL). See below.

## [Feb 2026] App.jsx / SuperSummary.jsx file-split refactor — IMPLEMENTED
User approved finishing the code-organization refactor (P2 backlog item above) plus a deployment
readiness check. Both complete and tested.

- **Deployment fixes (2 WARNs from `deployment_agent` static scan):** `backend/.env`
  `CORS_ORIGINS` changed from a hardcoded specific preview origin to `"*"`; `backend/storage.py`'s
  hardcoded `STORAGE_URL` now built from the platform-injected `INTEGRATION_PROXY_URL` env var
  instead of a literal string. Both verified via backend restart + curl.
- **App.jsx refactor (3260 → 288 lines):** extracted `LibraryScreen.jsx`, `PDFReader.jsx`,
  `TagLibraryModal.jsx`, `ConsultationScreen.jsx` (bundles its only-used-there helpers
  `PageViewer`/`DiagnosisSidebar`/`SuperTagsCard`/`DifferentialsPanel`/`OptionButton`),
  `NoteScreen.jsx`. `App.jsx` now only holds the root component wiring `product`/`phase` routing.
  `SuperMemoryPage.jsx` updated to import `PDFReader`/`TagLibraryModal` from their new dedicated
  files instead of `App.jsx` (removes a fragile cross-file dependency).
- **SuperSummary.jsx refactor (2373 → 196 lines):** extracted `SuperSummaryShared.jsx` (shared
  theme consts + `Btn`/`Card`/`inputS`), `DocumentIntake.jsx`, `SafetyCheckPanel.jsx`,
  `SaveAsTemplateModal.jsx`, `TemplateEditor.jsx`, `TemplateLibrary.jsx` (bundles
  `HowToUseCarousel`), `AiModeCard.jsx`, `FillScreen.jsx`, `SuperFastAiWizard.jsx`,
  `AIModeScreen.jsx`. `ConsultationScreen.jsx` now imports `DocumentIntake` from its own file
  instead of reaching into `SuperSummary.jsx`. Dropped one dead/unused helper
  (`extractDateFromText`) found during extraction — was defined but never called.
  `SuperSummary.jsx` now only holds the root component wiring `phase` routing.
  All dead/unused imports left over from earlier partial extractions (`PROVIDERS`,
  `getGenericInstructions`/`getDetailedInstructions` at the App root level, `RecordsModal`,
  `AdminDashboard`, `listCommunityWorkflows`, `rateWorkflow`, `uploadBook`, `deleteBook`, `PURPLE`,
  `CATEGORIES`, `initPDFJS`, `renderPDFPage`, `extractAllText`, `WorkflowEditor`) were removed as a
  side effect of rewriting `App.jsx`'s import block from scratch.
- Verified via `yarn build` (production build, 0 errors — confirms every import/export across all
  21 files resolves correctly) + testing_agent_v4 (iteration_9.json): 100% pass, 0 regressions,
  full ClinicFlow (library→consult→note) and SuperSummary (template library→fill/wizard→editor)
  flows re-verified end-to-end on desktop + mobile viewports post-refactor.

## Next Action Items
- Await user testing/confirmation of the refactor + the earlier 5 mobile/auth/SuperMemory fixes.
- Resume the payment/subscription clarification questions (quota logic, referral trigger,
  Razorpay vs other gateway, recurring vs one-time pass, upgrade-prompt UX) when user is ready.
- Optional/minor (found by testing agent, not a regression): reword pediatric-specific question
  phrasing in the offline "Fever — General" complaint bank to be age-neutral.
- Optional: create an email/password admin test account (current real admin is Google-OAuth-only)
  to make future Admin Dashboard regression testing automatable.
