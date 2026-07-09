import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareVersions,
  decideUpdatePrompt,
  type AppVersionConfig,
} from './app-update-logic.ts';

const base: AppVersionConfig = {
  latest_version: '1.0.8',
  min_version: '1.0.0',
  ios_store_url: 'https://apps.apple.com/app/id6781790996',
  android_store_url: 'https://play.google.com/store/apps/details?id=com.proteinquest.app',
  message: 'Please update.',
};

const store = 'https://apps.apple.com/app/id6781790996';

test('compareVersions orders semver segments', () => {
  assert.equal(compareVersions('1.0.8', '1.0.8'), 0);
  assert.equal(compareVersions('1.0.7', '1.0.8'), -1);
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
  assert.equal(compareVersions('1.1.0', '1.0.99'), 1);
});

test('soft update when below latest but at/above min', () => {
  const d = decideUpdatePrompt('1.0.7', base, store);
  assert.equal(d.kind, 'soft');
  assert.equal(d.latestVersion, '1.0.8');
});

test('force update when below min_version', () => {
  const d = decideUpdatePrompt('0.9.0', { ...base, min_version: '1.0.0' }, store);
  assert.equal(d.kind, 'force');
});

test('no prompt when current is latest', () => {
  assert.equal(decideUpdatePrompt('1.0.8', base, store).kind, 'none');
  assert.equal(decideUpdatePrompt('1.0.9', base, store).kind, 'none');
});

test('force wins over soft when both apply', () => {
  const d = decideUpdatePrompt(
    '1.0.0',
    { ...base, latest_version: '1.2.0', min_version: '1.1.0' },
    store,
  );
  assert.equal(d.kind, 'force');
});
