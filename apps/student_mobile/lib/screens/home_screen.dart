import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../core/format.dart';
import '../data/models.dart';
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
    final firstName = s.profile?.displayName.split(' ').first;
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 68,
        titleSpacing: 16,
        title: const Row(children: [LogoMark(size: 40), SizedBox(width: 10), Text('MITHRA')]),
        actions: [
          IconButton(tooltip: 'Scan a campus QR code', icon: const Icon(Icons.qr_code_scanner), onPressed: () => context.push('/scan')),
          if (member) _NotificationsButton(uid: s.uid!, seenAt: s.profile?.notificationsSeenAt),
          const SizedBox(width: 6),
        ],
      ),
      body: RefreshIndicator(
        color: Brand.ink,
        onRefresh: () async => setState(() => _refresh++),
        child: ListView(
          padding: const EdgeInsets.only(bottom: 28),
          children: [
            // --- hero -------------------------------------------------------------
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 22, 16, 18),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Padding(padding: const EdgeInsets.only(top: 76), child: PosterText(firstName == null ? 'Find your way' : 'Hello, $firstName', size: 78)),
                  const Positioned(
                    right: 4,
                    top: -14,
                    child: Starburst(text: 'Your\ncampus!', color: Brand.mint, size: 92),
                  ),
                ],
              ),
            ),
            _pad(
              ColorBlock(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'ROOMS. LABS. OFFICES.',
                      style: TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w800, fontSize: 20, color: Brand.ink),
                    ),
                    const SizedBox(height: 12),
                    const Divider(color: Brand.ink, thickness: 2, height: 2),
                    const SizedBox(height: 12),
                    const Text('Search any room, then walk there on the campus map.', style: TextStyle(fontSize: 16, color: Brand.muted)),
                    const SizedBox(height: 16),
                    Semantics(
                      button: true,
                      label: 'Search the campus',
                      excludeSemantics: true,
                      child: InkWell(
                        onTap: () => context.push('/directory'),
                        customBorder: const StadiumBorder(),
                        child: Container(
                          height: 54,
                          padding: const EdgeInsets.symmetric(horizontal: 18),
                          decoration: const ShapeDecoration(
                            color: Brand.paper,
                            shape: StadiumBorder(side: inkBorder),
                          ),
                          child: const Row(
                            children: [
                              Icon(Icons.search, color: Brand.ink),
                              SizedBox(width: 10),
                              Text('Library, A-201, canteen...', style: TextStyle(fontSize: 15, color: Brand.muted)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () => context.push('/directory'),
                        icon: const Icon(Icons.auto_awesome_outlined),
                        label: const Text('SEARCH THE CAMPUS'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // --- map banner ---------------------------------------------------------
            _pad(
              ColorBlock(
                color: Brand.bubblegum,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Transform.rotate(
                      angle: -0.08,
                      child: Container(
                        padding: const EdgeInsets.all(3),
                        decoration: const ShapeDecoration(
                          color: Brand.sun,
                          shape: StadiumBorder(side: inkBorder),
                        ),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                          decoration: const ShapeDecoration(
                            color: Brand.periwinkle,
                            shape: StadiumBorder(side: inkBorder),
                          ),
                          child: const Text(
                            'NO GUESSWORK!',
                            style: TextStyle(
                              fontFamily: titleFont,
                              fontWeight: FontWeight.w800,
                              fontStyle: FontStyle.italic,
                              fontSize: 19,
                              color: Brand.paper,
                              shadows: [Shadow(color: Brand.ink, offset: Offset(2, 2))],
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'Every building and room on one campus map, with walking directions - step-free when you need them.',
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: Brand.ink, height: 1.35),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        ElevatedButton.icon(
                          onPressed: () => context.go('/map'),
                          icon: const Icon(Icons.north_east, size: 18),
                          label: const Text('OPEN THE MAP'),
                        ),
                        const Spacer(),
                        const CharacterArt(Character.map, size: 84, label: 'A campus map with a walking route'),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            // --- tiles --------------------------------------------------------------
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: PosterTile(
                          color: Brand.tangerine,
                          icon: const Icon(Icons.build_outlined),
                          title: 'Report an issue',
                          subtitle: 'Track the fix',
                          onTap: () => context.push('/reports/new'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: PosterTile(
                          color: Brand.periwinkle,
                          icon: const Icon(Icons.event_outlined),
                          title: 'Events',
                          subtitle: 'Clubs & fests',
                          onTap: () => context.go('/events'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: PosterTile(
                          color: Brand.bubblegum,
                          icon: const Icon(Icons.forum_outlined),
                          title: 'Community',
                          subtitle: 'Ask a senior',
                          onTap: () => context.go('/community'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: PosterTile(
                          color: Brand.sun,
                          icon: const Icon(Icons.qr_code_scanner),
                          title: 'Scan a QR',
                          subtitle: 'Doors & boards',
                          onTap: () => context.push('/scan'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            // --- notices ------------------------------------------------------------
            AsyncView(
              dependsOn: _refresh,
              load: () => scope.repo.announcements(size: 4),
              builder: (context, page, _) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(padding: const EdgeInsets.fromLTRB(16, 18, 16, 0), child: _FeaturedNotice(page.items.isEmpty ? null : page.items.first)),
                  if (page.items.length > 1) ...[
                    SectionHeader('Notice board', onSeeAll: () => context.push('/notices')),
                    for (final a in page.items.skip(1)) NoticeTile(a),
                  ],
                ],
              ),
            ),
            const SectionHeader('How it works'),
            const _Step(
              n: '01',
              color: Brand.mint,
              character: Character.mithra,
              art: 'Mithra, the kiosk buddy, waving',
              title: 'Ask Mithra',
              body: 'At the kiosk in the Administrative Block lobby, hold the button and ask out loud.',
            ),
            const _Step(
              n: '02',
              color: Brand.sun,
              character: Character.phone,
              art: 'A phone holding up a QR code',
              title: 'Scan a campus QR',
              body: 'Codes on doors and notice boards open that place, event or notice in the app.',
            ),
            const _Step(
              n: '03',
              color: Brand.periwinkle,
              character: Character.map,
              art: 'A campus map with a walking route',
              title: 'Walk there',
              body: 'Turn-by-turn directions on the campus map - no outside map service needed.',
            ),
            SectionHeader('Coming up', onSeeAll: () => context.go('/events')),
            AsyncView(
              dependsOn: _refresh,
              load: () => scope.repo.upcomingEvents(size: 3),
              builder: (context, page, _) => page.items.isEmpty
                  ? const EmptyState(title: 'No upcoming events', icon: Icons.event_outlined)
                  : Column(children: [for (final e in page.items) EventTile(e)]),
            ),
            SectionHeader('Students say', onSeeAll: () => context.go('/community')),
            if (!member)
              const EmptyState(title: 'Sign in to join in', body: 'Students ask and answer questions about campus life here.', icon: Icons.forum_outlined)
            else
              AsyncView(
                dependsOn: _refresh,
                load: () => scope.repo.posts(size: 3),
                builder: (context, page, _) => page.items.isEmpty
                    ? const EmptyState(title: 'No discussions yet', icon: Icons.forum_outlined)
                    : Column(children: [for (final p in page.items) PostTile(p)]),
              ),
          ],
        ),
      ),
    );
  }

  Widget _pad(Widget child) => Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), child: child);
}

/// The newest official notice (pinned first) as a dark poster card.
class _FeaturedNotice extends StatelessWidget {
  const _FeaturedNotice(this.a);
  final Announcement? a;

  @override
  Widget build(BuildContext context) {
    final n = a;
    final fresh = n?.publishedAt != null && DateTime.now().difference(n!.publishedAt!).inDays < 7;
    final card = ColorBlock(
      color: Brand.ink,
      padding: const EdgeInsets.fromLTRB(22, 24, 22, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            // room for the starburst on the top-right corner
            padding: EdgeInsets.only(right: n != null && (fresh || n.pinned) ? 56 : 0),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: const ShapeDecoration(color: Brand.sun, shape: StadiumBorder()),
                  child: Text(
                    n == null
                        ? 'OFFICIAL NOTICES'
                        : 'OFFICIAL · ${n.category == 'notice' ? 'NOTICE' : 'ANNOUNCEMENT'} · ${formatDate(n.publishedAt).toUpperCase()}',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.6, color: Brand.ink),
                  ),
                ),
                if (n != null) SampleBadge(show: n.isSample),
              ],
            ),
          ),
          const SizedBox(height: 16),
          PosterText(n?.title ?? 'All quiet', size: 46, color: Brand.paper, stop: n == null),
          const SizedBox(height: 12),
          Text(
            n?.body ?? 'No notice has been published yet. When the college posts one, it appears here first.',
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 16.5, height: 1.45, color: Color(0xD9F7F0E3)),
          ),
          if (n != null) ...[
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () => context.push('/notice/${n.id}'),
                icon: const Icon(Icons.north_east),
                label: const Text('READ THE NOTICE'),
                iconAlignment: IconAlignment.end,
              ),
            ),
          ],
        ],
      ),
    );
    if (n == null || !(fresh || n.pinned)) return card;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Padding(padding: const EdgeInsets.only(top: 34), child: card),
        Positioned(
          right: 4,
          top: 0,
          child: ExcludeSemantics(child: Starburst(text: fresh ? 'Just\nin!' : 'Pinned!', size: 84)),
        ),
      ],
    );
  }
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

/// A "How it works" card: an animated character standing on top of the card.
class _Step extends StatelessWidget {
  const _Step({required this.n, required this.color, required this.character, required this.art, required this.title, required this.body});
  final String n, art, title, body;
  final Color color;
  final Character character;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 70, 16, 0),
    child: Stack(
      clipBehavior: Clip.none,
      alignment: Alignment.topCenter,
      children: [
        ColorBlock(
          color: color,
          padding: const EdgeInsets.fromLTRB(20, 96, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Divider(color: Brand.ink, thickness: 2, height: 2),
              const SizedBox(height: 14),
              Text(
                title.toUpperCase(),
                style: const TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w800, fontSize: 22, color: Brand.ink),
              ),
              const SizedBox(height: 4),
              Text(body, style: const TextStyle(fontSize: 15.5, height: 1.4, color: Brand.ink)),
            ],
          ),
        ),
        Positioned(
          left: 18,
          top: 18,
          child: Container(
            width: 58,
            height: 58,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Brand.paper,
              shape: BoxShape.circle,
              border: Border.all(color: Brand.ink, width: 2),
            ),
            child: Text(
              n,
              style: const TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w800, fontSize: 21, color: Brand.ink),
            ),
          ),
        ),
        Positioned(top: -78, child: CharacterArt(character, size: 164, label: art)),
      ],
    ),
  );
}
