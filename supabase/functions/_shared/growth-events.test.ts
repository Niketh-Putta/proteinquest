import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isAllowedEventName, stripForbiddenProps } from './growth-events.ts';

describe('growth event schema', () => {
  it('accepts the required event names only', () => {
    assert.equal(isAllowedEventName('first_open'), true);
    assert.equal(isAllowedEventName('paywall_viewed'), true);
    assert.equal(isAllowedEventName('paywall_view'), false);
  });

  it('strips health, identity and token fields', () => {
    const clean = stripForbiddenProps({
      step_id: 'intro_3',
      email: 'a@b.com',
      weight_kg: 80,
      note: 'large bowl',
    });
    assert.deepEqual(clean, { step_id: 'intro_3', note: 'large bowl' });
  });
});
