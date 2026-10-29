import 'package:campus_mithra_student/core/push.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('a notification opens only campus paths', () {
    expect(CampusPush.linkOf({'link': '/campus/notice/abc'}), '/campus/notice/abc');
    expect(CampusPush.linkOf({'link': '/campus/event/demo-ev-1'}), '/campus/event/demo-ev-1');
    expect(CampusPush.linkOf({'link': 'https://evil.example/campus/x'}), isNull);
    expect(CampusPush.linkOf({'link': '/admin'}), isNull);
    expect(CampusPush.linkOf({}), isNull);
  });
}
