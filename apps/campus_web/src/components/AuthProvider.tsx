'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  EmailAuthProvider, onIdTokenChanged, reauthenticateWithCredential, signInWithEmailAndPassword,
  signOut as fbSignOut, updatePassword, type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import { firebaseConfigured } from '@/lib/env';
import { identityFor, normalizeUsername, passwordProblem } from '@/lib/username';
import { fromDoc, type UserProfile } from '@/lib/data';
import type { Role } from '@/lib/constants';

type Status = 'unconfigured' | 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: User | null;
  role: Role | null;
  /** False for suspended accounts and for accounts the backend never set up. */
  active: boolean;
  profile: UserProfile | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  /** Fresh ID token for calling the backend API routes. */
  idToken: () => Promise<string>;
  isAdmin: boolean;
  isStaff: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(firebaseConfigured ? 'loading' : 'unconfigured');
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [active, setActive] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let stopProfile: (() => void) | null = null;
    const stop = onIdTokenChanged(fb().auth, async (u) => {
      stopProfile?.();
      stopProfile = null;
      setUser(u);
      if (!u) {
        setRole(null); setActive(false); setProfile(null); setStatus('signedOut');
        return;
      }
      const token = await u.getIdTokenResult();
      setRole((token.claims.role as Role) ?? null);
      setActive(token.claims.active === true);
      stopProfile = onSnapshot(doc(fb().db, `users/${u.uid}`),
        (snap) => setProfile(snap.exists() ? fromDoc<UserProfile>(snap) : null),
        () => setProfile(null));
      setStatus('signedIn');
    });
    return () => { stop(); stopProfile?.(); };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    // The username becomes the internal identifier; the UI never asks for an email.
    await signInWithEmailAndPassword(fb().auth, identityFor(normalizeUsername(username)), password);
  }, []);

  const signOut = useCallback(async () => { await fbSignOut(fb().auth); }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const u = fb().auth.currentUser;
    if (!u?.email) throw new Error('Sign in first.');
    const problem = passwordProblem(next);
    if (problem) throw new Error(problem);
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
    await updatePassword(u, next);
  }, []);

  const idToken = useCallback(async () => {
    const u = fb().auth.currentUser;
    if (!u) throw new Error('Sign in first.');
    return u.getIdToken();
  }, []);

  const value = useMemo<AuthState>(() => ({
    status, user, role, active, profile, signIn, signOut, changePassword, idToken,
    isAdmin: active && role === 'admin',
    isStaff: active && (role === 'staff' || role === 'admin'),
  }), [status, user, role, active, profile, signIn, signOut, changePassword, idToken]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Calls a backend API route with the signed-in user's ID token. */
export async function apiFetch<T>(idToken: () => Promise<string>, url: string, init: RequestInit = {}): Promise<T> {
  const token = await idToken();
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}
