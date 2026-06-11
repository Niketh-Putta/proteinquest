import { levelForXp } from './character';
import { rankForLevel, totalXp, type Rank } from './xp';
import type { Profile } from './types';

/**
 * Local-only leaderboard. Shaped so a Supabase `leaderboard` table
 * (id uuid, handle text, display_name text, xp int) could replace
 * MOCK_ROWS later without touching the UI.
 */

export interface LeaderboardEntry {
  id: string;
  handle: string;
  displayName: string;
  xp: number;
  level: number;
  rank: Rank;
  position: number;
  isYou: boolean;
}

interface SeedRow {
  id: string;
  handle: string;
  displayName: string;
  xp: number;
}

/** Lifetime protein logged ≈ XP (1 XP per gram). */
const MOCK_ROWS: SeedRow[] = [
  { id: 'm01', handle: 'lena.k', displayName: 'Lena', xp: 41280 },
  { id: 'm02', handle: 'marcus', displayName: 'Marcus', xp: 38950 },
  { id: 'm03', handle: 'priya.r', displayName: 'Priya', xp: 33410 },
  { id: 'm04', handle: 'tom.h', displayName: 'Tom', xp: 27860 },
  { id: 'm05', handle: 'aisha', displayName: 'Aisha', xp: 21540 },
  { id: 'm06', handle: 'dan.m', displayName: 'Dan', xp: 16720 },
  { id: 'm07', handle: 'sofia', displayName: 'Sofia', xp: 11890 },
  { id: 'm08', handle: 'jakob', displayName: 'Jakob', xp: 8340 },
  { id: 'm09', handle: 'em', displayName: 'Em', xp: 5120 },
  { id: 'm10', handle: 'ryu', displayName: 'Ryu', xp: 2980 },
  { id: 'm11', handle: 'chloe', displayName: 'Chloe', xp: 1460 },
  { id: 'm12', handle: 'felix', displayName: 'Felix', xp: 410 },
];

function toEntry(row: SeedRow, isYou: boolean): Omit<LeaderboardEntry, 'position'> {
  const level = levelForXp(row.xp);
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    xp: row.xp,
    level,
    rank: rankForLevel(level),
    isYou,
  };
}

/** Mock users + the real player, sorted into true rank order. */
export function buildLeaderboard(
  profile: Profile | null | undefined,
  preferredName: string | null,
): LeaderboardEntry[] {
  const youXp = totalXp(profile);
  const you: SeedRow = {
    id: profile?.id ?? 'you',
    handle: 'you',
    displayName: preferredName ?? 'You',
    xp: youXp,
  };

  const rows = [...MOCK_ROWS.map((r) => toEntry(r, false)), toEntry(you, true)];
  rows.sort((a, b) => b.xp - a.xp);
  return rows.map((r, i) => ({ ...r, position: i + 1 }));
}

export function formatXp(xp: number): string {
  if (xp >= 10000) return `${(xp / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(xp));
}

/** Next player above you and how much XP separates you. */
export function climbTarget(entries: LeaderboardEntry[]): {
  target: LeaderboardEntry;
  xpGap: number;
} | null {
  const you = entries.find((e) => e.isYou);
  if (!you || you.position <= 1) return null;
  const target = entries.find((e) => e.position === you.position - 1);
  if (!target) return null;
  return { target, xpGap: Math.max(target.xp - you.xp + 1, 1) };
}

export function formatProteinGrams(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toFixed(1).replace(/\.0$/, '')}k g`;
  return `${Math.round(xp)} g`;
}
