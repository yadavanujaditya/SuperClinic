// End-to-end test of the ClinicFlow Notebook (ask your books, verified citations).
// Needs: fake Claude server (node functions/test/fakeAnthropic.js), `npm run emulators`
// with functions/.env.local = ANTHROPIC_BASE_URL=http://127.0.0.1:4010, and `npm run dev`.
// Run from clinicalmind/:  node e2e/notebook.e2e.cjs
const { chromium, devices } = require('playwright');
const path = require('path');
const URL = 'http://localhost:5173/';
const FS = 'http://127.0.0.1:8080/v1/projects/demo-superclinic/databases/(default)/documents';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const BOOK = path.join(__dirname, 'fixtures', 'test-paediatrics-handbook.pdf');
const SHOTS = path.join(__dirname, 'screenshots');
const email = `nb${Date.now()}@test.in`, pw = 'secret123';
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(URL);
  await page.click('[data-testid=profile-button]');
  await page.getByText('Sign in / Profile').click();
  await page.getByText('New here? Create an account').click();
  await page.fill('[data-testid=email]', email);
  await page.fill('[data-testid=password]', pw);
  await page.click('[data-testid=email-submit]');
  await page.waitForSelector('[data-testid=sign-out]');
  await page.mouse.click(5, 5);

  // ClinicFlow → Notebook
  await page.getByText('Launch ClinicFlow').click();
  await page.click('[data-testid=open-notebook]');
  await page.waitForSelector('[data-testid=notebook]');

  // Upload a book
  await page.setInputFiles('[data-testid=nb-upload]', BOOK);
  const upMsg = await (await page.waitForSelector('[data-testid=nb-upload-msg]', { timeout: 30000 })).textContent();
  ok(/pages indexed/.test(upMsg), `book uploaded: "${upMsg}"`);
  const me = await post(`${AUTH}/accounts:signInWithPassword?key=demo-api-key`, { email, password: pw, returnSecureToken: true });
  const books = (await (await fetch(`${FS}/users/${me.localId}/books`, { headers: { Authorization: 'Bearer owner' } })).json()).documents || [];
  ok(books.length === 1 && books[0].fields.status.stringValue === 'ready', 'book stored privately with page text');

  // Ask with the complaints
  await page.fill('[data-testid=nb-age]', '4 months');
  await page.fill('[data-testid=nb-complaints]', 'cough for 5 days, fever for 10 days, fast breathing');
  await page.click('[data-testid=nb-ask]');
  await page.waitForSelector('[data-testid=nb-answer]', { timeout: 90000 });
  const okCites = await page.locator('[data-testid=nb-cite-ok]').count();
  const badCites = await page.locator('[data-testid=nb-cite-bad]').count();
  const diffs = await page.$$eval('[data-testid=nb-diff] strong', els => els.map(e => e.textContent));
  console.log('differentials:', diffs.join(', '), '| verified citations:', okCites, '| failed:', badCites);
  ok(diffs.includes('Acute bronchiolitis') && diffs.includes('Pneumonia') && diffs.includes('Enteric fever'), 'differentials found from the book');
  ok(okCites >= 5, 'points carry verified book + page citations');
  ok(badCites === 1, 'the made-up quote ("antibiotics are always required") is caught');
  ok((await page.locator('[data-testid=nb-point-uncited]').count()) === 1, 'uncited point labelled as general knowledge');
  ok(/Local antibiotic resistance/.test(await page.textContent('[data-testid=nb-answer]')), '"not covered by your books" listed');
  await page.screenshot({ path: path.join(SHOTS, 'notebook-1-answer.png'), fullPage: true });

  // Open a verified citation → page with the quote highlighted
  await page.locator('[data-testid=nb-diff]', { hasText: 'Pneumonia' }).locator('[data-testid=nb-cite-ok]').first().click();
  await page.waitForSelector('[data-testid=nb-page]');
  const hl = await page.textContent('[data-testid=nb-highlight]');
  const pageText = (await page.textContent('[data-testid=nb-page]')).replace(/\s+/g, ' ');
  ok(/pneumonia/i.test(hl) && pageText.includes('Lower chest indrawing is a danger sign'), `citation opens the book page with the quote highlighted: "${hl.slice(0, 60)}…"`);
  await page.screenshot({ path: path.join(SHOTS, 'notebook-2-citation.png') });
  await page.mouse.click(5, 5);

  // Open the failed citation → explains why
  await page.click('[data-testid=nb-cite-bad]');
  ok(/not on that page/.test(await page.textContent('[data-testid=nb-page]')), 'failed citation explains why it was rejected');
  await page.screenshot({ path: path.join(SHOTS, 'notebook-3-rejected.png') });
  await page.mouse.click(5, 5);

  // Follow-up question
  await page.fill('[data-testid=nb-followup]', 'Which investigation for prolonged fever?');
  await page.press('[data-testid=nb-followup]', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=nb-answer]').length === 2, null, { timeout: 90000 });
  ok((await page.locator('[data-testid=nb-answer]').nth(1).locator('[data-testid=nb-cite-ok]').count()) > 0, 'follow-up question answered with citations');

  // From a consultation: "Ask my books" pre-fills the complaint
  await page.getByText('← Back').click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await page.getByText('Fever with Cough').first().click();
  await page.fill('input[placeholder="e.g. 6"]', '4');
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByText('Start Consultation →').click();
  await page.getByText('📓 Ask my books').click();
  await page.waitForSelector('[data-testid=notebook]');
  ok(/Fever with Cough/.test(await page.inputValue('[data-testid=nb-complaints]')), 'consultation → Notebook pre-fills the complaint');

  // Privacy: another doctor can't read the books
  const other = await post(`${AUTH}/accounts:signUp?key=demo-api-key`, { email: `o${Date.now()}@t.in`, password: pw, returnSecureToken: true });
  const r = await fetch(`${FS}/users/${me.localId}/books`, { headers: { Authorization: `Bearer ${other.idToken}` } });
  ok(r.status === 403, `other doctor blocked from your books (HTTP ${r.status})`);

  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const pp = await phone.newPage();
  await pp.goto(URL);
  ok(!(await pp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'no horizontal scroll on phone');

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
