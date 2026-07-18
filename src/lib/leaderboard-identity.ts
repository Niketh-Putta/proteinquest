import type { LeaderboardRow } from './leaderboard';
import type { Profile } from './types';

export function reconcileLeaderboardIdentity(
  rows: LeaderboardRow[],
  currentUserId: string | null | undefined,
  currentProfile?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null,
): LeaderboardRow[] {
  if (!currentUserId || currentProfile?.id !== currentUserId) return rows;
  return rows.map((row) =>
    row.user_id === currentUserId
      ? {
          ...row,
          display_name: currentProfile.display_name,
          avatar_url: currentProfile.avatar_url,
        }
      : row,
  );
}
