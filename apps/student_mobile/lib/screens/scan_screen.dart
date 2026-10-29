import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../app_scope.dart';
import '../core/deep_links.dart';

/// Scans a Campus Mithra QR code (kiosk screen, posters, room doors) and opens
/// the matching screen. Codes that are not campus destinations are refused.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});
  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  bool _handled = false;
  String? _message;

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null) return;
    final uri = Uri.tryParse(raw);
    final siteHost = Uri.parse(AppScope.of(context).config.siteUrl).host;
    final link = uri == null ? null : parseCampusUri(uri, siteHost: siteHost);
    if (link == null) {
      setState(() => _message = 'That QR code is not a Campus Mithra destination.');
      return;
    }
    _handled = true;
    // Deep links can target a route that is already in the stack; go() builds
    // the destination stack from the URI without retaining duplicate pages.
    context.go(link.appRoute);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Scan a campus QR code')),
        body: Stack(children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(error.errorCode == MobileScannerErrorCode.permissionDenied
                    ? 'Camera permission is needed to scan QR codes. Allow it in your phone settings.'
                    : 'The camera is not available on this device.', textAlign: TextAlign.center),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: double.infinity,
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(14)),
              child: Text(_message ?? 'Point the camera at a QR code from the campus kiosk, a poster or a room sign.',
                  textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
            ),
          ),
        ]),
      );
}
