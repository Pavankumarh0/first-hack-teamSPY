import { handle, HttpError, json } from '@/lib/server/http';
import { kioskRequest } from '@/lib/server/kiosk';
import { ascii, campusData } from '@/lib/server/campus';
import { findRoute } from '@/lib/navigation';
import { campusUrl, isValidId } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';

// Walking directions from this kiosk (or ?from=<placeId>) to ?to=<placeId>,
// plus the URL to show as a QR code so the visitor can continue on a phone.
export const GET = handle(async (req: Request) => {
  const { config } = await kioskRequest(req, 'directions');
  const params = new URL(req.url).searchParams;
  const to = params.get('to');
  const from = params.get('from');
  const stepFree = params.get('accessible') === '1';
  if (!isValidId(to)) throw new HttpError(400, 'Pass ?to=<place id> (see /search).');
  if (from && !isValidId(from)) throw new HttpError(400, 'Invalid ?from.');

  const { map, places } = await campusData();
  if (!map) throw new HttpError(503, 'The campus map has not been set up yet.');
  const dest = places.find((p) => p.id === to);
  if (!dest?.navNodeId) throw new HttpError(404, 'That place is not on the campus map.');
  const origin = from ? places.find((p) => p.id === from) : null;
  const fromNode = from ? origin?.navNodeId : config.navNodeId;
  if (!fromNode) throw new HttpError(from ? 404 : 503, from ? 'Unknown starting place.' : 'This kiosk has no map position (navNodeId).');

  const route = findRoute(map, fromNode, dest.navNodeId, { accessibleOnly: stepFree });
  if (!route) throw new HttpError(404, stepFree ? 'No step-free route is mapped to that place.' : 'No mapped route to that place.');

  const fromId = from ?? config.locationId ?? undefined;
  const url = campusUrl(publicEnv.siteUrl, { type: 'route', from: fromId, to: dest.id });
  const where = [dest.buildingName, dest.floor != null ? `floor ${dest.floor}` : null, dest.room].filter(Boolean).join(', ');
  return json({
    destination: { kind: dest.kind, id: dest.id, name: ascii(dest.name, 100), where: ascii(where, 120) },
    distanceM: route.distanceM,
    minutes: route.minutes,
    accessible: route.accessible,
    steps: route.steps.map((s) => ascii(s.text, 160)),
    summary: ascii(`${dest.name}${where ? ` (${where})` : ''}: about ${route.minutes} min walk, ${route.distanceM} m.`, 200),
    qrUrl: url,
  });
});
