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

const MOCK_ROWS: SeedRow[] = [
  { id: 'm01', handle: 'liftswithlena', displayName: 'Lena', xp: 41280 },
  { id: 'm02', handle: 'marcus.dl', displayName: 'Marcus', xp: 38950 },
  { id: 'm03', handle: 'proteinpriya', displayName: 'Priya', xp: 33410 },
  { id: 'm04', handle: 'tomgets1g', displayName: 'Tom', xp: 27860 },
  { id: 'm05', handle: 'aishalifts', displayName: 'Aisha', xp: 21540 },
  { id: 'm06', handle: 'dan_the_scan', displayName: 'Dan', xp: 16720 },
  { id: 'm07', handle: 'sofia.fuel', displayName: 'Sofia', xp: 11890 },
  { id: 'm08', handle: 'jakob.bulk', displayName: 'Jakob', xp: 8340 },
  { id: 'm09', handle: 'em_eats_eggs', displayName: 'Em', xp: 5120 },
  { id: 'm10', handle: 'ryu.gainz', displayName: 'Ryu', xp: 2980 },
  { id: 'm11', handle: 'chloe.cuts', displayName: 'Chloe', xp: 1460 },
  { id: 'm12', handle: 'firstrep.felix', displayName: 'Felix', xp: 410 },
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
