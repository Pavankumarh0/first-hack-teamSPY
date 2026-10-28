import 'dart:math' as math;

import 'geo.dart';

// Campus-only navigation over campusMap/main: Dijkstra on a graph of walkway
// junctions and building entrances. A port of
// apps/campus_web/src/lib/navigation.ts; both are tested on the sample map.

class MapNode {
  const MapNode({required this.id, required this.x, required this.y, required this.label, this.landmark, this.buildingId});
  final String id;
  final double x;
  final double y;
  final String label;
  final String? landmark;
  final String? buildingId;

  factory MapNode.fromJson(Map<String, dynamic> j) => MapNode(
        id: j['id'] as String,
        x: (j['x'] as num).toDouble(),
        y: (j['y'] as num).toDouble(),
        label: (j['label'] as String?) ?? j['id'] as String,
        landmark: j['landmark'] as String?,
        buildingId: j['buildingId'] as String?,
      );
}

class MapEdge {
  const MapEdge({required this.id, required this.from, required this.to, this.accessible = true, this.note});
  final String id;
  final String from;
  final String to;
  final bool accessible;
  final String? note;

  factory MapEdge.fromJson(Map<String, dynamic> j) => MapEdge(
        id: j['id'] as String,
        from: j['from'] as String,
        to: j['to'] as String,
        accessible: j['accessible'] != false,
        note: j['note'] as String?,
      );
}

class CampusMapData {
  const CampusMapData({
    required this.width,
    required this.height,
    required this.metersPerUnit,
    required this.nodes,
    required this.edges,
    this.name,
    this.isSample = false,
    this.geo,
  });
  final double width;
  final double height;
  final double metersPerUnit;
  final List<MapNode> nodes;
  final List<MapEdge> edges;
  final String? name;
  final bool isSample;

  /// Where the plan sits on Earth; null until an admin places it (geo.dart).
  final GeoRef? geo;

  factory CampusMapData.fromJson(Map<String, dynamic> j) => CampusMapData(
        width: (j['width'] as num?)?.toDouble() ?? 1000,
        height: (j['height'] as num?)?.toDouble() ?? 700,
        metersPerUnit: (j['metersPerUnit'] as num?)?.toDouble() ?? 1,
        nodes: [for (final n in (j['nodes'] as List? ?? const [])) MapNode.fromJson(Map<String, dynamic>.from(n as Map))],
        edges: [for (final e in (j['edges'] as List? ?? const [])) MapEdge.fromJson(Map<String, dynamic>.from(e as Map))],
        name: j['name'] as String?,
        isSample: j['isSample'] == true,
        geo: GeoRef.tryParse(j['geo']),
      );

  MapNode? node(String id) {
    for (final n in nodes) {
      if (n.id == id) return n;
    }
    return null;
  }
}

class RouteStep {
  const RouteStep(this.nodeId, this.text, this.distanceM);
  final String nodeId;
  final String text;
  final int distanceM;
}

class CampusRoute {
  const CampusRoute({
    required this.nodeIds,
    required this.edgeIds,
    required this.distanceM,
    required this.minutes,
    required this.accessible,
    required this.steps,
  });
  final List<String> nodeIds;
  final List<String> edgeIds;
  final int distanceM;
  final int minutes;
  final bool accessible;
  final List<RouteStep> steps;
}

const walkingMetersPerMinute = 75;

double _length(MapNode a, MapNode b, double mpu) => math.sqrt(math.pow(b.x - a.x, 2) + math.pow(b.y - a.y, 2)) * mpu;

/// Shortest walk between two nodes, or null when they are not connected.
CampusRoute? findRoute(CampusMapData map, String fromId, String toId, {bool accessibleOnly = false}) {
  final nodes = {for (final n in map.nodes) n.id: n};
  if (!nodes.containsKey(fromId) || !nodes.containsKey(toId)) return null;

  final adj = <String, List<(String, MapEdge, double)>>{for (final n in map.nodes) n.id: []};
  for (final e in map.edges) {
    if (accessibleOnly && !e.accessible) continue;
    final a = nodes[e.from];
    final b = nodes[e.to];
    if (a == null || b == null) continue;
    final w = _length(a, b, map.metersPerUnit);
    adj[a.id]!.add((b.id, e, w));
    adj[b.id]!.add((a.id, e, w));
  }

  final dist = <String, double>{fromId: 0};
  final prev = <String, (String, MapEdge)>{};
  final done = <String>{};
  while (true) {
    String? current;
    for (final entry in dist.entries) {
      if (!done.contains(entry.key) && (current == null || entry.value < dist[current]!)) current = entry.key;
    }
    if (current == null) return null;
    if (current == toId) break;
    done.add(current);
    for (final (to, edge, w) in adj[current]!) {
      final alt = dist[current]! + w;
      if (alt < (dist[to] ?? double.infinity)) {
        dist[to] = alt;
        prev[to] = (current, edge);
      }
    }
  }

  final nodeIds = <String>[toId];
  final used = <MapEdge>[];
  for (var at = toId; at != fromId;) {
    final (p, edge) = prev[at]!;
    nodeIds.insert(0, p);
    used.insert(0, edge);
    at = p;
  }
  final distanceM = dist[toId]!.round();
  return CampusRoute(
    nodeIds: nodeIds,
    edgeIds: [for (final e in used) e.id],
    distanceM: distanceM,
    minutes: math.max(1, (distanceM / walkingMetersPerMinute).round()),
    accessible: used.every((e) => e.accessible),
    steps: _describe(map, nodes, nodeIds, used),
  );
}

/// The turn between two headings in screen coordinates (y grows downwards).
String turnWord(double ax, double ay, double bx, double by) {
  final angle = math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180 / math.pi;
  final a = angle.abs();
  if (a < 25) return 'Continue straight';
  if (a > 155) return 'Turn around';
  final side = angle > 0 ? 'right' : 'left';
  return a < 60 ? 'Bear $side' : 'Turn $side';
}

List<RouteStep> _describe(CampusMapData map, Map<String, MapNode> nodes, List<String> ids, List<MapEdge> edges) {
  final start = nodes[ids.first]!;
  if (ids.length == 1) return [RouteStep(start.id, 'You are at ${start.label}.', 0)];
  final steps = [RouteStep(start.id, 'Start at ${start.label}.', 0)];
  for (var i = 1; i < ids.length; i++) {
    final a = nodes[ids[i - 1]]!;
    final b = nodes[ids[i]]!;
    final d = _length(a, b, map.metersPerUnit).round();
    var lead = 'Walk $d m';
    if (i > 1) {
      final p = nodes[ids[i - 2]]!;
      final turn = turnWord(a.x - p.x, a.y - p.y, b.x - a.x, b.y - a.y);
      lead = turn == 'Continue straight' ? 'Continue straight for $d m' : '$turn and walk $d m';
    }
    final edge = edges[i - 1];
    final via = edge.note != null ? ' along the ${edge.note}' : '';
    final mark = b.landmark != null ? ' (${b.landmark})' : '';
    final stairs = edge.accessible ? '' : ' - includes steps';
    steps.add(RouteStep(b.id, '$lead$via to ${b.label}$mark$stairs.', d));
  }
  final end = nodes[ids.last]!;
  steps.add(RouteStep(end.id, 'You have arrived at ${end.label}.', 0));
  return steps;
}
