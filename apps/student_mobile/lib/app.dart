import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'app_scope.dart';
import 'core/config.dart';
import 'core/deep_links.dart';
import 'core/push.dart';
import 'data/repository.dart';
import 'data/session.dart';
import 'router.dart';
import 'ui/theme.dart';

class CampusApp extends StatefulWidget {
  const CampusApp({super.key, required this.config, required this.session, required this.repo, this.links, this.push});
  final AppConfig config;
  final Session session;
  final CampusRepository repo;

  /// Incoming App Links / Universal Links / campusmithra:// links.
  final AppLinks? links;

  /// Campus-wide push notifications; null on the web and with the emulators.
  final CampusPush? push;

  @override
  State<CampusApp> createState() => _CampusAppState();
}

class _CampusAppState extends State<CampusApp> {
  late final GoRouter _router = buildRouter();
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    // app_links reports the link that opened the app and every later one.
    _linkSub = widget.links?.uriLinkStream.listen(_openLink);
    widget.push?.start(onOpen: _openPushLink, onForeground: _showPush);
  }

  // A notification's link is a site path; it opens like the same QR code would.
  void _openPushLink(String path) => _openLink(Uri.parse('${widget.config.siteUrl}$path'));

  void _showPush(String title, String? body, String? link) {
    _messenger.currentState?.showSnackBar(SnackBar(
      content: Text(body == null || body.isEmpty ? title : '$title\n$body', maxLines: 3, overflow: TextOverflow.ellipsis),
      duration: const Duration(seconds: 6),
      action: link == null ? null : SnackBarAction(label: 'Open', onPressed: () => _openPushLink(link)),
    ));
  }

  void _openLink(Uri uri) {
    final link = parseCampusUri(uri, siteHost: Uri.parse(widget.config.siteUrl).host);
    if (link == null) {
      _messenger.currentState?.showSnackBar(const SnackBar(content: Text('That link is not a Campus Mithra destination.')));
      _router.go('/');
      return;
    }
    // A campus link can arrive while its destination is already somewhere in
    // the imperative route stack. Replace the location so repeated QR/app
    // links cannot add duplicate Navigator pages with the same route key.
    _router.go(link.appRoute);
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    widget.push?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppScope(
        config: widget.config,
        session: widget.session,
        repo: widget.repo,
        child: MaterialApp.router(
          title: 'Oxford College | Campus Mithra',
          debugShowCheckedModeBanner: false,
          theme: campusTheme(),
          scaffoldMessengerKey: _messenger,
          routerConfig: _router,
        ),
      );
}
