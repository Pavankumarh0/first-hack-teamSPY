// Drives the Flutter app (web build) against the Firebase emulators: sign in
// by username, file a maintenance report, then check that the website's admin
// dashboard lists it. Run through tool/web_smoke.sh.
//
// Flutter draws on a canvas, so the script switches on Flutter's semantics
// tree and works with its accessible labels. If www.gstatic.com is not
// reachable (offline CI), the Firebase JS SDK is served from the website's
// node_modules instead.
const path = require('node:path');
const { chromium } = require('playwright');

const APP = process.env.APP_URL ?? 'http://localhost:5050';
const SITE = process.env.SITE_URL ?? 'http://localhost:3000';
const FIREBASE_JS = path.resolve(__dirname, '../../campus_web/node_modules/firebase');
const PASSWORD = 'Campus@demo1';
const title = `Projector flickering ${Date.now().toString(36)}`;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (r) =>
    r.fulfill({ path: path.join(FIREBASE_JS, r.request().url().split('/').pop()), contentType: 'text/javascript' }));
  const app = await ctx.newPage();
  const semantics = () => app.evaluate(() => document.querySelector('flt-semantics-placeholder')?.click());
  // Semantics nodes take DOM click events (the canvas pane sits above them).
  const tap = (loc) => loc.first().dispatchEvent('click');
  const button = (text) => app.locator('flt-semantics[role=button]', { hasText: text });

  await app.goto(`${APP}/#/login`);
  await app.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60000 });
  await app.waitForTimeout(5000);
  await semantics();
  await app.getByRole('textbox', { name: 'Username' }).fill('student.demo');
  await app.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await tap(button('Sign in'));
  await app.waitForTimeout(4000);

  await app.goto(`${APP}/#/reports/new`);
  await app.waitForTimeout(4000);
  await semantics();
  const pick = async (field, option) => {
    await tap(button(field));
    await app.waitForTimeout(1000);
    await tap(app.locator(`flt-semantics[role=menuitem][aria-label="${option}"]`));
    await app.waitForTimeout(600);
  };
  await pick('Category', 'Electrical');
  await app.getByRole('textbox', { name: 'Title' }).fill(title);
  await pick('Building', 'Main Academic Block (A Block)');
  await app.getByRole('textbox', { name: 'What is wrong?' }).fill('The projector in A-201 flickers and turns off every few minutes.');
  await tap(button('Submit report'));
  await app.waitForURL(/#\/reports\/(?!new$)[A-Za-z0-9]+$/, { timeout: 30000 });
  console.log('PASS  report filed in the app:', app.url());

  const site = await (await browser.newContext()).newPage();
  await site.goto(`${SITE}/login`);
  await site.getByLabel('Username').fill('admin.demo');
  await site.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await site.getByRole('button', { name: 'Sign in' }).click();
  await site.waitForURL(`${SITE}/`);
  await site.goto(`${SITE}/admin/reports`);
  await site.getByText(title).waitFor({ timeout: 20000 });
  console.log('PASS  the admin dashboard lists the report filed in the app');
  await browser.close();
})().catch((e) => { console.error('FAIL ', e.message.split('\n')[0]); process.exit(1); });
