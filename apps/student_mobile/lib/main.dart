import 'package:app_links/app_links.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'core/config.dart';
import 'core/push.dart';
import 'data/repository.dart';
import 'data/session.dart';
import 'firebase_options.dart';
import 'screens/setup_screen.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();

  final options = firebaseOptionsFor(config);
  // No Firebase settings: explain what is missing instead of crashing.
  if (options == null) {
    runApp(MaterialApp(theme: campusTheme(), debugShowCheckedModeBanner: false, home: SetupScreen(missing: config.missing)));
    return;
  }

  await Firebase.initializeApp(options: options);
  final auth = FirebaseAuth.instance;
  final db = FirebaseFirestore.instance;
  final storage = FirebaseStorage.instance;
  if (config.useEmulators) {
    final host = kIsWeb ? 'localhost' : config.emulatorHost;
    await auth.useAuthEmulator(host, 9099);
    db.useFirestoreEmulator(host, 8080);
    await storage.useStorageEmulator(host, 9199);
  }

  runApp(CampusApp(
    config: config,
    session: FirebaseSession(auth, db, siteUrl: config.siteUrl),
    repo: CampusRepository(db, storage),
    links: kIsWeb ? null : AppLinks(),
    // FCM needs the real project (not the emulators) and a phone, not the web build.
    push: kIsWeb || config.useEmulators ? null : CampusPush(FirebaseMessaging.instance),
  ));
}

/// Which Firebase project to use: the emulators' stand-in project when
/// USE_FIREBASE_EMULATORS is set; otherwise lib/firebase_options.dart from
/// `flutterfire configure`; otherwise the FIREBASE_* values in .env.
FirebaseOptions? firebaseOptionsFor(AppConfig config) {
  if (!config.useEmulators) {
    try {
      return DefaultFirebaseOptions.currentPlatform;
    } on UnsupportedError {
      // Placeholder file, or this platform was not configured: try .env.
    }
  }
  if (!config.isConfigured) return null;
  return FirebaseOptions(
    apiKey: config.apiKey,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    authDomain: config.authDomain.isEmpty ? null : config.authDomain,
    iosBundleId: config.iosBundleId,
  );
}
