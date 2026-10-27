import 'package:flutter/material.dart';

import '../app_scope.dart';
import '../data/models.dart';
import '../data/session.dart';
import 'auth_screens.dart';

/// Builds [builder] only for a signed-in, active student with a profile.
class MemberGate extends StatelessWidget {
  const MemberGate({super.key, required this.why, required this.path, required this.builder});
  final String why;
  final String path;
  final Widget Function(BuildContext context, UserProfile me) builder;

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context).session;
    if (s.status == SessionStatus.loading || (s.status == SessionStatus.signedIn && s.active && s.profile == null)) {
      return const Center(child: CircularProgressIndicator());
    }
    if (s.status == SessionStatus.signedOut) return SignInPrompt(why: why, next: path);
    if (!s.active || s.profile == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('This account is not active. It may be suspended, or it was not created through Campus Mithra registration. '
              'Contact the college office.', textAlign: TextAlign.center),
        ),
      );
    }
    return builder(context, s.profile!);
  }
}
