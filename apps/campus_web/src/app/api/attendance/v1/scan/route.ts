import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminServices } from '@/lib/server/admin';
import { requireDevice } from '@/lib/server/devices';
import { handle, HttpError, json, readBody } from '@/lib/server/http';
import { cardKey } from '@/lib/server/rfid';
import { attendanceRecordId, isDuplicateScan, normalizeCardUid } from '@/lib/attendance';

// RFID check-in - PREPARED, NOT LIVE. No reader hardware exists yet, and
// settings/attendance.enabled is false, so this returns 503
// "pending_hardware". The flow below is what a reader will use once one is
// installed and an administrator enables attendance (docs/RFID_INTEGRATION.md).
const Body = z.object({
  cardUid: z.string().min(4).max(40),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

export const POST = handle(async (req: Request) => {
  const device = await requireDevice(req, 'attendance');
  const { db } = adminServices();
  const settings = (await db.doc('settings/attendance').get()).data();
  if (settings?.enabled !== true)
    return json({ status: 'pending_hardware', error: 'RFID attendance is not enabled yet.' }, 503);

  const body = await readBody(req, Body);
  const uid = normalizeCardUid(body.cardUid);
  if (!uid) throw new HttpError(400, 'That does not look like a card UID.');
  const key = cardKey(uid);
  const audit = (result: string, extra: Record<string, unknown> = {}) =>
    db.collection('attendanceAudit').add({ result, readerId: device.id, sessionId: body.sessionId,
      cardKey: key, at: FieldValue.serverTimestamp(), ...extra });

  const session = await db.doc(`attendanceSessions/${body.sessionId}`).get();
  const now = new Date();
  const s = session.data();
  if (!s || s.startsAt.toDate() > now || s.endsAt.toDate() < now) {
    await audit('session_closed');
    throw new HttpError(409, 'That session is not open.');
  }
  const card = await db.doc(`rfidCards/${key}`).get();
  if (!card.exists || card.data()!.active !== true) {
    await audit('unknown_card');
    throw new HttpError(404, 'Card not registered.');
  }
  const studentId = card.data()!.studentId as string;
  const recordRef = db.doc(`attendanceRecords/${attendanceRecordId(body.sessionId, studentId)}`);
  const existing = await recordRef.get();
  const window = settings.duplicateWindowMinutes ?? 10;
  if (existing.exists) {
    const last = existing.data()!.checkInAt?.toDate?.() ?? null;
    await audit(isDuplicateScan(last, now, window) ? 'duplicate' : 'already_checked_in', { studentId });
    return json({ status: 'already_checked_in' });
  }
  await recordRef.create({ sessionId: body.sessionId, studentId, readerId: device.id,
    checkInAt: Timestamp.fromDate(now), method: 'rfid' });
  await audit('checked_in', { studentId });
  return json({ status: 'checked_in' }, 201);
});
