import { adminServices } from '@/lib/server/admin';
import { handle, json } from '@/lib/server/http';
import { kioskRequest } from '@/lib/server/kiosk';
import { ascii } from '@/lib/server/campus';
import { campusUrl } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';

/** Published clubs only; this endpoint is safe for a read-only kiosk key. */
export const GET = handle(async (req: Request) => {
  await kioskRequest(req, 'clubs');
  const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 10));
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLocaleLowerCase().slice(0, 80);
  const snap = await adminServices().db.collection('clubs').where('published', '==', true).orderBy('name').limit(100).get();
  const clubs = snap.docs.map((d) => {
    const c = d.data();
    return {
      id: d.id,
      name: ascii(c.name, 100),
      category: ascii(c.category ?? '', 60),
      description: ascii(c.description ?? '', 1000),
      updatedAt: c.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      url: campusUrl(publicEnv.siteUrl, { type: 'club', id: d.id }),
      isSample: c.isSample === true,
    };
  }).filter((c) => !q || `${c.name} ${c.category} ${c.description}`.toLocaleLowerCase().includes(q));
  return json({ clubs: clubs.slice(0, limit) });
});
