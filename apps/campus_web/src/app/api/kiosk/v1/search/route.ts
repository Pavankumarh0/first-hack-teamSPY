import { handle, HttpError, json } from '@/lib/server/http';
import { kioskRequest } from '@/lib/server/kiosk';
import { ascii, campusData } from '@/lib/server/campus';
import { searchPlaces } from '@/lib/search';
import { campusUrl } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';

// Only places in the published directory come back; an unknown place returns
// an empty list, never a guess.
export const GET = handle(async (req: Request) => {
  await kioskRequest(req, 'search');
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) throw new HttpError(400, 'Search needs at least 2 characters.');
  const { places } = await campusData();
  return json({
    query: ascii(q, 80),
    results: searchPlaces(places, q, 5).map((p) => ({
      kind: p.kind,
      id: p.id,
      name: ascii(p.name, 100),
      building: p.buildingName ? ascii(p.buildingName, 100) : null,
      floor: p.floor ?? null,
      room: p.room ?? null,
      openingHours: p.openingHours ?? null,
      url: campusUrl(publicEnv.siteUrl, { type: p.kind, id: p.id }),
    })),
  });
});
