import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createH7Adventure } from '../src/examples/h7-adventure';
import { parseProject, validate, makeNode } from '../src/model';
import { begin, advance, setSimulationPosition } from '../src/simulation';
import { cameraPosition2D, cameraNodes2D } from '../src/camera2d';
import { makePhysics } from '../src/physics';
import { generate } from '../src/exporter';
import { tileFrame } from '../src/tiles/animation';
import { measureWorkload, analyzeTarget } from '../src/targets/analyze';
const steps = (
  s: ReturnType<typeof begin>,
  p: ReturnType<typeof createH7Adventure>,
  n: number,
  keys = new Set<string>(),
) => {
  for (let i = 0; i < n; i++)
    advance(
      s,
      p,
      keys,
      1000 / 60,
      () => {},
      () => {},
    );
};
test('H7 board policy exports exact M7 acceleration and external-memory guidance', () => {
  const p = createH7Adventure();
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.deepEqual(validate(p), []);
  assert.equal(p.width, 800);
  assert.equal(p.height, 480);
  assert.equal(p.rendering?.helium, false);
  const f = generate(p, {}).files;
  assert.match(String(f['ui/lv_conf_acceleration.h']), /LV_USE_NEMA_LIB LV_NEMA_LIB_M7/);
  assert.match(String(f['ui/lv_conf_acceleration.h']), /stm32h7rsxx_hal.h/);
  assert.match(String(f['ui/ports/stm32h7s78_dk.c']), /LV_USE_DRAW_DMA2D/);
  assert.match(String(f['ui/generated/game_data.c']), /\.input_action=16/);
  const report = analyzeTarget(p, measureWorkload(p));
  assert.equal(report.family.id, 'stm32h7rs');
  assert.equal(report.config.externalRamKiB, 32768);
});
test('overworld scrolls in both axes, preserves HUD positions and animates water independently of collision', () => {
  const p = createH7Adventure(),
    scene = p.scenes[0],
    s = begin(scene, p);
  const a = cameraPosition2D(scene.camera2d, s.nodes, p);
  steps(s, p, 180, new Set(['d']));
  const b = cameraPosition2D(scene.camera2d, s.nodes, p);
  assert.ok(b.x > a.x + 400);
  steps(s, p, 180, new Set(['a']));
  steps(s, p, 60, new Set(['w']));
  const c = cameraPosition2D(scene.camera2d, s.nodes, p);
  assert.ok(c.y < b.y - 100);
  const projected = cameraNodes2D(s.nodes, c);
  assert.equal(projected.find((n) => n.id === 'title')!.x, 16);
  const map = scene.nodes[0].tilemap!;
  assert.notEqual(tileFrame(map, 4, 0), tileFrame(map, 4, 12));
  assert.ok(map.solidTiles.includes(4));
  assert.equal(scene.nodes.find((n) => n.id === 'player')!.x, 45 * 32 - 32);
});
test('melee has windup, locks movement, strikes once per swing, preserves facing and restarts only on a new press', () => {
  const p = createH7Adventure(),
    scene = p.scenes[0];
  const player = scene.nodes.find((n) => n.id === 'player')!;
  player.x = 100;
  player.y = 100;
  scene.nodes = [
    player,
    makeNode('sprite', {
      id: 'dummy',
      asset: 'flower',
      x: 150,
      y: 130,
      width: 24,
      height: 24,
      physics: { ...makePhysics('area'), layer: 4, mask: 0 },
    }),
  ];
  const s = begin(scene, p);
  let hits = 0;
  const tick = (keys: Set<string>) =>
    advance(
      s,
      p,
      keys,
      1000 / 60,
      () => {},
      (m) => {
        if (m.startsWith('Melee hit')) hits++;
      },
    );
  tick(new Set(['d', ' ']));
  assert.equal(s.nodes[0].x, 100);
  assert.equal(s.melee.player.facing, 'Right');
  for (let i = 0; i < 3; i++) tick(new Set(['a', ' ']));
  assert.equal(hits, 0);
  for (let i = 0; i < 16; i++) tick(new Set(['d', ' ']));
  assert.equal(hits, 1);
  assert.equal(s.melee.player.facing, 'Right');
  for (let i = 0; i < 5; i++) tick(new Set(['d', ' ']));
  assert.equal(s.melee.player.swinging, false);
  assert.ok(s.nodes[0].x > 100);
  tick(new Set());
  tick(new Set([' ']));
  for (let i = 0; i < 10; i++) tick(new Set());
  assert.equal(hits, 2);
  setSimulationPosition(s, 'dummy', 1000, 1000);
  steps(s, p, 25);
  tick(new Set([' ']));
  steps(s, p, 10);
  assert.equal(hits, 2);
});
test('malformed melee, controller input and unknown board policies reject at import', () => {
  const p = createH7Adventure();
  p.scenes[0].nodes.find((n) => n.player)!.melee!.activeMs = 0;
  assert.throws(() => parseProject(JSON.stringify(p)));
  const q = createH7Adventure();
  q.scenes[0].nodes[0].inputAction = 'action';
  assert.throws(() => parseProject(JSON.stringify(q)));
  const r = createH7Adventure();
  (r as unknown as { board: string }).board = 'mystery';
  assert.throws(() => parseProject(JSON.stringify(r)));
});

test('platformer attacks preserve gravity instead of resetting fall velocity', () => {
  const p = createH7Adventure(),
    scene = p.scenes[0],
    hero = scene.nodes.find((n) => n.player)!;
  hero.x = 100;
  hero.y = 100;
  hero.physics = {
    ...makePhysics('character'),
    motion: 'platformer',
    gravity: 600,
    velocityY: 120,
  };
  scene.nodes = [hero];
  const s = begin(scene, p);
  steps(s, p, 10, new Set([' ']));
  assert.ok(s.bodies.player.velocityY > 210);
  assert.ok(s.nodes[0].y > 125);
});

test('melee also detects legacy solid colliders with default world layers', () => {
  const p = createH7Adventure(),
    scene = p.scenes[0],
    hero = scene.nodes.find((n) => n.player)!;
  hero.x = 100;
  hero.y = 100;
  hero.melee!.mask = 1;
  scene.nodes = [
    hero,
    makeNode('rect', { id: 'legacy', x: 150, y: 130, width: 24, height: 24, solid: true }),
  ];
  const s = begin(scene, p);
  let hits = 0;
  for (let i = 0; i < 12; i++)
    advance(
      s,
      p,
      new Set(['d', ' ']),
      1000 / 60,
      () => {},
      (m) => {
        if (m.startsWith('Melee hit')) hits++;
      },
    );
  assert.equal(hits, 1);
});

test('tall scenery sorts at its ground collider so the player can walk behind overhangs', async () => {
  const { drawNodes2D } = await import('../src/draw-order2d');
  const lamp = makeNode('sprite', {
    id: 'lamp',
    y: 20,
    height: 128,
    sortY: true,
    physics: { ...makePhysics('static'), box: { x: 20, y: 110, width: 12, height: 12 } },
  });
  const actor = makeNode('sprite', {
    id: 'actor',
    y: 80,
    height: 96,
    sortY: true,
    physics: { ...makePhysics('character'), box: { x: 20, y: 38, width: 20, height: 14 } },
  });
  assert.deepEqual(
    drawNodes2D([lamp, actor]).map((n) => n.id),
    ['actor', 'lamp'],
  );
  actor.y = 110;
  assert.deepEqual(
    drawNodes2D([lamp, actor]).map((n) => n.id),
    ['lamp', 'actor'],
  );
});
