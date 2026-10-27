import 'package:flutter/widgets.dart';

import 'core/config.dart';
import 'data/repository.dart';
import 'data/session.dart';

/// Hands the configuration, session and repository down the widget tree, and
/// rebuilds dependants when the session changes.
class AppScope extends InheritedNotifier<Session> {
  const AppScope({super.key, required this.config, required Session session, required this.repo, required super.child})
      : super(notifier: session);

  final AppConfig config;
  final CampusRepository repo;

  Session get session => notifier!;

  static AppScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope missing above $context');
    return scope!;
  }
}
