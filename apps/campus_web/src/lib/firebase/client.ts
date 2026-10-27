import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfigured, missingFirebaseVars, publicEnv } from '../env';

export class FirebaseNotConfigured extends Error {
  constructor() {
    super(`Firebase is not configured. Missing: ${missingFirebaseVars.join(', ')}`);
  }
}

interface Services {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let services: Services | null = null;

/** The browser-side Firebase services, created once. */
export function fb(): Services {
  if (!firebaseConfigured) throw new FirebaseNotConfigured();
  if (services) return services;
  const app = getApps()[0] ?? initializeApp(publicEnv.firebase);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  if (publicEnv.useEmulators) {
    const host = publicEnv.emulatorHost;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectStorageEmulator(storage, host, 9199);
  }
  services = { app, auth, db, storage };
  return services;
}
