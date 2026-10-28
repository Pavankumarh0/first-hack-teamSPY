'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { Button, Notice } from './ui';

/**
 * Shown when the browser is signed in but the account's profile is missing
 * or unreadable, so the person is never stuck without a way to sign out.
 */
export function BrokenSession() {
  const { user, profileStatus, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const name = user?.email?.split('@')[0] ?? 'this account';
  return (
    <Notice tone="amber">
      <p>
        You are signed in as <strong>{name}</strong>, but{' '}
        {profileStatus === 'error'
          ? 'its profile could not be read. If you run this site, check that the Firestore rules are deployed (cd firebase, npm run deploy:rules).'
          : 'this account has no profile in the database. It was probably created before the database was reset, or registration did not finish.'}
        {' '}Sign out, then sign in or create the account again.
      </p>
      <div className="mt-3">
        <Button variant="secondary" size="sm" busy={busy} onClick={async () => { setBusy(true); await signOut(); setBusy(false); }}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </Notice>
  );
}
