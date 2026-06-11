import AsyncStorage from '@react-native-async-storage/async-storage';

import { levelForXp, xpForLevel } from './character';
import type { Profile } from './types';

/**
 * Player-level gamification on top of the existing dragon XP economy.
 *
 * XP sources (already applied when logs are saved — see character.ts):
 *   - 1 XP per gram of protein logged
 *   - +100 XP bonus each day the daily goal is hit
 *
 * Total XP is the sum across every dragon the player has trained, so
 * switching dragons never loses progress. Level uses the shared XP curve
 * from character.ts; rank names are derived from level.
 */

export interface Rank {
  name: string;
  /** Roman numeral tier within the rank band (I = just entered). */
  tier: string;
  /** e.g. "Silver II" */
  label: string;
}

export interface XpSnapshot {
  xp: number;
  level: number;
  rank: Rank;
  /** XP accumulated inside the current level. */
  xpIntoLevel: number;
  /** XP needed to go from current level to the next (0 at cap). */
  xpForNext: number;
  /** 0..1 progress through the current level. */
  levelPct: number;
}

/** Rank ladder — first level of each band. */
const RANK_BANDS: { name: string; minLevel: number }[] = [
  { name: 'Rookie', minLevel: 1 },
  { name: 'Iron', minLevel: 3 },
  { name: 'Bronze', minLevel: 6 },
  { name: 'Silver', minLevel: 10 },
  { name: 'Gold', minLevel: 15 },
  { name: 'Platinum', minLevel: 20 },
  { name: 'Diamond', minLevel: 26 },
  { name: 'Mythic', minLevel: 32 },
  { name: 'Legend', minLevel: 40 },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

export function rankForLevel(level: number): Rank {
  let band = RANK_BANDS[0];
  let next: { minLevel: number } | null = null;
  for (let i = 0; i < RANK_BANDS.length; i++) {
    if (level >= RANK_BANDS[i].minLevel) {
      band = RANK_BANDS[i];
      next = RANK_BANDS[i + 1] ?? null;
    }
  }
  const span = next ? next.minLevel - band.minLevel : 0;
  const idx = Math.min(Math.max(level - band.minLevel, 0), Math.max(span - 1, 0));
  const tier = span > 0 ? ROMAN[Math.min(idx, ROMAN.length - 1)] : '';
  const label = tier ? `${band.name} ${tier}` : band.name;
  return { name: band.name, tier, label };
}

/** Lifetime XP across all dragons (falls back to legacy flat fields). */
export function totalXp(profile: Profile | null | undefined): number {
  if (!profile) return 0;
  const progress = profile.dragon_progress;
  if (progress && Object.keys(progress).length > 0) {
    return Object.values(progress).reduce((sum, p) => sum + (p?.xp ?? 0), 0);
  }
  return profile.xp ?? 0;
}

export function xpSnapshot(profile: Profile | null | undefined): XpSnapshot {
  const xp = totalXp(profile);
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const xpForNext = Math.max(ceil - floor, 0);
  const xpIntoLevel = Math.max(xp - floor, 0);
  const levelPct = xpForNext > 0 ? Math.min(xpIntoLevel / xpForNext, 1) : 1;
  return { xp, level, rank: rankForLevel(level), xpIntoLevel, xpForNext, levelPct };
}

// --- Preferred name (local only; no profile column required) ---

const NAME_KEY = 'pq:preferred-name';

export async function getPreferredName(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(NAME_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function setPreferredName(name: string): Promise<void> {
  try {
    const trimmed = name.trim();
    if (!trimmed) return;
    await AsyncStorage.setItem(NAME_KEY, trimmed.slice(0, 24));
  } catch {
    // Non-fatal — name is cosmetic.
  }
}
