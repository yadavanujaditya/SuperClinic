// End-to-end test of My Agent (SuperSummary learning agent).
// Needs: fake Claude server (node functions/test/fakeAnthropic.js), `npm run emulators`
// with functions/.env.local = ANTHROPIC_BASE_URL=http://127.0.0.1:4010, and `npm run dev`.
// Run from clinicalmind/:  node e2e/agent.e2e.cjs
const { chromium } = require('playwright');
const URL = 'http://localhost:5173/';
const PID = 'demo-superclinic';
const FS = `http://127.0.0.1:8080/v1/projects/${PID}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const email = `agent${Date.now()}@test.in`, pw = 'secret123';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const owner = { headers: { Authorization: 'Bearer owner' } };
const fsList = async (path) => ((await (await fetch(`${FS}/${path}?pageSize=300`, owner)).json()).documents || []);
const val = (f) => f == null ? undefined : f.stringValue ?? f.nullValue ?? f.integerValue ?? f.booleanValue ?? (f.timestampValue ? f.timestampValue : f);

const SUMMARIES = `Name: Aarav Kumar   UHID: 2024011122
Mobile: 9812345678
DIAGNOSIS
Acute gastroenteritis with some dehydration
HISTORY
2 year old boy with loose stools 8 episodes/day for 2 days.
TREATMENT GIVEN
IV fluids, ORS, Zinc
ADVICE AT DISCHARGE
ORS after every loose stool
Zinc 20 mg OD x 14 days
Review after 3 days or SOS
-----
Patient Name: Baby of Rekha   CR No: 55667788
DIAGNOSIS
Acute gastroenteritis, no dehydration
HISTORY
14 month old girl with watery stools for 1 day, 5 episodes.
ADVICE AT DISCHARGE
ORS after every loose stool
Zinc 20 mg OD x 14 days
Continue breastfeeding
Review after 3 days or SOS
-----
Name: Ishaan   UHID: 2024019999   Address: Village Kheri, Rohtak
DIAGNOSIS
Acute bronchiolitis
HISTORY
4 month old with cough, coryza and fast breathing for 3 days. SpO2 91% at admission.
TREATMENT
Oxygen by nasal prongs, nasal saline drops, feeding support.
ADVICE AT DISCHARGE
Nasal saline drops before feeds
Follow up in 1 week`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── Sign up ──
  await page.goto(URL);
  await page.click('[data-testid=profile-button]');
  await page.getByText('Sign in / Profile').click();
  await page.getByText('New here? Create an account').click();
  await page.fill('[data-testid=email]', email); await page.fill('[data-testid=password]', pw);
  await page.click('[data-testid=email-submit]');
  await page.waitForSelector('[data-testid=sign-out]');
  await page.mouse.click(5, 5);
  const uid = (await (await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-api-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw, returnSecureToken: true }) })).json()).localId;

  // ── Open My Agent ──
  await page.getByText('Launch SuperSummary').click();
  await page.click('[data-testid=open-agent]');
  await page.waitForSelector('[data-testid=tab-teach]');
  await page.screenshot({ path: 'e2e/screenshots/agent-1-empty.png' });

  // ── Teach: paste 3 summaries (no category → agent classifies) ──
  await page.fill('[data-testid=teach-paste]', SUMMARIES);
  await page.click('[data-testid=teach-add-paste]');
  await page.click('[data-testid=teach-save]');
  const msg = await (await page.waitForSelector('[data-testid=teach-msg]')).textContent();
  ok(/Saved 3 summaries/.test(msg) && /identifier/.test(msg), `upload message: "${msg}"`);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=summary-row]').length === 3);

  const stored = await fsList(`users/${uid}/summaries`);
  const allText = stored.map(d => val(d.fields.text)).join('\n');
  ok(stored.length === 3, 'three summaries stored in Firestore');
  ok(!/Aarav|2024011122|9812345678|Rekha|55667788|Ishaan|Kheri/.test(allText), 'patient names, UHID/CR numbers, phone and address removed before storage');
  ok(/Zinc 20 mg OD x 14 days/.test(allText) && /SpO2 91%/.test(allText), 'clinical content kept');

  // ── Learn ──
  await page.click('[data-testid=teach-learn]');
  await page.waitForSelector('[data-testid=run-panel]');
  await page.waitForFunction(() => /Learning|Waiting/.test(document.querySelector('[data-testid=run-status]')?.textContent || ''), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/screenshots/agent-2-learning.png' });
  await page.waitForFunction(() => /Finished|Failed/.test(document.querySelector('[data-testid=run-status]')?.textContent || ''), null, { timeout: 60000 });
  const status = await page.textContent('[data-testid=run-status]');
  ok(/Finished/.test(status), `learning run finished (${status})`);
  ok(/I read 3 summaries/.test(await page.textContent('[data-testid=run-report]')), 'agent report shown to doctor');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=summary-row]')].every(r => /learned/.test(r.textContent)));
  ok(true, 'all summaries marked learned');
  const classified = (await fsList(`users/${uid}/summaries`)).map(d => val(d.fields.category)).sort();
  ok(JSON.stringify(classified) === JSON.stringify(['Acute gastroenteritis', 'Acute gastroenteritis', 'Bronchiolitis']), `agent classified summaries: ${classified}`);
  await page.screenshot({ path: 'e2e/screenshots/agent-3-learned.png', fullPage: true });

  // ── Memory ──
  await page.click('[data-testid=tab-memory]');
  await page.waitForSelector('[data-testid=memory-file]');
  const files = await page.$$eval('[data-testid=memory-file]', els => els.map(e => e.textContent));
  ok(files.some(f => f.startsWith('categories/acute-gastroenteritis.md')) && files.some(f => f.startsWith('style.md')), `memory files: ${files.map(f => f.split('.md')[0]).join(', ')}`);
  await page.locator('[data-testid=memory-file]', { hasText: 'categories/acute-gastroenteritis.md' }).click();
  const memText = await page.inputValue('[data-testid=memory-editor]');
  ok(/Zinc 20 mg OD x 14 days/.test(memText) && !/Aarav|Rekha/.test(memText), 'category memory has the doctor\'s advice and no patient names');
  await page.fill('[data-testid=memory-editor]', memText + '\n- Always write "Danger signs explained to mother" (doctor added)');
  await page.click('[data-testid=memory-save]');
  await page.waitForFunction(() => document.body.textContent.includes('edited by you'));
  ok(true, 'doctor can correct a memory note (shows "edited by you")');
  await page.screenshot({ path: 'e2e/screenshots/agent-4-memory.png' });

  // ── Draft ──
  await page.click('[data-testid=tab-draft]');
  await page.fill('[data-testid=draft-category]', 'Acute gastroenteritis');
  await page.fill('[data-testid=draft-notes]', `Name: Kabir   UHID: 2024033333
18 month old boy with loose stools 6 episodes/day for 2 days
Some dehydration at admission, improved with IV fluids
Hb 10.4 g/dL, TLC 13200`);
  await page.click('[data-testid=draft-run]');
  await page.waitForSelector('[data-testid=draft-view]', { timeout: 60000 });
  const n = async (s) => (await page.$$(`[data-testid=line-${s}]`)).length;
  const counts = { input: await n('input'), memory: await n('memory'), unverified: await n('unverified'), missing: await n('missing'), template: await n('template') };
  console.log('draft line counts', JSON.stringify(counts));
  ok(counts.input >= 3, 'patient facts sourced from the doctor\'s notes');
  ok(counts.memory >= 2, 'advice sourced from the doctor\'s own memory');
  ok(counts.unverified === 1 && /Serum sodium/.test(await page.textContent('[data-testid=line-unverified]')), 'invented sodium value caught and flagged red');
  ok(counts.missing === 1, 'missing discharge weight shown as needs-your-input, not invented');
  ok(!/Kabir|2024033333/.test(await page.textContent('[data-testid=draft-view]')), 'patient identifiers never reached the AI / draft');
  await page.click('[data-testid=line-unverified]');
  await page.screenshot({ path: 'e2e/screenshots/agent-5-draft.png', fullPage: true });

  // ── Save final & teach ──
  const final = (await page.inputValue('[data-testid=draft-final]')).replace(/^Serum sodium 131 mEq\/L\n?/m, '').replace('[Weight at discharge not provided]', 'Weight at discharge 9.2 kg');
  await page.fill('[data-testid=draft-final]', final);
  await page.click('[data-testid=draft-save-final]');
  ok(/Saved/.test(await (await page.waitForSelector('[data-testid=draft-saved]')).textContent()), 'final copy saved for learning');
  const finals = (await fsList(`users/${uid}/summaries`)).filter(d => val(d.fields.source) === 'final');
  ok(finals.length === 1 && /Serum sodium/.test(val(finals[0].fields.aiDraft)) && !/Serum sodium/.test(val(finals[0].fields.text)), 'final stored with the AI draft, so the agent can learn the doctor\'s corrections');

  // ── Security ──
  const other = await (await fetch(`${AUTH}/accounts:signUp?key=demo-api-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `x${Date.now()}@t.in`, password: pw, returnSecureToken: true }) })).json();
  const me = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-api-key`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw, returnSecureToken: true }) })).json();
  const asUser = (t) => ({ headers: { Authorization: `Bearer ${t}`, 'content-type': 'application/json' } });
  for (const p of ['summaries', 'memories', 'agentRuns']) {
    const r = await fetch(`${FS}/users/${uid}/${p}`, asUser(other.idToken));
    ok(r.status === 403, `other doctor blocked from ${p} (HTTP ${r.status})`);
  }
  let r = await fetch(`${FS}/users/${uid}/summaries?documentId=sneaky`, { method: 'POST', ...asUser(me.idToken), body: JSON.stringify({ fields: { text: { stringValue: 'Name: Real Patient 9812345678' } } }) });
  ok(r.status === 403, `doctor cannot bypass de-identification by writing summaries directly (HTTP ${r.status})`);
  r = await fetch(`${FS}/users/${uid}/agentRuns?documentId=x`, { method: 'POST', ...asUser(me.idToken), body: JSON.stringify({ fields: { kind: { stringValue: 'learn' }, status: { stringValue: 'queued' } } }) });
  ok(r.status === 403, `doctor cannot start agent runs without the quota check (HTTP ${r.status})`);
  r = await fetch(`${FS}/users/${uid}?updateMask.fieldPaths=pendingSummaries`, { method: 'PATCH', ...asUser(me.idToken), body: JSON.stringify({ fields: { pendingSummaries: { integerValue: '0' } } }) });
  ok(r.status === 403, `doctor cannot tamper with server counters (HTTP ${r.status})`);
  const usage = await fsList(`users/${uid}/usage`);
  ok(usage.length === 1 && Number(val(usage[0].fields.drafts)) === 1 && Number(val(usage[0].fields.learnRuns)) >= 1, 'daily usage counted for rate limiting');

  // Phone layout
  const phone = await browser.newContext({ ...require('playwright').devices['iPhone 13'] });
  const pp = await phone.newPage();
  await pp.goto(URL);
  const overflow = await pp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, 'no horizontal scroll on phone');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
