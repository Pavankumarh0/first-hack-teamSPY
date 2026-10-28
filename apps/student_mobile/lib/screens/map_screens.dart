import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../core/config.dart';
import '../core/constants.dart';
import '../core/geo.dart';
import '../core/live_nav.dart';
import '../core/navigation.dart';
import '../data/models.dart';
import '../data/repository.dart';
import '../ui/theme.dart';
import '../ui/widgets/campus_map_view.dart';
import '../ui/widgets/cards.dart';
import '../ui/widgets/common.dart';
import '../ui/widgets/satellite_map.dart';

/// The "From" value meaning: wherever I am now (live GPS directions).
const myLocation = '__me';

/// A place you can walk to: a building entrance or a room.
class Destination {
  const Destination(this.id, this.name, this.group, this.nodeId, this.buildingId);
  final String id, name, group, nodeId;
  final String? buildingId;
}

class CampusData {
  const CampusData(this.map, this.buildings, this.places, this.destinations);
  final CampusMapData? map;
  final List<Building> buildings;
  final List<Place> places;
  final List<Destination> destinations;
}

Future<CampusData> loadCampus(CampusRepository repo) async {
  final results = await Future.wait([repo.campusMap(), repo.buildings(), repo.places()]);
  final buildings = results[1] as List<Building>;
  final places = results[2] as List<Place>;
  return CampusData(results[0] as CampusMapData?, buildings, places, [
    for (final b in buildings)
      if (b.entranceNodeId != null) Destination(b.id, b.name, 'Buildings', b.entranceNodeId!, b.id),
    for (final p in places)
      if (p.navNodeId != null) Destination(p.id, p.room != null ? '${p.name} (${p.room})' : p.name, p.buildingName ?? 'Other places', p.navNodeId!, p.buildingId),
  ]);
}

class MapScreen extends StatelessWidget {
  const MapScreen({super.key, this.from, this.to});
  final String? from;
  final String? to;

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return Scaffold(
        appBar: AppBar(
          title: const Text('Campus map'),
          actions: [IconButton(tooltip: 'Search places', icon: const Icon(Icons.search), onPressed: () => context.push('/directory'))],
        ),
        body: AsyncView<CampusData>(
          load: () => loadCampus(repo),
          builder: (context, data, _) => data.map == null
              ? const EmptyState(title: 'The campus map is not set up yet', body: 'An administrator draws it in the dashboard.', icon: Icons.map_outlined)
              : RoutePlanner(data: data, initialFrom: from, initialTo: to),
        ),
      );
  }
}

class RoutePlanner extends StatefulWidget {
  const RoutePlanner({super.key, required this.data, this.initialFrom, this.initialTo});
  final CampusData data;
  final String? initialFrom;
  final String? initialTo;
  @override
  State<RoutePlanner> createState() => _RoutePlannerState();
}

enum _Gps { off, asking, tracking, denied, disabled, error }

class _RoutePlannerState extends State<RoutePlanner> {
  late String? _from = _known(widget.initialFrom);
  late String? _to = _known(widget.initialTo);
  bool _stepFree = false;
  bool _satellite = true;

  // Live directions. The position lives only in this widget's memory.
  StreamSubscription<Position>? _gpsSub;
  _Gps _gps = _Gps.off;
  Position? _fix;
  LivePlan? _plan;
  DateTime _lastPlan = DateTime.fromMillisecondsSinceEpoch(0);

  String? _known(String? id) => id == myLocation || widget.data.destinations.any((d) => d.id == id) ? id : null;

  bool get _liveWanted => _from == myLocation && widget.data.map?.geo != null && _dest(_to) != null;

  PlanFrame get _frame {
    final m = widget.data.map!;
    return PlanFrame(width: m.width, height: m.height, metersPerUnit: m.metersPerUnit, geo: m.geo!);
  }

  PlanPoint? get _here => _fix == null ? null : toPlan(_frame, LatLngPoint(_fix!.latitude, _fix!.longitude));

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncGps());
  }

  @override
  void dispose() {
    _gpsSub?.cancel();
    super.dispose();
  }

  /// Starts or stops the GPS to match the current choice.
  Future<void> _syncGps() async {
    if (!_liveWanted) {
      await _gpsSub?.cancel();
      _gpsSub = null;
      if (_gps != _Gps.off) setState(() { _gps = _Gps.off; _fix = null; _plan = null; });
      return;
    }
    if (_gpsSub != null) return;
    setState(() => _gps = _Gps.asking);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        if (mounted) setState(() => _gps = _Gps.disabled);
        return;
      }
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        if (mounted) setState(() => _gps = _Gps.denied);
        return;
      }
      if (!mounted || !_liveWanted) return;
      _gpsSub = Geolocator.getPositionStream(locationSettings: const LocationSettings(accuracy: LocationAccuracy.best, distanceFilter: 2)).listen(
        _onFix,
        onError: (Object _) { if (mounted) setState(() => _gps = _Gps.error); },
      );
    } catch (_) {
      if (mounted) setState(() => _gps = _Gps.error);
    }
  }

  void _onFix(Position p) {
    if (!mounted) return;
    setState(() {
      _fix = p;
      _gps = _Gps.tracking;
      final here = _here!, to = _dest(_to);
      if (to == null) return;
      final live = _plan?.live;
      final off = live != null && progress(widget.data.map!, live, here).offRoute;
      // Plan on the first fix; re-plan when off the route (at most every 5 s).
      if ((_plan == null || _plan!.status != PlanStatus.ok || off) && DateTime.now().difference(_lastPlan).inSeconds >= 5) {
        _lastPlan = DateTime.now();
        _plan = routeFromPosition(widget.data.map!, here, to.nodeId, accessibleOnly: _stepFree);
      }
    });
  }

  void _choose(VoidCallback change) {
    setState(() {
      change();
      _plan = null;
      _lastPlan = DateTime.fromMillisecondsSinceEpoch(0);
    });
    _syncGps();
  }
  Destination? _dest(String? id) {
    for (final d in widget.data.destinations) {
      if (d.id == id) return d;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final map = widget.data.map!;
    final from = _dest(_from), to = _dest(_to);
    final route = from != null && to != null ? findRoute(map, from.nodeId, to.nodeId, accessibleOnly: _stepFree) : null;
    final live = _liveWanted && _plan?.status == PlanStatus.ok ? _plan!.live : null;
    final here = _liveWanted ? _here : null;
    final prog = live != null && here != null ? progress(map, live, here) : null;
    final satellite = googleMapsEnabled && map.geo != null && _satellite;
    final routePoints = live?.points ?? route?.nodeIds.map((id) => PlanPoint(map.node(id)!.x, map.node(id)!.y)).toList();
    final stale = (widget.initialTo != null && to == null && _to == null) || (widget.initialFrom != null && from == null && _from == null);
    return ListView(padding: const EdgeInsets.all(16), children: [
      if (stale)
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text('That link points to a place that is no longer on the campus map. Choose a destination below.', style: TextStyle(color: Color(0xFFB45309))),
        ),
      if (googleMapsEnabled && map.geo != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: SegmentedButton<bool>(
            segments: const [ButtonSegment(value: true, label: Text('SATELLITE')), ButtonSegment(value: false, label: Text('CAMPUS PLAN'))],
            selected: {_satellite},
            onSelectionChanged: (v) => setState(() => _satellite = v.first),
          ),
        ),
      Card(
        clipBehavior: Clip.antiAlias,
        child: satellite
            ? SizedBox(
                height: 420,
                child: SatelliteCampusMap(
                  map: map,
                  buildings: widget.data.buildings,
                  routePoints: routePoints,
                  startNodeId: live == null ? from?.nodeId : null,
                  endNodeId: to?.nodeId,
                  highlightBuildingId: to?.buildingId,
                  showMyLocation: _gps == _Gps.tracking,
                  follow: live != null && _fix != null ? LatLngPoint(_fix!.latitude, _fix!.longitude) : null,
                  onBuildingTap: (b) => _choose(() => _to = _known(b.id)),
                ),
              )
            : Padding(
                padding: const EdgeInsets.all(6),
                child: CampusMapView(
                  map: map,
                  buildings: widget.data.buildings,
                  route: live == null ? route : null,
                  startNodeId: live == null ? from?.nodeId : null,
                  endNodeId: to?.nodeId,
                  highlightBuildingId: to?.buildingId,
                  onBuildingTap: (b) => _choose(() => _to = _known(b.id)),
                  me: here,
                  livePath: live?.points,
                ),
              ),
      ),
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(children: [
          const Expanded(child: Text('Tap a building to make it your destination. Pinch to zoom.', style: TextStyle(fontSize: 12, color: Color(0xFF7B6E5A)))),
          SampleBadge(show: map.isSample),
        ]),
      ),
      _picker('From', _from, (v) => _choose(() => _from = v), live: map.geo != null),
      if (map.geo != null && _from != myLocation)
        Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(top: 8),
            child: OutlinedButton.icon(
              onPressed: () => _choose(() => _from = myLocation),
              icon: const Icon(Icons.my_location, size: 18),
              label: const Text('START FROM MY LOCATION'),
            ),
          ),
        ),
      Align(
        child: IconButton(
          tooltip: 'Swap start and destination',
          icon: const Icon(Icons.swap_vert),
          onPressed: _from == myLocation ? null : () => _choose(() { final t = _from; _from = _to; _to = t; }),
        ),
      ),
      _picker('To', _to, (v) => _choose(() => _to = v)),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Step-free route only'),
        secondary: const Icon(Icons.accessible),
        value: _stepFree,
        onChanged: (v) => _choose(() => _stepFree = v),
      ),
      if (_from == myLocation) _LiveCard(toName: to?.name, gps: _gps, accuracyM: _fix?.accuracy.round(), plan: _plan, progress: prog,
          onStop: () => _choose(() => _from = null)),
      if (from != null && to != null && route == null)
        Text(_stepFree ? 'No step-free route is mapped between these places.' : 'These places are not connected on the campus map yet.',
            style: const TextStyle(color: Color(0xFFB91C1C))),
      if (route != null) _RouteCard(route: route),
    ]);
  }

  Widget _picker(String label, String? value, ValueChanged<String?> onChanged, {bool live = false}) => DropdownButtonFormField<String>(
        key: ValueKey('$label-$value'),
        initialValue: value,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [
          if (live) const DropdownMenuItem(value: myLocation, child: Text('My location (live directions)')),
          for (final d in widget.data.destinations)
            DropdownMenuItem(value: d.id, child: Text(d.group == 'Buildings' ? d.name : '${d.name} · ${d.group}', overflow: TextOverflow.ellipsis)),
        ],
        onChanged: onChanged,
      );
}

class _RouteCard extends StatelessWidget {
  const _RouteCard({required this.route});
  final CampusRoute route;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.schedule, color: Brand.tealDark),
              const SizedBox(width: 6),
              Text('${route.minutes} min', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(width: 12),
              Text('${route.distanceM} m walk', style: const TextStyle(color: Color(0xFF5F5446))),
              const Spacer(),
              route.accessible ? const Pill('Step-free', color: Color(0xFF047857)) : const Pill('Includes steps', color: Color(0xFFB45309)),
            ]),
            const SizedBox(height: 12),
            for (var i = 0; i < route.steps.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  CircleAvatar(radius: 12, backgroundColor: Brand.teal.withValues(alpha: 0.12),
                      child: Text('${i + 1}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Brand.tealDark))),
                  const SizedBox(width: 10),
                  Expanded(child: Padding(padding: const EdgeInsets.only(top: 2), child: Text(route.steps[i].text))),
                ]),
              ),
          ]),
        ),
      );
}

/// Search the campus directory.
class DirectoryScreen extends StatefulWidget {
  const DirectoryScreen({super.key});
  @override
  State<DirectoryScreen> createState() => _DirectoryScreenState();
}

class _DirectoryScreenState extends State<DirectoryScreen> {
  String _q = '';

  static int score(Place p, String query) {
    final q = query.toLowerCase().replaceAll(RegExp('[^a-z0-9 ]'), ' ').trim();
    if (q.isEmpty) return 1;
    final fields = [p.name, p.room ?? '', p.type, p.buildingName ?? '', ...p.keywords].map((f) => f.toLowerCase()).toList();
    final compact = q.replaceAll(' ', '');
    var s = p.name.toLowerCase().startsWith(q) ? 50 : 0;
    if (fields.any((f) => f.replaceAll(RegExp('[^a-z0-9]'), '') == compact)) s += 40;
    for (final word in q.split(' ')) {
      if (!fields.any((f) => f.contains(word))) return 0;
      s += 5;
    }
    return s;
  }

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return Scaffold(
        appBar: AppBar(title: const Text('Find a place')),
        body: AsyncView<List<Place>>(
          load: () => repo.places(),
          builder: (context, places, _) {
            final results = places.map((p) => (p, score(p, _q))).where((x) => x.$2 > 0).toList()..sort((a, b) => b.$2.compareTo(a.$2));
            return ListView(children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: TextField(
                  autofocus: true,
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Library, B-104, exam section, gym...'),
                  onChanged: (v) => setState(() => _q = v),
                ),
              ),
              if (results.isEmpty)
                EmptyState(title: 'Nothing matches', body: 'No room or facility matches "$_q". Try a shorter word.')
              else
                for (final (p, _) in results) PlaceTile(p),
            ]);
          },
        ),
      );
  }
}

class PlaceScreen extends StatelessWidget {
  const PlaceScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return Scaffold(
        appBar: AppBar(),
        body: AsyncView<(Place?, CampusData)>(
          load: () async => (await repo.place(id), await loadCampus(repo)),
          builder: (context, data, _) {
            final (place, campus) = data;
            if (place == null) return const UnknownDestination(what: 'place');
            return ListView(padding: const EdgeInsets.all(16), children: [
              Wrap(spacing: 6, children: [Pill(C.label(C.locationTypeLabels, place.type), color: Brand.tealDark), SampleBadge(show: place.isSample)]),
              const SizedBox(height: 8),
              PosterText(place.name, size: 46, stop: false),
              if (place.where.isNotEmpty) Text(place.where, style: const TextStyle(color: Color(0xFF5F5446))),
              if (place.openingHours != null) ...[const SizedBox(height: 8), Row(children: [const Icon(Icons.schedule, size: 18), const SizedBox(width: 6), Text(place.openingHours!)])],
              if (place.description != null) ...[const SizedBox(height: 12), Text(place.description!)],
              const SizedBox(height: 16),
              FilledButton.icon(onPressed: () => context.push('/map?to=${place.id}'), icon: const Icon(Icons.directions_walk), label: const Text('Get directions')),
              if (place.buildingId != null)
                TextButton(onPressed: () => context.push('/building/${place.buildingId}'), child: Text('About ${place.buildingName ?? 'the building'}')),
              if (campus.map != null) ...[
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(6),
                    child: CampusMapView(map: campus.map!, buildings: campus.buildings, highlightBuildingId: place.buildingId, endNodeId: place.navNodeId),
                  ),
                ),
              ],
            ]);
          },
        ),
      );
  }
}

class BuildingScreen extends StatelessWidget {
  const BuildingScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return Scaffold(
        appBar: AppBar(),
        body: AsyncView<(Building?, List<Place>)>(
          load: () async {
            final b = await repo.building(id);
            return (b, b == null ? <Place>[] : await repo.placesIn(id));
          },
          builder: (context, data, _) {
            final (b, places) = data;
            if (b == null) return const UnknownDestination(what: 'building');
            return ListView(children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Wrap(spacing: 6, children: [Pill(b.code), SampleBadge(show: b.isSample)]),
                  const SizedBox(height: 8),
                  PosterText(b.name, size: 46, stop: false),
                  if (b.openingHours != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(b.openingHours!)),
                  if (b.accessible) const Padding(padding: EdgeInsets.only(top: 6), child: Row(children: [Icon(Icons.accessible, size: 18), SizedBox(width: 6), Text('Step-free entrance')])),
                  if (b.description != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(b.description!)),
                  const SizedBox(height: 16),
                  FilledButton.icon(onPressed: () => context.push('/map?to=${b.id}'), icon: const Icon(Icons.directions_walk), label: const Text('Get directions')),
                ]),
              ),
              const SectionHeader('Inside this building', icon: Icons.meeting_room_outlined),
              if (places.isEmpty) const EmptyState(title: 'No rooms listed yet') else for (final p in places) PlaceTile(p),
            ]);
          },
        ),
      );
  }
}

/// Safe screen for unknown, removed or malformed QR destinations.
class UnknownDestination extends StatelessWidget {
  const UnknownDestination({super.key, this.what = 'place'});
  final String what;
  @override
  Widget build(BuildContext context) => EmptyState(
        icon: Icons.search_off,
        title: 'We could not find that $what',
        body: 'The QR code or link may be out of date, or the $what is no longer listed.',
        action: FilledButton(onPressed: () => context.go('/'), child: const Text('Go home')),
      );
}

/// Turn-by-turn card for live directions from the phone's own position.
class _LiveCard extends StatelessWidget {
  const _LiveCard({required this.toName, required this.gps, required this.accuracyM, required this.plan, required this.progress, required this.onStop});
  final String? toName;
  final _Gps gps;
  final int? accuracyM;
  final LivePlan? plan;
  final Progress? progress;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    const light = TextStyle(color: Color(0xD9F7F0E3), fontSize: 15, height: 1.35);
    Widget body;
    if (toName == null) {
      body = const Text('Choose where you want to go, and directions will start from where you are.', style: light);
    } else if (gps == _Gps.denied) {
      body = const Text('Location access is off for Campus Mithra. Allow it in your phone settings, or choose a starting place.', style: light);
    } else if (gps == _Gps.disabled) {
      body = const Text('Location is switched off on this phone. Turn it on to get live directions.', style: light);
    } else if (gps == _Gps.error) {
      body = const Text('Your position is not available right now. Step outside or try again.', style: light);
    } else if (plan == null) {
      body = const Row(children: [
        SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Brand.sun)),
        SizedBox(width: 12),
        Expanded(child: Text('Finding you...', style: light)),
      ]);
    } else if (plan!.status == PlanStatus.offCampus) {
      body = Text('You seem to be about ${plan!.distanceM} m from the nearest campus path. Directions start once you are on campus.', style: light);
    } else if (plan!.status == PlanStatus.noRoute) {
      body = Text('There is no mapped path from here to $toName yet.', style: light);
    } else if (plan!.status == PlanStatus.arrived || (progress?.arrived ?? false)) {
      body = const PosterText("You're here", size: 46, color: Brand.paper);
    } else {
      final p = progress!;
      body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        PosterText(p.next, size: 40, color: Brand.paper),
        const SizedBox(height: 10),
        Text('${p.remainingM} m to $toName · about ${p.minutes} min${p.offRoute ? ' · re-routing' : ''}',
            style: const TextStyle(color: Color(0xD9F7F0E3), fontWeight: FontWeight.w700)),
      ]);
    }
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Semantics(
        liveRegion: true,
        child: ColorBlock(
          color: Brand.ink,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: const ShapeDecoration(color: Brand.sun, shape: StadiumBorder()),
                child: const Text('LIVE DIRECTIONS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Brand.ink)),
              ),
              const Spacer(),
              IconButton(tooltip: 'Stop live directions', onPressed: onStop, icon: const Icon(Icons.close, color: Brand.paper)),
            ]),
            const SizedBox(height: 10),
            body,
            if (accuracyM != null) ...[
              const SizedBox(height: 10),
              Text(accuracyM! > 35 ? 'Weak GPS signal (within $accuracyM m) - step outside or wait a moment.' : 'Located within $accuracyM m',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: accuracyM! > 35 ? Brand.sun : const Color(0xB3F7F0E3))),
            ],
            const SizedBox(height: 8),
            const Text('Your location stays on this phone. Campus Mithra does not store or share it.', style: TextStyle(fontSize: 12, color: Color(0xB3F7F0E3))),
          ]),
        ),
      ),
    );
  }
}
