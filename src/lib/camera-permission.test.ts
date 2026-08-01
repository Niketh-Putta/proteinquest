import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveCameraPermissionUi,
  shouldAutoRequestCameraPermission,
  shouldRequestCameraPermission,
} from './camera-permission.ts';

describe('resolveCameraPermissionUi', () => {
  it('does not show denied while permission is still loading', () => {
    assert.equal(resolveCameraPermissionUi({ permission: null, requesting: false }), 'loading');
  });

  it('does not show denied while the system prompt is in flight', () => {
    assert.equal(
      resolveCameraPermissionUi({
        permission: { granted: false, canAskAgain: true, status: 'undetermined' },
        requesting: true,
      }),
      'requesting',
    );
  });

  it('treats undetermined as loading, never blocked/unavailable', () => {
    assert.equal(
      resolveCameraPermissionUi({
        permission: { granted: false, canAskAgain: true, status: 'undetermined' },
        requesting: false,
      }),
      'loading',
    );
  });

  it('shows a soft prompt only after an askable denial', () => {
    assert.equal(
      resolveCameraPermissionUi({
        permission: { granted: false, canAskAgain: true, status: 'denied' },
        requesting: false,
      }),
      'needs_prompt',
    );
  });

  it('shows blocked only when the OS will not ask again', () => {
    assert.equal(
      resolveCameraPermissionUi({
        permission: { granted: false, canAskAgain: false, status: 'denied' },
        requesting: false,
      }),
      'blocked',
    );
  });

  it('returns granted when allowed', () => {
    assert.equal(
      resolveCameraPermissionUi({
        permission: { granted: true, canAskAgain: true, status: 'granted' },
        requesting: false,
      }),
      'granted',
    );
  });
});

describe('shouldRequestCameraPermission', () => {
  it('requests when undetermined or askable denial', () => {
    assert.equal(
      shouldRequestCameraPermission({ granted: false, canAskAgain: true, status: 'undetermined' }),
      true,
    );
    assert.equal(
      shouldRequestCameraPermission({ granted: false, canAskAgain: true, status: 'denied' }),
      true,
    );
  });

  it('does not request when granted or permanently blocked', () => {
    assert.equal(
      shouldRequestCameraPermission({ granted: true, canAskAgain: true, status: 'granted' }),
      false,
    );
    assert.equal(
      shouldRequestCameraPermission({ granted: false, canAskAgain: false, status: 'denied' }),
      false,
    );
    assert.equal(shouldRequestCameraPermission(null), false);
  });
});

describe('shouldAutoRequestCameraPermission', () => {
  it('auto-requests only while undetermined', () => {
    assert.equal(
      shouldAutoRequestCameraPermission({
        granted: false,
        canAskAgain: true,
        status: 'undetermined',
      }),
      true,
    );
    assert.equal(
      shouldAutoRequestCameraPermission({ granted: false, canAskAgain: true, status: 'denied' }),
      false,
    );
  });
});
