// End-to-end smoke test against the Firebase emulators.
//
//   cd apps/campus_web && npm run e2e
//
// which builds the site for the emulators, starts the emulators with the
// sample seed + demo accounts, serves the site on :3000 and runs this file.
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// require() also finds a globally installed Playwright (NODE_PATH); ESM import does not.
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const AUTH_EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const DEMO_PASSWORD = 'Campus@demo1';
const stamp = Date.now().toString(36);
const results = [];
mkdirSync('e2e/artifacts', { recursive: true });

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
async function step(name, fn, page) {
  try { await fn(); } catch (err) {
    check(name, false, err.message.split('\n')[0]);
    if (page) await page.screenshot({ path: `e2e/artifacts/${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`, fullPage: true }).catch(() => {});
  }
}

async function idToken(username, password) {
  const r = await fetch(`${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-api-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${username}@users.campus-mithra.invalid`, password, returnSecureToken: true }),
  });
  const b = await r.json();
  if (!b.idToken) throw new Error(`sign-in failed for ${username}: ${JSON.stringify(b.error ?? b)}`);
  return b.idToken;
}
async function api(path, { token, method = 'GET', body } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function signInUi(page, username, password) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}

const browser = await chromium.launch();
const anon = await (await browser.newContext()).newPage();
const student = await (await browser.newContext()).newPage();
const admin = await (await browser.newContext()).newPage();
const studentName = `e2e.student${stamp}`.slice(0, 24);
let reportUrl = '';

await step('public home shows official notices and events from Firestore', async () => {
  await anon.goto(BASE);
  await anon.getByText('Library open till 11 PM during exams').first().waitFor({ timeout: 20000 });
  await anon.getByText('Line-follower robot workshop').first().waitFor();
  check('public home shows official notices and events from Firestore', true);
});

await step('QR destination resolves to the location page with an app hand-off', async () => {
  await anon.goto(`${BASE}/campus/location/library-reading-hall`);
  await anon.getByRole('heading', { name: 'Library Reading Hall' }).waitFor({ timeout: 15000 });
  const href = await anon.getByRole('link', { name: 'Open in app' }).getAttribute('href');
  check('QR destination resolves to the location page with an app hand-off', href === 'campusmithra://campus/location/library-reading-hall', href);
});

await step('unknown and malformed QR destinations show a safe page', async () => {
  await anon.goto(`${BASE}/campus/location/no-such-room`);
  await anon.getByText('We could not find that place').waitFor({ timeout: 15000 });
  await anon.goto(`${BASE}/campus/event/bad%20id`);
  await anon.getByText('We could not find that event').waitFor({ timeout: 15000 });
  check('unknown and malformed QR destinations show a safe page', true);
});

await step('route deep link draws campus-only directions', async () => {
  await anon.goto(`${BASE}/campus/route?from=admission-office&to=main-canteen`);
  await anon.getByText('You have arrived at Canteen entrance.').waitFor({ timeout: 15000 });
  check('route deep link draws campus-only directions', true);
});

await step('a student registers with a username only (no email or phone field)', async () => {
  await student.goto(`${BASE}/register`);
  const emailFields = await student.locator('input[type=email], input[type=tel]').count();
  await student.getByLabel('Username').fill(studentName);
  await student.getByLabel('Your name').fill('E2E Student');
  await student.getByLabel(/^Password/).fill('campus2026');
  await student.getByLabel('Confirm password').fill('campus2026');
  await student.getByRole('button', { name: 'Create account' }).click();
  // Signed in: redirected home with the account menu in the header.
  await student.waitForURL(`${BASE}/`, { timeout: 20000 });
  await student.getByRole('button', { name: studentName }).waitFor({ timeout: 20000 });
  check('a student registers with a username only (no email or phone field)', emailFields === 0, `${emailFields} email/phone inputs`);
}, student);

await step('the student files a maintenance report', async () => {
  await student.goto(`${BASE}/reports/new`);
  await student.getByLabel('Category').selectOption('electrical');
  await student.getByLabel('Title').fill(`E2E fan broken ${stamp}`);
  await student.getByLabel('Building').selectOption('a-block');
  await student.getByLabel('What is wrong?').fill('The ceiling fan in the corridor does not turn on at all.');
  await student.getByRole('button', { name: 'Submit report' }).click();
  await student.waitForURL(/\/reports\/(?!new$)[A-Za-z0-9]+$/, { timeout: 20000 });
  reportUrl = student.url();
  await student.getByText('Report submitted').waitFor();
  check('the student files a maintenance report', true, reportUrl.split('/').pop());
}, student);

await step('a student cannot open the admin dashboard', async () => {
  await student.goto(`${BASE}/admin`);
  await student.getByText('No dashboard access').waitFor({ timeout: 15000 });
  check('a student cannot open the admin dashboard', true);
}, student);

await step('the report appears in the admin dashboard and the admin acknowledges it', async () => {
  await signInUi(admin, 'admin.demo', DEMO_PASSWORD);
  await admin.goto(`${BASE}/admin/reports`);
  await admin.getByText(`E2E fan broken ${stamp}`).click({ timeout: 20000 });
  const drawer = admin.getByRole('dialog');
  await drawer.getByLabel('Status').selectOption('acknowledged');
  await drawer.getByLabel('Note for the student').fill('Electrician informed.');
  await drawer.getByRole('button', { name: 'Save update' }).click();
  // The history (not the textarea) shows the change.
  await drawer.getByRole('listitem').filter({ hasText: 'Electrician informed.' }).waitFor({ timeout: 15000 });
  await drawer.getByText('Acknowledged', { exact: true }).first().waitFor();
  check('the report appears in the admin dashboard and the admin acknowledges it', true);
}, admin);

await step('the student sees the new status and an in-app notification', async () => {
  await student.goto(reportUrl);
  await student.getByText('Electrician informed.').waitFor({ timeout: 15000 });
  await student.goto(`${BASE}/notifications`);
  await student.getByText('Your report is now acknowledged').waitFor({ timeout: 15000 });
  check('the student sees the new status and an in-app notification', true);
}, student);

await step('an admin-published event appears on the public website', async () => {
  const title = `E2E open house ${stamp}`;
  await admin.goto(`${BASE}/admin/events`);
  await admin.getByRole('button', { name: 'New event' }).click();
  await admin.getByLabel('Title').fill(title);
  await admin.getByLabel('Status').selectOption('published');
  await admin.getByLabel('Venue (on the map)').selectOption('auditorium-hall');
  await admin.getByRole('button', { name: 'Save event' }).click();
  await admin.getByText(title).waitFor({ timeout: 15000 });
  await anon.goto(`${BASE}/events`);
  await anon.getByText(title).waitFor({ timeout: 15000 });
  check('an admin-published event appears on the public website', true);
}, admin);

await step('community posts are rate limited', async () => {
  await student.goto(`${BASE}/community/new`);
  await student.getByLabel('Topic').selectOption('wifi');
  await student.getByLabel('Title').fill(`Wi-Fi in A Block today? ${stamp}`);
  await student.getByLabel('Details').fill('Works for me on the second floor.');
  await student.getByRole('button', { name: 'Post' }).click();
  await student.waitForURL(/\/community\/(?!new$)[A-Za-z0-9]+$/, { timeout: 20000 });
  await student.getByText('Student opinion').first().waitFor();
  await student.goto(`${BASE}/community/new`);
  await student.getByLabel('Topic').selectOption('wifi');
  await student.getByLabel('Title').fill('A second post straight away');
  await student.getByLabel('Details').fill('Spam?');
  await student.getByRole('button', { name: 'Post' }).click();
  await student.getByText('Please wait 30 seconds between posts').waitFor({ timeout: 15000 });
  check('community posts are rate limited', true);
}, student);

await step('backend APIs refuse students and accept admins', async () => {
  const sTok = await idToken(studentName, 'campus2026');
  const aTok = await idToken('admin.demo', DEMO_PASSWORD);
  const a = await api('/api/admin/kiosk-devices', { token: sTok, method: 'POST', body: { name: 'hack', capabilities: ['kiosk'] } });
  const b = await api('/api/admin/users/whatever', { token: sTok, method: 'PATCH', body: { role: 'admin' } });
  const c = await api('/api/admin/kiosk-devices', { token: aTok });
  check('backend APIs refuse students and accept admins', a.status === 403 && b.status === 403 && c.status === 200, `${a.status}/${b.status}/${c.status}`);
});

await step('kiosk API: directions, search and QR URL with a device key', async () => {
  const aTok = await idToken('admin.demo', DEMO_PASSWORD);
  const { body: dev } = await api('/api/admin/kiosk-devices', { token: aTok, method: 'POST', body: { name: 'E2E kiosk', capabilities: ['kiosk'] } });
  const noKey = await api('/api/kiosk/v1/config');
  const dir = await fetch(`${BASE}/api/kiosk/v1/directions?to=library-reading-hall`, { headers: { authorization: `Bearer ${dev.key}` } }).then((r) => r.json());
  const search = await fetch(`${BASE}/api/kiosk/v1/search?q=bus%20pass`, { headers: { authorization: `Bearer ${dev.key}` } }).then((r) => r.json());
  const scan = await fetch(`${BASE}/api/attendance/v1/scan`, { method: 'POST', headers: { authorization: `Bearer ${dev.key}`, 'content-type': 'application/json' }, body: '{}' });
  const ok = noKey.status === 401 && dir.steps?.at(-1) === 'You have arrived at Library entrance.' && dir.qrUrl?.includes('/campus/route?')
    && search.results?.[0]?.id === 'transport-office' && scan.status === 403;
  check('kiosk API: directions, search and QR URL with a device key', ok, `${dir.summary} | search=${search.results?.[0]?.id} | scan=${scan.status}`);
  // RFID stays off: a device allowed to submit check-ins still gets "pending hardware".
  const { body: reader } = await api('/api/admin/kiosk-devices', { token: aTok, method: 'POST', body: { name: 'E2E reader', capabilities: ['attendance'] } });
  const pending = await fetch(`${BASE}/api/attendance/v1/scan`, { method: 'POST', headers: { authorization: `Bearer ${reader.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ cardUid: '04:A2:3B:1C', sessionId: 'x' }) });
  const pb = await pending.json();
  check('RFID check-in reports pending hardware (not implemented)', pending.status === 503 && pb.status === 'pending_hardware', `${pending.status} ${pb.status}`);
});

await step('app association files are served', async () => {
  const a = await fetch(`${BASE}/.well-known/assetlinks.json`);
  const i = await fetch(`${BASE}/.well-known/apple-app-site-association`);
  check('app association files are served', a.ok && i.ok && (await i.json()).applinks !== undefined);
});

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
