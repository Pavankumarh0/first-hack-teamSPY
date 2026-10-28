// Live, turn-by-turn guidance from the walker's own position (GPS converted to
// plan coordinates with lib/geo.ts). Everything runs on the device: positions
// are never sent anywhere. Ported to Dart in
// apps/student_mobile/lib/core/live_nav.dart.
import type { PlanPoint } from './geo';
import { findRoute, turnWord, WALKING_METERS_PER_MINUTE, type CampusMap, type MapEdge, type Route } from './navigation';

/** Further than this from every walkway = not on campus (or a bad fix). */
export const MAX_SNAP_M = 60;
/** Further than this from the route = re-plan. */
export const OFF_ROUTE_M = 25;
/** Closer than this to the destination = arrived. */
export const ARRIVE_M = 12;

export interface Snap { edge: MapEdge; point: PlanPoint; distanceM: number }

export interface Maneuver { index: number; text: string; kind: 'turn' | 'arrive' }

export interface LiveRoute {
  /** Polyline in plan units: the snapped start (if off a junction), then the route's nodes. */
  points: PlanPoint[];
  labels: string[];
  cumulativeM: number[];
  totalM: number;
  maneuvers: Maneuver[];
  route: Route;
  destinationId: string;
}

export type Plan =
  | { status: 'ok'; live: LiveRoute }
  | { status: 'arrived' }
  | { status: 'off_campus'; distanceM: number }
  | { status: 'no_route' };

export interface Progress {
  alongM: number;
  offsetM: number;
  remainingM: number;
  minutes: number;
  next: { text: string; inM: number; kind: Maneuver['kind'] };
  offRoute: boolean;
  arrived: boolean;
}

function closestOnSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  const point = { x: a.x + t * vx, y: a.y + t * vy };
  return { t, point, d: Math.hypot(p.x - point.x, p.y - point.y) };
}

/** The nearest point on any walkway (step-free walkways only, if asked). */
export function snapToPaths(map: CampusMap, p: PlanPoint, opts: { accessibleOnly?: boolean } = {}): Snap | null {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  let best: Snap | null = null;
  for (const e of map.edges) {
    if (opts.accessibleOnly && e.accessible === false) continue;
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (!a || !b) continue;
    const c = closestOnSegment(p, a, b);
    const distanceM = c.d * map.metersPerUnit;
    if (!best || distanceM < best.distanceM) best = { edge: e, point: c.point, distanceM };
  }
  return best;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Plans a walk from where the person stands to a node. */
export function routeFromPosition(map: CampusMap, p: PlanPoint, toId: string, opts: { accessibleOnly?: boolean } = {}): Plan {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const dest = nodes.get(toId);
  if (!dest) return { status: 'no_route' };
  const snap = snapToPaths(map, p, opts);
  if (!snap) return { status: 'no_route' };
  if (snap.distanceM > MAX_SNAP_M) return { status: 'off_campus', distanceM: Math.round(snap.distanceM) };
  if (Math.hypot(p.x - dest.x, p.y - dest.y) * map.metersPerUnit <= ARRIVE_M) return { status: 'arrived' };

  // Walk to whichever end of the nearest walkway gives the shorter trip.
  let best: { route: Route; leadM: number } | null = null;
  for (const endId of [snap.edge.from, snap.edge.to]) {
    const end = nodes.get(endId)!;
    const route = findRoute(map, endId, toId, opts);
    if (!route) continue;
    const leadM = Math.hypot(end.x - snap.point.x, end.y - snap.point.y) * map.metersPerUnit;
    if (!best || leadM + route.distanceM < best.leadM + best.route.distanceM) best = { route, leadM };
  }
  if (!best) return { status: 'no_route' };

  const routeNodes = best.route.nodeIds.map((id) => nodes.get(id)!);
  const points: PlanPoint[] = best.leadM >= 1 ? [snap.point, ...routeNodes] : [...routeNodes];
  const labels = best.leadM >= 1 ? ['your position', ...routeNodes.map((n) => n.label)] : routeNodes.map((n) => n.label);
  const cumulativeM = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeM.push(cumulativeM[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y) * map.metersPerUnit);
  }
  const maneuvers: Maneuver[] = [];
  for (let k = 1; k < points.length - 1; k++) {
    const a = points[k - 1], b = points[k], c = points[k + 1];
    const turn = turnWord(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y);
    if (turn !== 'Continue straight') maneuvers.push({ index: k, text: `${turn} at ${labels[k]}`, kind: 'turn' });
  }
  maneuvers.push({ index: points.length - 1, text: `Arrive at ${dest.label}`, kind: 'arrive' });
  return {
    status: 'ok',
    live: { points, labels, cumulativeM, totalM: cumulativeM[cumulativeM.length - 1], maneuvers, route: best.route, destinationId: toId },
  };
}

/** Where along the route the person is, and what to do next. */
export function progress(map: CampusMap, live: LiveRoute, p: PlanPoint): Progress {
  let best = { alongM: 0, offsetM: Infinity };
  for (let i = 1; i < live.points.length; i++) {
    const c = closestOnSegment(p, live.points[i - 1], live.points[i]);
    const offsetM = c.d * map.metersPerUnit;
    if (offsetM < best.offsetM) {
      best = { alongM: live.cumulativeM[i - 1] + c.t * (live.cumulativeM[i] - live.cumulativeM[i - 1]), offsetM };
    }
  }
  if (live.points.length === 1) {
    const only = live.points[0];
    best = { alongM: 0, offsetM: Math.hypot(p.x - only.x, p.y - only.y) * map.metersPerUnit };
  }
  const remainingM = Math.max(0, live.totalM - best.alongM);
  const nextM = live.maneuvers.find((m) => live.cumulativeM[m.index] > best.alongM + 1) ?? live.maneuvers[live.maneuvers.length - 1];
  const inM = Math.max(0, Math.round(live.cumulativeM[nextM.index] - best.alongM));
  const text = inM < 10 ? `${nextM.text} now` : `In ${Math.round(inM / 5) * 5} m, ${lower(nextM.text)}`;
  const arrived = remainingM <= ARRIVE_M && best.offsetM <= OFF_ROUTE_M;
  return {
    alongM: Math.round(best.alongM),
    offsetM: Math.round(best.offsetM),
    remainingM: Math.round(remainingM),
    minutes: Math.max(1, Math.round(remainingM / WALKING_METERS_PER_MINUTE)),
    next: { text: arrived ? `You have arrived at ${live.labels[live.labels.length - 1]}` : text, inM, kind: arrived ? 'arrive' : nextM.kind },
    offRoute: !arrived && best.offsetM > OFF_ROUTE_M,
    arrived,
  };
}
