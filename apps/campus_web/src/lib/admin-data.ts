'use client';

import {
  arrayRemove, arrayUnion, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit as qLimit, orderBy,
  query, serverTimestamp, setDoc, startAfter, Timestamp, updateDoc, where, writeBatch,
  type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { fb } from './firebase/client';
import { fromDoc, type Announcement, type Building, type CampusEvent, type CampusKnowledge, type Club, type Page, type Place, type Post, type Report, type UserProfile } from './data';
import type { CampusMap } from './navigation';
import { campusPath, isValidId, type CampusLink } from './deeplinks';
import { REPORT_STATUS_LABELS, type ReportStatus } from './constants';
import type { Workflow } from './reports';

// Writes the dashboard makes directly with the client SDK. The security rules
// decide whether each one is allowed; hiding a button is not the protection.
// Account roles and kiosk keys go through the API routes instead (Admin SDK).

const now = () => serverTimestamp();

async function all<T>(path: string, constraints: QueryConstraint[]): Promise<T[]> {
  const snap = await getDocs(query(collection(fb().db, path), ...constraints));
  return snap.docs.map((d) => fromDoc<T>(d));
}

async function paged<T>(path: string, constraints: QueryConstraint[], size: number, cursor?: QueryDocumentSnapshot | null): Promise<Page<T>> {
  const snap = await getDocs(query(collection(fb().db, path), ...constraints, ...(cursor ? [startAfter(cursor)] : []), qLimit(size)));
  return { items: snap.docs.map((d) => fromDoc<T>(d)), cursor: snap.docs.length === size ? snap.docs[snap.docs.length - 1] : null };
}

export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
export async function countWhere(path: string, constraints: QueryConstraint[]): Promise<number> {
  return (await getCountFromServer(query(collection(fb().db, path), ...constraints))).data().count;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------
export const adminListAnnouncements = () => all<Announcement>('announcements', [orderBy('updatedAt', 'desc'), qLimit(200)]);

export async function saveAnnouncement(id: string | null, a: { title: string; body: string; category: string; pinned: boolean; status: string }, uid: string, previous?: Announcement | null) {
  const ref = id ? doc(fb().db, `announcements/${id}`) : doc(collection(fb().db, 'announcements'));
  const publishing = a.status === 'published' && previous?.status !== 'published';
  const b = writeBatch(fb().db);
  b.set(ref, {
    title: a.title.trim(), body: a.body.trim(), category: a.category, pinned: a.pinned, status: a.status,
    authorId: uid, isSample: previous?.isSample ?? false, updatedAt: now(),
    // Untouched on edits: re-writing a stored timestamp through a JS Date loses precision.
    ...(publishing ? { publishedAt: now() } : id ? {} : { publishedAt: null }),
    ...(id ? {} : { createdAt: now() }),
  }, { merge: true });
  // A newly published announcement also reaches the students' notification inbox.
  if (publishing) {
    b.set(doc(collection(fb().db, 'notifications')), {
      type: 'announcement', audience: 'all', userId: null, title: a.title.trim().slice(0, 120),
      body: a.body.trim().slice(0, 200), link: `/campus/notice/${ref.id}`, read: false, createdAt: now(),
    });
  }
  await b.commit();
  return ref.id;
}
export const deleteAnnouncement = (id: string) => deleteDoc(doc(fb().db, `announcements/${id}`));

// Official text knowledge that should be retrievable by the kiosk.
export const adminListCampusKnowledge = () => all<CampusKnowledge>('campusKnowledge', [orderBy('updatedAt', 'desc'), qLimit(500)]);
export async function saveCampusKnowledge(id: string | null, value: Omit<CampusKnowledge, 'id' | 'updatedAt' | 'createdBy'>, uid: string, previous?: CampusKnowledge | null) {
  const ref = id ? doc(fb().db, `campusKnowledge/${id}`) : doc(collection(fb().db, 'campusKnowledge'));
  const fields = {
    ...value, title: value.title.trim(), body: value.body.trim(), updatedAt: now(),
    ...(value.status === 'published' && previous?.status !== 'published' ? { publishedAt: now() } : {}),
  };
  if (previous) await setDoc(ref, fields, { merge: true });
  else await setDoc(ref, { ...fields, createdBy: uid, isSample: false, createdAt: now() });
  return ref.id;
}
export const deleteCampusKnowledge = (id: string) => deleteDoc(doc(fb().db, `campusKnowledge/${id}`));

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------
export const adminListBuildings = () => all<Building>('buildings', [orderBy('name')]);
export const adminListPlaces = () => all<Place>('locations', [orderBy('name')]);

export async function saveBuilding(id: string, b: Omit<Building, 'id'>) {
  if (!isValidId(id)) throw new Error('The id may only use letters, digits, - and _.');
  await setDoc(doc(fb().db, `buildings/${id}`), { ...b, updatedAt: now() }, { merge: true });
}
export async function savePlace(id: string, p: Omit<Place, 'id'>) {
  if (!isValidId(id)) throw new Error('The id may only use letters, digits, - and _.');
  await setDoc(doc(fb().db, `locations/${id}`), { ...p, updatedAt: now() }, { merge: true });
}
export const deleteBuilding = (id: string) => deleteDoc(doc(fb().db, `buildings/${id}`));
export const deletePlace = (id: string) => deleteDoc(doc(fb().db, `locations/${id}`));

export async function saveCampusMap(map: CampusMap) {
  await setDoc(doc(fb().db, 'campusMap/main'), { ...map, updatedAt: now() });
}

// ---------------------------------------------------------------------------
// Clubs and events
// ---------------------------------------------------------------------------
/** Admins see every club; a club manager only the clubs they manage. */
export function listManagedClubs(uid: string, isAdmin: boolean) {
  return isAdmin ? all<Club>('clubs', [orderBy('name')]) : all<Club>('clubs', [where('managerIds', 'array-contains', uid)]);
}
export async function saveClub(id: string, c: Partial<Club>, isNew: boolean) {
  if (!isValidId(id)) throw new Error('The id may only use letters, digits, - and _.');
  await setDoc(doc(fb().db, `clubs/${id}`), { ...c, updatedAt: now(), ...(isNew ? { createdAt: now() } : {}) }, { merge: true });
}
export async function updateClubAsManager(id: string, c: { description: string; contact: string }) {
  await updateDoc(doc(fb().db, `clubs/${id}`), { description: c.description, contact: c.contact, updatedAt: now() });
}
export const addClubManager = (clubId: string, uid: string) => updateDoc(doc(fb().db, `clubs/${clubId}`), { managerIds: arrayUnion(uid), updatedAt: now() });
export const removeClubManager = (clubId: string, uid: string) => updateDoc(doc(fb().db, `clubs/${clubId}`), { managerIds: arrayRemove(uid), updatedAt: now() });
export const deleteClub = (id: string) => deleteDoc(doc(fb().db, `clubs/${id}`));

export async function listEventsForClubs(clubIds: string[] | 'all'): Promise<CampusEvent[]> {
  if (clubIds === 'all') return all<CampusEvent>('events', [orderBy('startAt', 'desc'), qLimit(200)]);
  const lists = await Promise.all(clubIds.map((id) => all<CampusEvent>('events', [where('clubId', '==', id), orderBy('startAt', 'desc')])));
  return lists.flat().sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
}

export interface EventInput {
  clubId: string; clubName: string; title: string; description: string; startAt: Date; endAt: Date;
  venueName: string; venueLocationId: string | null; status: 'draft' | 'published' | 'cancelled';
}
export async function saveEvent(id: string | null, e: EventInput, uid: string, previous?: CampusEvent | null) {
  const ref = id ? doc(fb().db, `events/${id}`) : doc(collection(fb().db, 'events'));
  const fields = {
    ...e, title: e.title.trim(), description: e.description.trim(), venueName: e.venueName.trim(),
    startAt: Timestamp.fromDate(e.startAt), endAt: Timestamp.fromDate(e.endAt), updatedAt: now(),
  };
  // createdBy/createdAt must stay exactly as stored (the rules check), so an
  // edit merges and never re-writes them.
  if (previous) await setDoc(ref, fields, { merge: true });
  else await setDoc(ref, { ...fields, isSample: false, createdBy: uid, createdAt: now() });
  return ref.id;
}

/** Campus-wide "new event" notification (admins only, by the rules). */
export async function announceEvent(eventId: string, title: string, when: string) {
  await setDoc(doc(collection(fb().db, 'notifications')), {
    type: 'event', audience: 'all', userId: null, title: `New event: ${title}`.slice(0, 120), body: when.slice(0, 200),
    link: `/campus/event/${eventId}`, read: false, createdAt: now(),
  });
}

// ---------------------------------------------------------------------------
// Maintenance reports
// ---------------------------------------------------------------------------
export interface ReportFilter { status: string | 'open' | 'all'; assignedTo?: string | null }

export function listReports(f: ReportFilter, size = 25, cursor?: QueryDocumentSnapshot | null) {
  const c: QueryConstraint[] = [];
  if (f.assignedTo) {
    c.push(where('assigneeId', '==', f.assignedTo), orderBy('updatedAt', 'desc'));
  } else if (f.status === 'open') {
    c.push(where('status', 'in', ['submitted', 'acknowledged', 'assigned', 'in_progress']), orderBy('createdAt', 'desc'));
  } else if (f.status !== 'all') {
    c.push(where('status', '==', f.status), orderBy('createdAt', 'desc'));
  } else {
    c.push(orderBy('createdAt', 'desc'));
  }
  return paged<Report>('reports', c, size, cursor);
}

export async function getWorkflow(): Promise<Workflow | null> {
  const s = await getDoc(doc(fb().db, 'settings/reportWorkflow'));
  return s.exists() ? (s.data().transitions as Workflow) : null;
}
export async function saveWorkflow(transitions: Workflow) {
  await setDoc(doc(fb().db, 'settings/reportWorkflow'), { transitions, updatedAt: now() });
}

/**
 * Moves a report (and/or assigns it), records the history entry and notifies
 * the reporter - one batch, as the rules require.
 */
export async function changeReport(report: Report, change: {
  status: ReportStatus; message: string; assignee?: { uid: string; name: string } | null; by: { uid: string; name: string };
}) {
  const { db } = fb();
  const b = writeBatch(db);
  const update = doc(collection(db, `reports/${report.id}/updates`));
  const assigning = change.assignee !== undefined && change.assignee?.uid !== report.assigneeId;
  const type = report.status !== change.status ? 'status' : assigning ? 'assignment' : 'comment';
  const message = change.message.trim() || (assigning && change.assignee ? `Assigned to ${change.assignee.name}` : '');
  b.update(doc(db, `reports/${report.id}`), {
    status: change.status, lastUpdateId: update.id, lastUpdateMessage: message || null, updatedAt: now(),
    ...(assigning ? { assigneeId: change.assignee?.uid ?? null, assigneeName: change.assignee?.name ?? null } : {}),
  });
  b.set(update, { type, fromStatus: report.status, toStatus: change.status, message, byId: change.by.uid, byName: change.by.name, at: now() });
  if (report.status !== change.status) {
    b.set(doc(collection(db, 'notifications')), {
      type: 'report_status', audience: 'user', userId: report.reporterId, reportId: report.id,
      title: `Your report is now ${REPORT_STATUS_LABELS[change.status].toLowerCase()}`,
      body: `${report.title}${message ? ` - ${message}` : ''}`.slice(0, 500), link: `/reports/${report.id}`, read: false, createdAt: now(),
    });
  }
  await b.commit();
}

/** Staff accounts an admin can assign reports to. */
export const listStaff = () => all<UserProfile>('users', [where('role', 'in', ['staff', 'admin']), orderBy('username'), qLimit(200)]);

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------
export interface FlagRow { id: string; reporterId: string; targetType: 'post' | 'comment'; targetPath: string; reason: string; status: string; createdAt: Date | null }
export const listOpenFlags = () => all<FlagRow>('flags', [where('status', '==', 'open'), orderBy('createdAt', 'desc'), qLimit(100)]);
export const resolveFlag = (id: string) => updateDoc(doc(fb().db, `flags/${id}`), { status: 'resolved' });

export const adminListPosts = (status: string, size = 25, cursor?: QueryDocumentSnapshot | null) =>
  paged<Post>('posts', [where('status', '==', status), orderBy('lastActivityAt', 'desc')], size, cursor);

export async function moderatePost(postId: string, uid: string, change: { status: string; public: boolean; note?: string }) {
  await updateDoc(doc(fb().db, `posts/${postId}`), {
    status: change.status, public: change.public, moderatedBy: uid, moderatedAt: now(), moderationNote: change.note?.trim() || null,
  });
}
export async function moderateComment(path: string, status: 'visible' | 'hidden' | 'removed') {
  await updateDoc(doc(fb().db, path), { status, updatedAt: now() });
}
export async function loadFlagTarget(path: string): Promise<Record<string, unknown> | null> {
  const s = await getDoc(doc(fb().db, path));
  return s.exists() ? fromDoc<Record<string, unknown>>(s) : null;
}

// ---------------------------------------------------------------------------
// Users (read here; role/status changes go through /api/admin/users)
// ---------------------------------------------------------------------------
export const listUsers = (role: string | 'all', size = 50, cursor?: QueryDocumentSnapshot | null) =>
  paged<UserProfile>('users', role === 'all' ? [orderBy('username')] : [where('role', '==', role), orderBy('username')], size, cursor);

// ---------------------------------------------------------------------------
// QR destinations
// ---------------------------------------------------------------------------
export interface QrRow { id: string; type: CampusLink['type']; targetId: string; label: string; path: string; active: boolean; isSample?: boolean; updatedAt: Date | null }
export const listQr = () => all<QrRow>('qrDestinations', [orderBy('updatedAt', 'desc'), qLimit(300)]);
export async function saveQr(link: CampusLink, labelText: string, uid: string) {
  const path = campusPath(link);
  const id = link.type === 'route' ? `route-${link.from ?? 'any'}-${link.to}` : `${link.type}-${link.id}`;
  await setDoc(doc(fb().db, `qrDestinations/${id}`), {
    type: link.type, targetId: link.type === 'route' ? `${link.from ?? ''}>${link.to}` : link.id,
    label: labelText.trim().slice(0, 120), path, active: true, createdBy: uid, updatedAt: now(),
  });
  return id;
}
export const setQrActive = (id: string, active: boolean) => updateDoc(doc(fb().db, `qrDestinations/${id}`), { active, updatedAt: now() });

// ---------------------------------------------------------------------------
// Kiosk configuration and attendance settings
// ---------------------------------------------------------------------------
export interface KioskConfig {
  id: string; name: string; locationId: string | null; navNodeId: string | null; welcomeText: string;
  enabledActions: string[]; announcementsLimit: number; featuredLocationIds: string[];
}
export const listKioskConfigs = () => all<KioskConfig>('kioskConfig', []);
export async function saveKioskConfig(c: KioskConfig) {
  const { id, ...rest } = c;
  await setDoc(doc(fb().db, `kioskConfig/${id}`), { ...rest, updatedAt: now() });
}

export interface AttendanceSettings { enabled: boolean; status?: string; duplicateWindowMinutes?: number; note?: string }
export async function getAttendanceSettings(): Promise<AttendanceSettings | null> {
  const s = await getDoc(doc(fb().db, 'settings/attendance'));
  return s.exists() ? (s.data() as AttendanceSettings) : null;
}
export async function saveAttendanceSettings(s: AttendanceSettings) {
  await setDoc(doc(fb().db, 'settings/attendance'), { ...s, updatedAt: now() });
}
export interface AttendanceSession { id: string; title: string; course?: string; startsAt: Date; endsAt: Date; readerIds?: string[] }
export const listAttendanceSessions = () => all<AttendanceSession>('attendanceSessions', [orderBy('startsAt', 'desc'), qLimit(50)]);
export async function saveAttendanceSession(s: { title: string; course: string; startsAt: Date; endsAt: Date; readerIds: string[] }) {
  await setDoc(doc(collection(fb().db, 'attendanceSessions')), {
    title: s.title.trim(), course: s.course.trim(), startsAt: Timestamp.fromDate(s.startsAt), endsAt: Timestamp.fromDate(s.endsAt),
    readerIds: s.readerIds, createdAt: now(), updatedAt: now(),
  });
}
export async function setSessionReaders(id: string, readerIds: string[]) {
  await updateDoc(doc(fb().db, `attendanceSessions/${id}`), { readerIds, updatedAt: now() });
}

// Written only by the backend after it has validated the card (lib/server/attendance.ts).
export interface AttendanceRecordRow {
  id: string; sessionId: string; sessionTitle?: string; course?: string;
  studentId: string; studentUsername?: string; studentName?: string;
  readerId: string; readerName?: string; checkInAt: Date | null; method: string; cardHint?: string; deviceDelayMs?: number;
}
export interface RecordFilter { sessionId?: string; username?: string; day?: string /* YYYY-MM-DD, local time */ }
/** Newest first. One equality filter is applied in Firestore (session, else
    student); a day narrows by time; a student within a session is filtered here. */
export async function listAttendanceRecords(f: RecordFilter, size = 100): Promise<AttendanceRecordRow[]> {
  const c: QueryConstraint[] = [];
  const username = f.username?.trim().toLowerCase();
  if (f.sessionId) c.push(where('sessionId', '==', f.sessionId));
  else if (username) c.push(where('studentUsername', '==', username));
  if (f.day) {
    const start = new Date(`${f.day}T00:00:00`);
    const end = new Date(start.getTime() + 86_400_000);
    c.push(where('checkInAt', '>=', Timestamp.fromDate(start)), where('checkInAt', '<', Timestamp.fromDate(end)));
  }
  const rows = await all<AttendanceRecordRow>('attendanceRecords', [...c, orderBy('checkInAt', 'desc'), qLimit(size)]);
  return f.sessionId && username ? rows.filter((r) => r.studentUsername === username) : rows;
}

export interface RfidCardRow {
  id: string; studentId: string; studentUsername: string; studentName?: string; cardHint: string; label?: string;
  active: boolean; registeredAt: Date | null; updatedAt: Date | null;
}
export const listRfidCards = (username?: string) => {
  const u = username?.trim().toLowerCase();
  return all<RfidCardRow>('rfidCards', [...(u ? [where('studentUsername', '==', u)] : []), orderBy('registeredAt', 'desc'), qLimit(100)]);
};

export interface ScanLogRow {
  id: string; result: string; readerId: string | null; readerName?: string | null; cardKey: string; cardHint?: string;
  sessionId: string | null; studentId: string | null; studentUsername?: string | null; deviceDelayMs?: number; at: Date | null;
}
export const listScanLog = (result?: string) =>
  all<ScanLogRow>('attendanceAudit', [...(result ? [where('result', '==', result)] : []), orderBy('at', 'desc'), qLimit(100)]);
