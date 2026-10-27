import 'server-only';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { serverEnv } from './config';

export class BackendNotConfigured extends Error {
  constructor(detail: string) {
    super(`The server is not connected to Firebase: ${detail}. See docs/FIREBASE_SETUP.md.`);
  }
}

let cached: { app: App; auth: Auth; db: Firestore } | null = null;

/** Firebase Admin, for the trusted operations in the API routes only. */
export function adminServices() {
  if (cached) return cached;
  if (!serverEnv.adminProjectId) throw new BackendNotConfigured('FIREBASE_ADMIN_PROJECT_ID is not set');
  if (serverEnv.useEmulators) {
    const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1';
    process.env.FIRESTORE_EMULATOR_HOST ||= `${host}:8080`;
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= `${host}:9099`;
  }
  const app = getApps()[0] ?? initializeApp(
    serverEnv.useEmulators
      ? { projectId: serverEnv.adminProjectId }
      : { projectId: serverEnv.adminProjectId, credential: applicationDefault() },
  );
  cached = { app, auth: getAuth(app), db: getFirestore(app) };
  return cached;
}
