import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminServices } from './admin';
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
    // A concurrent create of the same name fails the transaction.
    throw new HttpError(409, 'That username is taken. Try another.');
  }

  let uid: string;
  try {
    uid = (await auth.createUser({ email: identityFor(username), password: input.password, displayName: input.displayName })).uid;
  } catch (err) {
    await reservation.delete();
    const code = (err as { code?: string }).code ?? '';
    if (code.includes('email-already-exists')) throw new HttpError(409, 'That username is taken. Try another.');
    if (code.includes('invalid-password')) throw new HttpError(400, 'That password is not allowed.');
    throw err;
  }

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
  return uid;
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
