import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../core/constants.dart';
import '../core/navigation.dart';
import '../data/models.dart';
import '../data/repository.dart';
import '../ui/theme.dart';
import '../ui/widgets/campus_map_view.dart';
import '../ui/widgets/cards.dart';
import '../ui/widgets/common.dart';

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

class _RoutePlannerState extends State<RoutePlanner> {
  late String? _from = _known(widget.initialFrom);
  late String? _to = _known(widget.initialTo);
  bool _stepFree = false;

  String? _known(String? id) => widget.data.destinations.any((d) => d.id == id) ? id : null;
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
    final stale = (widget.initialTo != null && to == null && _to == null) || (widget.initialFrom != null && from == null && _from == null);
    return ListView(padding: const EdgeInsets.all(16), children: [
      if (stale)
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text('That link points to a place that is no longer on the campus map. Choose a destination below.', style: TextStyle(color: Color(0xFFB45309))),
        ),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: CampusMapView(
            map: map,
            buildings: widget.data.buildings,
            route: route,
            startNodeId: from?.nodeId,
            endNodeId: to?.nodeId,
            highlightBuildingId: to?.buildingId,
            onBuildingTap: (b) => setState(() => _to = _known(b.id)),
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
      _picker('From', _from, (v) => setState(() => _from = v)),
      Align(
        child: IconButton(
          tooltip: 'Swap start and destination',
          icon: const Icon(Icons.swap_vert),
          onPressed: () => setState(() { final t = _from; _from = _to; _to = t; }),
        ),
      ),
      _picker('To', _to, (v) => setState(() => _to = v)),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Step-free route only'),
        secondary: const Icon(Icons.accessible),
        value: _stepFree,
        onChanged: (v) => setState(() => _stepFree = v),
      ),
      if (from != null && to != null && route == null)
        Text(_stepFree ? 'No step-free route is mapped between these places.' : 'These places are not connected on the campus map yet.',
            style: const TextStyle(color: Color(0xFFB91C1C))),
      if (route != null) _RouteCard(route: route),
    ]);
  }

  Widget _picker(String label, String? value, ValueChanged<String?> onChanged) => DropdownButtonFormField<String>(
        initialValue: value,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [
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
