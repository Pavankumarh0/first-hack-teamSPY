import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../core/format.dart';
import '../data/models.dart';
import '../ui/theme.dart';
import '../ui/widgets/cards.dart';
import '../ui/widgets/common.dart';
import 'map_screens.dart';

/// Events tab: upcoming events and the club directory.
class EventsScreen extends StatelessWidget {
  const EventsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(title: const Text('Events and clubs'), bottom: const TabBar(tabs: [Tab(text: 'Upcoming'), Tab(text: 'Clubs')])),
        body: TabBarView(children: [
          PagedList<CampusEvent>(
            load: (cursor) => repo.upcomingEvents(size: 10, cursor: cursor),
            itemBuilder: (e) => EventTile(e),
            empty: const EmptyState(title: 'No upcoming events', icon: Icons.event_busy_outlined),
          ),
          AsyncView<List<Club>>(
            load: repo.clubs,
            builder: (context, clubs, _) => clubs.isEmpty
                ? const EmptyState(title: 'No clubs listed yet')
                : ListView(padding: const EdgeInsets.only(top: 12), children: [
                    for (final c in clubs)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                        child: Card(
                          child: ListTile(
                            leading: CircleAvatar(backgroundColor: Brand.navy, child: Text(c.name.split(' ').map((w) => w[0]).take(2).join(), style: const TextStyle(color: Brand.saffron, fontWeight: FontWeight.w800))),
                            title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                            subtitle: Text(c.description ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                            trailing: c.isSample ? const SampleBadge(show: true) : const Icon(Icons.chevron_right),
                            onTap: () => context.push('/club/${c.id}'),
                          ),
                        ),
                      ),
                  ]),
          ),
        ]),
      ),
    );
  }
}

/// A list that loads page by page as you scroll.
class PagedList<T> extends StatefulWidget {
  const PagedList({super.key, required this.load, required this.itemBuilder, required this.empty, this.header});
  final Future<PageOf<T>> Function(dynamic cursor) load;
  final Widget Function(T item) itemBuilder;
  final Widget empty;
  final Widget? header;
  @override
  State<PagedList<T>> createState() => _PagedListState<T>();
}

class _PagedListState<T> extends State<PagedList<T>> {
  final _items = <T>[];
  dynamic _cursor;
  bool _loading = true, _done = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _more();
  }

  Future<void> _more() async {
    setState(() { _loading = true; _error = null; });
    try {
      final page = await widget.load(_cursor);
      setState(() { _items.addAll(page.items); _cursor = page.cursor; _done = page.cursor == null; });
    } catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _refresh() async {
    _items.clear();
    _cursor = null;
    _done = false;
    await _more();
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: _refresh,
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (!_loading && !_done && _error == null && n.metrics.extentAfter < 300) _more();
            return false;
          },
          child: ListView(padding: const EdgeInsets.only(top: 12, bottom: 24), children: [
            ?widget.header,
            for (final item in _items) widget.itemBuilder(item),
            if (_error != null) ErrorView(error: _error!, onRetry: _more),
            if (_loading) _items.isEmpty ? const SkeletonList() : const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
            if (!_loading && _error == null && _items.isEmpty) widget.empty,
          ]),
        ),
      );
}

class EventScreen extends StatelessWidget {
  const EventScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return Scaffold(
      appBar: AppBar(),
      body: AsyncView<CampusEvent?>(
        load: () => repo.event(id),
        builder: (context, e, _) {
          if (e == null) return const UnknownDestination(what: 'event');
          final past = e.endAt.isBefore(DateTime.now());
          return ListView(padding: const EdgeInsets.all(16), children: [
            if (e.status == 'cancelled') const _Banner('This event has been cancelled.', Color(0xFFB91C1C)),
            if (past && e.status != 'cancelled') const _Banner('This event has already taken place.', Color(0xFF0369A1)),
            Wrap(spacing: 6, children: [const Pill('Event', color: Color(0xFFA9570C)), SampleBadge(show: e.isSample)]),
            const SizedBox(height: 8),
            PosterText(e.title, size: 46, stop: false),
            const SizedBox(height: 12),
            _Info(Icons.event, formatRange(e.startAt, e.endAt)),
            _Info(Icons.place_outlined, e.venueName),
            InkWell(onTap: () => context.push('/club/${e.clubId}'), child: _Info(Icons.groups_outlined, e.clubName, link: true)),
            if (e.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(e.description)),
            if (e.venueLocationId != null) ...[
              const SizedBox(height: 16),
              FilledButton.icon(onPressed: () => context.go('/map?to=${e.venueLocationId}'), icon: const Icon(Icons.directions_walk), label: const Text('Directions to the venue')),
            ],
          ]);
        },
      ),
    );
  }
}

class ClubScreen extends StatelessWidget {
  const ClubScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return Scaffold(
      appBar: AppBar(),
      body: AsyncView<(Club?, List<CampusEvent>)>(
        load: () async {
          final c = await repo.club(id);
          return (c, c == null ? <CampusEvent>[] : await repo.clubEvents(id));
        },
        builder: (context, data, _) {
          final (c, events) = data;
          if (c == null) return const UnknownDestination(what: 'club');
          final upcoming = events.where((e) => !e.endAt.isBefore(DateTime.now())).toList();
          return ListView(children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Wrap(spacing: 6, children: [const Pill('Club', color: Brand.violet), if (c.category != null) Pill(c.category!), SampleBadge(show: c.isSample)]),
                const SizedBox(height: 8),
                PosterText(c.name, size: 46, stop: false),
                if (c.description != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(c.description!)),
                if (c.contact != null) _Info(Icons.mail_outline, c.contact!),
                if (c.homeLocationId != null)
                  TextButton.icon(onPressed: () => context.push('/place/${c.homeLocationId}'), icon: const Icon(Icons.place_outlined), label: const Text('Where we meet')),
              ]),
            ),
            const SectionHeader('Upcoming events', icon: Icons.event_outlined),
            if (upcoming.isEmpty) const EmptyState(title: 'Nothing scheduled') else for (final e in upcoming) EventTile(e),
          ]);
        },
      ),
    );
  }
}

class NoticesScreen extends StatelessWidget {
  const NoticesScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return Scaffold(
      appBar: AppBar(title: const Text('Notices')),
      body: PagedList<Announcement>(
        load: (cursor) => repo.announcements(size: 10, cursor: cursor),
        itemBuilder: (a) => NoticeTile(a),
        empty: const EmptyState(title: 'No notices'),
      ),
    );
  }
}

class NoticeScreen extends StatelessWidget {
  const NoticeScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo;
    return Scaffold(
      appBar: AppBar(),
      body: AsyncView<Announcement?>(
        load: () => repo.announcement(id),
        builder: (context, a, _) => a == null
            ? const UnknownDestination(what: 'notice')
            : ListView(padding: const EdgeInsets.all(16), children: [
                if (a.status == 'archived') const _Banner('This notice has been archived and may be out of date.', Color(0xFFB45309)),
                Wrap(spacing: 6, children: [const OfficialBadge(), SampleBadge(show: a.isSample)]),
                const SizedBox(height: 8),
                PosterText(a.title, size: 46, stop: false),
                Text('Published ${formatDate(a.publishedAt)}', style: const TextStyle(color: Color(0xFF7B6E5A))),
                const SizedBox(height: 16),
                Text(a.body, style: const TextStyle(fontSize: 15.5, height: 1.45)),
              ]),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner(this.text, this.color);
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withValues(alpha: 0.3))),
        child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      );
}

class _Info extends StatelessWidget {
  const _Info(this.icon, this.text, {this.link = false});
  final IconData icon;
  final String text;
  final bool link;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          Icon(icon, size: 18, color: const Color(0xFF7B6E5A)),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: TextStyle(color: link ? Brand.tealDark : null, fontWeight: link ? FontWeight.w600 : null))),
        ]),
      );
}
