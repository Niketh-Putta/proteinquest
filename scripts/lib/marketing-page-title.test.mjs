import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { lockMarketingPageTitles, MARKETING_PAGE_TITLE } from './marketing-page-title.mjs';

const marketingIndex = join(dirname(fileURLToPath(import.meta.url)), '../../marketing/index.html');

test('marketing index uses a vertical bar in tab and og titles', () => {
  const html = readFileSync(marketingIndex, 'utf8');
  assert.match(html, /<title>ProteinQuest \| Hit your protein\. Actually stick with it\.<\/title>/);
  assert.match(
    html,
    /property="og:title" content="ProteinQuest \| Hit your protein\. Actually stick with it\."/,
  );
  assert.doesNotMatch(html, /<title>[^<]*[—–]/);
  assert.doesNotMatch(html, /property="og:title" content="[^"]*[—–]/);
});

test('build lock rewrites em dash titles to a vertical bar', () => {
  const dirty = `<title>ProteinQuest — Hit your protein. Actually stick with it.</title>
<meta property="og:title" content="ProteinQuest – Hit your protein. Actually stick with it." />`;
  const locked = lockMarketingPageTitles(dirty);
  assert.equal(locked.includes(MARKETING_PAGE_TITLE), true);
  assert.equal(locked.includes('—'), false);
  assert.equal(locked.includes('–'), false);
});
