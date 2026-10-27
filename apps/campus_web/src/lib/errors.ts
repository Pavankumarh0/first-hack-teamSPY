import { FirebaseNotConfigured } from './firebase/client';

/** A sentence a student or administrator can act on, from any thrown error. */
export function friendlyError(err: unknown): string {
  if (err instanceof FirebaseNotConfigured) return 'This site is not connected to Firebase yet. See the setup notice at the top of the page.';
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Incorrect username or password.';
    case 'auth/user-disabled':
      return 'This account is suspended. Contact the college office.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/requires-recent-login':
      return 'For your security, sign in again and retry.';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'Cannot reach the campus service. Check your internet connection.';
    case 'permission-denied':
      return 'You do not have permission for this. If you just signed in, wait a moment and retry.';
    case 'failed-precondition':
      return 'The database needs an index for this query. An administrator should deploy firebase/firestore.indexes.json.';
    case 'not-found':
      return 'That item no longer exists.';
    case 'storage/unauthorized':
      return 'The photo could not be uploaded: it must be an image under 5 MB.';
    case 'storage/canceled':
      return 'The upload was cancelled.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
