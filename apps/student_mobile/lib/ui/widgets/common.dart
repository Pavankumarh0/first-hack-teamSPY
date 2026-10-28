import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/errors.dart';
import '../theme.dart';

/// Outlined caps label. `color` tints the fill; the text stays ink.
class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = const Color(0xFF5F5446), this.icon});
  final String text;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
        decoration: BoxDecoration(
          color: Color.alphaBlend(color.withValues(alpha: 0.38), Brand.paper),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Brand.ink, width: 1.5),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 12, color: Brand.ink), const SizedBox(width: 3)],
          Text(text.toUpperCase(), style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.5, color: Brand.ink)),
        ]),
      );
}

/// Seed content is always labelled, so nobody mistakes it for real campus information.
class SampleBadge extends StatelessWidget {
  const SampleBadge({super.key, required this.show});
  final bool show;
  @override
  Widget build(BuildContext context) => show ? const Pill('Sample data', color: Brand.sun) : const SizedBox.shrink();
}

class OfficialBadge extends StatelessWidget {
  const OfficialBadge({super.key});
  @override
  Widget build(BuildContext context) => const Pill('Official', color: Brand.mint, icon: Icons.verified_outlined);
}

/// Community posts are opinions, never official information.
class OpinionBadge extends StatelessWidget {
  const OpinionBadge({super.key});
  @override
  Widget build(BuildContext context) => const Pill('Student opinion', color: Brand.bubblegum);
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
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(color: Brand.sun, shape: BoxShape.circle, border: Border.all(color: Brand.ink, width: 2)),
            child: Icon(icon, color: Brand.ink),
          ),
          const SizedBox(height: 14),
          PosterText(title, size: 28, align: TextAlign.center),
          if (body != null) ...[
            const SizedBox(height: 6),
            Text(body!, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted)),
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
          decoration: BoxDecoration(color: const Color(0xFFF6C3B4), borderRadius: BorderRadius.circular(20), border: Border.all(color: Brand.ink, width: 2)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.error_outline, color: Brand.ink),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(friendlyError(error), style: const TextStyle(color: Brand.ink, fontWeight: FontWeight.w600)),
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
        decoration: BoxDecoration(color: const Color(0xFFE7DAC3), borderRadius: BorderRadius.circular(6)),
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
  // `icon` is kept for callers; the poster headings go without it.
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 28, 16, 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(child: PosterText(title, size: 38)),
          if (onSeeAll != null)
            OutlinedButton.icon(
              onPressed: onSeeAll,
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 14), textStyle: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
              icon: const Icon(Icons.north_east, size: 14),
              label: const Text('SEE ALL'),
            ),
        ]),
      );
}

void showMessage(BuildContext context, String text) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text), behavior: SnackBarBehavior.floating));

// --- poster pieces ------------------------------------------------------------

/// Headline in poster type: condensed, caps, ending with a full stop.
class PosterText extends StatelessWidget {
  const PosterText(this.text, {super.key, this.size = 44, this.color = Brand.ink, this.align, this.stop = true});
  final String text;
  final double size;
  final Color color;
  final TextAlign? align;
  final bool stop;

  @override
  Widget build(BuildContext context) {
    final t = text.trim();
    final shown = stop && !RegExp(r'[.!?]$').hasMatch(t) ? '$t.' : t;
    return Text(
      shown.toUpperCase(),
      textAlign: align,
      style: TextStyle(fontFamily: posterFont, fontWeight: FontWeight.w800, fontSize: size, height: 0.9, letterSpacing: -size * 0.02, color: color),
    );
  }
}

/// A flat colour block with an ink outline.
class ColorBlock extends StatelessWidget {
  const ColorBlock({super.key, required this.child, this.color = Brand.paper, this.padding = const EdgeInsets.all(20), this.onTap});
  final Widget child;
  final Color color;
  final EdgeInsets padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(26), side: inkBorder);
    return Material(
      color: color,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: onTap == null ? Padding(padding: padding, child: child) : InkWell(onTap: onTap, customBorder: shape, child: Padding(padding: padding, child: child)),
    );
  }
}

/// Feature tile: an icon and a two-line caps label ("EVENTS / CLUBS & FESTS").
class PosterTile extends StatelessWidget {
  const PosterTile({super.key, required this.color, required this.icon, required this.title, required this.subtitle, required this.onTap});
  final Color color;
  final Widget icon;
  final String title, subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: '$title. $subtitle',
        excludeSemantics: true,
        child: ColorBlock(
          color: color,
          onTap: onTap,
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            height: 118,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              IconTheme(data: const IconThemeData(size: 32, color: Brand.ink), child: icon),
              const Spacer(),
              Text(title.toUpperCase(), style: const TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w800, fontSize: 16, height: 1.05, color: Brand.ink)),
              const SizedBox(height: 2),
              Text(subtitle.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5, letterSpacing: 0.2, color: Brand.ink)),
            ]),
          ),
        ),
      );
}

/// Spiky starburst sticker ("JUST IN!").
class Starburst extends StatelessWidget {
  const Starburst({super.key, required this.text, this.color = Brand.sun, this.size = 96});
  final String text;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _StarburstPainter(color),
          child: Center(
            child: Transform.rotate(
              angle: -0.2,
              child: Text(text.toUpperCase(), textAlign: TextAlign.center,
                  style: TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w800, fontSize: size * 0.15, height: 0.95, color: Brand.ink)),
            ),
          ),
        ),
      );
}

class _StarburstPainter extends CustomPainter {
  _StarburstPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const spikes = 14;
    final c = size.center(Offset.zero);
    final outer = size.width / 2 - 2, inner = outer * 0.74;
    final path = Path();
    for (var i = 0; i < spikes * 2; i++) {
      final r = i.isEven ? outer : inner;
      final a = math.pi * i / spikes - math.pi / 2;
      final p = c + Offset(r * math.cos(a), r * math.sin(a));
      i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
    }
    path.close();
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawPath(path, Paint()
      ..color = Brand.ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeJoin = StrokeJoin.round);
  }

  @override
  bool shouldRepaint(_StarburstPainter old) => old.color != color;
}

/// The round logo mark: the campus roof over a doorway, on ink.
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 40});
  final double size;
  @override
  Widget build(BuildContext context) => SizedBox(width: size, height: size, child: CustomPaint(painter: _LogoPainter()));
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 40;
    canvas.scale(s);
    canvas.drawCircle(const Offset(20, 20), 19, Paint()..color = Brand.ink);
    canvas.drawCircle(const Offset(20, 20), 16.2, Paint()
      ..color = const Color(0xFFF3EADA)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4);
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(Path()..moveTo(10.5, 26.5)..lineTo(10.5, 16.2)..lineTo(20, 11)..lineTo(29.5, 16.2)..lineTo(29.5, 26.5), stroke..color = Brand.sun);
    canvas.drawPath(Path()..moveTo(15.5, 26.5)..lineTo(15.5, 20.5)..lineTo(24.5, 20.5)..lineTo(24.5, 26.5), stroke..color = Brand.mint);
    canvas.drawCircle(const Offset(20, 16), 1.9, Paint()..color = Brand.tangerine);
  }

  @override
  bool shouldRepaint(_LogoPainter old) => false;
}
