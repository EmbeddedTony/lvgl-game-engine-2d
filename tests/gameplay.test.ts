import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameplayDemo } from '../src/gameplay/demo';
import { begin, advance } from '../src/simulation';
import { parseProject, validate, makeNode } from '../src/model';
import {
  startScript,
  chooseDialogue,
  signal,
  stateSet,
  gameplayBlocking,
} from '../src/gameplay/runtime';
import { saveState, restoreState, stateSchema, hashBytes } from '../src/gameplay/save';
import { dialogueBottom, dialoguePages } from '../src/gameplay/dialogue';
import { dialogueNodes } from '../src/gameplay/dialogue-view';
import { makePhysics } from '../src/physics';
import { installRecipe } from '../src/gameplay/recipes';
import { generate } from '../src/exporter';
import { measureWorkload } from '../src/targets/analyze';
const frame = (
  s: ReturnType<typeof begin>,
  p: ReturnType<typeof createGameplayDemo>,
  keys = new Set<string>(),
  ms = 17,
) =>
  advance(
    s,
    p,
    keys,
    ms,
    () => {},
    () => {},
  );
function drain(s: ReturnType<typeof begin>, p: ReturnType<typeof createGameplayDemo>, choice = 0) {
  for (let i = 0; i < 50 && s.gameplay!.runners.length; i++) {
    if (s.gameplay!.dialogue) chooseDialogue(s.gameplay!, p, choice);
    frame(s, p);
  }
  assert.equal(s.gameplay!.runners.length, 0);
}
test('Gameplay Lab survives import and exercises one-time inventory, locked room, encounter choices and return state', () => {
  const p = createGameplayDemo();
  assert.deepEqual(
    validate(p).filter((i) => i.severity === 'error'),
    [],
  );
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  let s = begin(p.scenes[0], p);
  const state = s.gameplay!;
  startScript(state, p, 'door', 'door');
  frame(s, p);
  assert.match(state.dialogue!.text, /locked/);
  drain(s, p);
  assert.equal(state.warp, null);
  startScript(state, p, 'chest', 'chest');
  frame(s, p);
  assert.equal(state.values.amber_key, 1);
  assert.equal(state.values.chest_opened, 1);
  drain(s, p);
  startScript(state, p, 'chest', 'chest');
  frame(s, p);
  assert.match(state.dialogue!.text, /empty/);
  drain(s, p);
  assert.equal(state.values.amber_key, 1);
  startScript(state, p, 'door', 'door');
  frame(s, p);
  drain(s, p);
  assert.equal((state.warp as { scene: string } | null)?.scene, p.scenes[1].id);
  s = begin(p.scenes[1], p, state);
  startScript(state, p, 'encounter', 'spirit');
  frame(s, p);
  assert.equal(state.dialogue!.choices.length, 3);
  chooseDialogue(state, p, 1); // Reveal the question without selecting a choice.
  assert.equal(state.values.resolved, 0);
  chooseDialogue(state, p, 1);
  frame(s, p);
  assert.match(state.dialogue!.text, /stayed to listen/);
  drain(s, p);
  assert.equal(state.values.resolved, 1);
  s = begin(p.scenes[0], p, state);
  assert.equal(state.values.amber_key, 1);
  s = begin(p.scenes[1], p, state);
  frame(s, p);
  assert.equal(s.nodes.find((n) => n.id === 'spirit')!.visible, false);
  assert.equal(p.scenes[1].nodes.find((n) => n.id === 'spirit')!.visible, true);
});
test('Interaction chooses one nearest eligible forward page, edges confirm once, modal physics freezes and scripts stay bounded', () => {
  const p = createGameplayDemo(),
    s = begin(p.scenes[0], p),
    state = s.gameplay!;
  frame(s, p, new Set(['e']));
  assert.equal(state.dialogue?.speaker, 'MIRA');
  const x = s.nodes.find((n) => n.player)!.x;
  for (let i = 0; i < 10; i++) frame(s, p, new Set(['e', 'd']));
  assert.equal(state.dialogue!.choices.length, 2);
  assert.equal(s.nodes.find((n) => n.player)!.x, x);
  frame(s, p);
  frame(s, p, new Set(['e']));
  assert.equal(state.values.quest, 0); // First press only reveals the current page.
  frame(s, p);
  frame(s, p, new Set(['e']));
  assert.equal(state.values.quest, 1);
  assert.match(state.dialogue!.text, /chest/);
  drain(s, p);
  assert.equal(gameplayBlocking(state, p), false);
  p.gameplay!.scripts.push({
    id: 'loop',
    name: 'Bounded loop',
    folder: 'Tests',
    blocking: false,
    actions: [{ id: 'spin', type: 'jump', target: 'spin' }],
  });
  for (let i = 0; i < 9; i++) startScript(state, p, 'loop', 'owner' + i);
  assert.equal(state.runners.length, 8);
  frame(s, p);
  assert.equal(state.runners.length, 8);
  assert.match(state.diagnostic, /Eight/);
});
test('Save codec validates schema, checksum, truncation and bounds atomically; transient fields reset', () => {
  const p = createGameplayDemo(),
    s = begin(p.scenes[0], p).gameplay!;
  stateSet(s, p, 'amber_key', 3);
  stateSet(s, p, 'spirit_hp', 1);
  const bytes = saveState(s, p);
  stateSet(s, p, 'amber_key', 7);
  assert.equal(restoreState(s, p, bytes), true);
  assert.equal(s.values.amber_key, 3);
  assert.equal(s.values.spirit_hp, 3);
  const before = { ...s.values };
  const corrupt = bytes.slice();
  corrupt[12] ^= 1;
  assert.equal(restoreState(s, p, corrupt), false);
  assert.deepEqual(s.values, before);
  assert.equal(restoreState(s, p, bytes.subarray(1)), false);
  const other = structuredClone(p);
  other.id = 'other';
  assert.notEqual(stateSchema(other), stateSchema(p));
  assert.equal(restoreState(s, other, bytes), false);
  const invalid = bytes.slice(),
    v = new DataView(invalid.buffer);
  v.setInt32(12, 999, true);
  v.setUint32(invalid.length - 4, hashBytes(invalid.subarray(0, -4)), true);
  assert.equal(restoreState(s, p, invalid), false);
  assert.deepEqual(s.values, before);
});
test('Dialogue paginates Unicode and long words, keeps choices for last page and preserves complete content', () => {
  const text = 'A long message about the village. '.repeat(10) + '\n你好 traveller!';
  const pages = dialoguePages(text, 320, 240, 4);
  assert.ok(pages.length > 3);
  assert.ok(pages.every((p) => p.split('\n').length <= 3));
  assert.equal(pages.join(' ').replace(/\s/g, ''), text.replace(/\s/g, ''));
  const p = createGameplayDemo(),
    s = begin(p.scenes[0], p);
  p.gameplay!.scripts[0].actions = [
    { id: 'page', type: 'say', speaker: 'Guide', text, choices: [{ text: 'Done', target: '' }] },
  ];
  startScript(s.gameplay!, p, 'talk', 'scout');
  frame(s, p);
  assert.equal(s.gameplay!.dialogue!.choices.length, 0);
  for (let i = 0; i < 50 && s.gameplay!.dialogue; i++) {
    chooseDialogue(s.gameplay!, p, 0);
    frame(s, p);
  }
  assert.equal(s.gameplay!.dialogue, null);
});
test('dialogue reserves visible lower touch controls and keeps a full-height advance target', () => {
  const controls = [makeNode('button', { layer: 'ui', y: 328, inputAction: 'up' })];
  assert.equal(dialogueBottom(480, controls, 0), 320);
  controls[0].visible = false;
  assert.equal(dialogueBottom(480, controls, 0), 472);
  controls[0].visible = true;
  controls[0].y = 130;
  assert.equal(dialogueBottom(240, controls, 4), 232); // Small-screen fallback.
  const p = createGameplayDemo(),
    s = begin(p.scenes[0], p);
  startScript(s.gameplay!, p, 'talk', 'scout');
  frame(s, p);
  const d = s.gameplay!.dialogue!;
  d.bottom = 180;
  const nodes = dialogueNodes(s.gameplay, p),
    panel = nodes.find((n) => n.id === 'story_frame')!;
  const advance = nodes.find((n) => n.id === 'story_continue')!;
  assert.equal(advance.kind, 'button');
  assert.equal(advance.height, 40);
  assert.ok(advance.y >= panel.y && advance.y + advance.height <= d.bottom);
  assert.ok(panel.y + panel.height <= d.bottom);
});
test('Grid controller settles a released tap on one tile and blocks walls; one-way platforms permit rise and catch falling bodies', () => {
  const p = createGameplayDemo();
  p.gameplay = undefined;
  const scene = p.scenes[0];
  scene.nodes = [
    makeNode('rect', {
      id: 'player',
      player: true,
      x: 32,
      y: 64,
      width: 16,
      height: 16,
      speed: 72,
      physics: { ...makePhysics('character'), motion: 'grid', mask: 1 },
    }),
    makeNode('rect', {
      id: 'wall',
      x: 64,
      y: 64,
      width: 16,
      height: 16,
      physics: makePhysics('static'),
    }),
  ];
  const s = begin(scene, p);
  frame(s, p, new Set(['d']));
  for (let i = 0; i < 20; i++) frame(s, p);
  assert.ok(Math.abs(s.nodes[0].x - 48) < 0.001);
  for (let i = 0; i < 30; i++) frame(s, p, new Set(['d']));
  assert.ok(Math.abs(s.nodes[0].x - 48) < 0.001);
  scene.nodes[0].physics = {
    ...makePhysics('character'),
    motion: 'code',
    velocityY: -240,
    mask: 1,
    gravity: 600,
  };
  scene.nodes[0].y = 104;
  scene.nodes[1].x = 16;
  scene.nodes[1].y = 96;
  scene.nodes[1].width = 100;
  scene.nodes[1].height = 4;
  scene.nodes[1].physics = { ...makePhysics('static'), oneWay: true };
  const a = begin(scene, p);
  let highest = 104;
  for (let i = 0; i < 90; i++) {
    frame(a, p);
    highest = Math.min(highest, a.nodes[0].y);
  }
  assert.ok(highest < 80);
  assert.ok(Math.abs(a.nodes[0].y - 80) < 0.01);
  assert.equal(a.bodies.player.onFloor, true);
});
test('Recipes are ordinary valid data; missing references reject import and guidance counts animated variants and scripts', () => {
  const p = createGameplayDemo();
  for (const recipe of ['conversation', 'chest', 'door', 'patrol', 'battle'] as const)
    installRecipe(p, recipe);
  assert.equal(validate(p).filter((i) => i.severity === 'error').length, 0);
  const missing = structuredClone(p);
  missing.gameplay!.scripts[0].actions = [{ id: 'x', type: 'jump', target: 'missing' }];
  assert.throws(() => parseProject(JSON.stringify(missing)));
  const malformed = structuredClone(p);
  (malformed.scenes[0].nodes[0] as unknown as { animator: unknown }).animator = false;
  assert.throws(() => parseProject(JSON.stringify(malformed)));
  const work = measureWorkload(p),
    staticProject = structuredClone(p);
  for (const s of staticProject.scenes) for (const n of s.nodes) delete n.animator;
  staticProject.gameplay = undefined;
  assert.ok(work.imageBytes > measureWorkload(staticProject).imageBytes);
  assert.ok(work.tableBytes > measureWorkload(staticProject).tableBytes);
  const files = generate(p, {}).files;
  assert.match(files['ui/generated/game_data.c'] as string, /LGE_ACTION_BRANCH/);
  assert.match(files['ui/generated/game_data.c'] as string, /\.animator=&animator_/);
  assert.match(files['ui/ui.h'] as string, /ui_save_read/);
  assert.match(files['ui/CMakeLists.txt'] as string, /lge_story.c/);
});

test('Top-down drawing uses stable Z and foot sorting independently of authored arrays and UI', async () => {
  const { drawNodes2D } = await import('../src/draw-order2d');
  const nodes = [
    makeNode('sprite', { id: 'back', x: 1, y: 20, sortY: true }),
    makeNode('sprite', { id: 'front', x: 1, y: 10, sortY: true }),
    makeNode('tilemap', { id: 'ground', zIndex: -10 }),
    makeNode('label', { id: 'hud', layer: 'ui', zIndex: -128 }),
  ];
  const before = nodes.map((n) => n.id);
  assert.deepEqual(
    drawNodes2D(nodes).map((n) => n.id),
    ['ground', 'front', 'back', 'hud'],
  );
  assert.deepEqual(
    nodes.map((n) => n.id),
    before,
  );
  nodes[1].y = 30;
  assert.deepEqual(
    drawNodes2D(nodes).map((n) => n.id),
    ['ground', 'back', 'front', 'hud'],
  );
});
test('Reusable role scripts and animator components survive extract/unpack with independent owned containers', async () => {
  const { extractScene, unpackInstance } = await import('../src/editor/scene-commands');
  const { resourceUsage } = await import('../src/gameplay/resources');
  const p = createGameplayDemo(),
    scene = p.scenes[0];
  const before = structuredClone(scene.nodes.find((n) => n.id === 'scout')!.events);
  extractScene(p, scene, 'scout');
  assert.equal(validate(p).filter((i) => i.severity === 'error').length, 0);
  unpackInstance(p, scene, 'scout');
  assert.equal(validate(p).filter((i) => i.severity === 'error').length, 0);
  assert.deepEqual(
    scene.nodes.find((n) => n.events?.some((e) => e.script === 'talk'))!.events,
    before,
  );
  assert.ok(resourceUsage(p, 'script', 'talk').length > 0);
  assert.ok(resourceUsage(p, 'state', 'amber_key').length > 0);
  assert.equal(resourceUsage(p, 'animation', 'hero_walk').length, 2);
});

test('Linked chests reuse one source/script, remap only their own saved flag and keep a shared item inventory', () => {
  const p = createGameplayDemo(),
    s = begin(p.scenes[0], p),
    state = s.gameplay!;
  startScript(state, p, 'chest', 'chest/body');
  frame(s, p);
  drain(s, p);
  assert.equal(state.values.amber_key, 1);
  startScript(state, p, 'chest', 'other_chest/body');
  frame(s, p);
  assert.equal(state.values.second_chest_opened, 1);
  assert.equal(state.values.amber_key, 2);
  drain(s, p);
  startScript(state, p, 'chest', 'chest/body');
  frame(s, p);
  assert.match(state.dialogue!.text, /empty/);
  assert.equal(state.values.amber_key, 2);
  const data = generate(p, {}).files['ui/generated/game_data.c'] as string;
  assert.match(data, /static const struct lge_state_binding/);
  const bad = structuredClone(p);
  bad.scenes[0].nodes.find((n) => n.id === 'other_chest')!.overrides!.body.stateBindings = {
    chest_opened: 'missing',
  };
  assert.throws(() => parseProject(JSON.stringify(bad)));
});
