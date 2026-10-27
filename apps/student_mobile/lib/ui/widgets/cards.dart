import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/constants.dart';
import '../../core/format.dart';
import '../../data/models.dart';
import '../theme.dart';
import 'common.dart';

class _TapCard extends StatelessWidget {
  const _TapCard({required this.onTap, required this.child});
  final VoidCallback onTap;
  final Widget child;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: Card(clipBehavior: Clip.antiAlias, child: InkWell(onTap: onTap, child: Padding(padding: const EdgeInsets.all(14), child: child))),
      );
}

class NoticeTile extends StatelessWidget {
  const NoticeTile(this.a, {super.key});
  final Announcement a;
  @override
  Widget build(BuildContext context) => _TapCard(
        onTap: () => context.push('/notice/${a.id}'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 6, runSpacing: 4, children: [
            const OfficialBadge(),
            Pill(a.category == 'notice' ? 'Notice' : 'Announcement', color: a.category == 'notice' ? const Color(0xFFB45309) : const Color(0xFF0369A1)),
            if (a.pinned) const Pill('Pinned', color: Color(0xFFB45309)),
            SampleBadge(show: a.isSample),
          ]),
          const SizedBox(height: 8),
          Text(a.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
          const SizedBox(height: 4),
          Text(a.body, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF475569))),
          const SizedBox(height: 6),
          Text(formatDate(a.publishedAt), style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        ]),
      );
}

class EventTile extends StatelessWidget {
  const EventTile(this.e, {super.key});
  final CampusEvent e;
  @override
  Widget build(BuildContext context) => _TapCard(
        onTap: () => context.push('/event/${e.id}'),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 52,
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(color: Brand.saffron.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
            child: Column(children: [
              Text(DateFormat('MMM').format(e.startAt).toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFA9570C))),
              Text('${e.startAt.day}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFFA9570C))),
            ]),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (e.status == 'cancelled' || e.isSample)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Wrap(spacing: 6, children: [
                    if (e.status == 'cancelled') const Pill('Cancelled', color: Color(0xFFB91C1C)),
                    SampleBadge(show: e.isSample),
                  ]),
                ),
              Text(e.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              Text(e.clubName, style: const TextStyle(color: Color(0xFF475569))),
              const SizedBox(height: 4),
              Text('${formatRange(e.startAt, e.endAt)}\n${e.venueName}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            ]),
          ),
        ]),
      );
}

class PlaceTile extends StatelessWidget {
  const PlaceTile(this.p, {super.key});
  final Place p;
  @override
  Widget build(BuildContext context) => _TapCard(
        onTap: () => context.push('/place/${p.id}'),
        child: Row(children: [
          CircleAvatar(backgroundColor: Brand.teal.withValues(alpha: 0.12), child: const Icon(Icons.place_outlined, color: Brand.tealDark)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              if (p.where.isNotEmpty) Text(p.where, style: const TextStyle(fontSize: 13, color: Color(0xFF475569))),
              const SizedBox(height: 4),
              Wrap(spacing: 6, children: [Pill(C.label(C.locationTypeLabels, p.type)), SampleBadge(show: p.isSample)]),
            ]),
          ),
          const Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
        ]),
      );
}

class PostTile extends StatelessWidget {
  const PostTile(this.p, {super.key});
  final Post p;
  @override
  Widget build(BuildContext context) => _TapCard(
        onTap: () => context.push('/community/${p.id}'),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 6, runSpacing: 4, children: [
            const OpinionBadge(),
            Pill(C.label(C.postCategoryLabels, p.category)),
            if (p.locationName != null) Pill(p.locationName!, color: const Color(0xFF0369A1), icon: Icons.place_outlined),
            SampleBadge(show: p.isSample),
          ]),
          const SizedBox(height: 8),
          Text(p.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 4),
          Text(p.body, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF475569))),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: Text('@${p.authorUsername} · ${timeAgo(p.createdAt)}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)))),
            const Icon(Icons.thumb_up_alt_outlined, size: 14, color: Color(0xFF64748B)),
            Text(' ${p.helpfulCount}   ', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            const Icon(Icons.chat_bubble_outline, size: 14, color: Color(0xFF64748B)),
            Text(' ${p.commentCount}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          ]),
        ]),
      );
}

const _statusColors = {
  'submitted': Color(0xFF475569), 'acknowledged': Color(0xFF0369A1), 'assigned': Color(0xFF7C3AED),
  'in_progress': Color(0xFFB45309), 'resolved': Color(0xFF047857), 'rejected': Color(0xFFB91C1C),
};

class ReportStatusPill extends StatelessWidget {
  const ReportStatusPill(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) => Pill(C.label(C.reportStatusLabels, status), color: _statusColors[status] ?? const Color(0xFF475569));
}

/// Submitted -> Acknowledged -> Assigned -> In progress -> Resolved.
class ReportProgress extends StatelessWidget {
  const ReportProgress(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) {
    if (status == 'rejected') {
      return const Text('This report was closed without action. See the history for the reason.', style: TextStyle(color: Color(0xFFB91C1C)));
    }
    final at = C.reportFlow.indexOf(status);
    return Row(children: [
      for (var i = 0; i < C.reportFlow.length; i++)
        Expanded(
          child: Column(children: [
            CircleAvatar(
              radius: 13,
              backgroundColor: i < at ? Brand.tealDark : (i == at ? Brand.saffron : const Color(0xFFE2E8F0)),
              child: i < at
                  ? const Icon(Icons.check, size: 15, color: Colors.white)
                  : Text('${i + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: i == at ? Brand.navy : const Color(0xFF64748B))),
            ),
            const SizedBox(height: 4),
            // Scales down rather than breaking "Acknowledged" mid-word on narrow phones.
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(C.reportStatusLabels[C.reportFlow[i]]!, maxLines: 1,
                  style: TextStyle(fontSize: 10.5, fontWeight: i <= at ? FontWeight.w600 : FontWeight.w400, color: i <= at ? Brand.navy : const Color(0xFF64748B))),
            ),
          ]),
        ),
    ]);
  }
}
