// Username accounts on top of Firebase Authentication, for the admin scripts.
// apps/campus_web/src/lib/server/accounts.ts is the same flow for the website's
// API routes. Keep them in step.
//
// Firebase Auth has no username provider. Each username maps to an internal
// sign-in identifier "<username>@users.campus-mithra.invalid" (.invalid is a
// reserved top-level domain: nothing is ever sent there). Students never see
// it; they type their username and the apps derive it. Firebase Auth stores
// and checks the password; nothing here stores or logs one.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FieldValue } from 'firebase-admin/firestore';

const here = dirname(fileURLToPath(import.meta.url));
export const C = JSON.parse(readFileSync(join(here, '..', '..', 'schema', 'constants.json'), 'utf8'));

const USERNAME_RE = new RegExp(C.username.pattern);

export function normalizeUsername(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/** Returns an error message, or null when the username is acceptable. */
export function usernameProblem(username) {
  if (username.length < C.username.minLength || username.length > C.username.maxLength)
    return `Usernames are ${C.username.minLength}-${C.username.maxLength} characters long.`;
  if (!USERNAME_RE.test(username))
    return 'Use lowercase letters, digits, dots and underscores, starting with a letter.';
  if (/[._]{2}/.test(username) || /[._]$/.test(username))
    return 'Dots and underscores cannot be doubled or end the username.';
  if (C.username.reserved.includes(username)) return 'That username is reserved.';
  return null;
}

export function identityFor(username) {
  return `${username}@${C.identityDomain}`;
}

/**
 * Creates the auth account, the username reservation and the profile, and
 * sets the role claims. Undoes the reservation if the auth account fails.
 */
export async function createAccount({ auth, db }, { username, password, displayName, role = 'student', department = '', year = null, createdBy = 'script' }) {
  const name = normalizeUsername(username);
  const problem = usernameProblem(name);
  if (problem) throw new Error(problem);
  if (!C.roles.includes(role)) throw new Error(`Unknown role ${role}`);
  if (typeof password !== 'string' || password.length < C.passwordMinLength)
    throw new Error(`Passwords need at least ${C.passwordMinLength} characters.`);

  const reservation = db.collection('usernames').doc(name);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(reservation)).exists) throw new Error(`The username "${name}" is taken.`);
    tx.create(reservation, { uid: null, reservedAt: FieldValue.serverTimestamp() });
  });

  let user;
  try {
    user = await auth.createUser({ email: identityFor(name), password, displayName: displayName || name });
  } catch (err) {
    await reservation.delete();
    if (String(err?.code).includes('email-already-exists'))
      throw new Error(`A sign-in account ${identityFor(name)} already exists in Firebase Authentication, but Firestore has no ` +
        'record of it (was Firestore cleared?). Delete that user in Firebase console > Authentication > Users, then run this again.');
    throw err;
  }
  try {
    await auth.setCustomUserClaims(user.uid, { role, active: true });
    const now = FieldValue.serverTimestamp();
    await db.batch()
      .set(reservation, { uid: user.uid, reservedAt: now })
      .set(db.collection('users').doc(user.uid), {
        username: name,
        displayName: displayName || name,
        role,
        status: 'active',
        department,
        year,
        bio: '',
        createdBy,
        createdAt: now,
        updatedAt: now,
      })
      .commit();
  } catch (err) {
    // Undo, so a failed attempt does not leave the name blocked.
    await auth.deleteUser(user.uid).catch(() => {});
    await reservation.delete().catch(() => {});
    throw err;
  }
  return user.uid;
}
