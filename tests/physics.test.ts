import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeNode, parseProject, validate } from '../src/model';
import { begin, advance } from '../src/simulation';
import { colliderBox, makePhysics } from '../src/physics';
import { createPhysicsDemo } from '../src/physics-demo';
import { resolveScene } from '../src/scenes';
import { generate } from '../src/exporter';

test('custom colliders sweep thin walls independently of artwork and respect directional masks', () => {
  const p = createPhysicsDemo(),
    scene = p.scenes[0];
  scene.nodes = [
    makeNode('rect', {
      id: 'actor',
      x: 0,
      y: 20,
      width: 20,
      height: 20,
      physics: {
        ...makePhysics('character'),
        motion: 'code',
        worldBounds: false,
        velocityX: 1200,
        mask: 1,
        box: { x: 5, y: 5, width: 10, height: 10 },
      },
    }),
    makeNode('rect', { id: 'wall', x: 40, y: 0, width: 1, height: 100, solid: true }),
  ];
  let s = begin(scene);
  advance(
    s,
    p,
    new Set(),
    34,
    () => {},
    () => {},
  );
  assert.equal(s.nodes[0].x, 25);
  assert.equal(s.bodies.actor.onWall, true);
  assert.deepEqual(colliderBox(s.nodes[0]), { x: 30, y: 25, width: 10, height: 10 });
  scene.nodes[0].physics!.mask = 4;
  s = begin(scene);
  advance(
    s,
    p,
    new Set(),
    100,
    () => {},
    () => {},
  );
  assert.equal(Math.round(s.nodes[0].x), 120);
});

test('platformer gravity lands on a floor and jumping is grounded and edge triggered', () => {
  const p = createPhysicsDemo(),
    scene = p.scenes[0];
  scene.nodes = [
    makeNode('rect', {
      id: 'actor',
      x: 20,
      y: 0,
      width: 10,
      height: 10,
      player: true,
      physics: { ...makePhysics('character'), motion: 'platformer', gravity: 600, jumpSpeed: 200 },
    }),
    makeNode('rect', { id: 'floor', x: 0, y: 80, width: 320, height: 1, solid: true }),
  ];
  const s = begin(scene);
  const step = (keys = new Set<string>(), ms = 100) =>
    advance(
      s,
      p,
      keys,
      ms,
      () => {},
      () => {},
    );
  for (let i = 0; i < 10; i++) step();
  assert.equal(s.nodes[0].y, 70);
  assert.equal(s.bodies.actor.onFloor, true);
  step(new Set([' ']), 17);
  assert.ok(s.nodes[0].y < 70 && s.bodies.actor.velocityY < 0 && !s.bodies.actor.onFloor);
  for (let i = 0; i < 10; i++) step(new Set([' ']));
  assert.equal(s.nodes[0].y, 70);
  assert.equal(s.bodies.actor.onFloor, true);
  step(new Set());
  step(new Set(['w']), 17);
  assert.ok(s.nodes[0].y < 70);
});

test('narrow area enters/exits survive fast motion; child areas follow without detecting their own character', () => {
  const p = createPhysicsDemo(),
    scene = p.scenes[0];
  scene.nodes = [
    makeNode('rect', {
      id: 'actor',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      physics: { ...makePhysics('character'), motion: 'code', velocityX: 1200, worldBounds: false },
    }),
    makeNode('area', {
      id: 'hurt',
      parent: 'actor',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      physics: { ...makePhysics('area'), layer: 16, mask: 2 },
    }),
    makeNode('area', {
      id: 'gate',
      x: 25,
      y: 0,
      width: 1,
      height: 10,
      physics: { ...makePhysics('area'), layer: 64, mask: 2 },
    }),
  ];
  const s = begin(scene),
    events: string[] = [];
  advance(
    s,
    p,
    new Set(),
    34,
    () => {},
    (message) => events.push(message),
  );
  assert.equal(s.nodes[0].x, 40);
  assert.equal(s.nodes[1].x, 40);
  assert.equal(events.filter((m) => m.startsWith('Entered')).length, 1);
  assert.equal(events.filter((m) => m.startsWith('Exited')).length, 1);
  assert.equal(s.areaContacts.size, 0);
});

test('physics projects round-trip, validate bounds and export immutable components with a clean C API', async () => {
  const p = createPhysicsDemo();
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.deepEqual(
    validate(p).filter((i) => i.severity === 'error'),
    [],
  );
  const runtime = Object.fromEntries(
    await Promise.all(
      [
        'lge.h',
        'lge.c',
        'lge_physics.c',
        'lge_tile_cache.h',
        'lge_tile_cache.c',
        'lge_lvgl.h',
        'lge_lvgl.c',
        'lge_flow.h',
        'lge_flow.c',
      ].map(async (name) => [name, await readFile(`engine/${name}`, 'utf8')]),
    ),
  );
  const { files } = generate(p, runtime);
  assert.match(files['ui/generated/game_data.c'] as string, /static const lge_physics_def_t.*\n/);
  assert.match(files['ui/generated/game_data.c'] as string, /LGE_MOTION_PLATFORMER/);
  assert.match(files['ui/ui.h'] as string, /ui_body_is_on_floor/);
  assert.match(files['ui/CMakeLists.txt'] as string, /lge_physics.c/);
  for (const bad of [
    { mask: 256 },
    { gravity: -1 },
    { box: { x: 0, y: 0, width: 0, height: 3 } },
    { velocityX: 1201 },
  ]) {
    const invalid = structuredClone(p);
    Object.assign(invalid.scenes[0].nodes.find((n) => n.id === 'player')!.physics!, bad);
    assert.throws(() => parseProject(JSON.stringify(invalid)));
  }
  const source = structuredClone(p.scenes[0]);
  source.id = 'character';
  source.nodes = source.nodes.filter((n) => n.id === 'player' || n.id === 'hurtbox');
  p.scenes.push(source);
  p.scenes[0].nodes = [makeNode('instance', { id: 'hero', scene: 'character', x: 10, y: 20 })];
  const resolved = resolveScene(p, p.scenes[0]);
  assert.equal(resolved.find((n) => n.id === 'hero/player')!.physics!.box!.width, 16);
  assert.equal(resolved.find((n) => n.id === 'hero/hurtbox')!.parent, 'hero/player');
  p.scenes[0].nodes.push(makeNode('instance', { id: 'other', scene: 'character' }));
  const composed = generate(p, runtime).files['ui/generated/game_data.c'] as string;
  assert.equal(
    (composed.match(/static const lge_physics_def_t/g) ?? []).length,
    2,
    'identical instance components share immutable flash definitions',
  );
});
