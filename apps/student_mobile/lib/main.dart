import 'package:app_links/app_links.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'app.dart';
import 'core/config.dart';
import 'data/repository.dart';
import 'data/session.dart';
import 'screens/setup_screen.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();

  // No Firebase settings: explain what is missing instead of crashing.
  if (!config.isConfigured) {
    runApp(MaterialApp(theme: campusTheme(), debugShowCheckedModeBanner: false, home: SetupScreen(missing: config.missing)));
    return;
  }

  await Firebase.initializeApp(
    options: FirebaseOptions(
      apiKey: config.apiKey,
      appId: config.appId,
      messagingSenderId: config.messagingSenderId,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      authDomain: config.authDomain.isEmpty ? null : config.authDomain,
      iosBundleId: config.iosBundleId,
    ),
  );
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
  ));
}
