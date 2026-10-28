// Georeferencing: where the campus plan (campusMap x/y units) sits on Earth.
// The plan stays the source of truth for routing, the kiosk and the drawn
// map; `campusMap.geo` pins its centre to a latitude/longitude and says which
// compass bearing the plan's "up" points to. Accurate to well under a metre
// across a campus (local flat-Earth approximation). Ported to Dart in
// apps/student_mobile/lib/core/geo.dart.

export interface GeoRef {
  /** Latitude/longitude of the plan's centre (width/2, height/2). */
  lat: number;
  lng: number;
  /** Compass bearing of the plan's "up" direction, degrees clockwise from north. */
  rotationDeg: number;
}

export interface LatLng { lat: number; lng: number }
export interface PlanPoint { x: number; y: number }

interface PlanFrame { width: number; height: number; metersPerUnit: number; geo?: GeoRef | null }

const M_PER_DEG_LAT = 111_320;
const rad = (d: number) => (d * Math.PI) / 180;

export function isGeoRef(g: unknown): g is GeoRef {
  const v = g as GeoRef | null;
  return !!v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180
    && Number.isFinite(v.rotationDeg ?? 0);
}

/** Plan point -> latitude/longitude. */
export function toLatLng(map: PlanFrame & { geo: GeoRef }, p: PlanPoint): LatLng {
  const { geo } = map;
  const dx = (p.x - map.width / 2) * map.metersPerUnit;     // metres right on the plan
  const dy = (p.y - map.height / 2) * map.metersPerUnit;    // metres down on the plan
  const t = rad(geo.rotationDeg ?? 0);
  const east = dx * Math.cos(t) - dy * Math.sin(t);
  const north = -dx * Math.sin(t) - dy * Math.cos(t);
  return {
    lat: geo.lat + north / M_PER_DEG_LAT,
    lng: geo.lng + east / (M_PER_DEG_LAT * Math.cos(rad(geo.lat))),
  };
}

/** Latitude/longitude -> plan point (may lie outside the plan). */
export function toPlan(map: PlanFrame & { geo: GeoRef }, ll: LatLng): PlanPoint {
  const { geo } = map;
  const north = (ll.lat - geo.lat) * M_PER_DEG_LAT;
  const east = (ll.lng - geo.lng) * M_PER_DEG_LAT * Math.cos(rad(geo.lat));
  const t = rad(geo.rotationDeg ?? 0);
  const dx = east * Math.cos(t) - north * Math.sin(t);
  const dy = -(east * Math.sin(t) + north * Math.cos(t));
  return { x: map.width / 2 + dx / map.metersPerUnit, y: map.height / 2 + dy / map.metersPerUnit };
}

/** Great-circle distance in metres (for GPS accuracy and sanity checks). */
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The four corners of a plan rectangle (a building) as lat/lng, for a polygon. */
export function rectToLatLngs(map: PlanFrame & { geo: GeoRef }, r: { x: number; y: number; w: number; h: number }): LatLng[] {
  return [
    toLatLng(map, { x: r.x, y: r.y }),
    toLatLng(map, { x: r.x + r.w, y: r.y }),
    toLatLng(map, { x: r.x + r.w, y: r.y + r.h }),
    toLatLng(map, { x: r.x, y: r.y + r.h }),
  ];
}
