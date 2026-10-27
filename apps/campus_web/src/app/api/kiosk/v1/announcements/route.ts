import { adminServices } from '@/lib/server/admin';
import { handle, json } from '@/lib/server/http';
import { kioskRequest } from '@/lib/server/kiosk';
import { ascii } from '@/lib/server/campus';
import { campusUrl } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';

export const GET = handle(async (req: Request) => {
  const { config } = await kioskRequest(req, 'announcements');
  const limit = Math.min(10, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || config.announcementsLimit));
  const snap = await adminServices().db.collection('announcements')
    .where('status', '==', 'published').orderBy('pinned', 'desc').orderBy('publishedAt', 'desc').limit(limit).get();
  return json({
    announcements: snap.docs.map((d) => {
      const a = d.data();
      return {
        id: d.id,
        category: a.category,
        title: ascii(a.title, 120),
        body: ascii(a.body, 280),
        pinned: a.pinned === true,
        publishedAt: a.publishedAt?.toDate?.()?.toISOString() ?? null,
        url: campusUrl(publicEnv.siteUrl, { type: 'notice', id: d.id }),
        isSample: a.isSample === true,
      };
    }),
  });
});
