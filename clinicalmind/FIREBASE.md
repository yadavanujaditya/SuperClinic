# Firebase backend

SuperClinic uses Firebase for **login** (Google + email/password) and **cloud sync**
(Firestore). The app still works fully without signing in, using on-device storage
only, the same as before.

## What gets synced

| Data | Firestore path | Synced? |
|---|---|---|
| Custom ClinicFlow complaints | `users/{uid}/complaints/{id}` | Yes |
| SuperSummary templates | `users/{uid}/templates/{id}` | Yes |
| AI provider + custom AI instructions | `users/{uid}` | Yes |
| AI API keys | none | **No, stays on the device only** |
| Uploaded PDFs, tags, patient sessions | none | No (not stored anywhere yet) |
| My Agent: past summaries (de-identified) | `users/{uid}/summaries/{id}` | Yes (written by the server only) |
| My Agent: memory notes | `users/{uid}/memories/{id}` | Yes |
| My Agent: learning/drafting runs, daily usage | `users/{uid}/agentRuns`, `users/{uid}/usage` | Yes (server only) |

- Data saved **before** signing in is uploaded the first time you sign in, so nothing is lost.
- **Signing out** removes synced data from that browser (for shared hospital PCs). It stays safe in the cloud.
- Security rules (`firestore.rules`) let each doctor read and write **only their own** `users/{uid}` data.

## My Agent (SuperSummary learning agent)

My Agent learns how each doctor writes discharge summaries and drafts new ones in
that style without inventing facts. It runs on the server (Cloud Functions), so the
AI key is never in the browser.

### How it works

```
Doctor ──► addSummaries ──► de-identify ──► users/{uid}/summaries
                                                  │
 "Teach my agent" / 2 AM nightly ──► agentRuns (queued) ──► runAgentJob
                                                  │
                     Claude (claude-opus-5-5) + memory tool, 10 summaries per run,
                     chains runs until all are learned
                                                  │
                         users/{uid}/memories  (/memories/style.md,
                         /memories/categories/<diagnosis>.md, /memories/edits.md, …)
                                                  │
 Draft ──► draftSummary ──► Claude reads memory (read-only) + past examples
                         ──► submit_draft (each line tagged input/memory/template/missing)
                         ──► verify.js checks every line ──► colour-coded draft
                                                  │
 "Save final & teach" ──► stored with the AI draft ──► agent learns the corrections
```

- **Harness** (`functions/src/harness.js`): a tool-use loop over the Claude Messages API with streaming, adaptive thinking, a turn limit, refusal/max-token handling, prompt caching, and server-side model fallback (`fallbacks: "default"`). If a request is declined, the API retries it on a fallback model automatically.
- **Memory** (`functions/src/memoryStore.js`): Claude's built-in memory tool (`view`, `create`, `str_replace`, `insert`, `delete`, `rename`), stored per doctor in Firestore. Paths can't leave `/memories`. Every write is de-identified and size-limited. Drafting is read-only.
- **No hallucination** (`functions/src/verify.js`): a line marked "from your reports" must quote your inputs word for word, and every number in it must appear there. A line marked "from your habits" must cite a memory file the agent actually read, and its numbers must be in that file. Anything else is shown in red as "Could not verify". Missing information becomes a yellow "[needs your input]", never a guess.
- **Privacy** (`functions/src/deidentify.js`): names, UHID/CR/IP numbers, phone, email, Aadhaar, ABHA, address and DOB are removed on the server before anything is stored or sent to the AI. Doctors can't write summaries directly; the security rules force them through the de-identifying function.
- **Limits**: 60 drafts and 40 learning runs per doctor per day (`LIMITS` in `functions/src/index.js`). Token usage is recorded in `users/{uid}/usage/{date}`.

### Agent setup

Cloud Functions and Secret Manager need the **Blaze (pay-as-you-go)** plan. You pay
Anthropic separately for AI usage.

1. Get an API key from https://console.anthropic.com.
2. Store it as a secret. This is a one-time step, and it prompts you for the key:

```bash
npx firebase functions:secrets:set ANTHROPIC_API_KEY
```

3. Install the functions' dependencies:

```bash
cd functions && npm install && cd ..
```

4. Deploy. `npm run deploy` deploys hosting, rules, indexes and functions together.

**Local testing with your real key:** put `ANTHROPIC_API_KEY=sk-ant-...` in
`functions/.secret.local` (git-ignored), then run `npm run emulators`.

**Local testing with no key and no cost:** run a fake Claude server that gives scripted answers:

```bash
node functions/test/fakeAnthropic.js
```

Then put `ANTHROPIC_BASE_URL=http://127.0.0.1:4010` in `functions/.env.local`, put
`ANTHROPIC_API_KEY=fake` in `functions/.secret.local`, and run `npm run emulators`.

**Tests:**

```bash
cd functions && npm test
```

```bash
cd functions && npm run test:integration
```

With the fake server, the emulators and `npm run dev` all running:

```bash
node e2e/agent.e2e.cjs
```

## Step 1: Test locally (no Firebase account needed)

Needs Node 20+ and Java 11+ (the Firestore emulator runs on Java).

```bash
cd clinicalmind
npm install
(cd functions && npm install)
cp .env.example .env.local      # VITE_USE_EMULATORS=true is already set
```

Terminal 1 (Firebase emulators: Auth, Firestore, Functions, plus a dashboard at http://127.0.0.1:4000):

```bash
npm run emulators
```

Terminal 2 (the app at http://localhost:5173):

```bash
npm run dev
```

Click the profile icon (top right), then **Sign in / Profile**, then create an account. In
local test mode any email works, and "Continue with Google" shows a fake Google screen.
You can browse the saved data at http://127.0.0.1:4000/firestore.

Emulator data is wiped when you stop the emulators.

## Step 2: Go live on Firebase

1. Go to https://console.firebase.google.com, choose **Add project** (e.g. `superclinic`), and note the **project ID**.
2. **Build → Authentication → Get started.** Enable **Google** and **Email/Password**.
3. **Build → Firestore Database → Create database.** Pick the `asia-south1` (Mumbai) location and start in **production mode**.
4. **Project settings → Your apps → Web (`</>`).** Register the app and copy the `firebaseConfig` values.
5. Edit `clinicalmind/.env.local`: set `VITE_USE_EMULATORS=false` and fill in the `VITE_FIREBASE_*` values.
6. Point the CLI at your project (replace `superclinic` with your project ID):

```bash
cd clinicalmind
npx firebase login
npx firebase use --add superclinic
```

7. Deploy the site and the security rules:

```bash
npm run deploy
```

Your site is live at `https://<project-id>.web.app`. If you add a custom domain, also add it
under **Authentication → Settings → Authorized domains** so Google sign-in works there.

Login and Firestore alone fit within the free Spark plan. My Agent's Cloud Functions need the Blaze plan.
