// Writes the SAMPLE campus (firebase/seed/sample-campus.json) into Firestore.
//
//   node scripts/seed.mjs --emulator                 sample content into the local emulators
//   node scripts/seed.mjs --emulator --demo-users    ...plus demo accounts and demo posts
//   node scripts/seed.mjs --project <id> --confirm-sample-data
//                                                    sample content into a real project
//
// Every document gets isSample: true so the apps label it, and the admin
// dashboard can replace it. Demo accounts are created only in the emulator:
// they have known passwords.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { arg, initAdmin } from './lib/admin.mjs';
import { C, createAccount, normalizeUsername } from './lib/accounts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(join(here, '..', 'seed', 'sample-campus.json'), 'utf8'));
export const DEMO_PASSWORD = 'Campus@demo1';

const ctx = initAdmin();
const { db, auth, useEmulator, projectId } = ctx;

if (!useEmulator && arg('confirm-sample-data') !== true) {
  console.error(`This writes SAMPLE campus data into the real project "${projectId}".`);
  console.error('Re-run with --confirm-sample-data if that is what you want.');
  process.exit(2);
}
if (arg('demo-users') === true && !useEmulator) {
  console.error('--demo-users is only allowed with the emulator: demo accounts have known passwords.');
  process.exit(2);
}

const now = FieldValue.serverTimestamp();
const sample = { isSample: true, updatedAt: now };

async function writeAll(entries) {
  // Firestore batches hold at most 500 writes.
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [ref, data] of entries.slice(i, i + 400)) batch.set(ref, data);
    await batch.commit();
  }
}

const buildingsById = Object.fromEntries(S.buildings.map((b) => [b.id, b]));
const clubsById = Object.fromEntries(S.clubs.map((c) => [c.id, c]));
const locationsById = Object.fromEntries(S.locations.map((l) => [l.id, l]));
const entries = [];

const { id: mapId, ...map } = S.map;
entries.push([db.doc(`campusMap/${mapId}`), { ...map, ...sample }]);

for (const { id, ...b } of S.buildings)
  entries.push([db.doc(`buildings/${id}`), { ...b, published: true, ...sample, createdAt: now }]);

for (const { id, ...l } of S.locations)
  entries.push([db.doc(`locations/${id}`), {
    ...l,
    buildingName: buildingsById[l.buildingId]?.name ?? null,
    description: l.description ?? null,
    openingHours: l.openingHours ?? buildingsById[l.buildingId]?.openingHours ?? null,
    published: true, ...sample, createdAt: now,
  }]);

for (const { id, ...c } of S.clubs)
  entries.push([db.doc(`clubs/${id}`), { ...c, managerIds: [], published: true, ...sample, createdAt: now }]);

const today = new Date();
today.setMinutes(0, 0, 0);
for (const { id, dayOffset, startHour, durationHours, ...e } of S.events) {
  const start = new Date(today);
  start.setDate(start.getDate() + dayOffset);
  start.setHours(startHour);
  const end = new Date(start.getTime() + durationHours * 3600_000);
  entries.push([db.doc(`events/${id}`), {
    ...e,
    clubName: clubsById[e.clubId].name,
    startAt: Timestamp.fromDate(start),
    endAt: Timestamp.fromDate(end),
    createdBy: 'seed',
    ...sample, createdAt: now,
  }]);
}

for (const { id, ...a } of S.announcements)
  entries.push([db.doc(`announcements/${id}`), {
    ...a,
    publishedAt: a.status === 'published' ? now : null,
    authorId: 'seed',
    ...sample, createdAt: now,
  }]);

const { id: kioskId, ...kiosk } = S.kioskConfig;
entries.push([db.doc(`kioskConfig/${kioskId}`), { ...kiosk, ...sample }]);

for (const q of S.qrDestinations) {
  const target = q.type === 'location' ? locationsById[q.targetId] : null;
  entries.push([db.doc(`qrDestinations/${q.type}-${q.targetId}`), {
    ...q,
    path: `/campus/${q.type}/${q.targetId}`,
    note: target ? target.name : null,
    active: true,
    createdBy: 'seed',
    ...sample, createdAt: now,
  }]);
}

entries.push([db.doc('settings/reportWorkflow'), { transitions: C.reportTransitions, updatedAt: now }]);
entries.push([db.doc('settings/attendance'), {
  enabled: false,
  status: 'pending_hardware',
  duplicateWindowMinutes: 10,
  note: 'RFID readers are not installed yet. See docs/RFID_INTEGRATION.md.',
  updatedAt: now,
}]);

await writeAll(entries);
console.log(`Seeded ${entries.length} sample documents into ${useEmulator ? 'the emulator' : projectId} (project ${projectId}).`);

if (arg('demo-users') === true) {
  const uids = {};
  for (const u of S.demoUsers) {
    const name = normalizeUsername(u.username);
    const existing = await db.doc(`usernames/${name}`).get();
    if (existing.exists && existing.data().uid) {
      uids[name] = existing.data().uid;
      continue;
    }
    uids[name] = await createAccount({ auth, db }, {
      username: name, password: DEMO_PASSWORD, displayName: u.displayName, role: u.role,
      department: u.department ?? '', year: u.year ?? null, createdBy: 'seed',
    });
  }
  for (const u of S.demoUsers)
    for (const clubId of u.manages ?? [])
      await db.doc(`clubs/${clubId}`).update({ managerIds: FieldValue.arrayUnion(uids[u.username]) });

  for (const { id, author, ...p } of S.demoPosts) {
    const profile = (await db.doc(`users/${uids[author]}`).get()).data();
    await db.doc(`posts/${id}`).set({
      ...p,
      authorId: uids[author],
      authorUsername: profile.username,
      authorDisplayName: profile.displayName,
      locationName: locationsById[p.locationId]?.name ?? null,
      status: 'visible',
      helpfulCount: 0, commentCount: 0, lastCommentId: null,
      isSample: true,
      createdAt: now, updatedAt: now, lastActivityAt: now,
    });
  }
  console.log('Demo accounts (emulator only), all with password', DEMO_PASSWORD);
  for (const u of S.demoUsers) console.log(`  ${u.username.padEnd(16)} ${u.role}`);
}
