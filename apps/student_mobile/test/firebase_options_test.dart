import 'package:campus_mithra_student/core/config.dart';
import 'package:campus_mithra_student/main.dart';
import 'package:flutter_test/flutter_test.dart';

AppConfig _config({bool emulators = false}) => AppConfig(
      apiKey: 'env-key', appId: '1:2:android:3', messagingSenderId: '2', projectId: 'demo-campus-mithra',
      storageBucket: 'demo.appspot.com', authDomain: '', iosBundleId: 'x', siteUrl: 'http://localhost:3000',
      useEmulators: emulators, emulatorHost: 'h');

void main() {
  // flutter test runs as Android.
  test('the app uses the project from flutterfire configure', () {
    expect(firebaseOptionsFor(_config())?.projectId, 'campus-mithra-c8d7b');
  });
  test('the emulators keep using the stand-in project, never the real one', () {
    expect(firebaseOptionsFor(_config(emulators: true))?.projectId, 'demo-campus-mithra');
  });
}
