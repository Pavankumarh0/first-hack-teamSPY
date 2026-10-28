import 'dart:math' as math;

import 'geo.dart';
import 'navigation.dart';

// Live, turn-by-turn guidance from the walker's own position. A port of
// apps/campus_web/src/lib/liveNav.ts; runs on the phone only - positions are
// never sent anywhere.

const maxSnapM = 60.0;
const offRouteM = 25.0;
const arriveM = 12.0;

class Snap {
  const Snap(this.edge, this.point, this.distanceM);
  final MapEdge edge;
  final PlanPoint point;
  final double distanceM;
}

class Maneuver {
  const Maneuver(this.index, this.text, {this.arrive = false});
  final int index;
  final String text;
  final bool arrive;
}

class LiveRoute {
  const LiveRoute({required this.points, required this.labels, required this.cumulativeM, required this.maneuvers, required this.route, required this.destinationId});
  final List<PlanPoint> points;
  final List<String> labels;
  final List<double> cumulativeM;
  final List<Maneuver> maneuvers;
  final CampusRoute route;
  final String destinationId;
  double get totalM => cumulativeM.last;
}

enum PlanStatus { ok, arrived, offCampus, noRoute }

class LivePlan {
  const LivePlan(this.status, {this.live, this.distanceM});
  final PlanStatus status;
  final LiveRoute? live;
  final int? distanceM;
}

class Progress {
  const Progress({required this.alongM, required this.offsetM, required this.remainingM, required this.minutes, required this.next, required this.offRoute, required this.arrived});
  final int alongM, offsetM, remainingM, minutes;
  final String next;
  final bool offRoute, arrived;
}

({double t, PlanPoint point, double d}) _closest(PlanPoint p, PlanPoint a, PlanPoint b) {
  final vx = b.x - a.x, vy = b.y - a.y;
  final len2 = vx * vx + vy * vy;
  final t = len2 == 0 ? 0.0 : (((p.x - a.x) * vx + (p.y - a.y) * vy) / len2).clamp(0.0, 1.0);
  final point = PlanPoint(a.x + t * vx, a.y + t * vy);
  return (t: t, point: point, d: math.sqrt(math.pow(p.x - point.x, 2) + math.pow(p.y - point.y, 2)));
}

double _dist(PlanPoint a, PlanPoint b) => math.sqrt(math.pow(a.x - b.x, 2) + math.pow(a.y - b.y, 2));

Snap? snapToPaths(CampusMapData map, PlanPoint p, {bool accessibleOnly = false}) {
  final nodes = {for (final n in map.nodes) n.id: n};
  Snap? best;
  for (final e in map.edges) {
    if (accessibleOnly && !e.accessible) continue;
    final a = nodes[e.from], b = nodes[e.to];
    if (a == null || b == null) continue;
    final c = _closest(p, PlanPoint(a.x, a.y), PlanPoint(b.x, b.y));
    final d = c.d * map.metersPerUnit;
    if (best == null || d < best.distanceM) best = Snap(e, c.point, d);
  }
  return best;
}

String _lower(String s) => s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);

LivePlan routeFromPosition(CampusMapData map, PlanPoint p, String toId, {bool accessibleOnly = false}) {
  final nodes = {for (final n in map.nodes) n.id: n};
  final dest = nodes[toId];
  if (dest == null) return const LivePlan(PlanStatus.noRoute);
  final snap = snapToPaths(map, p, accessibleOnly: accessibleOnly);
  if (snap == null) return const LivePlan(PlanStatus.noRoute);
  if (snap.distanceM > maxSnapM) return LivePlan(PlanStatus.offCampus, distanceM: snap.distanceM.round());
  if (_dist(p, PlanPoint(dest.x, dest.y)) * map.metersPerUnit <= arriveM) return const LivePlan(PlanStatus.arrived);

  CampusRoute? bestRoute;
  var bestLead = 0.0;
  for (final endId in [snap.edge.from, snap.edge.to]) {
    final end = nodes[endId]!;
    final r = findRoute(map, endId, toId, accessibleOnly: accessibleOnly);
    if (r == null) continue;
    final lead = _dist(PlanPoint(end.x, end.y), snap.point) * map.metersPerUnit;
    if (bestRoute == null || lead + r.distanceM < bestLead + bestRoute.distanceM) {
      bestRoute = r;
      bestLead = lead;
    }
  }
  if (bestRoute == null) return const LivePlan(PlanStatus.noRoute);

  final routeNodes = [for (final id in bestRoute.nodeIds) nodes[id]!];
  final lead = bestLead >= 1;
  final points = [if (lead) snap.point, for (final n in routeNodes) PlanPoint(n.x, n.y)];
  final labels = [if (lead) 'your position', for (final n in routeNodes) n.label];
  final cum = <double>[0];
  for (var i = 1; i < points.length; i++) {
    cum.add(cum[i - 1] + _dist(points[i], points[i - 1]) * map.metersPerUnit);
  }
  final maneuvers = <Maneuver>[];
  for (var k = 1; k < points.length - 1; k++) {
    final a = points[k - 1], b = points[k], c = points[k + 1];
    final turn = turnWord(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y);
    if (turn != 'Continue straight') maneuvers.add(Maneuver(k, '$turn at ${labels[k]}'));
  }
  maneuvers.add(Maneuver(points.length - 1, 'Arrive at ${dest.label}', arrive: true));
  return LivePlan(PlanStatus.ok,
      live: LiveRoute(points: points, labels: labels, cumulativeM: cum, maneuvers: maneuvers, route: bestRoute, destinationId: toId));
}

Progress progress(CampusMapData map, LiveRoute live, PlanPoint p) {
  var along = 0.0, offset = double.infinity;
  for (var i = 1; i < live.points.length; i++) {
    final c = _closest(p, live.points[i - 1], live.points[i]);
    final d = c.d * map.metersPerUnit;
    if (d < offset) {
      offset = d;
      along = live.cumulativeM[i - 1] + c.t * (live.cumulativeM[i] - live.cumulativeM[i - 1]);
    }
  }
  if (live.points.length == 1) offset = _dist(p, live.points.first) * map.metersPerUnit;
  final remaining = math.max(0.0, live.totalM - along);
  final next = live.maneuvers.firstWhere((m) => live.cumulativeM[m.index] > along + 1, orElse: () => live.maneuvers.last);
  final inM = math.max(0, (live.cumulativeM[next.index] - along).round());
  final arrived = remaining <= arriveM && offset <= offRouteM;
  final text = arrived
      ? 'You have arrived at ${live.labels.last}'
      : inM < 10
          ? '${next.text} now'
          : 'In ${(inM / 5).round() * 5} m, ${_lower(next.text)}';
  return Progress(
    alongM: along.round(),
    offsetM: offset.round(),
    remainingM: remaining.round(),
    minutes: math.max(1, (remaining / walkingMetersPerMinute).round()),
    next: text,
    offRoute: !arrived && offset > offRouteM,
    arrived: arrived,
  );
}
