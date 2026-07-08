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

## Remaining Phases (awaiting user clarification — see open questions below)
- **Phase 2:** Admin-only AI key (masked, not user-visible), other users don't need their own key
  (requires backend AI proxy since AI calls currently go directly from browser with user-supplied key).
- **Phase 3:** SuperSummary restructure — "AI Mode" as its own home-page-style card with image;
  "Template Library" card with tabs "System Template" (renamed from Public) + "My Templates"
  (Community tab fate unconfirmed — awaiting user answer).
- **Phase 4:** Persistence — every generated discharge summary + every clinical case/consultation
  saved and shown in user profile ("My Summaries" / "My Cases").
- **Phase 5:** Admin dashboard — view all users' generated discharges + consultation workflows.
- **Phase 6:** Publish & rate — users can publish custom templates/workflows publicly, others rate
  1–5 stars (scope of "workflow" unconfirmed — templates only, consultation flows only, or both).
- **Phase 7:** Post-completion rating prompt ("Rate your experience 1-5 stars" after generating a
  summary or finishing a consultation).

## Known Issues / Backlog
- **P2 (refactor, not urgent):** App.jsx (~3025 lines) and SuperSummary.jsx (~2287 lines) remain
  monolithic — recommend splitting into per-component files in a future pass.

## Testing Status
- Phase 1 auth: testing_agent_v4 PASSED, 100%, 0 bugs (iteration_6.json).
- Prior data-testid completeness pass: PASSED after 2 bug fixes (iteration_5.json).

## Next Action Items
- Awaiting user answers to: (1) SuperSummary tab/card restructure exact spec, (2) scope of
  "custom workflow" publishing (templates vs consultation flows vs both) + rating mechanism,
  (3) exact UX for the post-summary rating prompt, (4) confirm phase order/priority for
  Phases 2–7 above.
