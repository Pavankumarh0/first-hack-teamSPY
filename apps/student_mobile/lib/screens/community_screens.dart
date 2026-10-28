import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../core/constants.dart';
import '../core/errors.dart';
import '../core/format.dart';
import '../data/models.dart';
import '../ui/widgets/cards.dart';
import '../ui/widgets/common.dart';
import 'content_screens.dart';
import 'map_screens.dart';
import 'member_gate.dart';

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});
  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> {
  String? _category;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Community')),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => context.push('/community/new'),
          icon: const Icon(Icons.edit_outlined),
          label: const Text('New post'),
        ),
        body: MemberGate(
          why: 'Student discussions are for signed-in students.',
          path: '/community',
          builder: (context, me) {
            final repo = AppScope.of(context).repo;
            return Column(children: [
              SizedBox(
                height: 52,
                child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.fromLTRB(12, 8, 12, 4), children: [
                  for (final c in [null, ...C.postCategories])
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: ChoiceChip(
                        label: Text(c == null ? 'All' : C.postCategoryLabels[c]!),
                        selected: _category == c,
                        onSelected: (_) => setState(() => _category = c),
                      ),
                    ),
                ]),
              ),
              Expanded(
                child: PagedList<Post>(
                  key: ValueKey(_category),
                  header: const Padding(
                    padding: EdgeInsets.fromLTRB(16, 0, 16, 12),
                    child: Text('Opinions and tips from students - not official college information.', style: TextStyle(fontSize: 12, color: Color(0xFF7B6E5A))),
                  ),
                  load: (cursor) => repo.posts(category: _category, cursor: cursor),
                  itemBuilder: (p) => PostTile(p),
                  empty: const EmptyState(title: 'No discussions here yet', body: 'Ask a question or share something useful.', icon: Icons.forum_outlined),
                ),
              ),
            ]);
          },
        ),
      );
}

class NewPostScreen extends StatefulWidget {
  const NewPostScreen({super.key});
  @override
  State<NewPostScreen> createState() => _NewPostScreenState();
}

class _NewPostScreenState extends State<NewPostScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _body = TextEditingController();
  String? _category;
  Place? _place;
  bool _busy = false;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Start a discussion')),
        body: MemberGate(
          why: 'Posts show your username.',
          path: '/community/new',
          builder: (context, me) {
            final repo = AppScope.of(context).repo;
            return Form(
              key: _form,
              child: ListView(padding: const EdgeInsets.all(16), children: [
                Text('Your post shows @${me.username} and is labelled as a student opinion. Abusive posts are removed by moderators.',
                    style: const TextStyle(color: Color(0xFF5F5446))),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _category,
                  decoration: const InputDecoration(labelText: 'Topic'),
                  items: [for (final c in C.postCategories) DropdownMenuItem(value: c, child: Text(C.postCategoryLabels[c]!))],
                  onChanged: (v) => setState(() => _category = v),
                  validator: (v) => v == null ? 'Choose a topic.' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _title,
                  maxLength: 120,
                  decoration: const InputDecoration(labelText: 'Title', hintText: 'Is the library Wi-Fi working today?'),
                  validator: (v) => (v ?? '').trim().length < 5 ? 'Use a title of at least 5 characters.' : null,
                ),
                TextFormField(
                  controller: _body,
                  maxLength: 4000,
                  minLines: 4,
                  maxLines: 10,
                  decoration: const InputDecoration(labelText: 'Details'),
                  validator: (v) => (v ?? '').trim().isEmpty ? 'Write something.' : null,
                ),
                AsyncView<List<Place>>(
                  load: repo.places,
                  loading: const SizedBox.shrink(),
                  builder: (context, places, _) => DropdownButtonFormField<Place?>(
                    initialValue: _place,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Place (optional)'),
                    items: [const DropdownMenuItem(value: null, child: Text('None')), for (final p in places) DropdownMenuItem(value: p, child: Text(p.name))],
                    onChanged: (v) => setState(() => _place = v),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _busy
                      ? null
                      : () async {
                          if (!_form.currentState!.validate()) return;
                          setState(() => _busy = true);
                          try {
                            final id = await repo.createPost(me, title: _title.text, body: _body.text, category: _category!, place: _place);
                            if (context.mounted) context.pushReplacement('/community/$id');
                          } catch (e) {
                            if (context.mounted) showMessage(context, friendlyError(e));
                            setState(() => _busy = false);
                          }
                        },
                  child: const Text('Post'),
                ),
              ]),
            );
          },
        ),
      );
}

class PostScreen extends StatefulWidget {
  const PostScreen({super.key, required this.id});
  final String id;
  @override
  State<PostScreen> createState() => _PostScreenState();
}

class _PostScreenState extends State<PostScreen> {
  final _reply = TextEditingController();
  int _version = 0;
  bool? _helpful;
  bool _busy = false;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: MemberGate(
          why: 'Discussions are for signed-in students.',
          path: '/community/${widget.id}',
          builder: (context, me) {
            final repo = AppScope.of(context).repo;
            return AsyncView<(Post?, List<Comment>, bool)>(
              dependsOn: _version,
              load: () async {
                final p = await repo.post(widget.id);
                if (p == null) return (null, <Comment>[], false);
                return (p, await repo.comments(widget.id), await repo.markedHelpful(widget.id, me.id));
              },
              builder: (context, data, reload) {
                final (post, comments, markedHelpful) = data;
                if (post == null) return const UnknownDestination(what: 'discussion');
                final helpful = _helpful ?? markedHelpful;
                final mine = post.authorId == me.id;
                return ListView(padding: const EdgeInsets.all(16), children: [
                  Wrap(spacing: 6, runSpacing: 4, children: [
                    const OpinionBadge(),
                    Pill(C.label(C.postCategoryLabels, post.category)),
                    if (post.locationName != null) Pill(post.locationName!, color: const Color(0xFF0369A1), icon: Icons.place_outlined),
                    SampleBadge(show: post.isSample),
                  ]),
                  const SizedBox(height: 8),
                  Text(post.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  Text('${post.authorDisplayName} @${post.authorUsername} · ${formatDateTime(post.createdAt)}', style: const TextStyle(color: Color(0xFF7B6E5A), fontSize: 13)),
                  const SizedBox(height: 12),
                  Text(post.body, style: const TextStyle(fontSize: 15.5, height: 1.45)),
                  const SizedBox(height: 12),
                  Row(children: [
                    FilledButton.tonalIcon(
                      onPressed: mine
                          ? null
                          : () async {
                              try {
                                await repo.setHelpful(post.id, me.id, !helpful);
                                setState(() { _helpful = !helpful; _version++; });
                              } catch (e) {
                                if (context.mounted) showMessage(context, friendlyError(e));
                              }
                            },
                      icon: Icon(helpful ? Icons.thumb_up : Icons.thumb_up_alt_outlined),
                      label: Text('Helpful · ${post.helpfulCount}'),
                    ),
                    const Spacer(),
                    if (!mine)
                      IconButton(tooltip: 'Report to moderators', icon: const Icon(Icons.flag_outlined), onPressed: () => _flag(context, me.id, 'post', 'posts/${post.id}')),
                    if (mine)
                      IconButton(
                        tooltip: 'Delete post',
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          await repo.deleteOwnPost(post.id);
                          if (context.mounted) context.pop();
                        },
                      ),
                  ]),
                  const Divider(height: 32),
                  Text('${post.commentCount} ${post.commentCount == 1 ? 'reply' : 'replies'}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  for (final c in comments)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Card(
                        child: ListTile(
                          title: Text('${c.authorDisplayName}  @${c.authorUsername}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          subtitle: Padding(padding: const EdgeInsets.only(top: 4), child: Text(c.body)),
                          trailing: c.authorId == me.id
                              ? null
                              : IconButton(tooltip: 'Report reply', icon: const Icon(Icons.flag_outlined, size: 18), onPressed: () => _flag(context, me.id, 'comment', 'posts/${post.id}/comments/${c.id}')),
                        ),
                      ),
                    ),
                  if (post.status == 'visible') ...[
                    const SizedBox(height: 16),
                    TextField(controller: _reply, maxLength: 1000, minLines: 2, maxLines: 5, decoration: const InputDecoration(labelText: 'Your reply')),
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              if (_reply.text.trim().isEmpty) return;
                              setState(() => _busy = true);
                              try {
                                await repo.addComment(post.id, me, _reply.text);
                                _reply.clear();
                                setState(() => _version++);
                              } catch (e) {
                                if (context.mounted) showMessage(context, friendlyError(e));
                              } finally {
                                setState(() => _busy = false);
                              }
                            },
                      child: const Text('Reply'),
                    ),
                  ],
                ]);
              },
            );
          },
        ),
      );

  Future<void> _flag(BuildContext context, String uid, String type, String path) async {
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Report to moderators'),
        content: TextField(controller: reason, maxLength: 300, decoration: const InputDecoration(labelText: 'What is wrong with it?')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Send')),
        ],
      ),
    );
    if (ok != true || reason.text.trim().isEmpty || !context.mounted) return;
    try {
      await AppScope.of(context).repo.flag(uid, type, path, reason.text);
      if (context.mounted) showMessage(context, 'Thanks. A moderator will review it.');
    } catch (e) {
      if (context.mounted) showMessage(context, friendlyError(e));
    }
  }
}
