import 'dart:convert';
import 'dart:io';

import 'package:campus_mithra_student/core/constants.dart';
import 'package:flutter_test/flutter_test.dart';

/// The app's Dart constants must match firebase/schema/constants.json, which
/// the website and the security rules use.
void main() {
  final shared = jsonDecode(File('../../firebase/schema/constants.json').readAsStringSync()) as Map<String, dynamic>;

  test('constants match the shared schema', () {
    expect(C.roles, shared['roles']);
    expect(C.usernamePattern, shared['username']['pattern']);
    expect(C.usernameMin, shared['username']['minLength']);
    expect(C.usernameMax, shared['username']['maxLength']);
    expect(C.reservedUsernames, shared['username']['reserved']);
    expect(C.identityDomain, shared['identityDomain']);
    expect(C.passwordMinLength, shared['passwordMinLength']);
    expect(C.reportCategories, shared['reportCategories']);
    expect(C.reportStatuses, shared['reportStatuses']);
    expect(C.postCategories, shared['postCategories']);
    expect(C.locationTypes, shared['locationTypes']);
    expect(C.deepLinkTypes, shared['deepLinkTypes']);
    expect(C.rateLimitPostSeconds, shared['rateLimitSeconds']['post']);
    expect(C.rateLimitCommentSeconds, shared['rateLimitSeconds']['comment']);
  });

  test('every category and status has a label', () {
    for (final c in C.reportCategories) {
      expect(C.reportCategoryLabels.containsKey(c), isTrue, reason: c);
    }
    for (final s in C.reportStatuses) {
      expect(C.reportStatusLabels.containsKey(s), isTrue, reason: s);
    }
    for (final c in C.postCategories) {
      expect(C.postCategoryLabels.containsKey(c), isTrue, reason: c);
    }
    for (final t in C.locationTypes) {
      expect(C.locationTypeLabels.containsKey(t), isTrue, reason: t);
    }
  });
}
