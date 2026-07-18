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

/**
 * Trainer rank ladder — derived from account level (sum of all dragon XP).
 * Each step unlocks at minLevel; levels between steps keep the previous title.
 */
const RANK_STEPS: { name: string; tier: string; minLevel: number }[] = [
  { name: 'Rookie', tier: 'I', minLevel: 1 },
  { name: 'Rookie', tier: 'II', minLevel: 2 },
  { name: 'Rookie', tier: 'III', minLevel: 3 },
  { name: 'Bronze', tier: 'I', minLevel: 6 },
  { name: 'Bronze', tier: 'II', minLevel: 10 },
  { name: 'Silver', tier: 'I', minLevel: 15 },
  { name: 'Silver', tier: 'II', minLevel: 20 },
  { name: 'Gold', tier: 'I', minLevel: 26 },
  { name: 'Gold', tier: 'II', minLevel: 32 },
  { name: 'Champion', tier: '', minLevel: 37 },
  { name: 'Dragon Lord', tier: '', minLevel: 41 },
  { name: 'Legend', tier: '', minLevel: 44 },
];

export function rankForLevel(level: number): Rank {
  let step = RANK_STEPS[0];
  for (const s of RANK_STEPS) {
    if (level >= s.minLevel) step = s;
  }
  const label = step.tier ? `${step.name} ${step.tier}` : step.name;
  return { name: step.name, tier: step.tier, label };
}

/** Reference table for UI / docs — level threshold per rank title. */
export function rankTierTable(): { label: string; minLevel: number; minXp: number }[] {
  return RANK_STEPS.map((s) => ({
    label: s.tier ? `${s.name} ${s.tier}` : s.name,
    minLevel: s.minLevel,
    minXp: xpForLevel(s.minLevel),
  }));
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
