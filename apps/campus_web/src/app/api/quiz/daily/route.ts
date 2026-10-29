import { adminServices } from '@/lib/server/admin';
import { handle, json, requireCaller } from '@/lib/server/http';

export const GET = handle(async (req: Request) => {
  await requireCaller(req, ['student', 'staff', 'club_manager', 'admin']);
  const { db } = adminServices();
  const snap = await db.collection('quizQuestions').where('status', '==', 'published').limit(100).get();
  const sourceCollection = { building: 'buildings', location: 'locations', club: 'clubs', event: 'events', notice: 'announcements', knowledge: 'campusKnowledge' } as const;
  const rows = await Promise.all(snap.docs.map(async (d) => {
    const q = d.data();
    if (!Array.isArray(q.options) || q.options.length < 2 || !(q.sourceType in sourceCollection)) return null;
    const source = await db.doc(`${sourceCollection[q.sourceType as keyof typeof sourceCollection]}/${q.sourceId}`).get();
    const data = source.data();
    return source.exists && (data?.published === true || data?.status === 'published') && data?.access !== 'restricted' ? d : null;
  }));
  const available = rows.filter((d) => d !== null);
  if (!available.length) return json({ question: null });
  const day = new Date().toISOString().slice(0, 10);
  const picked = available.sort((a, b) => a.id.localeCompare(b.id))[Array.from(day).reduce((n, c) => n + c.charCodeAt(0), 0) % available.length]!;
  const q = picked.data();
  return json({ question: { id: picked.id, prompt: q.prompt, options: q.options, difficulty: q.difficulty, version: q.version } });
});
