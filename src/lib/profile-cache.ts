import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { Profile } from './types';

const CACHE_KEY = '@proteinquest/profile-cache';

type CachedProfile = { userId: string; profile: Profile };

async function readRaw(): Promise<CachedProfile | null> {
  try {
    const raw =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.localStorage.getItem(CACHE_KEY)
        : await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedProfile;
  } catch {
    return null;
  }
}

async function writeRaw(entry: CachedProfile): Promise<void> {
  const raw = JSON.stringify(entry);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.setItem(CACHE_KEY, raw);
    return;
  }
  await AsyncStorage.setItem(CACHE_KEY, raw);
}

export async function loadCachedProfile(userId: string): Promise<Profile | null> {
  const entry = await readRaw();
  if (!entry || entry.userId !== userId) return null;
  return entry.profile;
}

/** Keep immutable fields (e.g. created_at) when a partial profile update is cached. */
export function mergeProfiles(
  existing: Profile | null | undefined,
  incoming: Profile,
): Profile {
  if (!existing || existing.id !== incoming.id) return incoming;
  if (existing.created_at && !incoming.created_at) {
    return { ...incoming, created_at: existing.created_at };
  }
  return incoming;
}

export async function saveCachedProfile(profile: Profile): Promise<void> {
  const entry = await readRaw();
  const merged =
    entry?.userId === profile.id ? mergeProfiles(entry.profile, profile) : profile;
  await writeRaw({ userId: merged.id, profile: merged });
}

export async function clearCachedProfile(): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.localStorage.removeItem(CACHE_KEY);
    return;
  }
  await AsyncStorage.removeItem(CACHE_KEY);
}
