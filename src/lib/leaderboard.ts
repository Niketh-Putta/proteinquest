import { levelForXp } from './character';
import { supabase } from './supabase';
import type { DragonId, DragonProgress, Profile } from './types';
import { rankForLevel, type Rank } from './xp';

export interface LeaderboardEntry {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  xp: number;
  level: number;
  rank: Rank;
  position: number;
  isYou: boolean;
  isBot?: boolean;
}

export interface FriendLeaderboardRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  invite_code: string | null;
  xp: number;
  dragon_progress: Partial<Record<DragonId, DragonProgress>> | null;
  active_dragon_id: DragonId | null;
  daily_dragon_id: DragonId | null;
  daily_dragon_date: string | null;
}

export interface InviteAcceptResult {
  status: 'accepted' | 'self';
  friend_id?: string;
  display_name?: string;
}

function totalFriendXp(row: FriendLeaderboardRow): number {
  const dragonTotal = Object.values(row.dragon_progress ?? {}).reduce(
    (sum, progress) => sum + Math.max(0, Number(progress?.xp ?? 0)),
    0,
  );
  return dragonTotal > 0 ? dragonTotal : Math.max(0, Number(row.xp ?? 0));
}

function handleFromName(name: string, fallback: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 14);
  return clean || fallback;
}

function toEntry(
  row: FriendLeaderboardRow,
  currentUserId: string | null | undefined,
): Omit<LeaderboardEntry, 'position'> {
  const isYou = row.user_id === currentUserId;
  const displayName = row.display_name?.trim() || (isYou ? 'You' : 'ProteinQuest player');
  const xp = totalFriendXp(row);
  const level = levelForXp(xp);
  return {
    id: row.user_id,
    handle: isYou ? 'you' : handleFromName(displayName, row.user_id.slice(0, 6)),
    displayName,
    avatarUrl: row.avatar_url?.trim() || null,
    xp,
    level,
    rank: rankForLevel(level),
    isYou,
  };
}

function botEntry({
  id,
  handle,
  displayName,
  xp,
}: {
  id: string;
  handle: string;
  displayName: string;
  xp: number;
}): Omit<LeaderboardEntry, 'position'> {
  const level = levelForXp(xp);
  return {
    id,
    handle,
    displayName,
    avatarUrl: null,
    xp,
    level,
    rank: rankForLevel(level),
    isYou: false,
    isBot: true,
  };
}

export function buildLeaderboard(
  rows: FriendLeaderboardRow[],
  currentUserId: string | null | undefined,
): LeaderboardEntry[] {
  const entries = rows.map((row) => toEntry(row, currentUserId));
  const hasYou = entries.some((entry) => entry.isYou);
  if (!hasYou && currentUserId) {
    entries.push(
      toEntry(
        {
          user_id: currentUserId,
          display_name: 'You',
          avatar_url: null,
          invite_code: null,
          xp: 0,
          dragon_progress: {},
          active_dragon_id: null,
          daily_dragon_id: null,
          daily_dragon_date: null,
        },
        currentUserId,
      ),
    );
  }
  const youXp = entries.find((entry) => entry.isYou)?.xp ?? 0;
  const floor = Math.max(900, youXp);
  entries.push(
    botEntry({
      id: 'bot-ember',
      handle: 'ember.ai',
      displayName: 'Ember AI',
      xp: Math.max(63000, floor + 1800),
    }),
    botEntry({
      id: 'bot-onyx',
      handle: 'onyx.ai',
      displayName: 'Onyx AI',
      xp: Math.max(57000, floor + 900),
    }),
  );

  const rowsSorted = entries;
  rowsSorted.sort((a, b) => b.xp - a.xp);
  return rowsSorted.map((r, i) => ({ ...r, position: i + 1 }));
}

export async function fetchFriendLeaderboard(): Promise<FriendLeaderboardRow[]> {
  const { data, error } = await supabase.rpc('friend_leaderboard');
  if (error) throw error;
  return (data ?? []) as FriendLeaderboardRow[];
}

export async function acceptFriendInvite(inviteCode: string): Promise<InviteAcceptResult> {
  const { data, error } = await supabase.rpc('accept_friend_invite', {
    invite: inviteCode,
  });
  if (error) throw error;
  return data as InviteAcceptResult;
}

export async function removeFriend(friendId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { friend: friendId });
  if (error) throw error;
}

export function inviteUrl(profile: Profile | null | undefined, origin: string): string | null {
  const code = profile?.invite_code?.trim();
  if (!code) return null;
  return `${origin.replace(/\/$/, '')}/?invite=${encodeURIComponent(code)}`;
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
