import { test } from 'node:test';
import assert from 'node:assert/strict';
import { produce } from 'immer';
import { makeNode, parseProject, type Project } from '../src/model';
import { makePhysics } from '../src/physics';
import { moveSceneNode, resolveScene } from '../src/scenes';
import { createPrefab, createPrefabPool } from '../src/editor/prefab-commands';
import { begin, advance } from '../src/simulation';
import { spawnPrefab, despawnPrefab, prefabNode } from '../src/prefabs';
import { measureWorkload, analyzeTarget } from '../src/targets/analyze';
import { targetDefaults } from '../src/targets/model';
import { generate } from '../src/exporter';
import { applyCommands, queryProject } from '../src/automation/project-commands';
import { emptyGameplay } from '../src/gameplay/model';
import { unpackInstance } from '../src/editor/scene-commands';

export function prefabFixture(): Project {
  return {
    version: 1,
    name: 'Prefab Lab',
    width: 320,
    height: 240,
    colorDepth: 16,
    sprites: [],
    audio: [],
    code: '',
    scenes: [
      {
        id: 'level',
        name: 'Level',
        background: '#152738',
        objective: '',
        completion: '',
        music: '',
        nodes: [
          makeNode('group', { id: 'world', x: 10, y: 20 }),
          makeNode('group', { id: 'actor', name: 'Slime', x: 40, y: 60, parent: 'world' }),
          makeNode('rect', {
            id: 'body',
            name: 'Body',
            x: 2,
            y: 3,
            width: 16,
            height: 16,
            parent: 'actor',
            color: '#55cc88',
            physics: {
              ...makePhysics('character'),
              motion: 'code',
              velocityX: 60,
              worldBounds: false,
            },
          }),
          makeNode('label', {
            id: 'label',
            name: 'Label',
            x: 0,
            y: -10,
            parent: 'actor',
            text: 'Slime',
          }),
          makeNode('rect', { id: 'other', x: 200, y: 80 }),
        ],
      },
    ],
  };
}
function pooled() {
  const p = prefabFixture(),
    s = p.scenes[0],
    source = createPrefab(p, s, 'actor');
  createPrefabPool(p, s, source, 2);
  return { p, s, source };
}
test('tree moves preserve every world position, sibling order and IDs; cycles and inherited targets reject atomically', () => {
  const p = prefabFixture(),
    s = p.scenes[0];
  const positions = () =>
    resolveScene(p, s)
      .map((n) => [n.id, n.worldX, n.worldY])
      .sort();
  const before = positions();
  moveSceneNode(p, s, 'actor', 'other', 'inside');
  assert.equal(s.nodes.find((n) => n.id === 'actor')!.parent, 'other');
  assert.deepEqual(positions(), before);
  moveSceneNode(p, s, 'actor', 'world', 'before');
  assert.deepEqual(
    resolveScene(p, s)
      .filter((n) => !n.parent)
      .map((n) => n.id),
    ['actor', 'world', 'other'],
  );
  moveSceneNode(p, s, 'actor', undefined, 'root');
  assert.deepEqual(
    resolveScene(p, s)
      .filter((n) => !n.parent)
      .map((n) => n.id),
    ['world', 'other', 'actor'],
  );
  assert.deepEqual(positions(), before);
  assert.throws(
    () => produce(p, (draft) => moveSceneNode(draft, draft.scenes[0], 'actor', 'body', 'inside')),
    /own branch/,
  );
  createPrefab(p, s, 'actor');
  assert.throws(
    () =>
      produce(p, (draft) => moveSceneNode(draft, draft.scenes[0], 'other', 'actor/body', 'inside')),
    /authored/,
  );
});
test('prefabs round trip, share source edits, cook reserved instances once and budget all live slots', () => {
  const { p, s, source } = pooled();
  assert.deepEqual(parseProject(JSON.stringify(p)), JSON.parse(JSON.stringify(p)));
  const nodes = resolveScene(p, s),
    slots = nodes.filter((n) => n.spawnable);
  assert.equal(slots.length, 2);
  assert.ok(slots.every((n) => !n.effectiveVisible));
  p.scenes.find((s) => s.id === source)!.nodes.find((n) => n.id === 'label')!.text = 'Edited once';
  assert.equal(
    resolveScene(p, s).filter((n) => n.sourceId === 'label' && n.text === 'Edited once').length,
    3,
  );
  const work = measureWorkload(p);
  assert.equal(work.maxNodes, nodes.length);
  assert.equal(work.prefabSlots, 2);
  p.target = targetDefaults('stm32h7');
  assert.ok(analyzeTarget(p, work).alerts.some((a) => a.id === 'prefab-pools'));
  p.target = targetDefaults('host-pc');
  assert.ok(!analyzeTarget(p, work).alerts.some((a) => a.id === 'prefab-pools'));
  assert.equal(work.visibleNodes, 7); // Three bodies/labels plus the unrelated rectangle.
  const files = generate(p, {}).files;
  assert.match(files['ui/generated/game_data.c'] as string, /\.prefab="prefab_/);
  assert.match(files['ui/ui_ids.h'] as string, /UI_PREFAB_/);
  for (const capacity of [0, 17, 2.5])
    assert.throws(() =>
      produce(p, (d) => {
        createPrefabPool(d, d.scenes[0], source, capacity);
      }),
    );
  assert.throws(
    () =>
      produce(p, (d) => {
        for (let i = 0; i < 4; i++) createPrefabPool(d, d.scenes[0], source, 16);
      }),
    /128/,
  );
  const bad = structuredClone(p);
  bad.scenes[0].nodes[0].spawnable = true;
  assert.throws(() => parseProject(JSON.stringify(bad)));
});
test('preview acquires distinct bounded slots and respawns with clean motion, visibility, contacts, scripts and stale handles', () => {
  const { p, s, source } = pooled();
  p.gameplay = {
    ...emptyGameplay(),
    scripts: [
      {
        id: 'wait',
        name: 'Wait',
        folder: '',
        blocking: false,
        actions: [
          { id: 'wait_action', type: 'wait', ms: 5000 },
          { id: 'end_action', type: 'end' },
        ],
      },
    ],
  };
  p.scenes.find((s) => s.id === source)!.nodes.find((n) => n.id === 'body')!.events = [
    { id: 'start', trigger: 'start', script: 'wait' },
  ];
  const sim = begin(s, p),
    size = sim.nodes.length;
  const h = spawnPrefab(sim, p, source, 100, 90)!;
  const body = prefabNode(sim, h, 'body')!;
  assert.equal(body.x, 102);
  assert.equal(body.y, 93);
  assert.equal(body.visible, true);
  const second = spawnPrefab(sim, p, source, 200, 100)!;
  assert.notEqual(second.id, h.id);
  assert.equal(spawnPrefab(sim, p, source, 0, 0), undefined);
  assert.equal(spawnPrefab(sim, p, source, NaN, 0), undefined);
  advance(
    sim,
    p,
    new Set(),
    100,
    () => {},
    () => {},
  );
  assert.ok(body.x > 102);
  sim.bodies[body.id].velocityX = 900;
  sim.hierarchy[body.id].visible = false;
  sim.areaContacts.add(`${body.id}\0other`);
  assert.ok(sim.gameplay!.runners.some((r) => r.owner === body.id));
  assert.equal(despawnPrefab(sim, h), true);
  assert.equal(despawnPrefab(sim, h), false);
  assert.equal(prefabNode(sim, h), undefined);
  assert.equal(sim.areaContacts.size, 0);
  assert.ok(!sim.gameplay!.runners.some((r) => r.owner === body.id));
  for (let i = 0; i < 200; i++) {
    const next = spawnPrefab(sim, p, source, 50, 70)!;
    assert.notEqual(next.generation, h.generation);
    assert.equal(prefabNode(sim, next, 'body')!.x, 52);
    assert.equal(prefabNode(sim, next, 'body')!.visible, true);
    assert.equal(sim.bodies[body.id].velocityX, 60);
    assert.equal(sim.nodes.length, size);
    assert.equal(despawnPrefab(sim, next), true);
  }
  assert.equal(prefabNode(begin(s, p), second), undefined);
});
test('CLI prefab and hierarchy commands use the same validated transaction boundary', () => {
  const p = prefabFixture();
  const created = applyCommands(p, [
    { command: 'prefab.create', params: { scene: 'level', id: 'actor' } },
  ]);
  const prefab = created.project.scenes.find((s) => s.prefab)!.id;
  assert.deepEqual(
    (queryProject(created.project, 'prefab.list', {}) as { id: string }[]).map((s) => s.id),
    [prefab],
  );
  const result = applyCommands(created.project, [
    { command: 'prefab.pool', params: { scene: 'level', prefab, capacity: 3 } },
    {
      command: 'node.move',
      params: { scene: 'level', id: 'other', target: 'world', placement: 'inside' },
    },
  ]);
  assert.equal(result.project.scenes[0].nodes.filter((n) => n.spawnable).length, 3);
  assert.equal(result.project.scenes[0].nodes.find((n) => n.id === 'other')!.parent, 'world');
  assert.equal(p.scenes.length, 1);
});

test('pooled pickups retain earned score and remove uncollected retired copies from the total', () => {
  const { p, s, source } = pooled();
  const pickup = p.scenes.find((s) => s.id === source)!.nodes.find((n) => n.id === 'body')!;
  pickup.collectible = true;
  pickup.physics = { ...makePhysics('area'), layer: 32, mask: 2 };
  Object.assign(
    s.nodes.find((n) => n.id === 'other')!,
    { player: true, x: 202, y: 123, width: 16, height: 16, speed: 0 },
  );
  const sim = begin(s, p);
  assert.equal(sim.total, 1);
  const h = spawnPrefab(sim, p, source, 200, 120)!;
  assert.equal(sim.total, 2);
  advance(
    sim,
    p,
    new Set(),
    17,
    () => {},
    () => {},
  );
  assert.equal(sim.score, 1);
  assert.equal(prefabNode(sim, h, 'body')!.visible, false);
  assert.equal(despawnPrefab(sim, h), true);
  assert.equal(sim.total, 2);
  const next = spawnPrefab(sim, p, source, 100, 100)!;
  assert.equal(sim.total, 3);
  assert.equal(despawnPrefab(sim, next), true);
  assert.equal(sim.total, 2);
  assert.equal(sim.score, 1);
});

test('disabling a reserve slot permits unpacking without leaving instance-only metadata on groups', () => {
  const { p, s } = pooled();
  const slot = s.nodes.find((n) => n.spawnable)!;
  assert.throws(() => unpackInstance(p, s, slot.id), /Disable runtime spawning/);
  slot.spawnable = false;
  unpackInstance(p, s, slot.id);
  assert.equal(slot.kind, 'group');
  assert.equal(slot.spawnable, undefined);
  assert.doesNotThrow(() => parseProject(JSON.stringify(p)));
});
