/// App configuration, passed at build time with --dart-define-from-file
/// (see .env.example). Nothing here is a secret: the Firebase options
/// identify the project, and the security rules decide who may do what.
/// No Firebase Admin credential ever ships in the app.
class AppConfig {
  const AppConfig({
    required this.apiKey,
    required this.appId,
    required this.messagingSenderId,
    required this.projectId,
    required this.storageBucket,
    required this.authDomain,
    required this.iosBundleId,
    required this.siteUrl,
    required this.useEmulators,
    required this.emulatorHost,
  });

  final String apiKey;
  final String appId;
  final String messagingSenderId;
  final String projectId;
  final String storageBucket;
  final String authDomain;
  final String iosBundleId;

  /// The campus website: QR codes and deep links use it, and registration
  /// goes through its backend (/api/auth/register).
  final String siteUrl;
  final bool useEmulators;
  final String emulatorHost;

  static const _useEmulators = bool.fromEnvironment('USE_FIREBASE_EMULATORS');

  factory AppConfig.fromEnvironment() => AppConfig(
        apiKey: _or(const String.fromEnvironment('FIREBASE_API_KEY'), 'emulator-api-key'),
        appId: _or(const String.fromEnvironment('FIREBASE_APP_ID'), '1:0:android:emulator'),
        messagingSenderId: _or(const String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID'), '0'),
        projectId: _or(const String.fromEnvironment('FIREBASE_PROJECT_ID'), 'demo-campus-mithra'),
        storageBucket: _or(const String.fromEnvironment('FIREBASE_STORAGE_BUCKET'), 'demo-campus-mithra.appspot.com'),
        authDomain: const String.fromEnvironment('FIREBASE_AUTH_DOMAIN'),
        iosBundleId: const String.fromEnvironment('IOS_BUNDLE_ID', defaultValue: 'edu.campusmithra.student'),
        siteUrl: const String.fromEnvironment('CAMPUS_SITE_URL', defaultValue: 'http://localhost:3000').replaceAll(RegExp(r'/+$'), ''),
        useEmulators: _useEmulators,
        // 10.0.2.2 is the host machine as seen from the Android emulator.
        emulatorHost: const String.fromEnvironment('FIREBASE_EMULATOR_HOST', defaultValue: '10.0.2.2'),
      );

  /// With the emulators, stand-in values are fine: no real project is used.
  static String _or(String value, String emulatorDefault) =>
      value.isNotEmpty ? value : (_useEmulators ? emulatorDefault : '');

  /// Names of the settings that still need a value.
  List<String> get missing => [
        if (apiKey.isEmpty) 'FIREBASE_API_KEY',
        if (appId.isEmpty) 'FIREBASE_APP_ID',
        if (messagingSenderId.isEmpty) 'FIREBASE_MESSAGING_SENDER_ID',
        if (projectId.isEmpty) 'FIREBASE_PROJECT_ID',
        if (storageBucket.isEmpty) 'FIREBASE_STORAGE_BUCKET',
      ];

  bool get isConfigured => missing.isEmpty;
}

/// RFID attendance ("My attendance"): turned off for now. Build with
/// --dart-define=FEATURE_RFID_ATTENDANCE=true to bring it back.
const rfidAttendanceEnabled = bool.fromEnvironment('FEATURE_RFID_ATTENDANCE');

/// Google Maps (satellite view): on when GOOGLE_MAPS_API_KEY is in .env. The
/// native SDKs read their key from android/local.properties and
/// ios/Flutter/Secrets.xcconfig. Not used on the web build (tests only).
const googleMapsEnabled = String.fromEnvironment('GOOGLE_MAPS_API_KEY') != '' && !bool.fromEnvironment('dart.library.js_interop');
