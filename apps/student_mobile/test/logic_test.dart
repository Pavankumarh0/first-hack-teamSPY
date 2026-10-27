import 'dart:convert';
import 'dart:io';

import 'package:campus_mithra_student/core/deep_links.dart';
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
}
