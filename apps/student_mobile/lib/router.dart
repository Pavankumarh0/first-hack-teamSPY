import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'core/deep_links.dart';
import 'screens/auth_screens.dart';
import 'screens/community_screens.dart';
import 'screens/content_screens.dart';
import 'screens/home_screen.dart';
import 'screens/map_screens.dart';
import 'screens/profile_screens.dart';
import 'screens/report_screens.dart';
import 'screens/scan_screen.dart';

/// Ids in paths come from links and QR codes: anything malformed shows the
/// safe "not found" screen instead of querying Firestore with it.
Widget _withId(GoRouterState s, Widget Function(String id) build) {
  final id = s.pathParameters['id'];
  return isValidId(id) ? build(id!) : Scaffold(appBar: AppBar(), body: const UnknownDestination());
}

GoRouter buildRouter() => GoRouter(
      initialLocation: '/',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) => _TabShell(shell: shell),
          branches: [
            StatefulShellBranch(routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/map', builder: (_, s) => MapScreen(from: s.uri.queryParameters['from'], to: s.uri.queryParameters['to'])),
            ]),
            StatefulShellBranch(routes: [GoRoute(path: '/community', builder: (_, _) => const CommunityScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/events', builder: (_, _) => const EventsScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen())]),
          ],
        ),
        GoRoute(path: '/login', builder: (_, s) => LoginScreen(next: _safeNext(s.uri.queryParameters['next']))),
        GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
        GoRoute(path: '/directory', builder: (_, _) => const DirectoryScreen()),
        GoRoute(path: '/scan', builder: (_, _) => const ScanScreen()),
        GoRoute(path: '/place/:id', builder: (_, s) => _withId(s, (id) => PlaceScreen(id: id))),
        GoRoute(path: '/building/:id', builder: (_, s) => _withId(s, (id) => BuildingScreen(id: id))),
        GoRoute(path: '/event/:id', builder: (_, s) => _withId(s, (id) => EventScreen(id: id))),
        GoRoute(path: '/club/:id', builder: (_, s) => _withId(s, (id) => ClubScreen(id: id))),
        GoRoute(path: '/notices', builder: (_, _) => const NoticesScreen()),
        GoRoute(path: '/notice/:id', builder: (_, s) => _withId(s, (id) => NoticeScreen(id: id))),
        GoRoute(path: '/community/new', builder: (_, _) => const NewPostScreen()),
        GoRoute(path: '/community/:id', builder: (_, s) => _withId(s, (id) => PostScreen(id: id))),
        GoRoute(path: '/reports', builder: (_, _) => const ReportsScreen()),
        GoRoute(path: '/reports/new', builder: (_, _) => const NewReportScreen()),
        GoRoute(path: '/reports/:id', builder: (_, s) => _withId(s, (id) => ReportScreen(id: id))),
        GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
        GoRoute(path: '/profile/edit', builder: (_, _) => const EditProfileScreen()),
        GoRoute(path: '/profile/password', builder: (_, _) => const ChangePasswordScreen()),
      ],
      errorBuilder: (_, _) => Scaffold(appBar: AppBar(), body: const UnknownDestination(what: 'page')),
    );

/// Only in-app paths, never another scheme or host.
String? _safeNext(String? next) => next != null && next.startsWith('/') && !next.startsWith('//') ? next : null;

class _TabShell extends StatelessWidget {
  const _TabShell({required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: shell,
        bottomNavigationBar: NavigationBar(
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map), label: 'Campus map'),
            NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: 'Community'),
            NavigationDestination(icon: Icon(Icons.event_outlined), selectedIcon: Icon(Icons.event), label: 'Events'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      );
}
