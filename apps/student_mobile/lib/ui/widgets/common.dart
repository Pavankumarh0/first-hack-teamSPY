import 'package:flutter/material.dart';

import '../../core/errors.dart';
import '../theme.dart';

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = const Color(0xFF475569), this.icon});
  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withValues(alpha: 0.25))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 12, color: color), const SizedBox(width: 3)],
          Text(text, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: color)),
        ]),
      );
}

/// Seed content is always labelled, so nobody mistakes it for real campus information.
class SampleBadge extends StatelessWidget {
  const SampleBadge({super.key, required this.show});
  final bool show;
  @override
  Widget build(BuildContext context) => show ? const Pill('Sample data', color: Color(0xFFB45309)) : const SizedBox.shrink();
}

class OfficialBadge extends StatelessWidget {
  const OfficialBadge({super.key});
  @override
  Widget build(BuildContext context) => const Pill('Official', color: Brand.tealDark, icon: Icons.verified_outlined);
}

/// Community posts are opinions, never official information.
class OpinionBadge extends StatelessWidget {
  const OpinionBadge({super.key});
  @override
  Widget build(BuildContext context) => const Pill('Student opinion', color: Brand.violet);
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.title, this.body, this.icon = Icons.inbox_outlined, this.action});
  final String title;
  final String? body;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          CircleAvatar(radius: 28, backgroundColor: const Color(0xFFF1F5F9), child: Icon(icon, color: const Color(0xFF64748B))),
          const SizedBox(height: 12),
          Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          if (body != null) ...[
            const SizedBox(height: 4),
            Text(body!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF64748B))),
          ],
          if (action != null) ...[const SizedBox(height: 16), action!],
        ]),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.error, this.onRetry});
  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(16),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFFECACA))),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.error_outline, color: Color(0xFFB91C1C)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(friendlyError(error), style: const TextStyle(color: Color(0xFF991B1B))),
                if (onRetry != null) TextButton(onPressed: onRetry, child: const Text('Try again')),
              ]),
            ),
          ]),
        ),
      );
}

/// Grey placeholder blocks while content loads.
class SkeletonList extends StatelessWidget {
  const SkeletonList({super.key, this.count = 3});
  final int count;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          for (var i = 0; i < count; i++)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _bar(width: 180, height: 14),
                    const SizedBox(height: 10),
                    _bar(),
                    const SizedBox(height: 6),
                    _bar(width: 220),
                  ]),
                ),
              ),
            ),
        ],
        // Exposed to screen readers as one "Loading" item.
      );

  Widget _bar({double? width, double height = 10}) => Container(
        width: width ?? double.infinity,
        height: height,
        decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(6)),
      );
}

/// FutureBuilder with loading, error (with retry) and data states.
class AsyncView<T> extends StatefulWidget {
  const AsyncView({super.key, required this.load, required this.builder, this.loading, this.dependsOn});
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, VoidCallback reload) builder;
  final Widget? loading;

  /// Reloads when this value changes.
  final Object? dependsOn;

  @override
  State<AsyncView<T>> createState() => _AsyncViewState<T>();
}

class _AsyncViewState<T> extends State<AsyncView<T>> {
  late Future<T> _future = widget.load();

  void _reload() => setState(() => _future = widget.load());

  @override
  void didUpdateWidget(covariant AsyncView<T> old) {
    super.didUpdateWidget(old);
    if (old.dependsOn != widget.dependsOn) _future = widget.load();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return Semantics(label: 'Loading', child: widget.loading ?? const Padding(padding: EdgeInsets.only(top: 16), child: SkeletonList()));
          }
          if (snap.hasError) return ErrorView(error: snap.error!, onRetry: _reload);
          return widget.builder(context, snap.data as T, _reload);
        },
      );
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.icon, this.onSeeAll});
  final String title;
  final IconData? icon;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 8, 8),
        child: Row(children: [
          if (icon != null) ...[Icon(icon, size: 20, color: Brand.tealDark), const SizedBox(width: 8)],
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
          if (onSeeAll != null) TextButton(onPressed: onSeeAll, child: const Text('See all')),
        ]),
      );
}

void showMessage(BuildContext context, String text) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));
