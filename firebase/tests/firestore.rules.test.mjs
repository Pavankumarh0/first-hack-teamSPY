// Security rules tests. Run with `npm test` (starts the emulators itself).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, Timestamp,
  updateDoc, where, writeBatch, increment, deleteDoc,
} from 'firebase/firestore';

let env;
const STUDENT = { role: 'student', active: true };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-campus-mithra',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(async () => { await env?.cleanup(); });

const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const student = (uid = 'stu1') => as(uid, STUDENT);
const staff = (uid = 'staff1') => as(uid, { role: 'staff', active: true });
const admin = (uid = 'admin1') => as(uid, { role: 'admin', active: true });
const manager = (uid = 'mgr1') => as(uid, { role: 'club_manager', active: true });
const anon = () => env.unauthenticatedContext().firestore();

async function seed(fn) { await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore())); }

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    for (const [uid, username, role] of [['stu1', 'asha.k', 'student'], ['stu2', 'ravi.m', 'student'],
      ['staff1', 'raju.staff', 'staff'], ['staff2', 'mohan.staff', 'staff'], ['admin1', 'office.admin', 'admin'],
      ['mgr1', 'robotics.lead', 'club_manager']])
      await setDoc(doc(db, `users/${uid}`), { username, displayName: username, role, status: 'active' });
    await setDoc(doc(db, 'buildings/library'), { name: 'Library', code: 'LIB', published: true });
    await setDoc(doc(db, 'buildings/secret'), { name: 'Unpublished', code: 'X', published: false });
    await setDoc(doc(db, 'clubs/robotics'), { name: 'Robotics', managerIds: ['mgr1'], published: true });
    await setDoc(doc(db, 'clubs/coding'), { name: 'Coding', managerIds: [], published: true });
  });
});

function report(uid, overrides = {}) {
  return {
    reporterId: uid, reporterUsername: uid === 'stu1' ? 'asha.k' : 'ravi.m',
    category: 'electrical', title: 'Fan not working', description: 'The ceiling fan in A-201 does not turn on.',
    buildingId: 'a-block', buildingName: 'A Block', locationId: 'a-201', locationName: 'A-201', locationDetail: null,
    imagePath: null, status: 'submitted', assigneeId: null, assigneeName: null, lastUpdateId: null,
    lastUpdateMessage: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides,
  };
}

async function seedReport(id = 'r1', fields = {}) {
  await seed((db) => setDoc(doc(db, `reports/${id}`), { ...report('stu1'), status: 'submitted', lastUpdateId: null,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(), ...fields }));
}

function changeReport(db, id, { from, to, by, byName, extra = {}, type = 'status' }) {
  const b = writeBatch(db);
  const u = doc(collection(db, `reports/${id}/updates`));
  b.update(doc(db, `reports/${id}`), { status: to, lastUpdateId: u.id, lastUpdateMessage: 'note', updatedAt: serverTimestamp(), ...extra });
  b.set(u, { type, fromStatus: from, toStatus: to, message: 'note', byId: by, byName, at: serverTimestamp() });
  return b.commit();
}

describe('accounts', () => {
  it('a student edits their profile but cannot change their role', async () => {
    await assertSucceeds(updateDoc(doc(student(), 'users/stu1'), { displayName: 'Asha Kumari', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(student(), 'users/stu1'), { role: 'admin' }));
    await assertFails(updateDoc(doc(student(), 'users/stu1'), { status: 'active', displayName: 'x' }));
  });
  it('profiles are private and username reservations unreadable', async () => {
    await assertFails(getDoc(doc(student(), 'users/stu2')));
    await assertSucceeds(getDoc(doc(admin(), 'users/stu2')));
    await assertFails(getDoc(doc(admin(), 'usernames/asha.k')));
  });
  it('an account without role claims (made outside the backend) only reads public data', async () => {
    const raw = as('rogue', {});
    await assertSucceeds(getDoc(doc(raw, 'buildings/library')));
    await assertFails(setDoc(doc(raw, 'reports/x'), report('rogue')));
  });
  it('a suspended admin cannot write', async () => {
    const suspended = as('admin1', { role: 'admin', active: false });
    await assertFails(setDoc(doc(suspended, 'announcements/a'), {
      title: 't', body: 'b', category: 'notice', status: 'draft', pinned: false, isSample: false, updatedAt: serverTimestamp() }));
  });
});

describe('directory and official content', () => {
  it('the public sees published buildings only', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'buildings/library')));
    await assertFails(getDoc(doc(anon(), 'buildings/secret')));
    await assertSucceeds(getDoc(doc(admin(), 'buildings/secret')));
    await assertSucceeds(getDocs(query(collection(anon(), 'buildings'), where('published', '==', true))));
    await assertFails(getDocs(collection(anon(), 'buildings')));
  });
  it('students cannot create buildings, announcements or events; admins can', async () => {
    const building = { name: 'New', code: 'N', category: 'academic', x: 1, y: 1, w: 1, h: 1, published: true, isSample: false, updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(student(), 'buildings/new'), building));
    await assertSucceeds(setDoc(doc(admin(), 'buildings/new'), building));
    const notice = { title: 'Exam', body: 'Body', category: 'notice', status: 'published', pinned: false, isSample: false, updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(student(), 'announcements/n'), notice));
    await assertSucceeds(setDoc(doc(admin(), 'announcements/n'), notice));
  });
  it('drafts are hidden from the public', async () => {
    await seed((db) => setDoc(doc(db, 'announcements/d'), { title: 'x', status: 'draft' }));
    await assertFails(getDoc(doc(anon(), 'announcements/d')));
    await assertFails(getDocs(collection(student(), 'announcements')));
    await assertSucceeds(getDocs(query(collection(anon(), 'announcements'), where('status', '==', 'published'))));
  });
});

describe('club events', () => {
  const event = (clubId, uid, status = 'published') => ({
    clubId, clubName: 'Club', title: 'Workshop', description: 'Hands on', venueName: 'D-105', venueLocationId: null,
    startAt: Timestamp.fromMillis(Date.now() + 86400e3), endAt: Timestamp.fromMillis(Date.now() + 90000e3),
    status, isSample: false, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  it('a club manager publishes for their own club only', async () => {
    await assertSucceeds(setDoc(doc(manager(), 'events/e1'), event('robotics', 'mgr1')));
    await assertFails(setDoc(doc(manager(), 'events/e2'), event('coding', 'mgr1')));
    await assertFails(setDoc(doc(student(), 'events/e3'), event('robotics', 'stu1')));
  });
  it('a manager can list their club drafts; students see published events only', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'events/draft'), { ...event('robotics', 'mgr1', 'draft'), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
      await setDoc(doc(db, 'events/live'), { ...event('robotics', 'mgr1'), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    });
    await assertSucceeds(getDoc(doc(manager(), 'events/draft')));
    await assertSucceeds(getDocs(query(collection(manager(), 'events'), where('clubId', '==', 'robotics'))));
    await assertFails(getDoc(doc(student(), 'events/draft')));
    await assertSucceeds(getDocs(query(collection(anon(), 'events'), where('status', 'in', ['published', 'cancelled']))));
  });
});

describe('maintenance reports', () => {
  it('a student files a report for themselves, in the submitted state', async () => {
    await assertSucceeds(setDoc(doc(student(), 'reports/r1'), report('stu1')));
    await assertFails(setDoc(doc(student(), 'reports/r2'), report('stu1', { status: 'resolved' })));
    await assertFails(setDoc(doc(student(), 'reports/r3'), report('stu2')));
    await assertFails(setDoc(doc(student(), 'reports/r4'), report('stu1', { reporterUsername: 'someone.else' })));
    await assertFails(setDoc(doc(student(), 'reports/r5'), report('stu1', { imagePath: 'reports/stu2/r5/x.jpg' })));
    await assertSucceeds(setDoc(doc(student(), 'reports/r6'), report('stu1', { imagePath: 'reports/stu1/r6/photo.jpg' })));
  });
  it('only the reporter and staff can read a report', async () => {
    await seedReport();
    await assertSucceeds(getDoc(doc(student('stu1'), 'reports/r1')));
    await assertFails(getDoc(doc(student('stu2'), 'reports/r1')));
    await assertSucceeds(getDoc(doc(staff(), 'reports/r1')));
    await assertSucceeds(getDocs(query(collection(student('stu1'), 'reports'), where('reporterId', '==', 'stu1'))));
    await assertFails(getDocs(collection(student('stu1'), 'reports')));
  });
  it('the lifecycle is enforced and every change is recorded', async () => {
    await seedReport();
    // a student cannot move it
    await assertFails(changeReport(student(), 'r1', { from: 'submitted', to: 'acknowledged', by: 'stu1', byName: 'asha.k' }));
    // skipping states is refused
    await assertFails(changeReport(admin(), 'r1', { from: 'submitted', to: 'resolved', by: 'admin1', byName: 'admin' }));
    // a change without a history entry is refused
    await assertFails(updateDoc(doc(admin(), 'reports/r1'), { status: 'acknowledged', updatedAt: serverTimestamp() }));
    await assertSucceeds(changeReport(admin(), 'r1', { from: 'submitted', to: 'acknowledged', by: 'admin1', byName: 'admin' }));
    // staff not assigned cannot touch it
    await assertFails(changeReport(staff(), 'r1', { from: 'acknowledged', to: 'assigned', by: 'staff1', byName: 'raju' }));
    await assertSucceeds(changeReport(admin(), 'r1', { from: 'acknowledged', to: 'assigned', by: 'admin1', byName: 'admin',
      type: 'assignment', extra: { assigneeId: 'staff1', assigneeName: 'raju.staff' } }));
    await assertFails(changeReport(staff('staff2'), 'r1', { from: 'assigned', to: 'in_progress', by: 'staff2', byName: 'mohan' }));
    await assertSucceeds(changeReport(staff(), 'r1', { from: 'assigned', to: 'in_progress', by: 'staff1', byName: 'raju' }));
    // the assignee cannot reassign it
    await assertFails(changeReport(staff(), 'r1', { from: 'in_progress', to: 'assigned', by: 'staff1', byName: 'raju', extra: { assigneeId: 'staff2' } }));
    await assertSucceeds(changeReport(staff(), 'r1', { from: 'in_progress', to: 'resolved', by: 'staff1', byName: 'raju' }));
    // the reporter sees the history and can comment
    await assertSucceeds(getDocs(collection(student('stu1'), 'reports/r1/updates')));
    await assertFails(getDocs(collection(student('stu2'), 'reports/r1/updates')));
    await assertSucceeds(setDoc(doc(student('stu1'), 'reports/r1/updates/c1'), {
      type: 'comment', message: 'Thanks, it works now', byId: 'stu1', byName: 'asha.k', at: serverTimestamp() }));
  });
  it('an admin-configured workflow replaces the default transitions', async () => {
    await seedReport();
    await assertSucceeds(setDoc(doc(admin(), 'settings/reportWorkflow'), { transitions: { submitted: ['resolved'] }, updatedAt: serverTimestamp() }));
    await assertSucceeds(changeReport(admin(), 'r1', { from: 'submitted', to: 'resolved', by: 'admin1', byName: 'admin' }));
    await assertFails(setDoc(doc(student(), 'settings/reportWorkflow'), { transitions: {} }));
  });
  it('staff notify the reporter, and nobody else', async () => {
    await seedReport();
    const n = (userId) => ({ type: 'report_status', audience: 'user', userId, reportId: 'r1', title: 'Report update',
      body: 'Acknowledged', link: '/reports/r1', read: false, createdAt: serverTimestamp() });
    await assertSucceeds(setDoc(doc(staff(), 'notifications/n1'), n('stu1')));
    await assertFails(setDoc(doc(staff(), 'notifications/n2'), n('stu2')));
    await assertFails(setDoc(doc(student(), 'notifications/n3'), n('stu1')));
    await assertSucceeds(getDocs(query(collection(student('stu1'), 'notifications'), where('userId', '==', 'stu1'))));
    await assertFails(getDoc(doc(student('stu2'), 'notifications/n1')));
    await assertSucceeds(updateDoc(doc(student('stu1'), 'notifications/n1'), { read: true }));
    await assertFails(updateDoc(doc(student('stu1'), 'notifications/n1'), { title: 'hacked' }));
  });
});

describe('community', () => {
  const post = (uid, username, overrides = {}) => ({
    authorId: uid, authorUsername: username, authorDisplayName: username, title: 'Is the Wi-Fi working?',
    body: 'Keeps dropping in B Block.', category: 'wifi', locationId: null, locationName: null, status: 'visible',
    public: false, helpfulCount: 0, commentCount: 0, lastCommentId: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastActivityAt: serverTimestamp(), ...overrides,
  });
  function createPost(db, id, uid, username, overrides) {
    const b = writeBatch(db);
    b.set(doc(db, `posts/${id}`), post(uid, username, overrides));
    b.update(doc(db, `users/${uid}`), { lastPostAt: serverTimestamp() });
    return b.commit();
  }
  async function seedPost(id = 'p1', fields = {}) {
    await seed((db) => setDoc(doc(db, `posts/${id}`), { ...post('stu1', 'asha.k'), createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(), lastActivityAt: Timestamp.now(), ...fields }));
  }

  it('posting is rate limited and tied to the real username', async () => {
    await assertSucceeds(createPost(student(), 'p1', 'stu1', 'asha.k'));
    await assertFails(createPost(student(), 'p2', 'stu1', 'asha.k'));            // within 30 s
    await assertFails(setDoc(doc(student('stu2'), 'posts/p3'), post('stu2', 'ravi.m'))); // no rate stamp
    await assertFails(createPost(student('stu2'), 'p4', 'stu2', 'asha.k'));      // impersonation
    await assertFails(createPost(student('stu2'), 'p5', 'stu2', 'ravi.m', { public: true })); // self-approval
  });
  it('helpful votes: one per student, counted exactly', async () => {
    await seedPost();
    const db = student('stu2');
    const vote = () => { const b = writeBatch(db); b.set(doc(db, 'posts/p1/reactions/stu2'), { createdAt: serverTimestamp() }); b.update(doc(db, 'posts/p1'), { helpfulCount: increment(1) }); return b.commit(); };
    await assertSucceeds(vote());
    await assertFails(vote());
    await assertFails(updateDoc(doc(db, 'posts/p1'), { helpfulCount: increment(5) }));
    const unvote = writeBatch(db); unvote.delete(doc(db, 'posts/p1/reactions/stu2')); unvote.update(doc(db, 'posts/p1'), { helpfulCount: increment(-1) });
    await assertSucceeds(unvote.commit());
  });
  it('comments keep the count honest', async () => {
    await seedPost();
    const db = student('stu2');
    const b = writeBatch(db);
    b.set(doc(db, 'posts/p1/comments/c1'), { authorId: 'stu2', authorUsername: 'ravi.m', authorDisplayName: 'Ravi', body: 'Same here.', status: 'visible', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    b.update(doc(db, 'posts/p1'), { commentCount: increment(1), lastCommentId: 'c1', lastActivityAt: serverTimestamp() });
    b.update(doc(db, 'users/stu2'), { lastCommentAt: serverTimestamp() });
    await assertSucceeds(b.commit());
    await assertFails(updateDoc(doc(db, 'posts/p1'), { commentCount: increment(1), lastCommentId: 'ghost', lastActivityAt: serverTimestamp() }));
  });
  it('moderation is admin-only, and the public sees approved posts only', async () => {
    await seedPost('p1', { public: true });
    await seedPost('p2');
    await assertFails(updateDoc(doc(student('stu2'), 'posts/p1'), { status: 'hidden' }));
    await assertSucceeds(getDoc(doc(anon(), 'posts/p1')));
    await assertFails(getDoc(doc(anon(), 'posts/p2')));
    await assertSucceeds(getDoc(doc(student('stu2'), 'posts/p2')));
    await assertSucceeds(updateDoc(doc(admin(), 'posts/p1'), { status: 'hidden', public: false, moderatedBy: 'admin1', moderatedAt: serverTimestamp(), moderationNote: 'abusive' }));
    await assertFails(getDoc(doc(student('stu2'), 'posts/p1')));
    await assertSucceeds(getDoc(doc(student('stu1'), 'posts/p1'))); // the author still sees it
  });
  it('a student can flag a post once', async () => {
    await seedPost();
    const flag = { reporterId: 'stu2', targetType: 'post', targetPath: 'posts/p1', reason: 'abusive', status: 'open', createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(student('stu2'), 'flags/post_p1_stu2'), flag));
    await assertFails(setDoc(doc(student('stu2'), 'flags/post_p1_stu2'), flag));
    await assertFails(getDocs(collection(student('stu2'), 'flags')));
  });
});

describe('RFID attendance', () => {
  it('records, cards and the scan log are written only by the backend', async () => {
    await seed((db) => setDoc(doc(db, 'attendanceRecords/s1_stu1'), { studentId: 'stu1' }));
    await assertSucceeds(getDoc(doc(admin(), 'attendanceRecords/s1_stu1')));
    await assertFails(setDoc(doc(admin(), 'attendanceRecords/a2'), { studentId: 'stu1' }));
    await assertFails(setDoc(doc(student(), 'attendanceRecords/s1_stu1'), { studentId: 'stu1' }));
    await assertFails(setDoc(doc(admin(), 'rfidCards/c1'), { studentId: 'stu1' }));
    await assertFails(setDoc(doc(student(), 'rfidCards/c1'), { studentId: 'stu1' }));
    await assertFails(setDoc(doc(admin(), 'attendanceAudit/x'), { result: 'checked_in' }));
    await assertFails(getDoc(doc(admin(), 'kioskDevices/k1')));
  });

  it('a student reads their own records only, and never cards or the scan log', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'attendanceRecords/s1_stu1'), { studentId: 'stu1', sessionId: 's1' });
      await setDoc(doc(db, 'attendanceRecords/s1_stu2'), { studentId: 'stu2', sessionId: 's1' });
      await setDoc(doc(db, 'rfidCards/c1'), { studentId: 'stu1' });
      await setDoc(doc(db, 'attendanceAudit/a1'), { studentId: 'stu1' });
    });
    await assertSucceeds(getDoc(doc(student('stu1'), 'attendanceRecords/s1_stu1')));
    await assertSucceeds(getDocs(query(collection(student('stu1'), 'attendanceRecords'), where('studentId', '==', 'stu1'))));
    await assertFails(getDoc(doc(student('stu1'), 'attendanceRecords/s1_stu2')));
    await assertFails(getDocs(query(collection(student('stu1'), 'attendanceRecords'), where('sessionId', '==', 's1'))));
    await assertFails(getDoc(doc(student('stu1'), 'rfidCards/c1')));
    await assertFails(getDoc(doc(student('stu1'), 'attendanceAudit/a1')));
    await assertFails(getDoc(doc(anon(), 'attendanceRecords/s1_stu1')));
    await assertFails(getDoc(doc(as('x', {}), 'attendanceRecords/s1_stu1')));
  });

  it('sessions are admin-managed, with a valid time window and reader list', async () => {
    const session = (extra = {}) => ({ title: 'CS301', course: 'CSE 3A', readerIds: ['reader1'],
      startsAt: Timestamp.fromDate(new Date('2026-11-03T09:00:00Z')), endsAt: Timestamp.fromDate(new Date('2026-11-03T10:00:00Z')),
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });
    await assertSucceeds(setDoc(doc(admin(), 'attendanceSessions/s1'), session()));
    await assertFails(setDoc(doc(student(), 'attendanceSessions/s2'), session()));
    await assertFails(setDoc(doc(admin(), 'attendanceSessions/s3'), session({ endsAt: Timestamp.fromDate(new Date('2026-11-03T08:00:00Z')) })));
    await assertFails(setDoc(doc(admin(), 'attendanceSessions/s4'), session({ readerIds: 'reader1' })));
    await assertFails(getDoc(doc(student(), 'attendanceSessions/s1')));
  });
});
