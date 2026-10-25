import { duplicateBranch } from '../src/editor/scene-commands';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeNode, parseProject, validate } from '../src/model';
import { makePhysics, colliderBox } from '../src/physics';
import { begin, advance } from '../src/simulation';
import { createToolkitDemo } from '../src/gameplay/toolkit-demo';
import { actorStats, skillAmount, chooseEncounter, defaultPattern } from '../src/gameplay/toolkit';
import { generate } from '../src/exporter';
import { measureWorkload, analyzeTarget } from '../src/targets/analyze';
import { targetDefaults } from '../src/targets/model';
import { setTileSlope } from '../src/tilesets';
import { resourceUsageIndex } from '../src/gameplay/resources';
import { createTilesetDemo } from '../src/tileset-demo';
const step = (
  s: ReturnType<typeof begin>,
  p: ReturnType<typeof createToolkitDemo>,
  frames = 1,
  keys = new Set<string>(),
) => {
  for (let i = 0; i < frames; i++)
    advance(
      s,
      p,
      keys,
      1000 / 60,
      () => {},
      () => {},
    );
};
function ramps() {
  const p = createToolkitDemo(),
    scene = p.scenes[0];
  scene.nodes = [
    makeNode('rect', {
      id: 'player',
      x: 20,
      y: 100,
      width: 8,
      height: 12,
      speed: 60,
      player: true,
      physics: { ...makePhysics('character'), motion: 'platformer', gravity: 600 },
    }),
    makeNode('rect', { id: 'flat', x: 0, y: 112, width: 32, height: 8, solid: true }),
    makeNode('rect', {
      id: 'up',
      x: 32,
      y: 80,
      width: 64,
      height: 32,
      solid: true,
      physics: { ...makePhysics('static'), slope: 'up' },
    }),
    makeNode('rect', { id: 'crest', x: 96, y: 80, width: 32, height: 40, solid: true }),
    makeNode('rect', {
      id: 'down',
      x: 128,
      y: 80,
      width: 64,
      height: 32,
      solid: true,
      physics: { ...makePhysics('static'), slope: 'down' },
    }),
    makeNode('rect', { id: 'end', x: 192, y: 112, width: 128, height: 8, solid: true }),
  ];
  return { p, scene };
}
test('ramps follow the foot interval, join a crest without toe catching, descend and allow jumps', () => {
  const { p, scene } = ramps(),
    s = begin(scene, p);
  step(s, p, 1);
  step(s, p, 90, new Set(['d']));
  assert.ok(Math.abs(s.nodes[0].x - 110) < 0.001);
  assert.equal(s.nodes[0].y, 68);
  assert.ok(s.bodies.player.onFloor);
  step(s, p, 100, new Set(['d']));
  assert.ok(Math.abs(s.nodes[0].x - 210) < 0.001);
  assert.equal(s.nodes[0].y, 100);
  assert.ok(s.bodies.player.onFloor);
  step(s, p, 1, new Set([' ']));
  assert.ok(s.bodies.player.velocityY < 0);
  assert.ok(s.nodes[0].y < 100);
  assert.equal(scene.nodes[0].x, 20, 'simulation leaves authored data untouched');
});
test('tile-bank slopes retain compression and shared source edits without changing cell IDs', () => {
  const p = createTilesetDemo(),
    set = p.tilesets![0],
    tile = set.tiles[0];
  setTileSlope(p, tile.id, 'up');
  for (const n of p.scenes
    .flatMap((s) => s.nodes)
    .filter((n) => n.tilemap?.tiles.includes(tile.id))) {
    const map = n.tilemap!,
      v = map.tiles.indexOf(tile.id) + 1;
    assert.ok(map.solidTiles.includes(v));
    assert.equal(map.slopes?.[v], 'up');
  }
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  setTileSlope(p, tile.id, 'box');
  assert.equal(tile.slope, undefined);
  const { p: q, scene } = ramps();
  scene.nodes = scene.nodes.slice(0, 2);
  scene.nodes.push(
    makeNode('tilemap', {
      id: 'slope_tiles',
      x: 32,
      y: 80,
      width: 64,
      height: 32,
      tilemap: {
        tileSize: 32,
        columns: 2,
        rows: 1,
        tiles: [q.sprites[0].id],
        cells: [1, 1],
        solidTiles: [1],
        slopes: { 1: 'up' },
      },
    }),
  );
  // Isolated repeated ramps verify the query path; a falling character lands on the first tile.
  scene.nodes[0].x = 36;
  scene.nodes[0].y = 40;
  const s = begin(scene, q);
  step(s, q, 35);
  assert.equal(colliderBox(s.nodes[0]).y + 12, 100);
  assert.ok(s.bodies.player.onFloor);
});
test('platforms carry riders, push sideways, release jumping passengers and stop before crushing', () => {
  const { p, scene } = ramps();
  scene.nodes = [
    makeNode('rect', {
      id: 'player',
      x: 30,
      y: 80,
      width: 10,
      height: 10,
      physics: { ...makePhysics('character'), motion: 'code', gravity: 600 },
    }),
    makeNode('rect', {
      id: 'lift',
      x: 20,
      y: 90,
      width: 40,
      height: 8,
      solid: true,
      physics: { ...makePhysics('platform'), velocityX: 60 },
    }),
  ];
  let s = begin(scene, p);
  step(s, p, 30);
  assert.ok(Math.abs(s.nodes[0].x - 60) < 0.001);
  assert.equal(s.nodes[0].y, 80);
  s.bodies.player.velocityY = -200;
  step(s, p, 1);
  const x = s.nodes[0].x;
  step(s, p, 5);
  assert.equal(s.nodes[0].x, x);
  scene.nodes[0].x = 30;
  scene.nodes[0].y = 80;
  scene.nodes[1].physics!.velocityX = 0;
  scene.nodes[1].physics!.velocityY = -60;
  scene.nodes.push(
    makeNode('rect', { id: 'ceiling', x: 0, y: 60, width: 100, height: 5, solid: true }),
  );
  s = begin(scene, p);
  step(s, p, 60);
  assert.equal(s.nodes[0].y, 65);
  assert.equal(s.nodes[1].y, 75);
  scene.nodes = scene.nodes.slice(0, 2);
  scene.nodes[0].x = 60;
  scene.nodes[0].y = 90;
  scene.nodes[0].physics!.gravity = 0;
  scene.nodes[1].physics!.velocityY = 0;
  scene.nodes[1].physics!.velocityX = 60;
  s = begin(scene, p);
  step(s, p, 1);
  assert.equal(s.nodes[0].x, 61, 'solid platforms push leading characters');
});
test('ping-pong travel is relative to parents, bounded and stable across cycles', () => {
  const { p, scene } = ramps();
  scene.nodes = [
    makeNode('group', { id: 'root', x: 10, y: 20 }),
    makeNode('rect', {
      id: 'lift',
      parent: 'root',
      x: 10,
      y: 30,
      width: 40,
      height: 8,
      solid: true,
      physics: { ...makePhysics('platform'), travel: { x: 60, y: -30, durationMs: 1000 } },
    }),
  ];
  const s = begin(scene, p);
  step(s, p, 60);
  assert.ok(Math.abs(s.nodes[1].x - 80) < 0.001);
  assert.ok(Math.abs(s.nodes[1].y - 20) < 0.001);
  step(s, p, 60);
  assert.ok(Math.abs(s.nodes[1].x - 20) < 0.001);
  assert.ok(Math.abs(s.nodes[1].y - 50) < 0.001);
  step(s, p, 1200);
  assert.ok(Math.abs(s.nodes[1].x - 20) < 0.001);
});
test('projectile pools drop overflow, sweep thin targets, emit Hit scripts and freeze while modal', () => {
  const p = createToolkitDemo(),
    scene = p.scenes[1];
  p.gameplay!.projectileLimit = 2;
  p.gameplay!.patterns = [
    {
      ...defaultPattern('spiral'),
      count: 4,
      angle: 0,
      spread: 0,
      speed: 600,
      mask: 2,
      intervalMs: 1000,
    },
  ];
  scene.nodes = [
    makeNode('group', {
      id: 'emitter',
      x: 0,
      y: 10,
      width: 2,
      height: 2,
      emitter: { pattern: 'spiral', autoplay: true },
    }),
    makeNode('rect', {
      id: 'player',
      x: 16,
      y: 5,
      width: 1,
      height: 12,
      player: true,
      physics: { ...makePhysics('character'), motion: 'code' },
      events: [{ id: 'hit', trigger: 'hit', script: 'count_hits' }],
    }),
  ];
  const s = begin(scene, p);
  step(s, p);
  assert.equal(s.projectiles.slots.filter((b) => b && b.remaining > 0).length, 2);
  assert.equal(s.projectiles.dropped, 2);
  step(s, p, 2);
  assert.equal(s.gameplay!.values.hits, 1);
  assert.equal(s.projectiles.slots.filter((b) => b && b.remaining > 0).length, 0);
  s.projectiles.emitters.emitter.enabled = false;
  step(s, p, 120);
  assert.equal(s.projectiles.dropped, 2);
  const q = createToolkitDemo(),
    t = begin(q.scenes[1], q);
  step(t, q);
  const before = t.projectiles.slots[0]!.remaining;
  q.gameplay!.scripts.push({
    id: 'lock',
    name: 'Lock',
    folder: '',
    blocking: true,
    actions: [
      { id: 'wait', type: 'wait', ms: 1000 },
      { id: 'end', type: 'end' },
    ],
  });
  t.gameplay!.runners.push({
    script: 'lock',
    owner: 'player',
    other: '',
    pc: 0,
    wait: 0,
    dialog: false,
  });
  step(t, q, 5);
  assert.equal(t.projectiles.slots[0]!.remaining, before);
});
test('RPG resources round-trip, guard references and share deterministic bounded integer mechanics', () => {
  const p = createToolkitDemo(),
    d = p.gameplay!.rpg!;
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.equal(validate(p).filter((i) => i.severity === 'error').length, 0);
  assert.deepEqual(actorStats(d.actors[0], 3), { hp: 52, attack: 14, defense: 8, speed: 10 });
  assert.equal(skillAmount(d.skills[0], 14, 8, 94), 18);
  assert.equal(skillAmount(d.skills[0], 14, 8, 95), 0);
  assert.equal(skillAmount(d.skills[1], 9999, 9999, 0), 12);
  assert.deepEqual(chooseEncounter(d.encounters[0], 42, 6), { actor: 'wisp', level: 3 });
  assert.ok(resourceUsageIndex(p)('actor', 'wisp').length);
  assert.ok(resourceUsageIndex(p)('state', 'potions').length);
  for (const corrupt of [
    (q: typeof p) => q.gameplay!.rpg!.actors[0].skills.push('missing'),
    (q: typeof p) => (q.gameplay!.rpg!.items[0].stack = 'missing'),
    (q: typeof p) => (q.gameplay!.rpg!.encounters[0].entries[0].maxLevel = 0),
    (q: typeof p) => (q.gameplay!.patterns![0].count = 33),
    (q: typeof p) => (q.scenes[1].nodes.find((n) => n.emitter)!.emitter!.pattern = 'missing'),
  ]) {
    const q = structuredClone(p);
    corrupt(q);
    assert.throws(() => parseProject(JSON.stringify(q)));
  }
});
test('MCU guidance accounts for pool overflow, swept tests, flash tables and platform preflights; host stays quiet', () => {
  const p = createToolkitDemo();
  p.target = targetDefaults('generic');
  p.gameplay!.patterns![0].count = 32;
  p.gameplay!.patterns![0].intervalMs = 50;
  const work = measureWorkload(p);
  assert.equal(work.projectileSlots, 32);
  assert.ok(work.projectileDemand > 1000);
  assert.ok(work.platforms === 2);
  assert.ok(analyzeTarget(p, work).alerts.some((a) => a.id === 'projectile-overflow'));
  p.target = targetDefaults('host-pc');
  assert.equal(analyzeTarget(p, work).active, false);
});
test('clean export includes immutable RPG/images/patterns, optional pools and readable time/motion API', async () => {
  const p = createToolkitDemo(),
    names = [
      'lge.h',
      'lge.c',
      'lge_physics.c',
      'lge_gameplay.h',
      'lge_gameplay.c',
      'lge_tile_cache.h',
      'lge_tile_cache.c',
      'lge_lvgl.h',
      'lge_lvgl.c',
      'lge_flow.h',
      'lge_flow.c',
      'lge_story.h',
      'lge_story.c',
    ];
  const runtime = Object.fromEntries(
      await Promise.all(names.map(async (n) => [n, await readFile('engine/' + n, 'utf8')])),
    ),
    { files } = generate(p, runtime);
  assert.match(files['ui/generated/game_data.c'] as string, /const lge_rpg_database_t game_rpg/);
  assert.match(files['ui/generated/game_data.c'] as string, /\.pattern=&game_patterns\[0\]/);
  assert.match(files['ui/generated/game_data.c'] as string, /\.image=&game_image_/);
  assert.match(files['ui/ui_ids.h'] as string, /UI_ACTOR_WISP/);
  assert.match(files['ui/ui.h'] as string, /ui_delta_seconds/);
  assert.match(files['ui/CMakeLists.txt'] as string, /lge_gameplay.c/);
});

test('ramp ascent respects low-ceiling headroom and branch copies own nested motion data', () => {
  const { p, scene } = ramps();
  scene.nodes.push(
    makeNode('rect', { id: 'low_ceiling', x: 0, y: 75, width: 96, height: 8, solid: true }),
  );
  const s = begin(scene, p);
  step(s, p);
  step(s, p, 90, new Set(['d']));
  assert.ok(s.nodes[0].y >= 83 && s.nodes[0].x < 72 && s.bodies.player.onWall);
  const lift = p.scenes[1].nodes.find((n) => n.emitter)!;
  const copyId = duplicateBranch(p.scenes[1], lift.id),
    copy = p.scenes[1].nodes.find((n) => n.id === copyId)!;
  copy.emitter!.autoplay = false;
  assert.equal(lift.emitter!.autoplay, true);
  const source = scene.nodes.find((n) => n.id === 'up')!;
  source.physics!.box = { x: 0, y: 0, width: 64, height: 32 };
  const id = duplicateBranch(scene, 'up'),
    other = scene.nodes.find((n) => n.id === id)!;
  other.physics!.box!.width = 32;
  assert.equal(source.physics!.box!.width, 64);
});

test('aimed patterns use the player bearing and child emitters ignore sibling hurtboxes', () => {
  const p = createToolkitDemo(),
    scene = p.scenes[1];
  p.gameplay!.patterns![0] = {
    ...defaultPattern('spiral'),
    mode: 'aimed',
    count: 1,
    angle: 0,
    mask: 0,
    speed: 60,
  };
  scene.nodes = [
    makeNode('group', {
      id: 'emitter',
      x: 0,
      y: 10,
      width: 2,
      height: 2,
      emitter: { pattern: 'spiral', autoplay: true },
    }),
    makeNode('rect', {
      id: 'player',
      x: 100,
      y: 10,
      width: 2,
      height: 2,
      player: true,
      physics: { ...makePhysics('character'), motion: 'code' },
    }),
  ];
  let s = begin(scene, p);
  step(s, p);
  assert.ok(Math.abs(s.projectiles.slots[0]!.vx - 60) < 0.001);
  assert.ok(Math.abs(s.projectiles.slots[0]!.vy) < 0.001);
  p.gameplay!.patterns![0] = {
    ...defaultPattern('spiral'),
    count: 1,
    angle: 0,
    spread: 0,
    speed: 600,
    mask: 16,
  };
  scene.nodes = [
    makeNode('rect', {
      id: 'player',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      physics: { ...makePhysics('character'), motion: 'code' },
    }),
    makeNode('group', {
      id: 'emitter',
      parent: 'player',
      x: 0,
      y: 10,
      width: 2,
      height: 2,
      emitter: { pattern: 'spiral', autoplay: true },
    }),
    makeNode('area', {
      id: 'hurtbox',
      parent: 'player',
      x: 12,
      y: 5,
      width: 1,
      height: 12,
      physics: { ...makePhysics('area'), layer: 16, mask: 8 },
    }),
  ];
  s = begin(scene, p);
  step(s, p, 3);
  assert.ok(s.projectiles.slots[0]!.remaining > 0);
  assert.ok(s.projectiles.slots[0]!.x > 20);
});
