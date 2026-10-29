import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../core/constants.dart';
import '../data/models.dart';
import '../data/repository.dart';
import 'member_gate.dart';

const _interestLabels = {
  'coding': 'Coding',
  'gaming': 'Gaming',
  'music': 'Music',
  'photography': 'Photography',
  'sports': 'Sports',
  'entrepreneurship': 'Entrepreneurship',
  'design': 'Design',
  'robotics': 'Robotics',
  'volunteering': 'Volunteering',
  'other': 'Other',
};

class FindPeopleScreen extends StatelessWidget {
  const FindPeopleScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Find Your People')),
    body: MemberGate(
      why:
          'Sign in to discover campus communities and choose what you want to share.',
      path: '/people',
      builder: (context, me) => _PeopleContent(uid: me.id),
    ),
  );
}

class _PeopleContent extends StatefulWidget {
  const _PeopleContent({required this.uid});
  final String uid;
  @override
  State<_PeopleContent> createState() => _PeopleContentState();
}

class _PeopleContentState extends State<_PeopleContent> {
  CampusRepository? _repo;
  Future<Json?>? _mine;
  Future<List<(String, Json)>>? _people;
  Future<List<Club>>? _clubs;
  Future<PageOf<CampusEvent>>? _events;
  final _alias = TextEditingController();
  final _blurb = TextEditingController();
  final Set<String> _interests = {};
  final Set<String> _clubIds = {};
  bool _openToTeams = false;
  bool _discoverable = false;
  bool _busy = false;
  bool _saved = false;
  Object? _saveError;
  Json? _previous;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_repo != null) return;
    _repo = AppScope.of(context).repo;
    _mine = _repo!.myDiscoveryProfile(widget.uid);
    _people = _repo!.discoverableStudentProfiles();
    _clubs = _repo!.clubs();
    _events = _repo!.upcomingEvents(size: 20);
    _mine!.then((value) {
      if (!mounted || value == null) return;
      setState(() {
        _previous = value;
        _alias.text = value['alias'] as String? ?? '';
        _blurb.text = value['blurb'] as String? ?? '';
        _interests.addAll(
          (value['interests'] as List? ?? const []).map((e) => e.toString()),
        );
        _clubIds.addAll(
          (value['clubIds'] as List? ?? const []).map((e) => e.toString()),
        );
        _openToTeams = value['openToTeams'] == true;
        _discoverable = value['discoverable'] == true;
      });
    }, onError: (Object _) {});
  }

  @override
  void dispose() {
    _alias.dispose();
    _blurb.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_alias.text.trim().isEmpty) {
      setState(() => _saveError = 'Choose a display name first.');
      return;
    }
    setState(() {
      _busy = true;
      _saveError = null;
      _saved = false;
    });
    try {
      final fields = <String, dynamic>{
        'alias': _alias.text.trim(),
        'blurb': _blurb.text.trim(),
        'interests': _interests.toList(),
        'clubIds': _clubIds.toList(),
        'openToTeams': _openToTeams,
        'discoverable': _discoverable,
      };
      await _repo!.saveDiscoveryProfile(
        widget.uid,
        fields,
        createdAt: _previous?['createdAt'],
      );
      _previous = await _repo!.myDiscoveryProfile(widget.uid);
      setState(() => _saved = true);
      _people = _repo!.discoverableStudentProfiles();
    } catch (e) {
      setState(() => _saveError = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      const Text(
        'Your shareable profile',
        style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
      ),
      const Text(
        'Only the alias, short bio, selected interests, clubs and team availability below may be visible. Your username, contacts, attendance and reports remain private.',
      ),
      const SizedBox(height: 12),
      TextField(
        controller: _alias,
        maxLength: 32,
        decoration: const InputDecoration(labelText: 'Display name'),
      ),
      TextField(
        controller: _blurb,
        maxLength: 160,
        decoration: const InputDecoration(labelText: 'A little about you'),
      ),
      const SizedBox(height: 8),
      const Text('Interests', style: TextStyle(fontWeight: FontWeight.bold)),
      Wrap(
        spacing: 6,
        children: [
          for (final interest in C.studentInterests)
            FilterChip(
              label: Text(_interestLabels[interest] ?? interest),
              selected: _interests.contains(interest),
              onSelected: (selected) => setState(() {
                selected
                    ? _interests.add(interest)
                    : _interests.remove(interest);
              }),
            ),
        ],
      ),
      const SizedBox(height: 8),
      const Text(
        'Clubs to explore',
        style: TextStyle(fontWeight: FontWeight.bold),
      ),
      FutureBuilder<List<Club>>(
        future: _clubs,
        builder: (context, snap) => snap.hasData
            ? Wrap(
                spacing: 8,
                children: [
                  for (final club in snap.data!)
                    FilterChip(
                      label: Text(club.name),
                      selected: _clubIds.contains(club.id),
                      onSelected: (v) => setState(() {
                        v ? _clubIds.add(club.id) : _clubIds.remove(club.id);
                      }),
                    ),
                ],
              )
            : const LinearProgressIndicator(),
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Open to project or competition teams'),
        value: _openToTeams,
        onChanged: (v) => setState(() => _openToTeams = v),
      ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: const Text('Show my profile to active students'),
        subtitle: const Text('Off by default. You can hide it at any time.'),
        value: _discoverable,
        onChanged: (v) => setState(() => _discoverable = v),
      ),
      if (_saveError != null)
        Text(
          'Could not save: $_saveError',
          style: const TextStyle(color: Colors.red),
        ),
      if (_saved) const Text('Your profile and privacy choices are saved.'),
      FilledButton(
        onPressed: _busy ? null : _save,
        child: Text(_busy ? 'Saving…' : 'Save profile'),
      ),
      const SizedBox(height: 28),
      const Text(
        'Students like you',
        style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
      ),
      FutureBuilder<List<(String, Json)>>(
        future: _people,
        builder: (context, snap) {
          if (snap.hasError)
            return Text('Could not load opt-in profiles: ${snap.error}');
          if (!snap.hasData) return const LinearProgressIndicator();
          final rows =
              snap.data!
                  .where((row) => row.$1 != widget.uid)
                  .map((row) {
                    final interests = (row.$2['interests'] as List? ?? const [])
                        .map((e) => e.toString())
                        .toSet();
                    final shared = interests.intersection(_interests);
                    return (row, shared);
                  })
                  .where((entry) => _interests.isEmpty || entry.$2.isNotEmpty)
                  .toList()
                ..sort((a, b) => b.$2.length.compareTo(a.$2.length));
          if (rows.isEmpty)
            return const Text(
              'No matching opt-in profiles yet. Choose interests or check back later.',
            );
          return Column(
            children: [
              for (final entry in rows)
                Card(
                  child: ListTile(
                    title: Text(
                      entry.$1.$2['alias'] as String? ?? 'Campus student',
                    ),
                    subtitle: Text(
                      [
                        if ((entry.$1.$2['blurb'] as String? ?? '').isNotEmpty)
                          entry.$1.$2['blurb'] as String,
                        if (entry.$2.isNotEmpty)
                          'Shared: ${entry.$2.map((i) => _interestLabels[i] ?? i).join(', ')}',
                        if (entry.$1.$2['openToTeams'] == true) 'Open to teams',
                      ].join(' · '),
                    ),
                    isThreeLine: true,
                  ),
                ),
            ],
          );
        },
      ),
      const SizedBox(height: 28),
      const Text(
        'Published clubs and events',
        style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
      ),
      FutureBuilder<List<Club>>(
        future: _clubs,
        builder: (context, snap) => Column(
          children: [
            if (snap.hasData)
              for (final club in snap.data!)
                ListTile(
                  title: Text(club.name),
                  subtitle: Text(club.description ?? ''),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/club/${club.id}'),
                ),
          ],
        ),
      ),
      FutureBuilder<PageOf<CampusEvent>>(
        future: _events,
        builder: (context, snap) => Column(
          children: [
            if (snap.hasData)
              for (final event in snap.data!.items)
                ListTile(
                  title: Text(event.title),
                  subtitle: Text(
                    '${event.clubName} · ${event.startAt} · ${event.venueName}',
                  ),
                  onTap: () => context.push('/event/${event.id}'),
                ),
          ],
        ),
      ),
    ],
  );
}
