// Campus-only navigation: a graph of path junctions and building entrances
// (campusMap/main) walked with Dijkstra. lib/core/navigation.dart in the
// Flutter app is a port of this file; both are tested on the sample map.
import type { GeoRef } from './geo';

export interface MapNode {
  id: string;
  x: number;
  y: number;
  label: string;
  landmark?: string | null;
  buildingId?: string | null;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  accessible?: boolean;
  note?: string | null;
}

export interface CampusMap {
  name?: string;
  width: number;
  height: number;
  metersPerUnit: number;
  backgroundUrl?: string | null;
  /** Where the plan sits on Earth (lib/geo.ts); unset until an admin places it. */
  geo?: GeoRef | null;
  nodes: MapNode[];
  edges: MapEdge[];
  isSample?: boolean;
}

export interface RouteStep {
  nodeId: string;
  text: string;
  distanceM: number;
}

export interface Route {
  nodeIds: string[];
  edgeIds: string[];
  distanceM: number;
  minutes: number;
  accessible: boolean;
  steps: RouteStep[];
}

export const WALKING_METERS_PER_MINUTE = 75;

export function edgeLength(a: MapNode, b: MapNode, metersPerUnit: number): number {
  return Math.hypot(b.x - a.x, b.y - a.y) * metersPerUnit;
}

/** Shortest walk between two nodes, or null when they are not connected. */
export function findRoute(
  map: CampusMap,
  fromId: string,
  toId: string,
  opts: { accessibleOnly?: boolean } = {},
): Route | null {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  if (!nodes.has(fromId) || !nodes.has(toId)) return null;

  const adj = new Map<string, { to: string; edge: MapEdge; w: number }[]>();
  for (const n of map.nodes) adj.set(n.id, []);
  for (const e of map.edges) {
    if (opts.accessibleOnly && e.accessible === false) continue;
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b) continue;
    const w = edgeLength(a, b, map.metersPerUnit);
    adj.get(a.id)!.push({ to: b.id, edge: e, w });
    adj.get(b.id)!.push({ to: a.id, edge: e, w });
  }

  // The graph is a campus (tens to a few hundred nodes): a linear scan for the
  // closest unvisited node is plenty.
  const dist = new Map<string, number>([[fromId, 0]]);
  const prev = new Map<string, { node: string; edge: MapEdge }>();
  const done = new Set<string>();
  while (true) {
    let current: string | null = null;
    for (const [id, d] of dist) if (!done.has(id) && (current === null || d < dist.get(current)!)) current = id;
    if (current === null) return null;
    if (current === toId) break;
    done.add(current);
    for (const { to, edge, w } of adj.get(current)!) {
      const alt = dist.get(current)! + w;
      if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, { node: current, edge });
      }
    }
  }

  const nodeIds = [toId];
  const edgeIds: string[] = [];
  const edgesUsed: MapEdge[] = [];
  for (let at = toId; at !== fromId; ) {
    const p = prev.get(at)!;
    nodeIds.unshift(p.node);
    edgeIds.unshift(p.edge.id);
    edgesUsed.unshift(p.edge);
    at = p.node;
  }
  const distanceM = Math.round(dist.get(toId)!);
  return {
    nodeIds,
    edgeIds,
    distanceM,
    minutes: Math.max(1, Math.round(distanceM / WALKING_METERS_PER_MINUTE)),
    accessible: edgesUsed.every((e) => e.accessible !== false),
    steps: describeRoute(map, nodeIds, edgesUsed),
  };
}

/** Turn between two headings in screen coordinates (y grows downwards). */
export function turnWord(ax: number, ay: number, bx: number, by: number): string {
  const angle = Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * (180 / Math.PI);
  const a = Math.abs(angle);
  if (a < 25) return 'Continue straight';
  if (a > 155) return 'Turn around';
  const side = angle > 0 ? 'right' : 'left';
  return a < 60 ? `Bear ${side}` : `Turn ${side}`;
}

function describeRoute(map: CampusMap, nodeIds: string[], edges: MapEdge[]): RouteStep[] {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const start = nodes.get(nodeIds[0])!;
  if (nodeIds.length === 1) return [{ nodeId: start.id, text: `You are at ${start.label}.`, distanceM: 0 }];

  const steps: RouteStep[] = [{ nodeId: start.id, text: `Start at ${start.label}.`, distanceM: 0 }];
  for (let i = 1; i < nodeIds.length; i++) {
    const a = nodes.get(nodeIds[i - 1])!;
    const b = nodes.get(nodeIds[i])!;
    const d = Math.round(edgeLength(a, b, map.metersPerUnit));
    let lead = `Walk ${d} m`;
    if (i > 1) {
      const p = nodes.get(nodeIds[i - 2])!;
      const turn = turnWord(a.x - p.x, a.y - p.y, b.x - a.x, b.y - a.y);
      lead = turn === 'Continue straight' ? `Continue straight for ${d} m` : `${turn} and walk ${d} m`;
    }
    const via = edges[i - 1].note ? ` along the ${edges[i - 1].note}` : '';
    const mark = b.landmark ? ` (${b.landmark})` : '';
    const stairs = edges[i - 1].accessible === false ? ' - includes steps' : '';
    steps.push({ nodeId: b.id, text: `${lead}${via} to ${b.label}${mark}${stairs}.`, distanceM: d });
  }
  const end = nodes.get(nodeIds[nodeIds.length - 1])!;
  steps.push({ nodeId: end.id, text: `You have arrived at ${end.label}.`, distanceM: 0 });
  return steps;
}

export interface MapProblems {
  /** Walkways whose end point was deleted. */
  broken: MapEdge[];
  /** Points no walkway joins to the first point. */
  unreachable: MapNode[];
  /** Published buildings whose entrance point does not exist. */
  missingEntrance: { id: string; name: string }[];
  /** Published buildings whose entrance exists but is cut off from the rest. */
  cutOff: { id: string; name: string; nodeId: string }[];
  /** Points drawn on top of each other: walkways to one never reach the other. */
  stacked: [MapNode, MapNode][];
}

/** Everything that would stop directions working, for the admin map editor. */
export function checkMap(
  map: CampusMap,
  buildings: { id: string; name: string; entranceNodeId?: string | null; published?: boolean }[] = [],
): MapProblems {
  const ids = new Set(map.nodes.map((n) => n.id));
  const broken = map.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  const root = map.nodes[0]?.id;
  const linked = (id: string) => id === root || findRoute(map, root, id) !== null;
  const unreachable = root ? map.nodes.filter((n) => !linked(n.id)) : [];
  const live = buildings.filter((b) => b.published !== false);
  const missingEntrance = live.filter((b) => !b.entranceNodeId || !ids.has(b.entranceNodeId)).map(({ id, name }) => ({ id, name }));
  const cutOff = live.filter((b) => b.entranceNodeId && ids.has(b.entranceNodeId) && !linked(b.entranceNodeId))
    .map((b) => ({ id: b.id, name: b.name, nodeId: b.entranceNodeId! }));
  const stacked: [MapNode, MapNode][] = [];
  const near = Math.max(map.width, map.height) / 200;   // closer than this is the same spot
  for (let i = 0; i < map.nodes.length; i++)
    for (let j = i + 1; j < map.nodes.length; j++) {
      const a = map.nodes[i], b = map.nodes[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < near) stacked.push([a, b]);
    }
  return { broken, unreachable, missingEntrance, cutOff, stacked };
}

/** The node a building or room is reached at. */
export function nodeForPlace(place: { navNodeId?: string | null; entranceNodeId?: string | null } | null | undefined) {
  return place?.navNodeId ?? place?.entranceNodeId ?? null;
}
