import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarter } from '../src/assets';
import { makeNode, parseProject, validate } from '../src/model';
import {
  createTouchControls,
  setTouchControls,
  touchControlsEnabled,
} from '../src/input/touch-controls';
import { PointerInput, controllerAt } from '../src/input/pointer-input';
import { displaySceneNodes, resolveScene } from '../src/scenes';
import { generate } from '../src/exporter';
import { begin } from '../src/simulation';

function fixture() {
  const p = createStarter();
  p.scenes = [p.scenes[0]];
  p.scenes[0].nodes = [makeNode('rect', { id: 'hero', player: true })];
  delete p.flow;
  return p;
}


test('touch preset fits common displays, uses stable unique IDs and stays in the UI layer', () => {
  for (const [width, height] of [
    [128, 96],
    [240, 240],
    [320, 240],
    [800, 480],
    [480, 800],
  ]) {
    const nodes = createTouchControls({ width, height }, new Set(['touch_controls', 'pad_up']));
    assert.equal(nodes.length, 7);
    assert.equal(nodes[0].id, 'touch_controls_2');
    assert.equal(nodes[1].id, 'pad_up_2');
    for (const n of nodes.slice(1)) {
      assert.equal(n.parent, nodes[0].id);
      assert.equal(n.layer, 'ui');
      assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.width <= width && n.y + n.height <= height);
    }
  }
});

test('optional controls round-trip, preserve authored edits and export the same visibility as preview', () => {
  const p = fixture(),
    scene = p.scenes[0];
  assert.equal(touchControlsEnabled(p, scene), false);
  setTouchControls(p, scene, true);
  const right = scene.nodes.find((n) => n.inputAction === 'right')!;
  right.x += 3;
  const hidden = scene.nodes.find((n) => n.inputAction === 'interact')!;
  hidden.visible = false;
  const original = structuredClone(scene.nodes);
  setTouchControls(p, scene, false);
  assert.equal(touchControlsEnabled(p, scene), false);
  assert.deepEqual(scene.nodes, original);
  assert.ok(
    begin(scene, p)
      .nodes.filter((n) => n.inputAction)
      .every((n) => !n.visible),
  );
  assert.match(
    String(generate(p, {}).files['ui/generated/game_data.c']),
    /\.id="pad_right"[^\n]*\.visible=false/,
  );
  setTouchControls(p, scene, true);
  assert.deepEqual(scene.nodes, original);
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.equal(displaySceneNodes(p, scene).find((n) => n.id === right.id)!.visible, true);
  assert.equal(displaySceneNodes(p, scene).find((n) => n.id === hidden.id)!.visible, false);
  assert.deepEqual(
    validate(p).filter((i) => i.severity === 'error'),
    [],
  );
});

test('instanced controls follow the active scene option without duplicating or changing their source', () => {
  const p = fixture(),
    scene = p.scenes[0];
  const source = { ...structuredClone(scene), id: 'controller', nodes: createTouchControls(p) };
  p.scenes.push(source);
  scene.nodes.push(makeNode('instance', { id: 'overlay', scene: source.id, layer: 'ui' }));
  const count = scene.nodes.length;
  setTouchControls(p, scene, true);
  assert.equal(scene.nodes.length, count);
  setTouchControls(p, scene, false);
  assert.ok(
    resolveScene(p, scene)
      .filter((n) => n.inputAction)
      .every((n) => !n.visible),
  );
  assert.ok(
    resolveScene(p, source)
      .filter((n) => n.inputAction)
      .every((n) => n.visible),
  );
});

test('preset rejects exhausted MCU node budgets and tiny displays before mutating a scene', () => {
  const p = fixture(),
    scene = p.scenes[0];
  scene.nodes = Array.from({ length: 122 }, (_, i) => makeNode('group', { id: `g_${i}` }));
  const before = JSON.stringify(scene);
  assert.throws(() => setTouchControls(p, scene, true), /7 free scene nodes/);
  assert.equal(JSON.stringify(scene), before);
  scene.nodes.length = 1;
  p.width = p.height = 16;
  assert.throws(() => setTouchControls(p, scene, true), /128 × 96/);
  assert.equal(scene.touchControls, undefined);
});

test('legacy controller buttons stay enabled, malformed scene options reject import', () => {
  const p = fixture(),
    scene = p.scenes[0];
  scene.nodes.push(makeNode('button', { id: 'up', layer: 'ui', inputAction: 'up' }));
  assert.equal(touchControlsEnabled(p, scene), true);
  (scene as unknown as { touchControls: string }).touchControls = 'yes';
  assert.throws(() => parseProject(JSON.stringify(p)));
});

test('preview pointers slide through gaps, preserve independent holds and latch short action taps', () => {
  const input = new PointerInput(),
    nodes = createTouchControls({ width: 320, height: 240 });
  const right = nodes.find((n) => n.inputAction === 'right')!;
  const up = nodes.find((n) => n.inputAction === 'up')!;
  const action = nodes.find((n) => n.inputAction === 'action')!;
  input.start(1, right);
  input.start(2, right);
  input.end(1);
  assert.deepEqual([...input.keys()], ['arrowright']);
  input.move(2);
  assert.equal(input.keys().size, 0);
  input.move(2, up);
  assert.deepEqual([...input.keys()], ['arrowup']);
  input.start(3, action);
  input.end(3);
  assert.ok(input.pulses.has(' '));
  assert.deepEqual([...input.keys()], ['arrowup']);
  input.move(99, right); // Untracked hover is never an input.
  assert.deepEqual([...input.keys()], ['arrowup']);
  input.releaseHidden(nodes.map((n) => ({ ...n, visible: n.id !== up.id })));
  assert.equal(input.keys().size, 0);
  input.clear();
  assert.equal(input.keys().size + input.pulses.size, 0);
  input.move(2, right); // Pause/cancel cannot revive an old pointer.
  assert.equal(input.keys().size, 0);
  assert.equal(controllerAt(nodes, right.x + 1, right.y + 1), right);
  assert.equal(
    controllerAt(
      [
        ...nodes,
        makeNode('button', { x: right.x, y: right.y, width: right.width, height: right.height }),
      ],
      right.x + 1,
      right.y + 1,
    ),
    undefined,
  );
});
