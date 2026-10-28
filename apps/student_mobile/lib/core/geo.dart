import 'dart:math' as math;

// Georeferencing: where the campus plan (campusMap x/y units) sits on Earth.
// A port of apps/campus_web/src/lib/geo.ts; the plan stays the source of truth
// for routing, `campusMap.geo` pins its centre to a latitude/longitude and says
// which compass bearing the plan's "up" points to.

class GeoRef {
  const GeoRef({required this.lat, required this.lng, this.rotationDeg = 0});
  final double lat;
  final double lng;

  /// Compass bearing of the plan's "up", degrees clockwise from north.
  final double rotationDeg;

  static GeoRef? tryParse(Object? v) {
    if (v is! Map) return null;
    final lat = v['lat'], lng = v['lng'];
    if (lat is! num || lng is! num || lat.abs() > 90 || lng.abs() > 180) return null;
    return GeoRef(lat: lat.toDouble(), lng: lng.toDouble(), rotationDeg: (v['rotationDeg'] as num?)?.toDouble() ?? 0);
  }
}

class LatLngPoint {
  const LatLngPoint(this.lat, this.lng);
  final double lat;
  final double lng;
}

class PlanPoint {
  const PlanPoint(this.x, this.y);
  final double x;
  final double y;
}

/// The plan's size and scale - the fields of CampusMapData that geo needs.
class PlanFrame {
  const PlanFrame({required this.width, required this.height, required this.metersPerUnit, required this.geo});
  final double width;
  final double height;
  final double metersPerUnit;
  final GeoRef geo;
}

const _mPerDegLat = 111320.0;
double _rad(double d) => d * math.pi / 180;

LatLngPoint toLatLng(PlanFrame f, PlanPoint p) {
  final dx = (p.x - f.width / 2) * f.metersPerUnit;
  final dy = (p.y - f.height / 2) * f.metersPerUnit;
  final t = _rad(f.geo.rotationDeg);
  final east = dx * math.cos(t) - dy * math.sin(t);
  final north = -dx * math.sin(t) - dy * math.cos(t);
  return LatLngPoint(f.geo.lat + north / _mPerDegLat, f.geo.lng + east / (_mPerDegLat * math.cos(_rad(f.geo.lat))));
}

PlanPoint toPlan(PlanFrame f, LatLngPoint ll) {
  final north = (ll.lat - f.geo.lat) * _mPerDegLat;
  final east = (ll.lng - f.geo.lng) * _mPerDegLat * math.cos(_rad(f.geo.lat));
  final t = _rad(f.geo.rotationDeg);
  final dx = east * math.cos(t) - north * math.sin(t);
  final dy = -(east * math.sin(t) + north * math.cos(t));
  return PlanPoint(f.width / 2 + dx / f.metersPerUnit, f.height / 2 + dy / f.metersPerUnit);
}

double haversineM(LatLngPoint a, LatLngPoint b) {
  const r = 6371000.0;
  final dLat = _rad(b.lat - a.lat), dLng = _rad(b.lng - a.lng);
  final h = math.pow(math.sin(dLat / 2), 2) + math.cos(_rad(a.lat)) * math.cos(_rad(b.lat)) * math.pow(math.sin(dLng / 2), 2);
  return 2 * r * math.asin(math.sqrt(h));
}

List<LatLngPoint> rectToLatLngs(PlanFrame f, double x, double y, double w, double h) => [
      toLatLng(f, PlanPoint(x, y)),
      toLatLng(f, PlanPoint(x + w, y)),
      toLatLng(f, PlanPoint(x + w, y + h)),
      toLatLng(f, PlanPoint(x, y + h)),
    ];
