import assert from 'node:assert/strict';
import test from 'node:test';

import { reconcileLeaderboardIdentity } from './leaderboard-identity.ts';
import type { LeaderboardRow } from './leaderboard.ts';

const YOU_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';

function row(
  userId: string,
  displayName: string,
  avatarUrl: string | null,
  xp: number,
): LeaderboardRow {
  return {
    user_id: userId,
    display_name: displayName,
    avatar_url: avatarUrl,
    xp,
    dragon_progress: null,
    active_dragon_id: null,
    daily_dragon_id: null,
    daily_dragon_date: null,
  };
}

test('current profile identity replaces stale leaderboard fields on the podium', () => {
  const entries = reconcileLeaderboardIdentity(
    [row(YOU_ID, 'Old name', 'https://old.example/avatar.jpg', 900)],
    YOU_ID,
    {
      id: YOU_ID,
      display_name: 'New profile name',
      avatar_url: 'https://new.example/avatar.jpg',
    },
  );

  assert.equal(entries[0].display_name, 'New profile name');
  assert.equal(entries[0].avatar_url, 'https://new.example/avatar.jpg');
});

test('current profile identity replaces stale fields in a ranked row', () => {
  const entries = reconcileLeaderboardIdentity(
    [
      row(OTHER_ID, 'Champion', null, 1200),
      row(YOU_ID, 'Old name', null, 700),
    ],
    YOU_ID,
    {
      id: YOU_ID,
      display_name: 'Updated row name',
      avatar_url: 'https://new.example/row-avatar.jpg',
    },
  );
  const you = entries.find((entry) => entry.user_id === YOU_ID);

  assert.equal(you?.display_name, 'Updated row name');
  assert.equal(you?.avatar_url, 'https://new.example/row-avatar.jpg');
});
