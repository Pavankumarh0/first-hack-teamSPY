import 'dart:convert';
import 'dart:io';

import 'package:campus_mithra_student/core/deep_links.dart';
import 'package:campus_mithra_student/core/geo.dart';
import 'package:campus_mithra_student/core/live_nav.dart';
import 'package:campus_mithra_student/core/navigation.dart';
import 'package:campus_mithra_student/core/username.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final sample = jsonDecode(File('../../firebase/seed/sample-campus.json').readAsStringSync()) as Map<String, dynamic>;
  final map = CampusMapData.fromJson(sample['map'] as Map<String, dynamic>);

  group('campus routing on the sample map (same cases as the website)', () {
    test('kiosk to library', () {
      final r = findRoute(map, 'n-admin', 'n-library')!;
      expect(r.nodeIds, ['n-admin', 'n-j1', 'n-j2', 'n-library']);
      expect(r.steps.first.text, 'Start at Administrative Block entrance.');
      expect(r.steps.last.text, 'You have arrived at Library entrance.');
      expect(r.steps.firstWhere((s) => s.nodeId == 'n-library').text, startsWith('Turn right'));
    });

    test('stairs only when step-free is not required', () {
      final fast = findRoute(map, 'n-b', 'n-d')!;
      expect(fast.edgeIds, ['e-b-d-stairs']);
      expect(fast.accessible, isFalse);
      final stepFree = findRoute(map, 'n-b', 'n-d', accessibleOnly: true)!;
      expect(stepFree.nodeIds, ['n-b', 'n-j3', 'n-j4', 'n-d']);
      expect(stepFree.distanceM, greaterThan(fast.distanceM));
    });

    test('every building is reachable step-free from the gate', () {
      for (final b in sample['buildings'] as List) {
        expect(findRoute(map, 'n-gate', b['entranceNodeId'] as String, accessibleOnly: true), isNotNull, reason: b['id'] as String);
      }
    });

    test('unknown nodes', () {
      expect(findRoute(map, 'n-gate', 'nowhere'), isNull);
      expect(findRoute(map, 'n-gate', 'n-gate')!.steps.single.text, 'You are at Main Gate.');
    });

    test('turn words', () {
      expect(turnWord(0, -1, 1, 0), 'Turn right');
      expect(turnWord(0, -1, -1, 0), 'Turn left');
      expect(turnWord(0, -1, 0, -1), 'Continue straight');
    });
  });

  group('deep links', () {
    const site = 'campus.example.edu';
    test('https links from QR codes', () {
      expect(parseCampusUri(Uri.parse('https://campus.example.edu/campus/location/library-reading-hall'), siteHost: site),
          const CampusLink('location', id: 'library-reading-hall'));
      expect(parseCampusUri(Uri.parse('https://campus.example.edu/campus/event/campus-hackathon/'), siteHost: site)!.appRoute, '/event/campus-hackathon');
      final route = parseCampusUri(Uri.parse('https://campus.example.edu/campus/route?from=admission-office&to=main-canteen'), siteHost: site)!;
      expect(route.appRoute, '/map?from=admission-office&to=main-canteen');
      expect(route.webPath(), '/campus/route?from=admission-office&to=main-canteen');
    });
    test('custom scheme', () {
      expect(parseCampusUri(Uri.parse('campusmithra://campus/building/a-block'))!.appRoute, '/building/a-block');
    });
    test('rejects other sites and malformed links', () {
      expect(parseCampusUri(Uri.parse('https://evil.example.com/campus/location/library'), siteHost: site), isNull);
      expect(parseCampusUri(Uri.parse('https://campus.example.edu/campus/teleport/x'), siteHost: site), isNull);
      expect(parseCampusUri(Uri.parse('https://campus.example.edu/campus/location/%3Cscript%3E'), siteHost: site), isNull);
      expect(parseCampusUri(Uri.parse('https://campus.example.edu/campus/location/a/b'), siteHost: site), isNull);
      expect(parseCampusUri(Uri.parse('https://campus.example.edu/admin/users'), siteHost: site), isNull);
      expect(parseCampusUri(Uri.parse('campusmithra://elsewhere/location/x')), isNull);
      expect(parseCampusUri(Uri.parse('javascript:alert(1)')), isNull);
    });
  });

  group('usernames', () {
    test('validation matches the website', () {
      expect(usernameProblem('asha.k'), isNull);
      expect(usernameProblem('ab'), isNotNull);
      expect(usernameProblem('1asha'), isNotNull);
      expect(usernameProblem('asha..k'), isNotNull);
      expect(usernameProblem('admin'), 'That username is reserved.');
      expect(identityFor('  Asha.K '), 'asha.k@users.campus-mithra.invalid');
      expect(passwordProblem('campus2026'), isNull);
      expect(passwordProblem('longpassword'), isNotNull);
    });
  });

  group('georeferencing (matches lib/geo.ts)', () {
    const f = PlanFrame(width: 1000, height: 700, metersPerUnit: 0.5, geo: GeoRef(lat: 12.9, lng: 77.6));
    test('centre on the anchor, north up, 100 m checks out', () {
      final c = toLatLng(f, const PlanPoint(500, 350));
      expect(c.lat, 12.9);
      expect(c.lng, 77.6);
      final up = toLatLng(f, const PlanPoint(500, 150));
      expect(haversineM(const LatLngPoint(12.9, 77.6), up), closeTo(100, 0.5));
    });
    test('round-trips with rotation', () {
      for (final r in [0.0, 90.0, -37.5]) {
        final g = PlanFrame(width: 1000, height: 700, metersPerUnit: 0.5, geo: GeoRef(lat: 12.9, lng: 77.6, rotationDeg: r));
        final back = toPlan(g, toLatLng(g, const PlanPoint(123.4, 567.8)));
        expect(back.x, closeTo(123.4, 1e-6));
        expect(back.y, closeTo(567.8, 1e-6));
      }
    });
  });

  group('live navigation (matches lib/liveNav.ts)', () {
    final gate = map.node('n-gate')!;
    final lib = map.nodes.firstWhere((n) => RegExp('library', caseSensitive: false).hasMatch(n.label));
    test('off campus and already there', () {
      expect(routeFromPosition(map, const PlanPoint(-2000, -2000), lib.id).status, PlanStatus.offCampus);
      expect(routeFromPosition(map, PlanPoint(lib.x, lib.y), lib.id).status, PlanStatus.arrived);
    });
    test('guides, detects a detour, arrives', () {
      final plan = routeFromPosition(map, PlanPoint(gate.x + 4, gate.y - 20), lib.id);
      expect(plan.status, PlanStatus.ok);
      final live = plan.live!;
      expect(live.maneuvers.last.arrive, isTrue);
      final start = progress(map, live, live.points.first);
      expect(start.arrived, isFalse);
      expect(start.offRoute, isFalse);
      expect(start.next, matches(RegExp(r'^(In \d+ m, |.* now$)')));
      final k = live.points[1];
      expect(progress(map, live, PlanPoint(k.x + 80, k.y)).offRoute, isTrue);
      final end = live.points.last;
      final done = progress(map, live, PlanPoint(end.x + 2, end.y));
      expect(done.arrived, isTrue);
      expect(done.next, contains('arrived'));
    });
  });
}
