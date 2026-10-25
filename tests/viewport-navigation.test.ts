import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anchoredPan,
  editorZoom,
  editorZoomSteps,
  sceneBounds,
  stepEditorZoom,
} from '../src/editor/viewport-navigation';
import { makeNode } from '../src/model';

test('cursor-anchored zoom preserves world coordinates on both sides of the display origin', () => {
  for (const point of [
    { x: 120, y: 70 },
    { x: 900, y: 620 },
  ]) {
    const origin = { x: -90, y: 34 },
      center = { x: 400, y: 300 },
      display = { width: 320, height: 240 };
    const pan = anchoredPan(point, origin, 2, 3, center, display);
    const nextOrigin = {
      x: center.x - (display.width * 3) / 2 + pan.x,
      y: center.y - (display.height * 3) / 2 + pan.y,
    };
    assert.equal((point.x - origin.x) / 2, (point.x - nextOrigin.x) / 3);
    assert.equal((point.y - origin.y) / 2, (point.y - nextOrigin.y) / 3);
  }
});
test('overview fits large worlds while editing zoom retains whole physical pixels at inspection scales', () => {
  for (const ratio of [1, 1.25, 2]) {
    assert.equal(editorZoom(0.1, ratio, true), 0.1);
    const steps = editorZoomSteps(ratio, true);
    assert.ok(steps.some((z) => z * ratio < 1));
    for (const step of steps.filter((z) => z * ratio >= 1))
      assert.ok(Math.abs(step * ratio - Math.round(step * ratio)) < 1e-8);
    assert.ok(stepEditorZoom(1, -1, ratio, true) < 1);
    assert.ok(stepEditorZoom(1, 1, ratio, true) > 1);
    assert.equal(stepEditorZoom(8, 1, ratio, true), 8);
  }
});
test('framing includes negative/far artwork and the selected branch without letting logical group size distort it', () => {
  const nodes = [
    makeNode('group', { id: 'group', x: 0, y: 0, width: 4000 }),
    makeNode('rect', { id: 'one', parent: 'group', x: -80, y: -20, width: 16, height: 24 }),
    makeNode('rect', { id: 'two', parent: 'group', x: 1800, y: 500, width: 32, height: 16 }),
  ];
  assert.deepEqual(sceneBounds(nodes, { width: 320, height: 240 }), {
    x: -80,
    y: -20,
    width: 1912,
    height: 536,
  });
  assert.deepEqual(sceneBounds(nodes, { width: 320, height: 240 }, 'one'), {
    x: -80,
    y: -20,
    width: 16,
    height: 24,
  });
  assert.deepEqual(sceneBounds(nodes, { width: 320, height: 240 }, 'group'), {
    x: -80,
    y: -20,
    width: 1912,
    height: 536,
  });
});
