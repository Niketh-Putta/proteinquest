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

/** Keep immutable fields (e.g. created_at) when a partial profile update is cached.
 * Also never let a stale network refresh wipe today's dragon lock. */
export function mergeProfiles(
  existing: Profile | null | undefined,
  incoming: Profile,
): Profile {
  if (!existing || existing.id !== incoming.id) return incoming;

  // Spread existing first so partial applies (lock-in) never drop other fields.
  let merged: Profile = { ...existing, ...incoming };
  if (existing.created_at && !incoming.created_at) {
    merged = { ...merged, created_at: existing.created_at };
  }

  const existingLockDate = normalizeDailyDate(existing.daily_dragon_date);
  const incomingLockDate = normalizeDailyDate(incoming.daily_dragon_date);
  const existingLockId = existing.daily_dragon_id;
  const incomingLockId = incoming.daily_dragon_id;

  // Prefer the newer daily lock. A background profile refresh that started before
  // "Lock in for today" must not send the user back to the picker.
  if (existingLockDate && existingLockId) {
    const incomingOlderOrMissing =
      !incomingLockDate ||
      incomingLockDate < existingLockDate ||
      (incomingLockDate === existingLockDate && !incomingLockId);
    if (incomingOlderOrMissing) {
      merged = {
        ...merged,
        daily_dragon_date: existingLockDate,
        daily_dragon_id: existingLockId,
        active_dragon_id: existing.active_dragon_id ?? merged.active_dragon_id,
      };
    }
  }

  return merged;
}

function normalizeDailyDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
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
