/** Fast structural/story route audit. Not a human playtime or difficulty measurement. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseProject, validate } from '../src/model';
import { begin, advance, setSimulationPosition } from '../src/simulation';
import {
  startScript,
  stepGameplay,
  chooseDialogue,
  gameplayBlocking,
  signal,
  createSession,
  skipCutscene,
} from '../src/gameplay/runtime';
import { restoreState, stateSchema } from '../src/gameplay/save';
import { chapters, sideStories } from '../src/examples/willowlight/story';
import { colliderBox } from '../src/physics';

const path =
  process.argv[2] ??
  '.local-examples/Willowlight-TheNamesWeLeave/Willowlight-TheNamesWeLeave.lge.json';
const p = parseProject(await readFile(path, 'utf8'));
assert.deepEqual(
  validate(p).filter((i) => i.severity === 'error'),
  [],
);
let sim = begin(
    p.scenes.find((s) => s.id === 'title')!,
    p,
  ),
  state = sim.gameplay!;
let disk: Uint8Array | null = null;
const commits: Record<string, number>[] = [];
state.checkpointStore = {
  read: () => disk,
  write: (b) => {
    disk = b.slice();
    const restored = createSession(p);
    assert.ok(restoreState(restored, p, disk));
    for (const field of p.gameplay!.state.filter((f) => f.persistent))
      assert.equal(restored.values[field.id], state.values[field.id], 'committed ' + field.id);
    commits.push({ ...restored.values });
  },
};
const visited = new Set<string>();
let currentScene = 'title';
const enter = (id: string) => {
  const scene = p.scenes.find((s) => s.id === id);
  assert.ok(scene, id);
  sim = begin(scene, p, state);
  state = sim.gameplay!;
  currentScene = id;
  visited.add(id);
};
function drain(id?: string, pick: (choices: string[]) => number = () => 0) {
  for (let i = 0; i < 20000; i++) {
    if (state.dialogue) chooseDialogue(state, p, pick(state.dialogue.choices));
    stepGameplay(state, sim, p, new Set(), () => {});
    if (state.warp) return;
    if (id ? !state.runners.some((r) => r.script === id) : !gameplayBlocking(state, p)) return;
  }
  throw new Error(`VM did not settle: ${id}, ${JSON.stringify(state.runners)}`);
}
function run(id: string, owner = '', pick?: (choices: string[]) => number) {
  assert.equal(startScript(state, p, id, owner), true, 'start ' + id);
  drain(id, pick);
}
function followWarp() {
  const w = state.warp;
  assert.ok(w);
  enter(w.scene);
  setSimulationPosition(sim, 'player', w.x, w.y);
  drain();
}
// A fresh title session must route from the committed packet, without a lamp save
// or any live coroutine/position surviving. Never write during this check.
function coldContinue(scene: string) {
  const fresh = begin(
    p.scenes.find((s) => s.id === 'title')!,
    p,
  );
  const session = fresh.gameplay!;
  session.checkpointStore = {
    read: () => disk,
    write: () => assert.fail('Continue must not overwrite the checkpoint'),
  };
  assert.ok(startScript(session, p, 'continue'));
  for (let i = 0; i < 500 && !session.warp; i++) {
    assert.equal(session.dialogue, null, 'compatible checkpoint must load');
    stepGameplay(session, fresh, p, new Set(), () => {});
  }
  assert.equal(session.warp?.scene, scene);
  assert.deepEqual(session.values, commits.at(-1));
}
assert.ok(
  signal(
    state,
    p,
    'click',
    sim.nodes.find((n) => n.id === 'menu_new_journey')!,
  ),
);
drain('new_journey');
followWarp();
assert.equal(state.values.intro_0, 1);
assert.equal(commits.length, 1, 'opening completion creates the first checkpoint');
coldContinue('area_0');
run('arrival_0', 'chapter_director');
assert.equal(commits.length, 1, 'revisiting the opening does not autosave');

// Walkable interaction access, including water crossings and static prop footprints.
let reachableInteractions = 0;
for (const scene of p.scenes.filter((s) => s.id.startsWith('area_'))) {
  const map = scene.nodes.find((n) => n.tilemap)!.tilemap!;
  const statics = scene.nodes
    .filter((n) => n.visible && n.physics?.body === 'static')
    .map(colliderBox);
  const free = (c: number, r: number) => {
    if (
      c < 1 ||
      r < 1 ||
      c >= map.columns - 1 ||
      r >= map.rows - 1 ||
      map.solidTiles.includes(map.cells[r * map.columns + c])
    )
      return false;
    const x = c * 32 + 16,
      y = r * 32 + 16;
    return !statics.some(
      (b) => x - 14 < b.x + b.width && x + 14 > b.x && y - 18 < b.y + b.height && y > b.y,
    );
  };
  const seen = new Set<number>(),
    queue = [20 * map.columns + 9];
  while (queue.length) {
    const cell = queue.pop()!;
    if (seen.has(cell)) continue;
    const c = cell % map.columns,
      r = Math.floor(cell / map.columns);
    if (!free(c, r)) continue;
    seen.add(cell);
    for (const [x, y] of [
      [c - 1, r],
      [c + 1, r],
      [c, r - 1],
      [c, r + 1],
    ])
      if (free(x, y)) queue.push(y * map.columns + x);
  }
  for (const n of scene.nodes.filter((n) => n.events?.some((e) => e.trigger === 'interact'))) {
    const targetX = n.x + n.width / 2,
      targetY = n.y + n.height / 2;
    assert.ok(
      [...seen].some((cell) => {
        const x = (cell % map.columns) * 32 + 16,
          y = Math.floor(cell / map.columns) * 32 + 16 - 30;
        return (x - targetX) ** 2 + (y - targetY) ** 2 <= 40 ** 2;
      }),
      `${scene.name}: unreachable ${n.id} at ${targetX},${targetY}`,
    );
    reachableInteractions++;
  }
}

for (let ci = 0; ci < 6; ci++) {
  assert.equal(state.values.chapter, ci);
  const chapterCommits = commits.length;
  for (const q of sideStories.filter((q) => q.chapter === ci)) {
    run(`quest_${q.id}`, `giver_${q.id}`);
    assert.equal(state.values['q_' + q.id], 1);
  }
  assert.equal(commits.length, chapterCommits, 'accepting quests does not write');
  for (let part = 1; part <= 3; part++) {
    enter(`area_${ci * 4 + part}`);
    drain();
    if (part === 1) {
      run(`witness_scene_${ci}`, 'witness');
      assert.equal(state.values[`witness_${ci}`], 1);
      const afterWitness = commits.length;
      coldContinue(`area_${ci * 4 + 1}`);
      run(`witness_scene_${ci}`, 'witness');
      assert.equal(commits.length, afterWitness, 'repeat testimony does not write');
    }
    const beforeRecord = commits.length;
    run(`read_${ci}_${part - 1}`, 'witness_record');
    assert.equal(commits.length, beforeRecord + (part === 3 ? 1 : 0));
    const afterRecord = commits.length;
    const old = state.values[`records_${ci}`];
    run(`read_${ci}_${part - 1}`, 'witness_record');
    assert.equal(state.values[`records_${ci}`], old);
    assert.equal(commits.length, afterRecord, 'rereading records does not write');
    for (const q of sideStories.filter((q) => q.destination === ci * 4 + part)) {
      run(`find_${q.id}`, `quest_object_${q.id}`);
      assert.equal(state.values['q_' + q.id], 2);
    }
  }
  run(`bells_${ci}`, 'bell_controls', () => chapters[ci].puzzle[0] % 3); // deliberately wrong first bell
  assert.equal(state.values[`seal_${ci}`], 0);
  assert.equal(state.values[`puzzle_${ci}`], 0);
  const beforeSeal = commits.length;
  run(`bells_${ci}`, 'bell_controls', () => chapters[ci].puzzle[state.values[`puzzle_${ci}`]] - 1);
  assert.equal(state.values[`seal_${ci}`], 1);
  assert.equal(commits.length, beforeSeal + 1, 'seal completion saves once');
  coldContinue(`area_${ci * 4 + 3}`);
  run(`bells_${ci}`, 'bell_controls');
  assert.equal(commits.length, beforeSeal + 1, 'open seal does not save again');
  const beforeCombat = commits.length;
  // Hit events exercise authored bounded health/reward/visibility rules. Collision/timing is covered separately.
  for (let j = 0; j < 3; j++) {
    const hp = `ward_hp_${ci * 4 + 3}_${j}`;
    while (state.values[hp] > 0) run(`hit_${ci * 4 + 3}_${j}`, `ward_${j}`);
    assert.equal(sim.nodes.find((n) => n.id === `ward_${j}`)!.visible, false);
    assert.equal(sim.projectiles.emitters[`ward_${j}`].enabled, false);
  }
  assert.equal(commits.length, beforeCombat, 'combat hits do not write');
  enter(`area_${ci * 4}`);
  drain();
  for (const q of sideStories.filter((q) => q.chapter === ci)) {
    const beforeDelivery = commits.length;
    run(`quest_${q.id}`, `giver_${q.id}`);
    assert.equal(state.values['q_' + q.id], 3);
    assert.equal(commits.length, beforeDelivery + 1, 'quest completion saves rewards');
    coldContinue(`area_${ci * 4}`);
    const before = state.values.witnesses;
    run(`quest_${q.id}`, `giver_${q.id}`);
    assert.equal(state.values.witnesses, before);
    assert.equal(commits.length, beforeDelivery + 1, 'completed quest does not write again');
  }
  run(`rest_${ci * 4}`, 'rest_lamp');
  assert.ok(disk);
  enter(`area_${ci * 4 + 3}`);
  drain();
  const beforeTransition = commits.length;
  run(`resolution_${ci}`, 'chapter_record', () => (ci === 5 ? 1 : 0));
  assert.ok(state.warp);
  assert.equal(commits.length, beforeTransition + 1, 'chapter saves before scene retirement');
  assert.equal(commits.at(-1)!.chapter, ci + 1);
  coldContinue(ci < 5 ? `area_${ci * 4 + 4}` : 'shore');
  followWarp();
  assert.equal(
    commits.length,
    beforeTransition + (ci === 5 ? 2 : 1),
    'arrival is not a redundant save',
  );
}
assert.equal(state.values.ending, 2);
assert.equal(state.values.chapter, 6);
assert.equal(state.values.epilogue_seen, 1);
assert.equal(state.values.witnesses, 8);
assert.equal(commits.length, 40, '34 milestone commits plus six explicit lamp saves');
coldContinue('shore');
run('rest_20', 'rest_lamp');
const saved = disk!.slice();
enter('title');
state.values.chapter = 0;
run('continue', 'menu_continue');
followWarp();
assert.equal(state.values.chapter, 6);
assert.equal(state.values.ending, 2);
assert.equal(state.values.checkpoint_room, 20);
assert.deepEqual(disk, saved);
assert.equal(currentScene, 'shore', 'completed campaign Continue returns directly to epilogue');
enter('area_20');
drain();
run('shore_road', 'shore_road');
followWarp();
assert.equal(state.values.epilogue_seen, 1);
// Both other dawn outcomes are reachable, and the earned ending is gated for an unprepared party.
for (const [choice, ending] of [
  [0, 1],
  [2, 3],
]) {
  state.values.chapter = 5;
  state.values.epilogue_seen = 0;
  enter('area_23');
  drain();
  run('resolution_5', 'chapter_record', () => choice);
  followWarp();
  assert.equal(state.values.ending, ending);
}
state.values.chapter = 5;
state.values.witnesses = 0;
enter('area_23');
drain();
run('resolution_5', 'chapter_record', () => 1);
assert.equal(state.warp, null);
assert.equal(state.values.chapter, 5);

// Save failures preserve the previous packet, report the problem and still let
// the chapter transition finish. A lamp can retry; there is no per-frame retry.
enter('area_3');
state.values.chapter = 0;
const previousSave = disk!.slice();
let failures = 0;
state.checkpointStore = {
  read: () => disk,
  write: () => {
    failures++;
    throw new Error('flash unavailable');
  },
};
assert.ok(startScript(state, p, 'resolution_0', 'chapter_record'));
let failureShown = false;
for (let i = 0; i < 10000 && !state.warp; i++) {
  if (state.dialogue) {
    if (state.dialogue.speaker === 'AUTOSAVE') failureShown = true;
    chooseDialogue(state, p, 0);
  }
  stepGameplay(state, sim, p, new Set(), () => {});
}
assert.equal(failures, 1);
assert.ok(failureShown);
assert.equal(state.warp?.scene, 'area_4');
assert.deepEqual(disk, previousSave);

// The same completion path owns autosaving when a cutscene is skipped.
const skipped = begin(
  p.scenes.find((s) => s.id === 'area_3')!,
  p,
);
const skipState = skipped.gameplay!;
skipState.values.seal_0 = 1;
skipState.values.knots_0 = 3;
let skipPacket: Uint8Array | null = null;
skipState.checkpointStore = {
  read: () => skipPacket,
  write: (b) => {
    skipPacket = b.slice();
  },
};
assert.ok(startScript(skipState, p, 'resolution_0', 'chapter_record'));
stepGameplay(skipState, skipped, p, new Set(), () => {});
assert.ok(skipCutscene(skipState, skipped, p));
for (let i = 0; i < 100 && !skipState.warp; i++)
  stepGameplay(skipState, skipped, p, new Set(), () => {});
assert.ok(skipPacket);
const restoredSkip = createSession(p);
assert.ok(restoreState(restoredSkip, p, skipPacket!));
assert.equal(restoredSkip.values.chapter, 1);
assert.equal(restoredSkip.values.checkpoint_room, 4);
assert.equal(skipState.warp?.scene, 'area_4');

// Existing DK saves must remain loadable: content edits must not change schema.
const oldPath = '.cache/autosave-backup/Willowlight-TheNamesWeLeave.lge.json';
const oldText = await readFile(oldPath, 'utf8').catch(() => null);
if (oldText) assert.equal(stateSchema(p), stateSchema(parseProject(oldText)));
// Exercise a real authored sword collision, rather than synthesising the hit signal.
const combat = begin(
  p.scenes.find((s) => s.id === 'area_1')!,
  p,
);
const target = combat.nodes.find((n) => n.id === 'ward_0')!,
  player = combat.nodes.find((n) => n.player)!;
const targetBox = colliderBox(target),
  playerBox = player.physics!.box!;
setSimulationPosition(
  combat,
  'player',
  targetBox.x - playerBox.x - playerBox.width - 5,
  targetBox.y - playerBox.y,
);
const beforeHit = combat.gameplay!.values.ward_hp_1_0;
advance(
  combat,
  p,
  new Set(['d', ' ']),
  1000 / 60,
  () => {},
  () => {},
);
for (let i = 0; i < 38; i++)
  advance(
    combat,
    p,
    new Set([' ']),
    1000 / 60,
    () => {},
    () => {},
  );
assert.equal(
  combat.gameplay!.values.ward_hp_1_0,
  beforeHit - 1,
  'one actual overlap per held sword press',
);
const report = {
  valid: true,
  scenesVisited: [...visited],
  reachableInteractions,
  chaptersCompleted: 6,
  optionalStoriesCompleted: 8,
  endingsVerified: 3,
  earnedEndingGate: true,
  persistentCheckpointReload: true,
  milestoneAutosaves: 34,
  autosaveColdContinue: true,
  autosaveFailurePreservesPrevious: true,
  skippedChapterAutosaves: true,
  repeatedMilestonesDoNotWrite: true,
  duplicateRewardsPrevented: true,
  actualMeleeCollision: true,
  testScope:
    'Deterministic event/route/collision-grid audit. Does not measure human playtime, full combat difficulty or target-board performance.',
};
await writeFile('.cache/willowlight-route-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
