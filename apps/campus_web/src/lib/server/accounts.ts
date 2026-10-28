import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminServices, BackendNotConfigured } from './admin';
import { serverEnv } from './config';
import { HttpError } from './http';
import { identityFor, normalizeUsername, passwordProblem, usernameProblem } from '../username';
import type { Role } from '../constants';

// Same flow as firebase/scripts/lib/accounts.mjs. Passwords go straight to
// Firebase Auth; they are never stored, hashed or logged here.

export interface NewAccount {
  username: string;
  password: string;
  displayName: string;
  role: Role;
  department?: string;
  year?: number | null;
  createdBy: string;
}

export async function createAccount(input: NewAccount): Promise<string> {
  const { auth, db } = adminServices();
  const username = normalizeUsername(input.username);
  const problem = usernameProblem(username) ?? passwordProblem(input.password);
  if (problem) throw new HttpError(400, problem);

  const reservation = db.collection('usernames').doc(username);
  try {
    await db.runTransaction(async (tx) => {
      if ((await tx.get(reservation)).exists) throw new HttpError(409, 'That username is taken. Try another.');
      tx.create(reservation, { uid: null, reservedAt: FieldValue.serverTimestamp() });
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // ABORTED: a concurrent create of the same name won the transaction.
    if ((err as { code?: unknown }).code === 10) throw new HttpError(409, 'That username is taken. Try another.');
    throw setupError(err);
  }

  let uid: string;
  try {
    uid = (await auth.createUser({ email: identityFor(username), password: input.password, displayName: input.displayName })).uid;
  } catch (err) {
    await reservation.delete();
    const code = (err as { code?: string }).code ?? '';
    if (code.includes('email-already-exists')) {
      // No reservation but a sign-in account: usually left over after
      // Firestore was cleared. Only the operator can tell, so say it here.
      console.warn(`[accounts] "${username}" has a Firebase Auth account but no username reservation. ` +
        'If Firestore was reset, delete that user in Firebase console > Authentication.');
      throw new HttpError(409, 'That username is taken. Try another.');
    }
    if (code.includes('invalid-password')) throw new HttpError(400, 'That password is not allowed.');
    throw setupError(err);
  }

  try {
    await auth.setCustomUserClaims(uid, { role: input.role, active: true });
    const now = FieldValue.serverTimestamp();
    await db.batch()
      .set(reservation, { uid, reservedAt: now })
      .set(db.collection('users').doc(uid), {
        username,
        displayName: input.displayName,
        role: input.role,
        status: 'active',
        department: input.department ?? '',
        year: input.year ?? null,
        bio: '',
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .commit();
  } catch (err) {
    // Undo, so a failed attempt does not leave the name blocked.
    await auth.deleteUser(uid).catch(() => {});
    await reservation.delete().catch(() => {});
    throw setupError(err);
  }
  return uid;
}

/** Turns credential / project mistakes into a readable 503 instead of a bare 500. */
function setupError(err: unknown): unknown {
  const e = err as { code?: unknown; message?: string };
  const msg = e.message ?? '';
  if (/default credentials|credential|invalid_grant|refresh token/i.test(msg))
    return new BackendNotConfigured('no usable admin credentials (run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS)');
  if (e.code === 5 || /NOT_FOUND/.test(msg))
    return new BackendNotConfigured(`no Firestore database found in project "${serverEnv.adminProjectId}" (create it in Firebase console > Firestore)`);
  if (e.code === 7 || /PERMISSION_DENIED/.test(msg))
    return new BackendNotConfigured(`the admin credentials cannot use project "${serverEnv.adminProjectId}" (check FIREBASE_ADMIN_PROJECT_ID and the account's roles)`);
  return err;
}

/** Changes role and/or status, keeping claims, profile and auth in step. */
export async function updateAccount(uid: string, change: { role?: Role; status?: 'active' | 'suspended' }) {
  const { auth, db } = adminServices();
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'No such account.');
  const current = snap.data()!;
  const role = (change.role ?? current.role) as Role;
  const status = change.status ?? current.status;
  await auth.setCustomUserClaims(uid, { role, active: status === 'active' });
  await auth.updateUser(uid, { disabled: status !== 'active' });
  // Existing sessions pick up the new claims at their next refresh; a
  // suspension also ends them now.
  if (status !== 'active' || change.role) await auth.revokeRefreshTokens(uid);
  await ref.update({ role, status, updatedAt: FieldValue.serverTimestamp() });
  return { role, status };
}

/** Administrator-led recovery: there is no email to send a reset link to. */
export async function setPassword(uid: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(400, problem);
  const { auth } = adminServices();
  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
}
