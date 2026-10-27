// Admin SDK set-up shared by the scripts.
//
//   --emulator        use the local emulators (defaults 127.0.0.1:8080 / :9099 / :9199)
//   --project <id>    use a real project with Application Default Credentials:
//                     `gcloud auth application-default login`, or
//                     GOOGLE_APPLICATION_CREDENTIALS=<service-account.json> kept
//                     outside the repository.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
}

export function initAdmin() {
  const useEmulator = arg('emulator') === true || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (useEmulator) {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';
  }
  const projectId = arg('project') !== undefined && arg('project') !== true
    ? arg('project')
    : process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || (useEmulator ? 'demo-campus-mithra' : undefined);
  if (!projectId) {
    console.error('No project. Pass --emulator for the local emulators, or --project <your-project-id>.');
    process.exit(2);
  }
  initializeApp(useEmulator ? { projectId } : { projectId, credential: applicationDefault() });
  return { auth: getAuth(), db: getFirestore(), projectId, useEmulator };
}
