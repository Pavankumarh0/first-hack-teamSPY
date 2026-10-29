import { adminServices } from '@/lib/server/admin';
import { handle, json, requireCaller } from '@/lib/server/http';

export const GET = handle(async (req: Request) => {
  await requireCaller(req, ['student', 'staff', 'club_manager', 'admin']);
  const mode = new URL(req.url).searchParams.get('period') === 'weekly' ? 'weekly' : 'allTime';
  const { db } = adminServices();
  const base = db.collection('quizScores');
  const query = mode === 'weekly' ? base.where('weekKey', '==', weekKey(new Date())) : base;
  const snap = await query.orderBy(mode, 'desc').limit(50).get();
  const users = await Promise.all(snap.docs.map(async (d) => {
    const profile = await db.doc(`studentDiscovery/${d.id}`).get();
    return { alias: profile.get('discoverable') === true ? profile.get('alias') ?? 'Campus student' : 'Campus student', points: Number(d.get(mode)) || 0 };
  }));
  return json({ period: mode, leaders: users });
});

function weekKey(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil((((d.getTime() - start.getTime()) / 86400000) + 1) / 7)).padStart(2, '0')}`;
}
