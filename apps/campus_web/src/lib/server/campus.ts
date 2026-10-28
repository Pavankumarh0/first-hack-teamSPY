import 'server-only';
import { adminServices } from './admin';
import type { CampusMap } from '../navigation';

// Published campus data for the kiosk API. The Admin SDK ignores the security
// rules, so every query here filters to published content itself.

export interface PlaceRow {
  id: string;
  kind: 'location' | 'building';
  name: string;
  code?: string | null;
  room?: string | null;
  type?: string | null;
  category?: string | null;
  floor?: number | null;
  buildingId?: string | null;
  buildingName?: string | null;
  keywords?: string[];
  navNodeId?: string | null;
  openingHours?: string | null;
  description?: string | null;
  isSample?: boolean;
}

let cache: { at: number; map: CampusMap | null; places: PlaceRow[] } | null = null;
const TTL_MS = 60_000;

export async function campusData() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const { db } = adminServices();
  const [mapSnap, buildings, locations] = await Promise.all([
    db.doc('campusMap/main').get(),
    db.collection('buildings').where('published', '==', true).get(),
    db.collection('locations').where('published', '==', true).get(),
  ]);
  const places: PlaceRow[] = [
    ...buildings.docs.map((d) => {
      const b = d.data();
      return { id: d.id, kind: 'building' as const, name: b.name, code: b.code, category: b.category,
        navNodeId: b.entranceNodeId ?? null, openingHours: b.openingHours ?? null, description: b.description ?? null,
        isSample: b.isSample === true, keywords: [] };
    }),
    ...locations.docs.map((d) => {
      const l = d.data();
      return { id: d.id, kind: 'location' as const, name: l.name, room: l.room ?? null, type: l.type,
        floor: l.floor ?? null, buildingId: l.buildingId ?? null, buildingName: l.buildingName ?? null,
        keywords: l.keywords ?? [], navNodeId: l.navNodeId ?? null, openingHours: l.openingHours ?? null,
        description: l.description ?? null, isSample: l.isSample === true };
    }),
  ];
  cache = { at: Date.now(), map: mapSnap.exists ? (mapSnap.data() as CampusMap) : null, places };
  return cache;
}

/** Plain ASCII for the kiosk's TFT font (32-126 only). */
export function ascii(text: string, max = 600): string {
  return text
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, max);
}
