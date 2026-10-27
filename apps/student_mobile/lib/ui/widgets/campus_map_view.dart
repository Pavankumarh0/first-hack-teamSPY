import 'package:flutter/material.dart';

import '../../core/navigation.dart';
import '../../data/models.dart';
import '../theme.dart';

const _fill = {
  'academic': Color(0xFFDBEAFE), 'administrative': Color(0xFFEDE9FE), 'library': Color(0xFFD1FAE5), 'food': Color(0xFFFFEDD5),
  'hostel': Color(0xFFFCE7F3), 'sports': Color(0xFFDCFCE7), 'medical': Color(0xFFFEE2E2), 'event': Color(0xFFFEF3C7),
  'parking': Color(0xFFE2E8F0),
};
const _stroke = {
  'academic': Color(0xFF3B82F6), 'administrative': Color(0xFF8B5CF6), 'library': Color(0xFF10B981), 'food': Color(0xFFF97316),
  'hostel': Color(0xFFEC4899), 'sports': Color(0xFF22C55E), 'medical': Color(0xFFEF4444), 'event': Color(0xFFF59E0B),
  'parking': Color(0xFF64748B),
};

/// The campus drawn from campusMap/main and the buildings: walkways, buildings,
/// an optional route and start/destination markers. Pinch to zoom; tap a
/// building to pick it.
class CampusMapView extends StatelessWidget {
  const CampusMapView({
    super.key,
    required this.map,
    required this.buildings,
    this.route,
    this.startNodeId,
    this.endNodeId,
    this.highlightBuildingId,
    this.onBuildingTap,
  });

  final CampusMapData map;
  final List<Building> buildings;
  final CampusRoute? route;
  final String? startNodeId;
  final String? endNodeId;
  final String? highlightBuildingId;
  final ValueChanged<Building>? onBuildingTap;

  @override
  Widget build(BuildContext context) => AspectRatio(
        aspectRatio: map.width / map.height,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: LayoutBuilder(builder: (context, box) {
            final scale = box.maxWidth / map.width;
            return InteractiveViewer(
              maxScale: 5,
              child: GestureDetector(
                onTapUp: onBuildingTap == null
                    ? null
                    : (d) {
                        final p = d.localPosition / scale;
                        for (final b in buildings) {
                          if (p.dx >= b.x && p.dx <= b.x + b.w && p.dy >= b.y && p.dy <= b.y + b.h) {
                            onBuildingTap!(b);
                            return;
                          }
                        }
                      },
                child: Semantics(
                  label: 'Campus map${route != null ? ' with your route, ${route!.distanceM} metres' : ''}',
                  child: CustomPaint(
                    size: Size(box.maxWidth, box.maxWidth * map.height / map.width),
                    painter: _MapPainter(map, buildings, route, startNodeId, endNodeId, highlightBuildingId, scale),
                  ),
                ),
              ),
            );
          }),
        ),
      );
}

class _MapPainter extends CustomPainter {
  _MapPainter(this.map, this.buildings, this.route, this.start, this.end, this.highlight, this.scale);
  final CampusMapData map;
  final List<Building> buildings;
  final CampusRoute? route;
  final String? start, end, highlight;
  final double scale;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(scale);
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, map.width, map.height), const Radius.circular(16)), Paint()..color = const Color(0xFFEEF5EC));
    final nodes = {for (final n in map.nodes) n.id: n};
    final onRoute = route?.edgeIds.toSet() ?? const <String>{};

    for (final e in map.edges) {
      final a = nodes[e.from], b = nodes[e.to];
      if (a == null || b == null) continue;
      final paint = Paint()
        ..color = onRoute.contains(e.id) ? Brand.tealDark : const Color(0xFFCBD5E1)
        ..strokeWidth = onRoute.contains(e.id) ? 9 : 7
        ..strokeCap = StrokeCap.round;
      if (e.accessible) {
        canvas.drawLine(Offset(a.x, a.y), Offset(b.x, b.y), paint);
      } else {
        _dotted(canvas, Offset(a.x, a.y), Offset(b.x, b.y), paint..strokeWidth = 5);
      }
    }

    for (final b in buildings) {
      final rect = RRect.fromRectAndRadius(Rect.fromLTWH(b.x, b.y, b.w, b.h), const Radius.circular(8));
      canvas.drawRRect(rect, Paint()..color = _fill[b.category] ?? const Color(0xFFF1F5F9));
      canvas.drawRRect(rect, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = b.id == highlight ? 5 : 2
        ..color = b.id == highlight ? Brand.saffron : (_stroke[b.category] ?? const Color(0xFF94A3B8)));
      _text(canvas, b.code, Offset(b.x + b.w / 2, b.y + b.h / 2 - 6), 15, FontWeight.w800, b.w);
    }

    if (route != null && route!.nodeIds.length > 1) {
      final path = Path();
      for (var i = 0; i < route!.nodeIds.length; i++) {
        final n = nodes[route!.nodeIds[i]]!;
        i == 0 ? path.moveTo(n.x, n.y) : path.lineTo(n.x, n.y);
      }
      canvas.drawPath(path, Paint()
        ..color = Brand.teal
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round);
    }
    if (start != null && nodes[start] != null) _pin(canvas, nodes[start]!, Brand.navy);
    if (end != null && nodes[end] != null) _pin(canvas, nodes[end]!, Brand.saffron);
  }

  void _dotted(Canvas canvas, Offset a, Offset b, Paint paint) {
    final d = (b - a).distance;
    for (double t = 0; t < d; t += 12) {
      canvas.drawCircle(a + (b - a) * (t / d), 2.5, paint);
    }
  }

  void _pin(Canvas canvas, MapNode n, Color color) {
    final path = Path()
      ..moveTo(n.x, n.y)
      ..cubicTo(n.x - 10, n.y - 14, n.x - 14, n.y - 20, n.x - 14, n.y - 27)
      ..arcToPoint(Offset(n.x + 14, n.y - 27), radius: const Radius.circular(14))
      ..cubicTo(n.x + 14, n.y - 20, n.x + 10, n.y - 14, n.x, n.y)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
    canvas.drawCircle(Offset(n.x, n.y - 27), 5, Paint()..color = Colors.white);
  }

  void _text(Canvas canvas, String text, Offset center, double size, FontWeight weight, double maxWidth) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: TextStyle(color: const Color(0xFF0F172A), fontSize: size, fontWeight: weight)),
      textDirection: TextDirection.ltr,
      maxLines: 1,
      ellipsis: '…',
    )..layout(maxWidth: maxWidth);
    tp.paint(canvas, center - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _MapPainter old) =>
      old.route != route || old.start != start || old.end != end || old.highlight != highlight || old.scale != scale || old.map != map;
}
