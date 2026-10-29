import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../core/config.dart';
import '../core/errors.dart';
import '../core/format.dart';
import '../core/username.dart';
import '../data/models.dart';
import '../ui/theme.dart';
import '../ui/widgets/common.dart';
import 'member_gate.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  DateTime? _seenAt;
  bool _marked = false;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notifications')),
        body: MemberGate(
          why: 'Notifications are about your reports and campus events.',
          path: '/notifications',
          builder: (context, me) {
            final repo = AppScope.of(context).repo;
            _seenAt ??= me.notificationsSeenAt ?? DateTime(0);
            return AsyncView<List<AppNotification>>(
              load: () => repo.notifications(me.id),
              builder: (context, items, reload) {
                if (!_marked) {
                  _marked = true;
                  repo.markBroadcastsSeen(me.id).catchError((_) {});
                }
                if (items.isEmpty) {
                  return const EmptyState(title: 'Nothing yet', body: 'Report updates and new events will show up here.', icon: Icons.notifications_none);
                }
                return ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final n = items[i];
                    final unread = n.audience == 'user' ? !n.read : (n.createdAt?.isAfter(_seenAt!) ?? false);
                    return ListTile(
                      leading: Icon(n.type == 'report_status' ? Icons.build_outlined : Icons.campaign_outlined, color: unread ? Brand.saffron : const Color(0xFF9D8D73)),
                      title: Text(n.title, style: TextStyle(fontWeight: unread ? FontWeight.w700 : FontWeight.w400)),
                      subtitle: Text([if (n.body != null) n.body!, '${timeAgo(n.createdAt)}${n.audience == 'all' ? ' · campus-wide' : ''}'].join('\n')),
                      isThreeLine: n.body != null,
                      onTap: () {
                        if (n.audience == 'user' && !n.read) repo.markRead(n.id).catchError((_) {});
                        final link = n.link;
                        if (link == null) return;
                        // Website paths -> app screens.
                        final path = link.startsWith('/campus/notice/') ? '/notice/${link.split('/').last}'
                            : link.startsWith('/campus/event/') ? '/event/${link.split('/').last}'
                            : link;
                        context.push(path);
                      },
                    );
                  },
                );
              },
            );
          },
        ),
      );
}

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Profile')),
        body: MemberGate(
          why: 'Your profile, reports and notifications.',
          path: '/profile',
          builder: (context, me) => ListView(children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                CircleAvatar(radius: 30, backgroundColor: Brand.sun, child: Text(me.displayName.isEmpty ? '?' : me.displayName[0].toUpperCase(), style: const TextStyle(fontSize: 24, color: Brand.ink, fontWeight: FontWeight.w800))),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(me.displayName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                    Text('@${me.username}', style: const TextStyle(color: Color(0xFF7B6E5A))),
                    if (me.department.isNotEmpty || me.year != null)
                      Text([if (me.department.isNotEmpty) me.department, if (me.year != null) 'Year ${me.year}'].join(' · ')),
                  ]),
                ),
              ]),
            ),
            if (me.bio.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(me.bio)),
            const SizedBox(height: 8),
            ListTile(leading: const Icon(Icons.edit_outlined), title: const Text('Edit profile'), onTap: () => context.push('/profile/edit')),
            ListTile(leading: const Icon(Icons.build_outlined), title: const Text('My reports'), onTap: () => context.push('/reports')),
            ListTile(leading: const Icon(Icons.notifications_outlined), title: const Text('Notifications'), onTap: () => context.push('/notifications')),
            ListTile(leading: const Icon(Icons.people_outline), title: const Text('Find Your People'), subtitle: const Text('Discover clubs and teammates with shared interests'), onTap: () => context.push('/people')),
              ListTile(leading: const Icon(Icons.quiz_outlined), title: const Text('Campus IQ'), subtitle: const Text('Learn campus facts and earn points'), onTap: () => context.push('/quiz')),
            if (rfidAttendanceEnabled)
              ListTile(leading: const Icon(Icons.badge_outlined), title: const Text('My attendance'), onTap: () => context.push('/attendance')),
            ListTile(leading: const Icon(Icons.lock_outline), title: const Text('Change password'), onTap: () => context.push('/profile/password')),
            ListTile(leading: const Icon(Icons.qr_code_scanner), title: const Text('Scan a campus QR code'), onTap: () => context.push('/scan')),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Sign out'),
              onTap: () async {
                await AppScope.of(context).session.signOut();
                if (context.mounted) context.go('/');
              },
            ),
          ]),
        ),
      );
}

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _form = GlobalKey<FormState>();
  TextEditingController? _name, _dept, _bio;
  int? _year;
  bool _busy = false;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Edit profile')),
        body: MemberGate(
          why: 'Sign in to edit your profile.',
          path: '/profile/edit',
          builder: (context, me) {
            _name ??= TextEditingController(text: me.displayName);
            _dept ??= TextEditingController(text: me.department);
            _bio ??= TextEditingController(text: me.bio);
            _year ??= me.year;
            return Form(
              key: _form,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                TextFormField(initialValue: me.username, enabled: false, decoration: const InputDecoration(labelText: 'Username', helperText: 'Usernames cannot be changed')),
                const SizedBox(height: 14),
                TextFormField(controller: _name, maxLength: 40, decoration: const InputDecoration(labelText: 'Your name'),
                    validator: (v) => (v ?? '').trim().length < 2 ? 'At least 2 characters.' : null),
                TextFormField(controller: _dept, maxLength: 60, decoration: const InputDecoration(labelText: 'Department')),
                DropdownButtonFormField<int?>(
                  initialValue: _year,
                  decoration: const InputDecoration(labelText: 'Year'),
                  items: [const DropdownMenuItem(value: null, child: Text('-')), for (var y = 1; y <= 6; y++) DropdownMenuItem(value: y, child: Text('$y'))],
                  onChanged: (v) => setState(() => _year = v),
                ),
                const SizedBox(height: 14),
                TextFormField(controller: _bio, maxLength: 280, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'About you')),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () async {
                          if (!_form.currentState!.validate()) return;
                          setState(() => _busy = true);
                          try {
                            await AppScope.of(context).repo.updateProfile(me.id, displayName: _name!.text, department: _dept!.text, bio: _bio!.text, year: _year);
                            if (context.mounted) { showMessage(context, 'Saved.'); context.pop(); }
                          } catch (e) {
                            if (context.mounted) showMessage(context, friendlyError(e));
                            setState(() => _busy = false);
                          }
                        },
                  child: const Text('Save'),
                ),
              ]),
            );
          },
        ),
      );
}

class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _repeat = TextEditingController();
  bool _busy = false;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Change password')),
        body: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.all(16), children: [
            TextFormField(controller: _current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password'),
                validator: (v) => (v ?? '').isEmpty ? 'Enter your current password.' : null),
            const SizedBox(height: 14),
            TextFormField(controller: _next, obscureText: true, decoration: const InputDecoration(labelText: 'New password', helperText: 'At least 8 characters, with letters and a digit'),
                validator: (v) => passwordProblem(v ?? '')),
            const SizedBox(height: 14),
            TextFormField(controller: _repeat, obscureText: true, decoration: const InputDecoration(labelText: 'Repeat new password'),
                validator: (v) => v != _next.text ? 'The passwords do not match.' : null),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy
                  ? null
                  : () async {
                      if (!_form.currentState!.validate()) return;
                      setState(() => _busy = true);
                      try {
                        await AppScope.of(context).session.changePassword(_current.text, _next.text);
                        if (context.mounted) { showMessage(context, 'Password changed.'); context.pop(); }
                      } catch (e) {
                        if (context.mounted) showMessage(context, friendlyError(e));
                        setState(() => _busy = false);
                      }
                    },
              child: const Text('Change password'),
            ),
          ]),
        ),
      );
}
