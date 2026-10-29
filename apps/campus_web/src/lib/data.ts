'use client';

import {
  collection, doc, getDoc, getDocs, increment, limit as qLimit, orderBy, query, serverTimestamp, setDoc,
  startAfter, Timestamp, updateDoc, where, writeBatch, type DocumentData, type DocumentSnapshot,
  type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { fb } from './firebase/client';
import type { CampusMap } from './navigation';
import type { AnnouncementStatus, EventStatus, PostStatus, ReportStatus, Role } from './constants';

// ---------------------------------------------------------------------------
// Models (Firestore schema - docs/ARCHITECTURE.md)
// ---------------------------------------------------------------------------
export interface Building {
  id: string; name: string; code: string; category: string; description?: string | null;
  x: number; y: number; w: number; h: number; floors?: number | null; openingHours?: string | null;
  entranceNodeId?: string | null; accessible?: boolean; published: boolean; isSample?: boolean;
}
export interface Place {
  id: string; name: string; type: string; buildingId?: string | null; buildingName?: string | null;
  floor?: number | null; room?: string | null; description?: string | null; navNodeId?: string | null;
  keywords?: string[]; openingHours?: string | null; published: boolean; isSample?: boolean;
}
export interface Announcement {
  id: string; title: string; body: string; category: 'announcement' | 'notice'; status: AnnouncementStatus;
  pinned: boolean; publishedAt: Date | null; updatedAt: Date | null; isSample?: boolean;
}
export interface CampusKnowledge {
  id: string; title: string; body: string; sourceType: 'handbook' | 'policy' | 'faq' | 'procedure' | 'general';
  status: 'draft' | 'published' | 'archived'; access: 'public' | 'restricted'; updatedAt: Date | null;
  publishedAt?: Date | null; createdBy: string; isSample?: boolean;
}
export interface Club {
  id: string; name: string; category?: string; description?: string | null; contact?: string | null;
  homeLocationId?: string | null; managerIds: string[]; published: boolean; isSample?: boolean;
}
export interface CampusEvent {
  id: string; clubId: string; clubName: string; title: string; description: string; startAt: Date; endAt: Date;
  venueName: string; venueLocationId?: string | null; status: EventStatus; createdBy: string; createdAt: Date | null;
  isSample?: boolean;
}
export interface Report {
  id: string; reporterId: string; reporterUsername: string; category: string; title: string; description: string;
  buildingId?: string | null; buildingName?: string | null; locationId?: string | null; locationName?: string | null;
  locationDetail?: string | null; imagePath?: string | null; status: ReportStatus; assigneeId?: string | null;
  assigneeName?: string | null; lastUpdateId?: string | null; lastUpdateMessage?: string | null;
  createdAt: Date | null; updatedAt: Date | null;
}
export interface ReportUpdate {
  id: string; type: 'status' | 'assignment' | 'comment'; fromStatus?: string; toStatus?: string;
  message: string; byId: string; byName: string; at: Date | null;
}
export interface Post {
  id: string; authorId: string; authorUsername: string; authorDisplayName: string; title: string; body: string;
  category: string; locationId?: string | null; locationName?: string | null; status: PostStatus; public: boolean;
  helpfulCount: number; commentCount: number; createdAt: Date | null; updatedAt: Date | null;
  lastActivityAt: Date | null; isSample?: boolean; moderationNote?: string | null;
}
export interface Comment {
  id: string; authorId: string; authorUsername: string; authorDisplayName: string; body: string;
  status: PostStatus; createdAt: Date | null;
}
export interface AppNotification {
  id: string; type: string; audience: 'user' | 'all'; userId?: string | null; title: string; body?: string;
  link?: string | null; read: boolean; createdAt: Date | null;
}
export interface UserProfile {
  id: string; username: string; displayName: string; role: Role; status: 'active' | 'suspended';
  department?: string; year?: number | null; bio?: string; notificationsSeenAt?: Date | null; createdAt?: Date | null;
}

export interface Page<T> {
  items: T[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------
function toDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
}

/** Document -> plain object with Timestamps turned into Dates. */
export function fromDoc<T>(snap: DocumentSnapshot<DocumentData>): T {
  const out: Record<string, unknown> = { id: snap.id };
  for (const [k, v] of Object.entries(snap.data() ?? {})) out[k] = v instanceof Timestamp ? v.toDate() : v;
  return out as T;
}

async function list<T>(path: string, constraints: QueryConstraint[]): Promise<T[]> {
  const snap = await getDocs(query(collection(fb().db, path), ...constraints));
  return snap.docs.map((d) => fromDoc<T>(d));
}

async function page<T>(path: string, constraints: QueryConstraint[], size: number, cursor?: QueryDocumentSnapshot | null): Promise<Page<T>> {
  const all = [...constraints, ...(cursor ? [startAfter(cursor)] : []), qLimit(size)];
  const snap = await getDocs(query(collection(fb().db, path), ...all));
  return { items: snap.docs.map((d) => fromDoc<T>(d)), cursor: snap.docs.length === size ? snap.docs[snap.docs.length - 1] : null };
}

/** A single document, or null if it does not exist or is not visible to us. */
async function one<T>(path: string): Promise<T | null> {
  try {
    const snap = await getDoc(doc(fb().db, path));
    return snap.exists() ? fromDoc<T>(snap) : null;
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Directory and map (public)
// ---------------------------------------------------------------------------
export async function getCampusMap(): Promise<CampusMap | null> {
  return one<CampusMap>('campusMap/main');
}
export const listBuildings = () => list<Building>('buildings', [where('published', '==', true), orderBy('name')]);
export const listPlaces = () => list<Place>('locations', [where('published', '==', true), orderBy('name')]);
export const getBuilding = (id: string) => one<Building>(`buildings/${id}`);
export const getPlace = (id: string) => one<Place>(`locations/${id}`);
export const listPlacesInBuilding = (buildingId: string) =>
  list<Place>('locations', [where('buildingId', '==', buildingId), where('published', '==', true), orderBy('name')]);

// ---------------------------------------------------------------------------
// Official content (public)
// ---------------------------------------------------------------------------
export const listAnnouncements = (size = 10, cursor?: QueryDocumentSnapshot | null) =>
  page<Announcement>('announcements', [where('status', '==', 'published'), orderBy('pinned', 'desc'), orderBy('publishedAt', 'desc')], size, cursor);
export const getAnnouncement = (id: string) => one<Announcement>(`announcements/${id}`);

export const listUpcomingEvents = (size = 10, cursor?: QueryDocumentSnapshot | null) =>
  page<CampusEvent>('events', [where('status', '==', 'published'), where('startAt', '>=', Timestamp.now()), orderBy('startAt')], size, cursor);
export const listClubEvents = (clubId: string) =>
  list<CampusEvent>('events', [where('clubId', '==', clubId), where('status', 'in', ['published', 'cancelled']), orderBy('startAt')]);
export const getEvent = (id: string) => one<CampusEvent>(`events/${id}`);

export const listClubs = () => list<Club>('clubs', [where('published', '==', true), orderBy('name')]);
export const getClub = (id: string) => one<Club>(`clubs/${id}`);

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------
/** Public website: only posts an administrator approved for public display. */
export const listPublicPosts = (size = 10, cursor?: QueryDocumentSnapshot | null) =>
  page<Post>('posts', [where('public', '==', true), where('status', '==', 'visible'), orderBy('lastActivityAt', 'desc')], size, cursor);

/** Signed-in students: every visible post, optionally one category. */
export const listPosts = (category: string | null, size = 10, cursor?: QueryDocumentSnapshot | null) =>
  page<Post>('posts', [
    where('status', '==', 'visible'),
    ...(category ? [where('category', '==', category)] : []),
    orderBy('lastActivityAt', 'desc'),
  ], size, cursor);

export const getPost = (id: string) => one<Post>(`posts/${id}`);
export const listComments = (postId: string) =>
  list<Comment>(`posts/${postId}/comments`, [where('status', '==', 'visible'), orderBy('createdAt')]);

export async function hasMarkedHelpful(postId: string, uid: string): Promise<boolean> {
  return (await getDoc(doc(fb().db, `posts/${postId}/reactions/${uid}`))).exists();
}

export interface NewPost { title: string; body: string; category: string; locationId?: string | null; locationName?: string | null }

/** Creates a post together with the rate-limit stamp the rules require. */
export async function createPost(profile: UserProfile, input: NewPost): Promise<string> {
  const { db } = fb();
  const ref = doc(collection(db, 'posts'));
  const now = serverTimestamp();
  const b = writeBatch(db);
  b.set(ref, {
    authorId: profile.id, authorUsername: profile.username, authorDisplayName: profile.displayName,
    title: input.title.trim(), body: input.body.trim(), category: input.category,
    locationId: input.locationId ?? null, locationName: input.locationName ?? null,
    status: 'visible', public: false, helpfulCount: 0, commentCount: 0, lastCommentId: null,
    createdAt: now, updatedAt: now, lastActivityAt: now,
  });
  b.update(doc(db, `users/${profile.id}`), { lastPostAt: now });
  await commitRateLimited(b, 'post');
  return ref.id;
}

export async function addComment(postId: string, profile: UserProfile, body: string): Promise<void> {
  const { db } = fb();
  const ref = doc(collection(db, `posts/${postId}/comments`));
  const now = serverTimestamp();
  const b = writeBatch(db);
  b.set(ref, { authorId: profile.id, authorUsername: profile.username, authorDisplayName: profile.displayName,
    body: body.trim(), status: 'visible', createdAt: now, updatedAt: now });
  b.update(doc(db, `posts/${postId}`), { commentCount: increment(1), lastCommentId: ref.id, lastActivityAt: now });
  b.update(doc(db, `users/${profile.id}`), { lastCommentAt: now });
  await commitRateLimited(b, 'comment');
}

async function commitRateLimited(b: ReturnType<typeof writeBatch>, kind: 'post' | 'comment') {
  try {
    await b.commit();
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied')
      throw new Error(kind === 'post'
        ? 'Please wait 30 seconds between posts, and check the title (5+ characters) and text.'
        : 'Please wait a few seconds between comments.');
    throw err;
  }
}

export async function setHelpful(postId: string, uid: string, helpful: boolean): Promise<void> {
  const { db } = fb();
  const b = writeBatch(db);
  const r = doc(db, `posts/${postId}/reactions/${uid}`);
  if (helpful) b.set(r, { createdAt: serverTimestamp() });
  else b.delete(r);
  b.update(doc(db, `posts/${postId}`), { helpfulCount: increment(helpful ? 1 : -1) });
  await b.commit();
}

export async function deleteOwnPost(postId: string) {
  await updateDoc(doc(fb().db, `posts/${postId}`), { status: 'deleted', updatedAt: serverTimestamp() });
}

export async function deleteOwnComment(postId: string, commentId: string) {
  await updateDoc(doc(fb().db, `posts/${postId}/comments/${commentId}`), { status: 'deleted', updatedAt: serverTimestamp() });
}

/** Flags a post or comment for moderators; a second flag by the same student is refused. */
export async function flagContent(uid: string, targetType: 'post' | 'comment', targetPath: string, reason: string) {
  const targetId = targetPath.split('/').pop()!;
  try {
    await setDoc(doc(fb().db, `flags/${targetType}_${targetId}_${uid}`), {
      reporterId: uid, targetType, targetPath, reason: reason.trim().slice(0, 300), status: 'open', createdAt: serverTimestamp(),
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') throw new Error('You have already reported this.');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Maintenance reports
// ---------------------------------------------------------------------------
export interface NewReport {
  category: string; title: string; description: string; buildingId?: string | null; buildingName?: string | null;
  locationId?: string | null; locationName?: string | null; locationDetail?: string | null;
}

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Uploads the optional photo first, then files the report. */
export async function createReport(profile: UserProfile, input: NewReport, photo?: File | null): Promise<string> {
  const { db, storage } = fb();
  const ref = doc(collection(db, 'reports'));
  let imagePath: string | null = null;
  if (photo) {
    if (!PHOTO_TYPES.includes(photo.type)) throw new Error('The photo must be a JPEG, PNG, WebP or HEIC image.');
    if (photo.size > PHOTO_MAX_BYTES) throw new Error('The photo must be under 5 MB.');
    const ext = photo.type.split('/')[1].replace('jpeg', 'jpg');
    imagePath = `reports/${profile.id}/${ref.id}/photo.${ext}`;
    await uploadBytes(storageRef(storage, imagePath), photo, { contentType: photo.type });
  }
  const now = serverTimestamp();
  await setDoc(ref, {
    reporterId: profile.id, reporterUsername: profile.username, category: input.category,
    title: input.title.trim(), description: input.description.trim(),
    buildingId: input.buildingId ?? null, buildingName: input.buildingName ?? null,
    locationId: input.locationId ?? null, locationName: input.locationName ?? null,
    locationDetail: input.locationDetail?.trim() || null, imagePath, status: 'submitted',
    assigneeId: null, assigneeName: null, lastUpdateId: null, lastUpdateMessage: null, createdAt: now, updatedAt: now,
  });
  return ref.id;
}

export const listMyReports = (uid: string, size = 20, cursor?: QueryDocumentSnapshot | null) =>
  page<Report>('reports', [where('reporterId', '==', uid), orderBy('createdAt', 'desc')], size, cursor);
export const getReport = (id: string) => one<Report>(`reports/${id}`);
export const listReportUpdates = (id: string) => list<ReportUpdate>(`reports/${id}/updates`, [orderBy('at')]);

export async function addReporterComment(reportId: string, profile: UserProfile, message: string) {
  await setDoc(doc(collection(fb().db, `reports/${reportId}/updates`)), {
    type: 'comment', message: message.trim(), byId: profile.id, byName: profile.username, at: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export async function listNotifications(uid: string): Promise<AppNotification[]> {
  const [mine, all] = await Promise.all([
    list<AppNotification>('notifications', [where('userId', '==', uid), orderBy('createdAt', 'desc'), qLimit(30)]),
    list<AppNotification>('notifications', [where('audience', '==', 'all'), orderBy('createdAt', 'desc'), qLimit(20)]),
  ]);
  return [...mine, ...all].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

export async function markNotificationRead(id: string) {
  await updateDoc(doc(fb().db, `notifications/${id}`), { read: true });
}

/** Broadcasts are read per user by comparing with this timestamp. */
export async function markBroadcastsSeen(uid: string) {
  await updateDoc(doc(fb().db, `users/${uid}`), { notificationsSeenAt: serverTimestamp() });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function updateProfile(uid: string, change: { displayName?: string; bio?: string; department?: string; year?: number | null }) {
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (change.displayName !== undefined) clean.displayName = change.displayName.trim();
  if (change.bio !== undefined) clean.bio = change.bio.trim();
  if (change.department !== undefined) clean.department = change.department.trim();
  if (change.year !== undefined && change.year !== null) clean.year = change.year;
  await updateDoc(doc(fb().db, `users/${uid}`), clean);
}
