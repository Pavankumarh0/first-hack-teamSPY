import 'package:campus_mithra_student/app_scope.dart';
import 'package:campus_mithra_student/core/config.dart';
import 'package:campus_mithra_student/data/models.dart';
import 'package:campus_mithra_student/data/repository.dart';
import 'package:campus_mithra_student/data/session.dart';
import 'package:campus_mithra_student/screens/auth_screens.dart';
import 'package:campus_mithra_student/screens/setup_screen.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

/// A session that records calls instead of talking to Firebase.
class FakeSession extends Session {
  final signIns = <(String, String)>[];
  final registrations = <String>[];
  Object? failWith;

  @override
  SessionStatus status = SessionStatus.signedOut;
  @override
  String? get uid => null;
  @override
  String? get role => null;
  @override
  bool get active => false;
  @override
  UserProfile? get profile => null;

  @override
  Future<void> signIn(String username, String password) async {
    signIns.add((username, password));
    if (failWith != null) throw failWith!;
  }

  @override
  Future<void> register({required String username, required String password, required String displayName, String? department, int? year, String? inviteCode}) async {
    registrations.add(username);
  }

  @override
  Future<void> signOut() async {}
  @override
  Future<void> changePassword(String current, String next) async {}
}

Widget _app(Session session, String initial) {
  final router = GoRouter(initialLocation: initial, routes: [
    GoRoute(path: '/', builder: (_, _) => const Scaffold(body: Text('HOME'))),
    GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
    GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
  ]);
  return AppScope(
    config: AppConfig.fromEnvironment(),
    session: session,
    repo: CampusRepository.unavailable(),
    child: MaterialApp.router(routerConfig: router),
  );
}

void main() {
  testWidgets('missing Firebase settings show setup help instead of crashing', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SetupScreen(missing: ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID'])));
    expect(find.text('Campus Mithra is not configured yet'), findsOneWidget);
    expect(find.textContaining('FIREBASE_API_KEY'), findsOneWidget);
    expect(find.textContaining('--dart-define-from-file=.env'), findsOneWidget);
  });

  testWidgets('login asks for a username and password, never an email', (tester) async {
    final session = FakeSession();
    await tester.pumpWidget(_app(session, '/login'));
    await tester.pumpAndSettle();
    expect(find.text('Username'), findsOneWidget);
    // No email or phone field (the help text may still say there is no email recovery).
    final fields = tester.widgetList<TextField>(find.byType(TextField)).toList();
    expect(fields, hasLength(2));
    for (final f in fields) {
      expect(f.keyboardType, isNot(anyOf(TextInputType.emailAddress, TextInputType.phone)));
      expect(f.decoration?.labelText?.toLowerCase(), isNot(contains('mail')));
    }

    await tester.tap(find.text('Sign in').last);
    await tester.pump();
    expect(find.text('Enter your username.'), findsOneWidget);
    expect(session.signIns, isEmpty);

    await tester.enterText(find.byKey(const Key('login-username')), 'asha.k');
    await tester.enterText(find.byKey(const Key('login-password')), 'campus2026');
    await tester.tap(find.text('Sign in').last);
    await tester.pumpAndSettle();
    expect(session.signIns, [('asha.k', 'campus2026')]);
    expect(find.text('HOME'), findsOneWidget);
  });

  testWidgets('a wrong password shows a clear message', (tester) async {
    final session = FakeSession()..failWith = FirebaseAuthException(code: 'invalid-credential');
    await tester.pumpWidget(_app(session, '/login'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('login-username')), 'asha.k');
    await tester.enterText(find.byKey(const Key('login-password')), 'wrong');
    await tester.tap(find.text('Sign in').last);
    await tester.pumpAndSettle();
    expect(find.text('Incorrect username or password.'), findsOneWidget);
  });

  testWidgets('registration validates the username and password', (tester) async {
    tester.view.physicalSize = const Size(1080, 2600);
    addTearDown(tester.view.resetPhysicalSize);
    final session = FakeSession();
    await tester.pumpWidget(_app(session, '/register'));
    await tester.pumpAndSettle();
    // Only username/password style fields: no email or phone inputs.
    for (final field in tester.widgetList<TextField>(find.byType(TextField))) {
      expect(field.keyboardType, isNot(anyOf(TextInputType.emailAddress, TextInputType.phone)));
    }
    await tester.enterText(find.byKey(const Key('register-username')), 'Admin');
    await tester.enterText(find.byKey(const Key('register-name')), 'Asha');
    await tester.enterText(find.byKey(const Key('register-password')), 'short');
    await tester.enterText(find.byKey(const Key('register-confirm')), 'different');
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();
    expect(find.text('That username is reserved.'), findsOneWidget);
    expect(find.text('Use at least 8 characters.'), findsOneWidget);
    expect(find.text('The passwords do not match.'), findsOneWidget);
    expect(session.registrations, isEmpty);

    await tester.enterText(find.byKey(const Key('register-username')), 'Asha.K');
    await tester.enterText(find.byKey(const Key('register-password')), 'campus2026');
    await tester.enterText(find.byKey(const Key('register-confirm')), 'campus2026');
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();
    expect(session.registrations, ['Asha.K']);
  });
}
