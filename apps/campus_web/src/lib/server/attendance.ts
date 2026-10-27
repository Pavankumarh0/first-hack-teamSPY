import 'server-only';
import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { adminServices } from './admin';
import { HttpError } from './http';
import { cardKey } from './rfid';
import type { Device } from './devices';
import {
  attendanceRecordId, cardHint, isDuplicateScan, kioskLine, normalizeCardUid, pickOpenSession, type ScanStatus,
} from '@/lib/attendance';

// The trusted half of RFID attendance. A reader only ever says "this card was
// presented"; who the card belongs to, whether that student may check in and
// which session it counts for are decided here, from Firestore data that no
// client can write (rfidCards, attendanceRecords, attendanceAudit are
// backend-only in firestore.rules).

export interface ScanInput { cardUid: string; sessionId?: string; ageMs?: number }

export interface ScanOutcome {
  httpStatus: number;
  body: { status: ScanStatus; display: string; checkInAt?: string; session?: string; error?: string };
}

interface StudentInfo { id: string; username: string; displayName: string; active: boolean; role: string }

async function studentInfo(db: Firestore, uid: string): Promise<StudentInfo | null> {
  const u = await db.doc(`users/${uid}`).get();
  if (!u.exists) return null;
  const x = u.data()!;
  return { id: uid, username: x.username, displayName: x.displayName ?? x.username, active: x.status === 'active', role: x.role };
}

const firstName = (s: StudentInfo) => (s.displayName || s.username).split(/\s+/)[0];

export async function recordScan(device: Device, input: ScanInput): Promise<ScanOutcome> {
  const { db } = adminServices();
  const settings = (await db.doc('settings/attendance').get()).data();
  if (settings?.enabled !== true) {
    return { httpStatus: 503, body: { status: 'disabled', display: kioskLine('disabled'), error: 'RFID attendance is switched off (Dashboard > Attendance).' } };
  }

  const uid = normalizeCardUid(input.cardUid);
  if (!uid) throw new HttpError(400, 'That does not look like a card UID.');
  const key = cardKey(uid);
  const hint = cardHint(uid);
  const ageMs = Math.max(0, Math.min(input.ageMs ?? 0, 120_000));
  const audit = (result: string, extra: Record<string, unknown> = {}) =>
    db.collection('attendanceAudit').add({
      result, readerId: device.id, readerName: device.name, cardKey: key, cardHint: hint,
      sessionId: null, studentId: null, studentUsername: null, deviceDelayMs: ageMs,
      at: FieldValue.serverTimestamp(), ...extra,
    });

  // 1. The card: registered and active? (Never trust anything else the device says.)
  const card = await db.doc(`rfidCards/${key}`).get();
  if (!card.exists || card.data()!.active !== true) {
    await audit('unknown_card');
    return { httpStatus: 404, body: { status: 'unknown_card', display: kioskLine('unknown_card'), error: 'Card not registered.' } };
  }
  const student = await studentInfo(db, card.data()!.studentId);
  if (!student || !student.active) {
    await audit('student_inactive', { studentId: card.data()!.studentId });
    return { httpStatus: 403, body: { status: 'student_inactive', display: kioskLine('student_inactive'), error: 'This account is not active.' } };
  }
  const who = { studentId: student.id, studentUsername: student.username };

  // 2. The session: the one named (if this reader is assigned to it), else the
  //    session open now on this reader.
  const now = new Date();
  let session: { id: string; title: string; course: string; startsAt: Date; endsAt: Date } | null = null;
  const toSession = (d: DocumentSnapshot) => {
    const x = d.data()!;
    return { id: d.id, title: x.title, course: x.course ?? '', startsAt: x.startsAt.toDate(), endsAt: x.endsAt.toDate(), readerIds: (x.readerIds ?? []) as string[] };
  };
  if (input.sessionId) {
    const d = await db.doc(`attendanceSessions/${input.sessionId}`).get();
    const s = d.exists ? toSession(d) : null;
    session = s && s.readerIds.includes(device.id) ? pickOpenSession([s], now) : null;
  } else {
    const snap = await db.collection('attendanceSessions')
      .where('readerIds', 'array-contains', device.id)
      .where('endsAt', '>=', Timestamp.fromDate(now))
      .limit(20).get();
    session = pickOpenSession(snap.docs.map(toSession), now);
  }
  if (!session) {
    await audit('no_open_session', who);
    return { httpStatus: 409, body: { status: 'no_open_session', display: kioskLine('no_open_session'), error: 'No session is open on this reader now.' } };
  }

  // 3. The record: one per student per session. create() fails if it exists,
  //    so two readers scanning at once still make one record.
  const ref = db.doc(`attendanceRecords/${attendanceRecordId(session.id, student.id)}`);
  try {
    await ref.create({
      sessionId: session.id, sessionTitle: session.title, course: session.course,
      studentId: student.id, studentUsername: student.username, studentName: student.displayName,
      readerId: device.id, readerName: device.name, method: 'rfid', cardHint: hint,
      checkInAt: FieldValue.serverTimestamp(), deviceDelayMs: ageMs,
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 6) throw err;      // 6 = ALREADY_EXISTS
    const existing = (await ref.get()).data();
    const last: Date | null = existing?.checkInAt?.toDate?.() ?? null;
    const window = Number(settings.duplicateWindowMinutes) || 10;
    await audit(isDuplicateScan(last, now, window) ? 'duplicate' : 'already_checked_in', { ...who, sessionId: session.id });
    return {
      httpStatus: 200,
      body: { status: 'already_checked_in', display: kioskLine('already_checked_in', firstName(student)), session: session.title, checkInAt: last?.toISOString() },
    };
  }
  await audit('checked_in', { ...who, sessionId: session.id });
  return { httpStatus: 201, body: { status: 'checked_in', display: kioskLine('checked_in', firstName(student)), session: session.title } };
}

// --- card management (administrators, through /api/admin/rfid-cards) --------

export async function studentByUsername(username: string): Promise<StudentInfo> {
  const { db } = adminServices();
  const name = username.trim().toLowerCase();
  const reservation = /^[a-z][a-z0-9._]{2,23}$/.test(name) ? await db.doc(`usernames/${name}`).get() : null;
  const info = reservation?.exists ? await studentInfo(db, reservation.data()!.uid) : null;
  if (!info) throw new HttpError(404, `No account with the username "${name}".`);
  if (info.role !== 'student') throw new HttpError(400, `"${name}" is not a student account.`);
  if (!info.active) throw new HttpError(400, `"${name}" is suspended. Reactivate the account first.`);
  return info;
}

/** Links a card to a student. The card is given either as its UID (typed or
    read from the reader's log) or as the key of a recent unknown-card scan. */
export async function registerCard(adminUid: string, input: { username: string; cardUid?: string; cardKey?: string; label?: string }) {
  const { db } = adminServices();
  const student = await studentByUsername(input.username);
  let key: string, hint: string;
  if (input.cardUid) {
    const uid = normalizeCardUid(input.cardUid);
    if (!uid) throw new HttpError(400, 'That does not look like a card UID (e.g. A3:2F:91:0C).');
    key = cardKey(uid);
    hint = cardHint(uid);
  } else if (input.cardKey && /^[0-9a-f]{64}$/.test(input.cardKey)) {
    const seen = await db.collection('attendanceAudit').where('cardKey', '==', input.cardKey).limit(1).get();
    if (seen.empty) throw new HttpError(404, 'That card has not been scanned on any reader.');
    key = input.cardKey;
    hint = seen.docs[0].data().cardHint ?? '??:??';
  } else {
    throw new HttpError(400, 'Give the card UID, or pick a scanned card.');
  }

  const ref = db.doc(`rfidCards/${key}`);
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const c = current.data();
    if (c && c.active === true && c.studentId !== student.id)
      throw new HttpError(409, `This card is already assigned to ${c.studentUsername}. Deactivate it there first.`);
    tx.set(ref, {
      studentId: student.id, studentUsername: student.username, studentName: student.displayName,
      cardHint: hint, label: (input.label ?? '').trim().slice(0, 60), active: true,
      registeredBy: adminUid, registeredAt: c?.registeredAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await db.collection('attendanceAudit').add({
    result: 'card_registered', readerId: null, readerName: null, cardKey: key, cardHint: hint, sessionId: null,
    studentId: student.id, studentUsername: student.username, byAdmin: adminUid, at: FieldValue.serverTimestamp(),
  });
  return { id: key, cardHint: hint, studentUsername: student.username };
}

export async function setCardActive(adminUid: string, key: string, active: boolean) {
  const { db } = adminServices();
  if (!/^[0-9a-f]{64}$/.test(key)) throw new HttpError(400, 'Invalid card id.');
  const ref = db.doc(`rfidCards/${key}`);
  const card = await ref.get();
  if (!card.exists) throw new HttpError(404, 'No such card.');
  await ref.update({ active, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUid });
  const c = card.data()!;
  await db.collection('attendanceAudit').add({
    result: active ? 'card_activated' : 'card_deactivated', readerId: null, readerName: null, cardKey: key,
    cardHint: c.cardHint ?? null, sessionId: null, studentId: c.studentId, studentUsername: c.studentUsername,
    byAdmin: adminUid, at: FieldValue.serverTimestamp(),
  });
}
