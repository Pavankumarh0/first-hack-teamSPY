import 'package:flutter/material.dart';

import '../ui/theme.dart';

/// Shown instead of crashing when the Firebase settings were not provided.
class SetupScreen extends StatelessWidget {
  const SetupScreen({super.key, required this.missing});
  final List<String> missing;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(24), children: [
            const Icon(Icons.settings_suggest_outlined, size: 48, color: Brand.saffron),
            const SizedBox(height: 16),
            Text('Campus Mithra is not configured yet', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            const Text('This build has no Firebase settings. In apps/student_mobile, run:'),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Brand.navy, borderRadius: BorderRadius.circular(10)),
              child: const SelectableText('flutterfire configure',
                  style: TextStyle(fontFamily: 'monospace', color: Color(0xFF6EE7B7))),
            ),
            const SizedBox(height: 12),
            const Text('Or copy .env.example to .env, fill in your Firebase app values, and run:'),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Brand.navy, borderRadius: BorderRadius.circular(10)),
              child: const SelectableText('flutter run --dart-define-from-file=.env',
                  style: TextStyle(fontFamily: 'monospace', color: Color(0xFF6EE7B7))),
            ),
            const SizedBox(height: 16),
            const Text('Missing in .env:', style: TextStyle(fontWeight: FontWeight.w700)),
            for (final m in missing) Padding(padding: const EdgeInsets.only(top: 4), child: Text('•  $m', style: const TextStyle(fontFamily: 'monospace'))),
            const SizedBox(height: 16),
            const Text('For local testing without a Firebase project, set USE_FIREBASE_EMULATORS=true and start the '
                'emulators (docs/FIREBASE_SETUP.md).'),
          ]),
        ),
      );
}
