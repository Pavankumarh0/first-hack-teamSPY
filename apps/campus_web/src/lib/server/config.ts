import 'server-only';

// Server-only settings. None of these are sent to the browser.
export const serverEnv = {
  // Firebase Admin uses Application Default Credentials: on Google Cloud /
  // Firebase App Hosting the runtime service account, locally
  // `gcloud auth application-default login` or GOOGLE_APPLICATION_CREDENTIALS
  // pointing at a key file kept OUTSIDE the repository.
  adminProjectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  // Hosts without Google credentials (Vercel): the service account's
  // client_email and private_key, set as encrypted environment variables in
  // the host's dashboard, never in a file. Env UIs often store the key's
  // newlines as "\n", so those are turned back into newlines.
  adminClientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '',
  adminPrivateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  useEmulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true',

  // open    anyone can create a student account from /register
  // invite  registration needs REGISTRATION_INVITE_CODE (shared on campus)
  // closed  only administrators create accounts
  registrationMode: (process.env.REGISTRATION_MODE || 'invite') as 'open' | 'invite' | 'closed',
  registrationInviteCode: process.env.REGISTRATION_INVITE_CODE || '',

  // Secret for hashing RFID card UIDs (future attendance). 32+ random bytes.
  rfidUidSecret: process.env.RFID_UID_HMAC_SECRET || '',

  // Mobile app identity for /.well-known association files.
  androidPackage: process.env.ANDROID_APP_PACKAGE || '',
  androidCertFingerprints: (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  appleTeamId: process.env.APPLE_TEAM_ID || '',
  iosBundleId: process.env.IOS_BUNDLE_ID || '',
};
