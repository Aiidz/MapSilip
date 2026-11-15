import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchView } from '../app/lib/map-gestures.mjs';

test('pinch zoom keeps the map point under the moving pinch midpoint', () => {
  const result = pinchView({
    startZoom: 1.25,
    startDistance: 100,
    currentDistance: 160,
    minZoom: 1.25,
    maxZoom: 4,
    anchor: { x: 600, y: 300 },
    currentPoint: { x: 640, y: 330 },
    center: { x: 495, y: 250 },
  });

  assert.equal(result.zoom, 2);
  assert.deepEqual(result.pan, { x: -65, y: -20 });
});

test('pinch zoom clamps to the allowed scale range when fingers move beyond it', () => {
  const result = pinchView({
    startZoom: 3,
    startDistance: 100,
    currentDistance: 200,
    minZoom: 1.25,
    maxZoom: 4,
    anchor: { x: 495, y: 250 },
    currentPoint: { x: 495, y: 250 },
    center: { x: 495, y: 250 },
  });

  assert.equal(result.zoom, 4);
  assert.deepEqual(result.pan, { x: 0, y: 0 });
});
