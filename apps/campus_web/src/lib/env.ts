// Public configuration. Everything here is compiled into the browser bundle,
// so it holds only values meant to be public: the Firebase web config is an
// identifier, not a secret - access control is done by the security rules.
// Server-only settings live in lib/server/config.ts.

const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

// With the local emulators no real project is involved; these stand-ins are
// what the emulators expect (a "demo-" project id never reaches Google).
const emulatorDefaults = {
  apiKey: 'emulator-api-key',
  authDomain: 'localhost',
  projectId: 'demo-campus-mithra',
  storageBucket: 'demo-campus-mithra.appspot.com',
  messagingSenderId: '0',
  appId: 'emulator-app-id',
};

const firebase = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (useEmulators ? emulatorDefaults.apiKey : ''),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (useEmulators ? emulatorDefaults.authDomain : ''),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (useEmulators ? emulatorDefaults.projectId : ''),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || (useEmulators ? emulatorDefaults.storageBucket : ''),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || (useEmulators ? emulatorDefaults.messagingSenderId : ''),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (useEmulators ? emulatorDefaults.appId : ''),
};

const REQUIRED: [keyof typeof firebase, string][] = [
  ['apiKey', 'NEXT_PUBLIC_FIREBASE_API_KEY'],
  ['authDomain', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'],
  ['projectId', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'],
  ['storageBucket', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'],
  ['messagingSenderId', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'],
  ['appId', 'NEXT_PUBLIC_FIREBASE_APP_ID'],
];

export const publicEnv = {
  firebase,
  useEmulators,
  emulatorHost: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || '127.0.0.1',
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  collegeName: process.env.NEXT_PUBLIC_COLLEGE_NAME || 'Sri Venkateshwara Institute of Technology',
  playStoreUrl: process.env.NEXT_PUBLIC_ANDROID_STORE_URL || '',
  appStoreUrl: process.env.NEXT_PUBLIC_IOS_STORE_URL || '',
  // Google Maps (satellite view + live directions). A browser key: restrict it
  // to your site's domain in Google Cloud. Without it the drawn plan is used.
  googleMapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  // Advanced markers need a Map ID; Google's DEMO_MAP_ID works for development.
  googleMapsMapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};

export const missingFirebaseVars: string[] = REQUIRED.filter(([k]) => !firebase[k]).map(([, name]) => name);
export const firebaseConfigured = missingFirebaseVars.length === 0;
