import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../app_scope.dart';
import '../core/constants.dart';
import '../core/errors.dart';
import '../core/format.dart';
import '../data/models.dart';
import '../data/repository.dart';
import '../ui/theme.dart';
import '../ui/widgets/cards.dart';
import '../ui/widgets/common.dart';
import 'content_screens.dart';
import 'map_screens.dart';
import 'member_gate.dart';

class ReportsScreen extends StatelessWidget {
  const ReportsScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('My reports')),
        floatingActionButton: FloatingActionButton.extended(onPressed: () => context.push('/reports/new'), icon: const Icon(Icons.add), label: const Text('New report')),
        body: MemberGate(
          why: 'Your maintenance reports are linked to your account.',
          path: '/reports',
          builder: (context, me) {
            final repo = AppScope.of(context).repo;
            return PagedList<Report>(
              load: (cursor) => repo.myReports(me.id, cursor: cursor),
              itemBuilder: (r) => Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: Card(
                  child: ListTile(
                    title: Text(r.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${C.label(C.reportCategoryLabels, r.category)} · ${r.where.isEmpty ? 'No location' : r.where} · ${timeAgo(r.createdAt)}'),
                    trailing: ReportStatusPill(r.status),
                    onTap: () => context.push('/reports/${r.id}'),
                  ),
                ),
              ),
              empty: EmptyState(
                title: 'No reports yet',
                body: 'Broken fan, leaking tap, Wi-Fi down? Report it and follow the fix here.',
                icon: Icons.build_outlined,
                action: FilledButton(onPressed: () => context.push('/reports/new'), child: const Text('Report an issue')),
              ),
            );
          },
        ),
      );
}

class NewReportScreen extends StatefulWidget {
  const NewReportScreen({super.key});
  @override
  State<NewReportScreen> createState() => _NewReportScreenState();
}

class _NewReportScreenState extends State<NewReportScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _detail = TextEditingController();
  String? _category;
  Building? _building;
  Place? _place;
  XFile? _photo;
  bool _busy = false;

  Future<void> _pick(ImageSource source) async {
    final file = await ImagePicker().pickImage(source: source, maxWidth: 2000, imageQuality: 80);
    if (file != null) setState(() => _photo = file);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Report an issue')),
        body: MemberGate(
          why: 'Reports are linked to your account so you can follow their progress.',
          path: '/reports/new',
          builder: (context, me) {
            final repo = AppScope.of(context).repo;
            return AsyncView<(List<Building>, List<Place>)>(
              load: () async => (await repo.buildings(), await repo.places()),
              builder: (context, dir, _) {
                final (buildings, places) = dir;
                final rooms = places.where((p) => p.buildingId == _building?.id).toList();
                return Form(
                  key: _form,
                  child: ListView(padding: const EdgeInsets.all(16), children: [
                    const Text('Staff see your report straight away, and you are notified as its status changes.', style: TextStyle(color: Color(0xFF5F5446))),
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: _category,
                      decoration: const InputDecoration(labelText: 'Category'),
                      items: [for (final c in C.reportCategories) DropdownMenuItem(value: c, child: Text(C.reportCategoryLabels[c]!))],
                      onChanged: (v) => setState(() => _category = v),
                      validator: (v) => v == null ? 'Choose a category.' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _title,
                      maxLength: 100,
                      decoration: const InputDecoration(labelText: 'Title', hintText: 'Ceiling fan not working'),
                      validator: (v) => (v ?? '').trim().length < 3 ? 'Give a short title (3+ characters).' : null,
                    ),
                    DropdownButtonFormField<Building?>(
                      initialValue: _building,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Building'),
                      items: [const DropdownMenuItem(value: null, child: Text('Choose...')), for (final b in buildings) DropdownMenuItem(value: b, child: Text(b.name))],
                      onChanged: (v) => setState(() { _building = v; _place = null; }),
                      validator: (v) => v == null && _detail.text.trim().isEmpty ? 'Choose a building or describe where it is.' : null,
                    ),
                    const SizedBox(height: 14),
                    DropdownButtonFormField<Place?>(
                      key: ValueKey(_building?.id),
                      initialValue: _place,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Room or facility (optional)'),
                      items: [const DropdownMenuItem(value: null, child: Text('-')), for (final r in rooms) DropdownMenuItem(value: r, child: Text(r.room != null ? '${r.name} (${r.room})' : r.name))],
                      onChanged: rooms.isEmpty ? null : (v) => setState(() => _place = v),
                    ),
                    const SizedBox(height: 14),
                    TextFormField(controller: _detail, maxLength: 200, decoration: const InputDecoration(labelText: 'Exact spot', hintText: 'Second floor corridor, near the stairs')),
                    TextFormField(
                      controller: _description,
                      maxLength: 2000,
                      minLines: 4,
                      maxLines: 8,
                      decoration: const InputDecoration(labelText: 'What is wrong?'),
                      validator: (v) => (v ?? '').trim().length < 10 ? 'Describe the problem (10+ characters).' : null,
                    ),
                    const SizedBox(height: 8),
                    const Text('Photo (optional) - only you and campus staff can see it.', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    if (_photo != null)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.image_outlined),
                        title: Text(_photo!.name, overflow: TextOverflow.ellipsis),
                        trailing: IconButton(tooltip: 'Remove photo', icon: const Icon(Icons.close), onPressed: () => setState(() => _photo = null)),
                      )
                    else
                      Row(children: [
                        Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.camera), icon: const Icon(Icons.photo_camera_outlined), label: const Text('Camera'))),
                        const SizedBox(width: 12),
                        Expanded(child: OutlinedButton.icon(onPressed: () => _pick(ImageSource.gallery), icon: const Icon(Icons.photo_library_outlined), label: const Text('Gallery'))),
                      ]),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : () async {
                              if (!_form.currentState!.validate()) return;
                              setState(() => _busy = true);
                              try {
                                final bytes = _photo == null ? null : await _photo!.readAsBytes();
                                final ext = _photo?.name.split('.').last;
                                final id = await repo.createReport(me,
                                    category: _category!, title: _title.text, description: _description.text,
                                    building: _building, place: _place, detail: _detail.text, photo: bytes, photoExtension: ext);
                                if (context.mounted) context.pushReplacement('/reports/$id');
                              } catch (e) {
                                if (context.mounted) showMessage(context, friendlyError(e));
                                setState(() => _busy = false);
                              }
                            },
                      child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Submit report'),
                    ),
                  ]),
                );
              },
            );
          },
        ),
      );
}

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key, required this.id});
  final String id;
  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  final _note = TextEditingController();
  int _version = 0;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Report')),
        body: MemberGate(
          why: 'Reports are visible to the student who filed them and to campus staff.',
          path: '/reports/${widget.id}',
          builder: (context, me) {
            final repo = AppScope.of(context).repo;
            return AsyncView<(Report?, List<ReportUpdate>)>(
              dependsOn: _version,
              load: () async {
                final r = await repo.report(widget.id);
                return (r, r == null ? <ReportUpdate>[] : await repo.reportUpdates(widget.id));
              },
              builder: (context, data, reload) {
                final (r, updates) = data;
                if (r == null) return const UnknownDestination(what: 'report');
                return ListView(padding: const EdgeInsets.all(16), children: [
                  Row(children: [Expanded(child: Text(C.label(C.reportCategoryLabels, r.category), style: const TextStyle(color: Color(0xFF7B6E5A)))), ReportStatusPill(r.status)]),
                  const SizedBox(height: 6),
                  Text(r.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                  Text('Reported ${formatDateTime(r.createdAt)}${r.where.isEmpty ? '' : ' · ${r.where}'}', style: const TextStyle(color: Color(0xFF7B6E5A), fontSize: 13)),
                  const SizedBox(height: 16),
                  Card(child: Padding(padding: const EdgeInsets.all(14), child: ReportProgress(r.status))),
                  const SizedBox(height: 16),
                  Text(r.description, style: const TextStyle(fontSize: 15.5, height: 1.4)),
                  if (r.imagePath != null) _Photo(repo: repo, path: r.imagePath!),
                  if (r.assigneeName != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text('Assigned to ${r.assigneeName}')),
                  const Divider(height: 32),
                  const Text('History', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  _HistoryItem(icon: Icons.build_outlined, title: 'Report submitted', at: r.createdAt),
                  for (final u in updates)
                    _HistoryItem(
                      icon: u.type == 'comment' ? Icons.chat_bubble_outline : (u.type == 'assignment' ? Icons.person_add_alt : Icons.arrow_forward),
                      title: u.fromStatus != null && u.toStatus != null && u.fromStatus != u.toStatus
                          ? '${C.label(C.reportStatusLabels, u.fromStatus)} → ${C.label(C.reportStatusLabels, u.toStatus)}'
                          : (u.type == 'assignment' ? 'Assigned to staff' : 'Comment'),
                      at: u.at,
                      by: u.byName,
                      message: u.message,
                    ),
                  if (r.reporterId == me.id) ...[
                    const SizedBox(height: 16),
                    TextField(controller: _note, maxLength: 1000, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Add a note for staff')),
                    FilledButton.tonal(
                      onPressed: () async {
                        if (_note.text.trim().isEmpty) return;
                        try {
                          await repo.addReporterComment(r.id, me, _note.text);
                          _note.clear();
                          setState(() => _version++);
                        } catch (e) {
                          if (context.mounted) showMessage(context, friendlyError(e));
                        }
                      },
                      child: const Text('Send note'),
                    ),
                  ],
                ]);
              },
            );
          },
        ),
      );
}

class _Photo extends StatelessWidget {
  const _Photo({required this.repo, required this.path});
  final CampusRepository repo;
  final String path;
  @override
  Widget build(BuildContext context) => FutureBuilder<String>(
        future: repo.photoUrl(path),
        builder: (context, snap) => snap.hasData
            ? Padding(
                padding: const EdgeInsets.only(top: 12),
                child: ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(snap.data!, semanticLabel: 'Photo attached to the report')),
              )
            : const SizedBox.shrink(),
      );
}

class _HistoryItem extends StatelessWidget {
  const _HistoryItem({required this.icon, required this.title, this.at, this.by, this.message});
  final IconData icon;
  final String title;
  final DateTime? at;
  final String? by;
  final String? message;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          CircleAvatar(radius: 13, backgroundColor: Brand.teal.withValues(alpha: 0.12), child: Icon(icon, size: 14, color: Brand.tealDark)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text('${formatDateTime(at)}${by != null ? ' · $by' : ''}', style: const TextStyle(fontSize: 12, color: Color(0xFF7B6E5A))),
              if (message != null && message!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(message!)),
            ]),
          ),
        ]),
      );
}
