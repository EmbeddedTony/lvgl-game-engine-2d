import { extractScene, unpackInstance } from '../src/editor/scene-commands';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSideScrollerDemo } from '../src/examples/side-scroller';
import { createAdventureDemo } from '../src/examples/topdown-adventure';
import { parseProject, validate, type Project, type Scene } from '../src/model';
import { begin, advance, type Simulation } from '../src/simulation';
import { cameraNodes2D, cameraPosition2D } from '../src/camera2d';
import { displaySceneNodes } from '../src/scenes';
import { packTilemap } from '../src/compression';
function frame(s: Simulation, p: Project, keys: string[] = []) {
  advance(
    s,
    p,
    new Set(keys),
    1000 / 60,
    () => {},
    () => {},
  );
}
function settle(s: Simulation, p: Project) {
  for (let i = 0; i < 120 && !s.bodies.player.onFloor; i++) frame(s, p);
  assert.ok(s.bodies.player.onFloor);
}
function runRight(s: Simulation, p: Project, x: number, jump = false) {
  if (jump) {
    settle(s, p);
    frame(s, p, ['d', ' ']);
  }
  for (let i = 0; i < 600 && s.nodes.find((n) => n.id === 'player')!.x < x; i++) frame(s, p, ['d']);
  assert.ok(s.nodes.find((n) => n.id === 'player')!.x >= x, `blocked before ${x}`);
  frame(s, p);
}
function walk(s: Simulation, p: Project, x: number, y: number) {
  for (let i = 0; i < 600; i++) {
    const player = s.nodes.find((n) => n.id === 'player')!,
      dx = x - player.x,
      dy = y - player.y;
    if (Math.abs(dx) < 1.3 && Math.abs(dy) < 1.3) return;
    frame(s, p, Math.abs(dx) > 1.3 ? [dx > 0 ? 'd' : 'a'] : [dy > 0 ? 's' : 'w']);
  }
  assert.fail(`unreachable waypoint ${x},${y}`);
}
/** Tile-center route planning is independent of the movement/collision implementation. */
function pathTo(s: Simulation, p: Project, scene: Scene, x: number, y: number) {
  const map = scene.nodes.find((n) => n.tilemap)!.tilemap!,
    player = s.nodes.find((n) => n.id === 'player')!;
  const start = Math.floor((player.y + 12.5) / 16) * 20 + Math.floor((player.x + 8) / 16),
    goal = Math.floor((y + 6.5) / 16) * 20 + Math.floor((x + 8) / 16);
  const previous = new Map<number, number>([[start, -1]]),
    queue = [start];
  for (let i = 0; i < queue.length && !previous.has(goal); i++) {
    const n = queue[i];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const col = (n % 20) + dx,
        row = Math.floor(n / 20) + dy,
        next = row * 20 + col;
      if (
        col >= 0 &&
        col < 20 &&
        row >= 0 &&
        row < 11 &&
        !map.solidTiles.includes(map.cells[next]) &&
        !previous.has(next)
      ) {
        previous.set(next, n);
        queue.push(next);
      }
    }
  }
  assert.ok(previous.has(goal));
  const route: number[] = [];
  for (let n = goal; n !== -1; n = previous.get(n)!) route.unshift(n);
  for (const n of route) walk(s, p, (n % 20) * 16, Math.floor(n / 20) * 16 - 4.5);
}
test('both original 2D examples round-trip, use whole pixel sprites, expose visible textbox groups in every scene and compact tilemaps', () => {
  for (const p of [createSideScrollerDemo(), createAdventureDemo()]) {
    assert.equal(parseProject(JSON.stringify(p)).name, p.name);
    assert.deepEqual(
      validate(p).filter((i) => i.severity === 'error'),
      [],
    );
    assert.equal(p.dimension, '2d');
    assert.equal(p.pixelPerfect, true);
    assert.ok(p.sprites.every((a) => a.pixels.length === a.width * a.height * 4));
    for (const scene of p.scenes) {
      const nodes = displaySceneNodes(p, scene),
        text = nodes.find((n) => n.id === 'dialogue_text')!;
      assert.ok(nodes.some((n) => n.id === 'dialogue' && n.layer === 'ui' && n.visible));
      assert.equal(text.layer, 'ui');
      assert.equal(text.worldY, 201);
      assert.ok(scene.objective.includes('\n'));
      for (const map of scene.nodes.filter((n) => n.tilemap).map((n) => n.tilemap!))
        assert.ok(packTilemap(map.cells).bytes <= map.cells.length);
    }
  }
});
test('side-scroller course is completable with movement/jumps; camera follows beyond one display while textbox stays fixed', () => {
  const p = createSideScrollerDemo(),
    scene = p.scenes[0],
    s = begin(scene, p),
    source = JSON.stringify(scene);
  settle(s, p);
  runRight(s, p, 120);
  runRight(s, p, 176, true);
  runRight(s, p, 268);
  runRight(s, p, 328, true);
  settle(s, p);
  runRight(s, p, 384, true);
  runRight(s, p, 472);
  settle(s, p);
  runRight(s, p, 528, true);
  settle(s, p);
  runRight(s, p, 576, true);
  runRight(s, p, 724);
  assert.equal(s.score, 6);
  assert.equal(s.complete, true);
  const camera = cameraPosition2D(scene.camera2d, s.nodes, p);
  assert.equal(camera.x, 448);
  const projected = cameraNodes2D(s.nodes, camera);
  assert.equal(projected.find((n) => n.id === 'dialogue_text')!.x, 18);
  assert.ok(projected.find((n) => n.id === 'player')!.x < 320);
  assert.equal(JSON.stringify(scene), source);
});
test('adventure grove and shrine are both completable through actual collisions and foot-box movement', () => {
  const p = createAdventureDemo();
  for (const scene of p.scenes.slice(0, 2)) {
    const s = begin(scene, p);
    for (const target of scene.nodes.filter((n) => n.collectible))
      pathTo(s, p, scene, target.x, target.y);
    assert.equal(s.score, 3);
    assert.equal(s.complete, true);
    assert.equal(scene.nodes.filter((n) => n.collectible && n.visible).length, 3);
  }
});
test('camera validation rejects missing/UI targets and malformed extents; legacy scenes keep screen bounds', () => {
  const p = createSideScrollerDemo();
  p.scenes[0].camera2d!.follow = 'dialogue_text';
  assert.throws(() => parseProject(JSON.stringify(p)), /camera|Invalid/);
  p.scenes[0].camera2d!.follow = 'player';
  p.scenes[0].camera2d!.worldWidth = Infinity;
  assert.throws(() => parseProject(JSON.stringify(p)), /Invalid/);
  const scene = createAdventureDemo().scenes[0];
  assert.deepEqual(
    cameraPosition2D(undefined, displaySceneNodes({ scenes: [scene] }, scene), {
      width: 320,
      height: 240,
    }),
    { x: 0, y: 0 },
  );
});

test('camera references survive scene extraction and unpacking without changing source world positions', () => {
  const p = createSideScrollerDemo(),
    scene = p.scenes[0];
  extractScene(p, scene, 'player');
  assert.equal(scene.camera2d!.follow, 'player/player');
  assert.doesNotThrow(() => parseProject(JSON.stringify(p)));
  const before = cameraPosition2D(scene.camera2d, displaySceneNodes(p, scene), p);
  unpackInstance(p, scene, 'player');
  assert.notEqual(scene.camera2d!.follow, 'player/player');
  assert.doesNotThrow(() => parseProject(JSON.stringify(p)));
  assert.deepEqual(cameraPosition2D(scene.camera2d, displaySceneNodes(p, scene), p), before);
});
