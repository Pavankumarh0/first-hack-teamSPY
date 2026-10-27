import { C } from './constants';

// Username sign-in on Firebase Authentication.
//
// Firebase Auth has no username provider. A username maps to the internal
// sign-in identifier "<username>@users.campus-mithra.invalid" (.invalid is a
// reserved top-level domain, so nothing is ever delivered to it). Students
// only ever see and type their username; Firebase Auth stores and verifies
// the password. firebase/scripts/lib/accounts.mjs uses the same mapping.

const PATTERN = new RegExp(C.username.pattern);

export function normalizeUsername(raw: string): string {
  return (raw ?? '').trim().toLowerCase();
}

/** A message for the user, or null when the username is acceptable. */
export function usernameProblem(username: string): string | null {
  if (username.length < C.username.minLength || username.length > C.username.maxLength)
    return `Usernames are ${C.username.minLength}-${C.username.maxLength} characters long.`;
  if (!PATTERN.test(username)) return 'Use lowercase letters, digits, dots and underscores, starting with a letter.';
  if (/[._]{2}/.test(username) || /[._]$/.test(username))
    return 'Dots and underscores cannot be doubled or end the username.';
  if (C.username.reserved.includes(username)) return 'That username is reserved.';
  return null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < C.passwordMinLength) return `Use at least ${C.passwordMinLength} characters.`;
  if (password.length > 128) return 'That password is too long.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use letters and at least one digit.';
  return null;
}

export function identityFor(username: string): string {
  return `${normalizeUsername(username)}@${C.identityDomain}`;
}

/** The username back from an internal identifier, for display. */
export function usernameFromIdentity(identity: string | null | undefined): string | null {
  if (!identity) return null;
  const suffix = `@${C.identityDomain}`;
  return identity.endsWith(suffix) ? identity.slice(0, -suffix.length) : null;
}
