import { missingFirebaseVars } from '@/lib/env';

/** Shown instead of a crash when the Firebase web config is missing. */
export function SetupRequired() {
  return (
    <div className="border-b border-amber-300 bg-amber-50">
      <div className="mx-auto max-w-6xl px-4 py-4 text-sm text-amber-900">
        <p className="font-semibold">Campus Mithra is not connected to Firebase yet.</p>
        <p className="mt-1">
          Copy <code className="rounded bg-amber-100 px-1">apps/campus_web/.env.example</code> to{' '}
          <code className="rounded bg-amber-100 px-1">.env.local</code>, fill in your Firebase web app settings, and restart{' '}
          <code className="rounded bg-amber-100 px-1">npm run dev</code>. Missing:
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {missingFirebaseVars.map((v) => <li key={v}><code className="rounded bg-amber-100 px-1.5 py-0.5">{v}</code></li>)}
        </ul>
        <p className="mt-2">
          For local development without a Firebase project, set{' '}
          <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true</code> and start the emulators
          (docs/FIREBASE_SETUP.md).
        </p>
      </div>
    </div>
  );
}
