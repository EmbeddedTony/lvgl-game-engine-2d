import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameplayDemo } from '../src/gameplay/demo';
import { begin, advance } from '../src/simulation';
import { startScript, skipCutscene, chooseDialogue, stepGameplay } from '../src/gameplay/runtime';
import { validate } from '../src/model';
import { generate } from '../src/exporter';

test('staging advances while modal physics is locked, snaps exactly and returns camera/control', () => {
  const p = createGameplayDemo(),
    scene = p.scenes[0];
  scene.camera2d = { worldWidth: 640, worldHeight: 480, follow: 'player', axis: 'both' };
  p.gameplay!.scripts.push({
    id: 'cinema',
    name: 'A staged arrival',
    folder: 'Cutscenes',
    kind: 'cutscene',
    blocking: true,
    actions: [
      { id: 'pan', type: 'camera', mode: 'pan', x: 200, y: 180, ms: 500 },
      { id: 'walk', type: 'move', node: 'player', x: 180, y: 110, ms: 1000 },
      { id: 'done', type: 'end' },
    ],
  });
  const original = scene.nodes.find((n) => n.player)!.x;
  const s = begin(scene, p);
  startScript(s.gameplay!, p, 'cinema');
  for (let i = 0; i < 120 && s.gameplay!.runners.length; i++)
    advance(
      s,
      p,
      new Set(['a']),
      1000 / 60,
      () => {},
      () => {},
    );
  assert.equal(s.nodes.find((n) => n.player)!.x, 180);
  assert.equal(s.nodes.find((n) => n.player)!.y, 110);
  assert.equal(s.cameraOverride, undefined);
  assert.equal(s.bodies.player.velocityX, 0);
  assert.equal(scene.nodes.find((n) => n.player)!.x, original);
  assert.deepEqual(
    validate(p).filter((i) => i.severity === 'error'),
    [],
  );
  const files = generate(p, {}).files;
  assert.match(String(files['ui/generated/game_data.c']), /LGE_ACTION_MOVE/);
  assert.match(String(files['ui/generated/game_data.c']), /\.cinematic=true/);
});

test('skip releases staging, runs completion state once and cannot rewind past the completion beat', () => {
  const p = createGameplayDemo();
  p.gameplay!.scripts.push({
    id: 'skippable',
    name: 'Safe skip',
    folder: '',
    kind: 'cutscene',
    blocking: true,
    skipTo: 'complete',
    actions: [
      { id: 'walk', type: 'move', node: 'player', x: 200, y: 100, ms: 60000 },
      { id: 'complete', type: 'state', key: 'quest', operation: 'add', value: 1 },
      {
        id: 'epilogue',
        type: 'say',
        speaker: 'Guide',
        text: 'After the completion beat.',
        choices: [],
      },
      { id: 'done', type: 'end' },
    ],
  });
  const sim = begin(p.scenes[0], p),
    s = sim.gameplay!;
  startScript(s, p, 'skippable');
  assert.equal(skipCutscene(s, sim, p), false);
  stepGameplay(s, sim, p, new Set(), () => {});
  assert.equal(startScript(s, p, 'skippable', 'another_owner'), false);
  assert.equal(skipCutscene(s, sim, p), true);
  assert.equal(sim.bodies.player.velocityX, 0);
  stepGameplay(s, sim, p, new Set(), () => {});
  assert.equal(s.values.quest, 1);
  assert.equal(skipCutscene(s, sim, p), false);
  chooseDialogue(s, p, 0);
  chooseDialogue(s, p, 0);
  stepGameplay(s, sim, p, new Set(), () => {});
  assert.equal(s.runners.length, 0);
});

test('checkpoint actions use checked packets, branch on storage failure and restore atomically', () => {
  const p = createGameplayDemo();
  p.gameplay!.scripts.push(
    {
      id: 'save',
      name: 'Save',
      folder: '',
      blocking: true,
      actions: [
        { id: 'save', type: 'checkpoint', operation: 'save', success: 'done', failure: 'fail' },
        { id: 'fail', type: 'state', key: 'quest', operation: 'set', value: 0 },
        { id: 'done', type: 'end' },
      ],
    },
    {
      id: 'load',
      name: 'Load',
      folder: '',
      blocking: true,
      actions: [
        { id: 'load', type: 'checkpoint', operation: 'load', success: 'done', failure: 'done' },
        { id: 'done', type: 'end' },
      ],
    },
  );
  const sim = begin(p.scenes[0], p),
    s = sim.gameplay!;
  let disk: Uint8Array | null = null;
  s.checkpointStore = {
    read: () => disk,
    write: (b) => {
      disk = b;
    },
  };
  const run = (id: string) => {
    assert.equal(startScript(s, p, id), true);
    for (let i = 0; i < 4; i++) stepGameplay(s, sim, p, new Set(), () => {});
  };
  s.values.quest = 1;
  run('save');
  assert.ok(disk);
  s.values.quest = 0;
  run('load');
  assert.equal(s.values.quest, 1);
  (disk as unknown as Uint8Array)[15] ^= 1;
  s.values.quest = 0;
  run('load');
  assert.equal(s.values.quest, 0);
  s.checkpointStore.write = () => {
    throw new Error('full');
  };
  s.values.quest = 1;
  run('save');
  assert.equal(s.values.quest, 0);
  assert.match(String(generate(p, {}).files['ui/engine/lge_config.h']), /LGE_CHECKPOINT_BYTES \d+/);
});
