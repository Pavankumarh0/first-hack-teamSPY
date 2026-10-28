import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/geo.dart';
import '../../core/navigation.dart';
import '../../data/models.dart';
import '../theme.dart';

// The campus drawn over Google's satellite imagery (google_maps_flutter). Campus
// data stays in plan coordinates; core/geo.dart converts. The website's
// GoogleCampusMap.tsx is the same idea.

const _fill = {
  'academic': Brand.periwinkle, 'administrative': Brand.sun, 'library': Brand.mint, 'food': Brand.tangerine,
  'hostel': Brand.bubblegum, 'sports': Color(0xFF9FD9A8), 'medical': Color(0xFFF6A28F), 'event': Color(0xFFC9B6F0),
  'parking': Color(0xFFD6C6AB),
};

class SatelliteCampusMap extends StatefulWidget {
  const SatelliteCampusMap({
    super.key,
    required this.map,
    required this.buildings,
    this.routePoints,
    this.startNodeId,
    this.endNodeId,
    this.highlightBuildingId,
    this.onBuildingTap,
    this.showMyLocation = false,
    this.follow,
  });

  final CampusMapData map;
  final List<Building> buildings;
  final List<PlanPoint>? routePoints;
  final String? startNodeId;
  final String? endNodeId;
  final String? highlightBuildingId;
  final ValueChanged<Building>? onBuildingTap;
  final bool showMyLocation;

  /// When set, the camera follows this position (live directions).
  final LatLngPoint? follow;

  @override
  State<SatelliteCampusMap> createState() => _SatelliteCampusMapState();
}

class _SatelliteCampusMapState extends State<SatelliteCampusMap> {
  GoogleMapController? _controller;

  PlanFrame get _frame => PlanFrame(width: widget.map.width, height: widget.map.height, metersPerUnit: widget.map.metersPerUnit, geo: widget.map.geo!);
  LatLng _ll(PlanPoint p) {
    final g = toLatLng(_frame, p);
    return LatLng(g.lat, g.lng);
  }

  @override
  void didUpdateWidget(covariant SatelliteCampusMap old) {
    super.didUpdateWidget(old);
    final f = widget.follow;
    if (f != null && (old.follow?.lat != f.lat || old.follow?.lng != f.lng)) {
      _controller?.animateCamera(CameraUpdate.newLatLng(LatLng(f.lat, f.lng)));
    }
  }

  void _fit() {
    final corners = [
      for (final p in [PlanPoint(0, 0), PlanPoint(widget.map.width, 0), PlanPoint(0, widget.map.height), PlanPoint(widget.map.width, widget.map.height)]) _ll(p),
    ];
    final lats = corners.map((c) => c.latitude), lngs = corners.map((c) => c.longitude);
    _controller?.moveCamera(CameraUpdate.newLatLngBounds(
      LatLngBounds(
        southwest: LatLng(lats.reduce((a, b) => a < b ? a : b), lngs.reduce((a, b) => a < b ? a : b)),
        northeast: LatLng(lats.reduce((a, b) => a > b ? a : b), lngs.reduce((a, b) => a > b ? a : b)),
      ),
      24,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final map = widget.map;
    final nodes = {for (final n in map.nodes) n.id: n};
    PlanPoint at(String id) => PlanPoint(nodes[id]!.x, nodes[id]!.y);

    final polygons = <Polygon>{
      for (final b in widget.buildings)
        Polygon(
          polygonId: PolygonId(b.id),
          points: [for (final c in rectToLatLngs(_frame, b.x, b.y, b.w, b.h)) LatLng(c.lat, c.lng)],
          fillColor: (_fill[b.category] ?? const Color(0xFFE7DAC3)).withValues(alpha: b.id == widget.highlightBuildingId ? 0.9 : 0.6),
          strokeColor: Brand.ink,
          strokeWidth: b.id == widget.highlightBuildingId ? 4 : 2,
          consumeTapEvents: widget.onBuildingTap != null,
          onTap: widget.onBuildingTap == null ? null : () => widget.onBuildingTap!(b),
        ),
    };
    final polylines = <Polyline>{
      for (final e in map.edges)
        if (nodes[e.from] != null && nodes[e.to] != null)
          Polyline(
            polylineId: PolylineId(e.id),
            points: [_ll(at(e.from)), _ll(at(e.to))],
            color: e.accessible ? Brand.paper : const Color(0xFFF6A28F),
            width: e.accessible ? 4 : 3,
            patterns: e.accessible ? const [] : [PatternItem.dash(8), PatternItem.gap(8)],
          ),
      if ((widget.routePoints?.length ?? 0) > 1) ...[
        Polyline(polylineId: const PolylineId('route-outline'), points: [for (final p in widget.routePoints!) _ll(p)], color: Brand.ink, width: 10, zIndex: 5),
        Polyline(polylineId: const PolylineId('route'), points: [for (final p in widget.routePoints!) _ll(p)], color: Brand.sun, width: 6, zIndex: 6),
      ],
    };
    final markers = <Marker>{
      for (final b in widget.buildings)
        Marker(
          markerId: MarkerId('b-${b.id}'),
          position: _ll(PlanPoint(b.x + b.w / 2, b.y + b.h / 2)),
          infoWindow: InfoWindow(title: b.name, snippet: b.code.isEmpty ? null : b.code),
          icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow),
          alpha: 0.0, // tap target for the info window; the outline is the visual
          onTap: widget.onBuildingTap == null ? null : () => widget.onBuildingTap!(b),
        ),
      if (widget.startNodeId != null && nodes[widget.startNodeId] != null)
        Marker(markerId: const MarkerId('start'), position: _ll(at(widget.startNodeId!)), icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueYellow), zIndexInt: 10),
      if (widget.endNodeId != null && nodes[widget.endNodeId] != null)
        Marker(markerId: const MarkerId('end'), position: _ll(at(widget.endNodeId!)), icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed), zIndexInt: 10),
    };

    return GoogleMap(
      mapType: MapType.hybrid,
      initialCameraPosition: CameraPosition(target: LatLng(map.geo!.lat, map.geo!.lng), zoom: 17),
      onMapCreated: (c) {
        _controller = c;
        WidgetsBinding.instance.addPostFrameCallback((_) => _fit());
      },
      polygons: polygons,
      polylines: polylines,
      markers: markers,
      myLocationEnabled: widget.showMyLocation,
      myLocationButtonEnabled: widget.showMyLocation,
      mapToolbarEnabled: false,
      tiltGesturesEnabled: false,
      zoomControlsEnabled: false,
    );
  }
}
