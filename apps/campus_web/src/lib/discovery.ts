'use client';

import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { fb } from './firebase/client';

export const INTERESTS = ['coding', 'gaming', 'music', 'photography', 'sports', 'entrepreneurship', 'design', 'robotics', 'volunteering', 'other'] as const;
export type Interest = typeof INTERESTS[number];

export interface DiscoveryProfile {
  id: string;
  alias: string;
  blurb: string;
  interests: Interest[];
  clubIds: string[];
  openToTeams: boolean;
  discoverable: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export type DiscoveryDraft = Omit<DiscoveryProfile, 'id' | 'createdAt' | 'updatedAt'>;

export async function ownDiscoveryProfile(uid: string): Promise<DiscoveryProfile | null> {
  const snap = await getDoc(doc(fb().db, `studentDiscovery/${uid}`));
  return snap.exists() ? { id: snap.id, ...snap.data() } as DiscoveryProfile : null;
}

/** Only explicit opt-ins are queried; student account records are never read for discovery. */
export async function discoverableProfiles(): Promise<DiscoveryProfile[]> {
  const snap = await getDocs(query(collection(fb().db, 'studentDiscovery'), where('discoverable', '==', true), limit(100)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DiscoveryProfile);
}

export async function saveDiscoveryProfile(uid: string, draft: DiscoveryDraft, previous: DiscoveryProfile | null) {
  const ref = doc(fb().db, `studentDiscovery/${uid}`);
  const existing = previous ?? await ownDiscoveryProfile(uid);
  await setDoc(ref, {
    alias: draft.alias.trim(),
    blurb: draft.blurb.trim(),
    interests: draft.interests,
    clubIds: draft.clubIds,
    openToTeams: draft.openToTeams,
    discoverable: draft.discoverable,
    createdAt: existing?.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

