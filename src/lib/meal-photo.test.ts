import assert from 'node:assert/strict';
import test from 'node:test';

import { cameraViewfinderCrop } from './camera-geometry.ts';

test('maps an offset square through a portrait aspect-fill preview', () => {
  assert.deepEqual(
    cameraViewfinderCrop(3000, 4000, {
      viewportWidth: 400,
      viewportHeight: 800,
      viewfinder: { originX: 50, originY: 250, width: 300, height: 300 },
    }),
    { originX: 750, originY: 1250, width: 1500, height: 1500 },
  );
});

test('accounts for source pixels hidden beside a tall Android viewport', () => {
  assert.deepEqual(
    cameraViewfinderCrop(4000, 3000, {
      viewportWidth: 400,
      viewportHeight: 800,
      viewfinder: { originX: 50, originY: 200, width: 300, height: 300 },
    }),
    { originX: 1438, originY: 750, width: 1125, height: 1125 },
  );
});

test('clamps a viewfinder at the viewport edge to valid source pixels', () => {
  assert.deepEqual(
    cameraViewfinderCrop(1000, 1000, {
      viewportWidth: 500,
      viewportHeight: 500,
      viewfinder: { originX: 400, originY: 400, width: 200, height: 200 },
    }),
    { originX: 600, originY: 600, width: 400, height: 400 },
  );
});
