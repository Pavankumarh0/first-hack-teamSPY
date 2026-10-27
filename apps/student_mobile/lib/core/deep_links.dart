// One link format everywhere (QR codes, kiosk, website, shares):
//   https://<site>/campus/<type>/<id>        type = location | building | event | club | notice
//   https://<site>/campus/route?from=<id>&to=<id>
//   campusmithra://campus/<type>/<id>         the same, as a custom scheme
// Mirrors apps/campus_web/src/lib/deeplinks.ts.

final _id = RegExp(r'^[A-Za-z0-9_-]{1,100}$');

bool isValidId(String? id) => id != null && _id.hasMatch(id);

class CampusLink {
  const CampusLink(this.type, {this.id, this.from, this.to});
  final String type;
  final String? id;
  final String? from;
  final String? to;

  /// The screen inside the app for this link.
  String get appRoute => switch (type) {
        'location' => '/place/$id',
        'building' => '/building/$id',
        'event' => '/event/$id',
        'club' => '/club/$id',
        'notice' => '/notice/$id',
        _ => Uri(path: '/map', queryParameters: {'from': ?from, 'to': to!}).toString(),
      };

  String webPath() => type == 'route'
      ? Uri(path: '/campus/route', queryParameters: {'from': ?from, 'to': to!}).toString()
      : '/campus/$type/$id';

  @override
  bool operator ==(Object other) =>
      other is CampusLink && other.type == type && other.id == id && other.from == from && other.to == to;
  @override
  int get hashCode => Object.hash(type, id, from, to);
  @override
  String toString() => 'CampusLink($type, id: $id, from: $from, to: $to)';
}

/// Parses a scanned or opened URI into a campus link, or null if it is not
/// one. [siteHost] restricts https links to the campus site; null accepts any
/// host (custom-scheme links carry no meaningful host).
CampusLink? parseCampusUri(Uri uri, {String? siteHost}) {
  List<String> segments;
  if (uri.scheme == 'campusmithra') {
    if (uri.host != 'campus') return null;
    segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  } else if (uri.scheme == 'https' || uri.scheme == 'http') {
    if (siteHost != null && uri.host != siteHost) return null;
    final s = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    if (s.isEmpty || s.first != 'campus') return null;
    segments = s.sublist(1);
  } else {
    return null;
  }
  if (segments.isEmpty) return null;
  final type = segments.first;
  if (type == 'route') {
    if (segments.length != 1) return null;
    final from = uri.queryParameters['from'];
    final to = uri.queryParameters['to'];
    if ((from != null && !isValidId(from)) || !isValidId(to)) return null;
    return CampusLink('route', from: from, to: to);
  }
  if (!const ['location', 'building', 'event', 'club', 'notice'].contains(type)) return null;
  if (segments.length != 2 || !isValidId(segments[1])) return null;
  return CampusLink(type, id: segments[1]);
}
