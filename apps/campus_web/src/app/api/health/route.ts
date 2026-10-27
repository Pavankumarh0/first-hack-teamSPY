import { firebaseConfigured, missingFirebaseVars, publicEnv } from '@/lib/env';
import { serverEnv } from '@/lib/server/config';
import { json } from '@/lib/server/http';

// What is configured - never the values themselves.
export async function GET() {
  return json({
    ok: true,
    firebaseWebConfig: firebaseConfigured ? 'ok' : { missing: missingFirebaseVars },
    adminBackend: serverEnv.adminProjectId ? 'project set' : 'FIREBASE_ADMIN_PROJECT_ID missing',
    emulators: publicEnv.useEmulators,
    registrationMode: serverEnv.registrationMode,
    appLinks: {
      android: serverEnv.androidPackage && serverEnv.androidCertFingerprints.length ? 'configured' : 'not configured',
      ios: serverEnv.appleTeamId && serverEnv.iosBundleId ? 'configured' : 'not configured',
    },
    rfidAttendance: 'pending hardware',
  });
}
