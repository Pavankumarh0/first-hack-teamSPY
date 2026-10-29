import { z } from 'zod';
import { adminServices } from '@/lib/server/admin';
import { handle, HttpError, json, readBody, requireCaller } from '@/lib/server/http';

const Question = z.object({ id: z.string().max(120).regex(/^[^/]+$/).optional(), prompt: z.string().trim().min(10).max(500), options: z.array(z.string().trim().min(1).max(160)).min(2).max(6), correctIndex: z.number().int().min(0).max(5), explanation: z.string().trim().min(1).max(1000), difficulty: z.enum(['easy','medium','hard']), points: z.number().int().min(1).max(10), sourceType: z.enum(['building','location','club','event','notice','knowledge']), sourceId: z.string().min(1).max(120).regex(/^[^/]+$/), learnMoreUrl: z.string().max(500).refine((v) => /^(https:\/\/|\/(?!\/))/.test(v), 'Use an https link or an in-app path.').optional(), status: z.enum(['draft','published','archived']), version: z.string().min(1).max(80) }).refine((v) => v.correctIndex < v.options.length);
export const GET = handle(async (req: Request) => {
  await requireCaller(req, ['admin']);
  const { db } = adminServices();
  const [questions, attempts] = await Promise.all([db.collection('quizQuestions').limit(200).get(), db.collectionGroup('answers').limit(1000).get()]);
  return json({ questions: questions.docs.map((d) => ({ id: d.id, ...d.data() })), participation: attempts.size });
});
export const POST = handle(async (req: Request) => {
  const caller = await requireCaller(req, ['admin']);
  const v = await readBody(req, Question);
  const { db } = adminServices();
  const collection = ({ building: 'buildings', location: 'locations', club: 'clubs', event: 'events', notice: 'announcements', knowledge: 'campusKnowledge' } as const)[v.sourceType];
  const source = await db.doc(`${collection}/${v.sourceId}`).get();
  if (!source.exists) throw new HttpError(400, 'The selected campus source does not exist.');
  const sourceData = source.data()!;
  const sourcePublished = sourceData.published === true || sourceData.status === 'published';
  if (v.status === 'published' && (!sourcePublished || sourceData.access === 'restricted'))
    throw new HttpError(400, 'Published questions must reference a published public campus source.');
  const ref = v.id ? db.doc(`quizQuestions/${v.id}`) : db.collection('quizQuestions').doc();
  const prior = v.id ? await ref.get() : null;
  const { id: _id, ...record } = v;
  await ref.set({ ...record, createdBy: prior?.get('createdBy') ?? caller.uid, createdAt: prior?.get('createdAt') ?? new Date(), updatedAt: new Date() });
  return json({ id: ref.id }, prior?.exists ? 200 : 201);
});
