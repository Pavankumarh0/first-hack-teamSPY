import { Timestamp } from 'firebase-admin/firestore';
import { adminServices } from '@/lib/server/admin';
import { handle, json } from '@/lib/server/http';
import { kioskRequest } from '@/lib/server/kiosk';
import { ascii } from '@/lib/server/campus';
import { campusUrl } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';

export const GET = handle(async (req: Request) => {
  await kioskRequest(req, 'events');
  const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 10));
  const snap = await adminServices().db.collection('events')
    .where('status', '==', 'published').where('startAt', '>=', Timestamp.now())
    .orderBy('startAt', 'asc').limit(limit).get();
  return json({
    events: snap.docs.map((d) => {
      const e = d.data();
      return {
        id: d.id,
        title: ascii(e.title, 120),
        description: ascii(e.description ?? '', 1000),
        clubName: ascii(e.clubName, 80),
        venueName: ascii(e.venueName, 120),
        venueLocationId: e.venueLocationId ?? null,
        startAt: e.startAt.toDate().toISOString(),
        endAt: e.endAt.toDate().toISOString(),
        updatedAt: e.updatedAt?.toDate?.()?.toISOString?.() ?? null,
        url: campusUrl(publicEnv.siteUrl, { type: 'event', id: d.id }),
        isSample: e.isSample === true,
      };
    }),
  });
});
