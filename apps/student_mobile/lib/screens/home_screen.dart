import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../data/session.dart';
import '../ui/theme.dart';
import '../ui/widgets/cards.dart';
import '../ui/widgets/common.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _refresh = 0;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final s = scope.session;
    final member = s.status == SessionStatus.signedIn && s.active;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Campus Mithra', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(tooltip: 'Scan a campus QR code', icon: const Icon(Icons.qr_code_scanner), onPressed: () => context.push('/scan')),
          if (member) _NotificationsButton(uid: s.uid!, seenAt: s.profile?.notificationsSeenAt),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => setState(() => _refresh++),
        child: ListView(children: [
          _Hero(name: s.profile?.displayName),
          SectionHeader('Notices and announcements', icon: Icons.campaign_outlined, onSeeAll: () => context.push('/notices')),
          AsyncView(
            dependsOn: _refresh,
            load: () => scope.repo.announcements(size: 3),
            builder: (context, page, _) => page.items.isEmpty
                ? const EmptyState(title: 'No notices right now', body: 'Official announcements from the college appear here.')
                : Column(children: [for (final a in page.items) NoticeTile(a)]),
          ),
          SectionHeader('Upcoming events', icon: Icons.event_outlined, onSeeAll: () => context.go('/events')),
          AsyncView(
            dependsOn: _refresh,
            load: () => scope.repo.upcomingEvents(size: 3),
            builder: (context, page, _) => page.items.isEmpty
                ? const EmptyState(title: 'No upcoming events')
                : Column(children: [for (final e in page.items) EventTile(e)]),
          ),
          SectionHeader('Recent student discussions', icon: Icons.forum_outlined, onSeeAll: () => context.go('/community')),
          if (!member)
            const EmptyState(title: 'Sign in to see discussions', body: 'Students ask and answer questions about campus life here.', icon: Icons.forum_outlined)
          else
            AsyncView(
              dependsOn: _refresh,
              load: () => scope.repo.posts(size: 3),
              builder: (context, page, _) => page.items.isEmpty
                  ? const EmptyState(title: 'No discussions yet')
                  : Column(children: [for (final p in page.items) PostTile(p)]),
            ),
          const SizedBox(height: 24),
        ]),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({this.name});
  final String? name;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: Brand.navy, borderRadius: BorderRadius.circular(20)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name == null ? 'Find your way around campus' : 'Hello, $name',
              style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text('Rooms, directions, events and notices.', style: TextStyle(color: Color(0xFFCBD5E1))),
          const SizedBox(height: 16),
          Row(children: [
            _Quick(icon: Icons.search, label: 'Find a place', onTap: () => context.push('/directory')),
            _Quick(icon: Icons.qr_code_scanner, label: 'Scan QR', onTap: () => context.push('/scan')),
            _Quick(icon: Icons.build_outlined, label: 'Report issue', onTap: () => context.push('/reports/new')),
          ]),
        ]),
      );
}

class _Quick extends StatelessWidget {
  const _Quick({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Material(
            color: Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Column(children: [
                  Icon(icon, color: Brand.saffron),
                  const SizedBox(height: 4),
                  Text(label, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
          ),
        ),
      );
}

class _NotificationsButton extends StatelessWidget {
  const _NotificationsButton({required this.uid, this.seenAt});
  final String uid;
  final DateTime? seenAt;
  @override
  Widget build(BuildContext context) => StreamBuilder<int>(
        stream: AppScope.of(context).repo.unreadCount(uid, seenAt),
        builder: (context, snap) {
          final n = snap.data ?? 0;
          return IconButton(
            tooltip: n > 0 ? '$n unread notifications' : 'Notifications',
            onPressed: () => context.push('/notifications'),
            icon: Badge(isLabelVisible: n > 0, label: Text('$n'), child: const Icon(Icons.notifications_outlined)),
          );
        },
      );
}
