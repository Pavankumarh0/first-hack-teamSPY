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

let current = null;   // the page to screenshot if a step fails
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (r) =>
    r.fulfill({ path: path.join(FIREBASE_JS, r.request().url().split('/').pop()), contentType: 'text/javascript' }));
  const app = await ctx.newPage();
  current = app;
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

  // RFID: a real check-in made through the backend (as the kiosk PC sends it),
  // then read back by the student in the app's "My attendance" screen.
  const idToken = async (u) => (await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=k`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${u}@users.campus-mithra.invalid`, password: PASSWORD, returnSecureToken: true }) })).json()).idToken;
  const call = async (url, token, body, method = 'POST') => {
    const r = await fetch(`${SITE}${url}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const aTok = await idToken('admin.demo');
  const reader = (await call('/api/admin/kiosk-devices', aTok, { name: 'Smoke reader', capabilities: ['attendance'] })).body;
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await site.goto(`${SITE}/admin/attendance`);
  await site.getByRole('tab', { name: 'Sessions & settings' }).click();
  await site.getByLabel('Accept check-ins from readers').check();
  await site.getByRole('button', { name: 'Save settings' }).click();
  await site.getByText('Settings saved.').waitFor();
  const form = site.locator('form').filter({ has: site.getByRole('button', { name: 'Add session' }) });
  await form.getByLabel('Title').fill('Smoke lecture');
  await form.getByLabel('Starts').fill(local(new Date(Date.now() - 600000)));
  await form.getByLabel('Ends').fill(local(new Date(Date.now() + 3000000)));
  await form.getByLabel('Smoke reader').check();
  await form.getByRole('button', { name: 'Add session' }).click();
  await site.getByText('Session added.').waitFor();
  const reg = await call('/api/admin/rfid-cards', aTok, { username: 'student.demo', cardUid: 'A3:2F:91:0C' });
  const scan = await call('/api/attendance/v1/scan', reader.key, { cardUid: 'A3:2F:91:0C' });
  if (reg.status !== 201 || scan.body.status !== 'checked_in') throw new Error(`check-in failed: ${reg.status} ${JSON.stringify(scan.body)}`);
  await app.goto(`${APP}/#/attendance`);
  await semantics();
  await app.locator('flt-semantics', { hasText: 'Smoke lecture' }).first().waitFor({ timeout: 30000 });
  await app.locator('flt-semantics', { hasText: 'Last 30 days: 1 check-in' }).first().waitFor({ timeout: 30000 });
  console.log('PASS  the student sees their RFID check-in in the app');

  // Live directions from the phone's own position (faked GPS). The sample
  // campus is pinned to test coordinates first - an emulator fixture only.
  const web = path.resolve(__dirname, '../../campus_web');
  const { initializeApp, getApps } = require(require.resolve('firebase-admin/app', { paths: [web] }));
  const { getFirestore } = require(require.resolve('firebase-admin/firestore', { paths: [web] }));
  const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-campus-mithra' }));
  const geo = { lat: 10, lng: 76, rotationDeg: 0 };
  await db.doc('campusMap/main').update({ geo });
  const m = (await db.doc('campusMap/main').get()).data();
  const toLatLng = (x, y) => ({
    latitude: geo.lat - ((y - m.height / 2) * m.metersPerUnit) / 111320,
    longitude: geo.lng + ((x - m.width / 2) * m.metersPerUnit) / (111320 * Math.cos((geo.lat * Math.PI) / 180)),
  });
  const gate = m.nodes.find((n) => n.id === 'n-gate');
  const libNodeId = (await db.doc('locations/library-reading-hall').get()).data().navNodeId;
  const libNode = m.nodes.find((n) => n.id === libNodeId);
  await ctx.grantPermissions(['geolocation'], { origin: APP });
  await ctx.setGeolocation({ ...toLatLng(gate.x + 4, gate.y - 20), accuracy: 8 });
  await app.evaluate(() => { location.hash = '#/map?to=library-reading-hall'; });
  await app.waitForTimeout(4000);
  await semantics();
  await tap(button('START FROM MY LOCATION'));
  // Flutter exposes some text as aria-label rather than text content.
  const announced = (source) => app.waitForFunction((src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll('flt-semantics')].some((el) => re.test(`${el.getAttribute('aria-label') ?? ''} ${el.textContent}`));
  }, source, { timeout: 30000 });
  await announced('m to Library Reading Hall');
  await ctx.setGeolocation({ ...toLatLng(libNode.x + 2, libNode.y), accuracy: 8 });
  await announced("you.re here");
  console.log('PASS  live directions in the app follow the GPS and announce arrival');
  await browser.close();
})().catch(async (e) => {
  console.error('FAIL ', e.message.split('\n')[0]);
  const shot = path.resolve(__dirname, '../build/web_smoke_failure.png');
  await current?.screenshot({ path: shot }).then(() => console.error(`      screenshot: ${shot}`)).catch(() => {});
  process.exit(1);
});
