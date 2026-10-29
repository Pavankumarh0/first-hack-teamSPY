// Fills a campus that already has its real buildings and map with DEMO content
// (firebase/seed/demo-content.json): rooms, clubs, events, notices, knowledge,
// quiz questions, QR codes, the Main Gate kiosk, sample posts and reports.
//
//   node scripts/seed-demo-content.mjs --project <id>            dry run: shows the plan, writes nothing
//   node scripts/seed-demo-content.mjs --project <id> --apply    back up, then write
//   node scripts/seed-demo-content.mjs --project <id> --remove   delete the demo content again
//
// Unlike seed.mjs this never replaces data entered in the admin dashboard:
// it writes only documents whose id starts with "demo-" (or QR codes it made
// itself), creates kioskConfig/default only when it is missing, and on the
// real buildings fills only fields that are empty. No user accounts are created;
// demo posts and reports belong to a "Sample Student" that has no account.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { arg, initAdmin } from './lib/admin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(here, '..', 'seed', 'demo-content.json'), 'utf8'));
const { db, projectId } = initAdmin();
const APPLY = arg('apply') === true;
const REMOVE = arg('remove') === true;
const BY = 'seed-demo';
const AUTHOR = { id: 'demo-student', username: 'sample.student', name: 'Sample Student' };
const now = FieldValue.serverTimestamp();
const ago = (minutes) => Timestamp.fromMillis(Date.now() - minutes * 60_000);
const ours = (id) => id.startsWith('demo-');

const DEMO_COLLECTIONS = ['locations', 'clubs', 'events', 'announcements', 'campusKnowledge', 'quizQuestions', 'posts', 'reports', 'studentDiscovery'];

async function commit(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 400)) w(batch);
    await batch.commit();
  }
}

// ---------------------------------------------------------------- remove ---
if (REMOVE) {
  const refs = [];
  for (const col of DEMO_COLLECTIONS) {
    for (const d of (await db.collection(col).get()).docs) {
      if (!ours(d.id)) continue;
      refs.push(d.ref);
      for (const sub of await d.ref.listCollections()) for (const s of (await sub.get()).docs) refs.push(s.ref);
    }
  }
  for (const d of (await db.collection('qrDestinations').where('createdBy', '==', BY).get()).docs) refs.push(d.ref);
  const kiosk = await db.doc('kioskConfig/default').get();
  if (kiosk.exists && kiosk.get('isSample') === true) refs.push(kiosk.ref);
  console.log(`${refs.length} demo document(s) ${APPLY ? 'deleted' : 'would be deleted (add --apply)'} in ${projectId}.`);
  if (APPLY) await commit(refs.map((r) => (b) => b.delete(r)));
  console.log('Fields filled on the real buildings are left as they are.');
  process.exit(0);
}

// ------------------------------------------------------------------ load ---
const map = (await db.doc('campusMap/main').get()).data();
if (!map?.nodes?.length) { console.error('campusMap/main has no nodes: draw the map in the admin dashboard first.'); process.exit(2); }
const nodeIds = new Set(map.nodes.map((n) => n.id));
const buildings = new Map((await db.collection('buildings').get()).docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

const problems = [];
const writes = [];
const plan = {};
const count = (what) => { plan[what] = (plan[what] ?? 0) + 1; };

// existing documents, so nothing that is not ours is ever replaced
const existing = new Map();
async function exists(path) {
  if (!existing.has(path)) existing.set(path, await db.doc(path).get());
  return existing.get(path);
}
async function put(path, data, what) {
  const id = path.split('/').pop();
  const snap = await exists(path);
  if (!ours(id) && snap.exists && snap.get('createdBy') !== BY && snap.get('isSample') !== true) {
    console.log(`  keep   ${path} (already set up in the dashboard)`);
    return;
  }
  writes.push((b) => b.set(db.doc(path), data));
  count(what);
}

// ------------------------------------------------- real buildings: blanks ---
const blank = (v) => v === undefined || v === null || v === '' || v === 0;
const filled = {};
for (const [id, defaults] of Object.entries(D.buildingDefaults)) {
  const b = buildings.get(id);
  if (!b) { problems.push(`building ${id} is not in the database (skipped its defaults)`); continue; }
  const patch = Object.fromEntries(Object.entries(defaults).filter(([k]) => blank(b[k])));
  if (!Object.keys(patch).length) continue;
  filled[id] = Object.keys(patch);
  writes.push((bt) => bt.update(db.doc(`buildings/${id}`), { ...patch, updatedAt: now }));
  count('building fields filled');
}

// ---------------------------------------------------------------- places ---
const locations = new Map();
for (const { id, ...l } of D.locations) {
  const b = l.buildingId ? buildings.get(l.buildingId) : null;
  if (l.buildingId && !b) { problems.push(`${id}: building ${l.buildingId} does not exist`); continue; }
  const navNodeId = l.navNodeId ?? b?.entranceNodeId ?? null;
  if (!nodeIds.has(navNodeId)) { problems.push(`${id}: map node ${navNodeId} does not exist`); continue; }
  const doc = {
    name: l.name, type: l.type, buildingId: l.buildingId, buildingName: b?.name ?? null,
    floor: l.floor ?? null, room: l.room ?? null, description: l.description ?? null, navNodeId,
    keywords: l.keywords ?? [], openingHours: l.openingHours ?? b?.openingHours ?? D.buildingDefaults[l.buildingId]?.openingHours ?? null,
    published: b ? b.published === true : true, isSample: true, createdAt: now, updatedAt: now,
  };
  locations.set(id, doc);
  await put(`locations/${id}`, doc, 'locations');
}

const clubs = new Map();
for (const { id, ...c } of D.clubs) {
  if (c.homeLocationId && !locations.has(c.homeLocationId)) problems.push(`${id}: home ${c.homeLocationId} unknown`);
  clubs.set(id, c);
  await put(`clubs/${id}`, { ...c, managerIds: [], published: true, isSample: true, createdAt: now, updatedAt: now }, 'clubs');
}

const today = new Date();
today.setMinutes(0, 0, 0);
for (const { id, dayOffset, startHour, durationHours, ...e } of D.events) {
  const start = new Date(today);
  start.setDate(start.getDate() + dayOffset);
  start.setHours(startHour);
  await put(`events/${id}`, {
    ...e, clubName: clubs.get(e.clubId)?.name ?? null, venueName: locations.get(e.venueLocationId)?.name ?? null,
    startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(new Date(start.getTime() + durationHours * 3600_000)),
    status: 'published', createdBy: BY, isSample: true, createdAt: now, updatedAt: now,
  }, 'events');
}

for (const [i, { id, ...a }] of D.announcements.entries())
  await put(`announcements/${id}`, {
    ...a, status: 'published', publishedAt: ago(60 * (i + 1)), authorId: BY, isSample: true, createdAt: now, updatedAt: now,
  }, 'announcements');

for (const { id, ...k } of D.knowledge)
  await put(`campusKnowledge/${id}`, {
    ...k, status: 'published', access: 'public', createdBy: BY, isSample: true, createdAt: now, updatedAt: now, publishedAt: now,
  }, 'knowledge');

// Quiz questions must point at something published (the quiz API checks the same).
const knowledgeIds = new Set(D.knowledge.map((k) => k.id));
const published = {
  building: (id) => buildings.get(id)?.published === true,
  location: (id) => locations.get(id)?.published === true,
  club: (id) => clubs.has(id),
  knowledge: (id) => knowledgeIds.has(id),
};
const learnMore = { building: (id) => `/campus/building/${id}`, location: (id) => `/campus/location/${id}`, club: (id) => `/campus/club/${id}` };
for (const { id, ...q } of D.quiz) {
  if (!published[q.sourceType]?.(q.sourceId)) { problems.push(`${id}: source ${q.sourceType}/${q.sourceId} is not published`); continue; }
  // No isSample here: the quizQuestions rules allow only these fields. The demo- id marks it.
  await put(`quizQuestions/${id}`, {
    ...q, ...(learnMore[q.sourceType] ? { learnMoreUrl: learnMore[q.sourceType](q.sourceId) } : {}),
    status: 'published', version: 'demo-1', createdBy: BY, createdAt: now, updatedAt: now,
  }, 'quiz questions');
}

for (const [i, { id, locationId, ...p }] of D.posts.entries()) {
  const t = ago(45 * (i + 1));
  await put(`posts/${id}`, {
    ...p, locationId, locationName: locations.get(locationId)?.name ?? null,
    authorId: AUTHOR.id, authorUsername: AUTHOR.username, authorDisplayName: AUTHOR.name,
    status: 'visible', public: true, helpfulCount: 0, commentCount: 0, lastCommentId: null,
    isSample: true, createdAt: t, updatedAt: t, lastActivityAt: t,
  }, 'posts');
}

for (const [i, { id, locationId, buildingId, status, update, ...r }] of D.reports.entries()) {
  const loc = locationId ? locations.get(locationId) : null;
  const bId = buildingId ?? loc?.buildingId ?? null;
  const t = ago(90 * (i + 1));
  await put(`reports/${id}`, {
    ...r, reporterId: AUTHOR.id, reporterUsername: AUTHOR.username,
    buildingId: bId, buildingName: bId ? buildings.get(bId)?.name ?? null : null,
    locationId: locationId ?? null, locationName: loc?.name ?? null, locationDetail: null, imagePath: null,
    status, assigneeId: null, assigneeName: null,
    lastUpdateId: update ? 'demo-u1' : null, lastUpdateMessage: update ?? null,
    isSample: true, createdAt: t, updatedAt: t,
  }, 'reports');
  if (update) writes.push((b) => b.set(db.doc(`reports/${id}/updates/demo-u1`), {
    type: 'status', fromStatus: 'submitted', toStatus: status, message: update, byId: BY, byName: 'Facilities desk', at: t,
  }));
}

for (const { id, ...p } of D.people)
  await put(`studentDiscovery/${id}`, { ...p, discoverable: true, createdAt: now, updatedAt: now }, 'Find Your People profiles');

// ------------------------------------------------------------- QR codes ---
// One QR per published building and demo room (opens its page), plus one
// "directions" QR per building that starts live walking guidance on the phone.
const qr = async (id, data) => put(`qrDestinations/${id}`, { ...data, active: true, createdBy: BY, isSample: true, updatedAt: now }, 'QR codes');
for (const b of buildings.values()) {
  if (!b.published) continue;
  await qr(`building-${b.id}`, { type: 'building', targetId: b.id, label: b.name, path: `/campus/building/${b.id}` });
  await qr(`route-__me-${b.id}`, { type: 'route', targetId: `__me>${b.id}`, label: `Directions to ${b.name}`, path: `/campus/route?from=__me&to=${b.id}` });
}
for (const [id, l] of locations)
  if (l.published) await qr(`location-${id}`, { type: 'location', targetId: id, label: l.name, path: `/campus/location/${id}` });

// ----------------------------------------------------------------- kiosk ---
const kiosk = await exists('kioskConfig/default');
if (!nodeIds.has(D.kioskConfig.navNodeId)) problems.push(`kioskConfig: node ${D.kioskConfig.navNodeId} not on the map`);
else if (!kiosk.exists || kiosk.get('isSample') === true) {
  writes.push((b) => b.set(kiosk.ref, { ...D.kioskConfig, isSample: true, updatedAt: now }));
  count('kiosk config');
} else console.log('  keep   kioskConfig/default (already set up in the dashboard)');

// ---------------------------------------------------------------- report ---
console.log(`\nDemo content for ${projectId}:`);
for (const [what, n] of Object.entries(plan)) console.log(`  ${String(n).padStart(3)}  ${what}`);
for (const [id, fields] of Object.entries(filled)) console.log(`       ${buildings.get(id).name}: fills ${fields.join(', ')}`);
if (problems.length) { console.log('\nSkipped:'); problems.forEach((p) => console.log('  - ' + p)); }

if (!APPLY) { console.log(`\nDry run: ${writes.length} write(s) planned. Add --apply to write them.`); process.exit(0); }

const backupDir = join(here, '..', 'backups');
mkdirSync(backupDir, { recursive: true });
const backup = join(backupDir, `before-demo-content-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(backup, JSON.stringify({
  buildings: [...buildings.values()],
  replaced: Object.fromEntries([...existing].filter(([, s]) => s.exists).map(([p, s]) => [p, s.data()])),
}, null, 2));
console.log(`\nbackup written: ${backup}`);
await commit(writes);
console.log(`written: ${writes.length} document(s).`);
process.exit(0);
