import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminServices } from '@/lib/server/admin';
import { handle, HttpError, json, readBody, requireCaller } from '@/lib/server/http';

const Body = z.object({ questionId: z.string().min(1).max(120).regex(/^[^/]+$/), version: z.string().min(1).max(80), optionIndex: z.number().int().min(0).max(5) });
const weekKey = (date: Date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)).padStart(2, '0')}`;
};

export const POST = handle(async (req: Request) => {
  const caller = await requireCaller(req, ['student', 'staff', 'club_manager', 'admin']);
  const body = await readBody(req, Body);
  const { db } = adminServices();
  const qRef = db.doc(`quizQuestions/${body.questionId}`);
  const answerRef = db.doc(`quizAttempts/${caller.uid}/answers/${body.questionId}`);
  const scoreRef = db.doc(`quizScores/${caller.uid}`);
  const now = new Date();
  const result = await db.runTransaction(async (tx) => {
    const [qSnap, aSnap, sSnap] = await Promise.all([tx.get(qRef), tx.get(answerRef), tx.get(scoreRef)]);
    if (!qSnap.exists || qSnap.get('status') !== 'published') throw new HttpError(404, 'This question is no longer available.');
    if (aSnap.exists) throw new HttpError(409, 'You have already answered this question.');
    const q = qSnap.data()!;
    if (body.version !== q.version) throw new HttpError(409, 'This question changed. Reload it before answering.');
    const sourceCollection = ({ building: 'buildings', location: 'locations', club: 'clubs', event: 'events', notice: 'announcements', knowledge: 'campusKnowledge' } as const)[q.sourceType as 'building'|'location'|'club'|'event'|'notice'|'knowledge'];
    if (!sourceCollection || typeof q.sourceId !== 'string' || q.sourceId.includes('/')) throw new HttpError(409, 'The linked campus source is unavailable.');
    const sourceSnap = await tx.get(db.doc(`${sourceCollection}/${q.sourceId}`));
    const sourceData = sourceSnap.data();
    if (!sourceSnap.exists || !(sourceData?.published === true || sourceData?.status === 'published') || sourceData?.access === 'restricted')
      throw new HttpError(409, 'The linked campus source is no longer published.');
    const options = q.options as unknown[];
    if (!Array.isArray(options) || body.optionIndex >= options.length) throw new HttpError(400, 'Choose one of the listed answers.');
    const correct = body.optionIndex === q.correctIndex;
    const points = correct ? Number(q.points) || 1 : 0;
    const week = weekKey(now);
    const old = sSnap.data() ?? {};
    const weekly = old.weekKey === week ? (Number(old.weekly) || 0) : 0;
    tx.create(answerRef, { questionId: body.questionId, version: q.version, selectedIndex: body.optionIndex, correct, points, answeredAt: Timestamp.fromDate(now) });
    tx.set(scoreRef, { allTime: (Number(old.allTime) || 0) + points, weekly: weekly + points, weekKey: week, answeredCount: (Number(old.answeredCount) || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { correct, points, explanation: q.explanation, correctIndex: q.correctIndex, learnMoreUrl: q.learnMoreUrl ?? null, allTime: (Number(old.allTime) || 0) + points, weekly: weekly + points };
  });
  return json(result);
});
