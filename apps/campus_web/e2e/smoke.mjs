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
});

// RFID attendance, server side: what the kiosk PC sends for a card tap
// (kiosk/rfid_bridge.py), checked against registered cards and open sessions.
// The physical reader chain is not part of this test (docs/RFID_TESTING.md).
const CARD = '04:A2:3B:1C';
let readerKey = '';
const scan = async (body) => {
  const r = await fetch(`${BASE}/api/attendance/v1/scan`, { method: 'POST', headers: { authorization: `Bearer ${readerKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

await step('RFID: scans are refused while check-ins are switched off', async () => {
  const aTok = await idToken('admin.demo', DEMO_PASSWORD);
  const { body: reader } = await api('/api/admin/kiosk-devices', { token: aTok, method: 'POST', body: { name: 'E2E reader', capabilities: ['kiosk', 'attendance'] } });
  readerKey = reader.key;
  const off = await scan({ cardUid: CARD });
  check('RFID: scans are refused while check-ins are switched off', off.status === 503 && off.body.status === 'disabled', `${off.status} ${off.body.status}`);
});

await step('RFID: admin switches check-ins on and opens a session on the reader', async () => {
  await admin.goto(`${BASE}/admin/attendance`);
  await admin.getByRole('tab', { name: 'Sessions & settings' }).click();
  await admin.getByLabel('Accept check-ins from readers').check();
  await admin.getByRole('button', { name: 'Save settings' }).click();
  await admin.getByText('Settings saved.').waitFor();
  const form = admin.locator('form').filter({ has: admin.getByRole('button', { name: 'Add session' }) });
  await form.getByLabel('Title').fill('E2E lecture');
  await form.getByLabel('Starts').fill(localInput(new Date(Date.now() - 10 * 60000)));
  await form.getByLabel('Ends').fill(localInput(new Date(Date.now() + 50 * 60000)));
  await form.getByLabel('E2E reader').check();
  await form.getByRole('button', { name: 'Add session' }).click();
  await admin.getByText('Session added.').waitFor();
  await admin.getByText('Open now').first().waitFor();
  check('RFID: admin switches check-ins on and opens a session on the reader', true);
}, admin);

await step('RFID: an unregistered card is refused and listed for assignment', async () => {
  const unknown = await scan({ cardUid: CARD });
  await admin.getByRole('tab', { name: 'Cards' }).click();
  await admin.getByText('..3B:1C').first().waitFor({ timeout: 15000 });
  const raw = await admin.getByText(CARD).count();          // the raw UID is never shown
  check('RFID: an unregistered card is refused and listed for assignment', unknown.status === 404 && unknown.body.status === 'unknown_card' && raw === 0,
    `${unknown.status} ${unknown.body.display} raw-uid-on-page=${raw}`);
}, admin);

await step('RFID: admin assigns the tapped card to a student', async () => {
  await admin.getByLabel('Student username for card ..3B:1C').fill('student.demo');
  await admin.getByRole('button', { name: 'Assign' }).first().click();
  await admin.getByText('Card ..3B:1C now belongs to @student.demo.').waitFor();
  check('RFID: admin assigns the tapped card to a student', true);
}, admin);

await step('RFID: the card checks the student in once; repeats are not recorded twice', async () => {
  // Extra fields from a device (here a forged studentId) are ignored: the
  // student comes from the card registration only.
  const first = await scan({ cardUid: '04a23b1c', studentId: 'someone-else', ageMs: 1500 });
  const again = await scan({ cardUid: CARD });
  check('RFID: the card checks the student in once; repeats are not recorded twice',
    first.status === 201 && first.body.status === 'checked_in' && first.body.display === 'Checked in: Demo'
      && again.status === 200 && again.body.status === 'already_checked_in',
    `${first.status} "${first.body.display}" / ${again.status} ${again.body.status}`);
});

await step('RFID: the dashboard shows the verified record and the scan log', async () => {
  await admin.getByRole('tab', { name: 'Records' }).click();
  const row = admin.locator('tr', { hasText: '@student.demo' });
  await row.first().waitFor({ timeout: 15000 });
  const text = await row.first().innerText();
  const rows = await row.count();
  await admin.getByRole('tab', { name: 'Scan log' }).click();
  await admin.locator('tbody').getByText('Unknown card').first().waitFor();
  await admin.locator('tbody').getByText('Card registered').first().waitFor();
  const repeats = await admin.locator('tr', { hasText: 'Repeat scan' }).count();
  check('RFID: the dashboard shows the verified record and the scan log',
    rows === 1 && text.includes('E2E lecture') && text.includes('Verified') && text.includes('E2E reader') && repeats === 1, `rows=${rows} repeats=${repeats}`);
}, admin);

await step('RFID: students cannot manage cards; a deactivated card is refused', async () => {
  const sTok = await idToken('student.demo', DEMO_PASSWORD);
  const aTok = await idToken('admin.demo', DEMO_PASSWORD);
  const forged = await api('/api/admin/rfid-cards', { token: sTok, method: 'POST', body: { username: 'student.demo', cardUid: '11:22:33:44' } });
  const noKey = await fetch(`${BASE}/api/attendance/v1/scan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cardUid: CARD }) });
  const cards = await (await fetch(`${BASE}/api/admin/kiosk-devices`, { headers: { authorization: `Bearer ${aTok}` } })).json();
  const health = await (await fetch(`${BASE}/api/health`)).json();
  // Deactivate through the API the dashboard uses, then scan again.
  await admin.getByRole('tab', { name: 'Cards' }).click();
  admin.once('dialog', (d) => d.accept());
  await admin.getByRole('button', { name: 'Deactivate' }).first().click();
  await admin.getByText('Card deactivated').waitFor();
  const after = await scan({ cardUid: CARD });
  check('RFID: students cannot manage cards; a deactivated card is refused',
    forged.status === 403 && noKey.status === 401 && after.status === 404 && Array.isArray(cards.devices) && health.rfidAttendance?.cardSecret === 'set',
    `student=${forged.status} nokey=${noKey.status} deactivated=${after.status} secret=${health.rfidAttendance?.cardSecret}`);
}, admin);

await step('app association files are served', async () => {
  const a = await fetch(`${BASE}/.well-known/assetlinks.json`);
  const i = await fetch(`${BASE}/.well-known/apple-app-site-association`);
  check('app association files are served', a.ok && i.ok && (await i.json()).applinks !== undefined);
});

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
