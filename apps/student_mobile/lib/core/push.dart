import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'constants.dart';

/// Campus-wide push notifications: new notices and events. The website's admin
/// dashboard sends them to the FCM topic [C.pushTopic] (POST /api/admin/push),
/// so no device token or account data is stored and they arrive signed out too.
///
/// Android shows a notification by itself while the app is in the background;
/// tapping it opens its campus link. In the foreground [onForeground] is called
/// instead, so the app can show it in place.
class CampusPush {
  CampusPush(this._fcm);
  final FirebaseMessaging _fcm;
  final _subs = <StreamSubscription<RemoteMessage>>[];

  Future<void> start({
    required void Function(String link) onOpen,
    required void Function(String title, String? body, String? link) onForeground,
  }) async {
    void open(RemoteMessage m) {
      final link = linkOf(m.data);
      if (link != null) onOpen(link);
    }

    _subs
      ..add(FirebaseMessaging.onMessageOpenedApp.listen(open))
      ..add(FirebaseMessaging.onMessage.listen((m) {
        final n = m.notification;
        if (n?.title != null) onForeground(n!.title!, n.body, linkOf(m.data));
      }));
    try {
      // Android 13+ asks the student once; older versions allow by default.
      await _fcm.requestPermission();
      await _fcm.subscribeToTopic(C.pushTopic);
      final first = await _fcm.getInitialMessage();   // the tap that launched the app
      if (first != null) open(first);
    } catch (e) {
      // No Google Play services, offline at first start...: the app works without push.
      debugPrint('push notifications unavailable: $e');
    }
  }

  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
  }

  /// The in-app path a notification points at (`/campus/notice/<id>`...), or null.
  static String? linkOf(Map<String, dynamic> data) {
    final link = data['link'];
    return link is String && link.startsWith('/campus/') ? link : null;
  }
}
