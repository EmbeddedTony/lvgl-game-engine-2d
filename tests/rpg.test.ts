import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpgDemo } from '../src/rpg/demo';
import { parseProject, validate } from '../src/model';
import { createSession } from '../src/gameplay/runtime';
import { saveState, restoreState } from '../src/gameplay/save';
import {
  startBattle,
  battleCommand,
  acknowledgeBattle,
  partyRest,
  partyUseItem,
  partyAdd,
  partyRemove,
  stats,
  random,
} from '../src/rpg/runtime';
import { openParty, rpgOptions, selectRpgOption, stepRpgInput } from '../src/rpg/view';
import { generate } from '../src/exporter';
const setup = () => {
  const p = parseProject(JSON.stringify(createRpgDemo()));
  return { p, g: createSession(p) };
};
test('RPG example validates and exports immutable battle tables and animated frames', () => {
  const { p } = setup();
  assert.deepEqual(
    validate(p).filter((x) => x.severity === 'error'),
    [],
  );
  const { files } = generate(p, {});
  assert.match(String(files['ui/generated/game_data.c']), /LGE_ACTION_BATTLE/);
  assert.match(String(files['ui/generated/game_data.c']), /game_party=/);
  assert.match(String(files['ui/generated/game_data.c']), /tile_animation/);
});
test('party inventory consumes useful items only, revives, cures, bounds roster and restores MP', () => {
  const { p, g } = setup(),
    r = g.rpg!;
  assert.equal(partyUseItem(g, p, 'potion', 0), false);
  assert.equal(g.values.potion, 8);
  r.party[0].hp = 0;
  assert.equal(partyUseItem(g, p, 'potion', 0), false);
  assert.equal(partyUseItem(g, p, 'revive', 0), true);
  assert.equal(r.party[0].hp, 20);
  r.party[0].statuses[0] = 3;
  assert.equal(partyUseItem(g, p, 'antidote', 0), true);
  assert.equal(r.party[0].statuses[0], 0);
  r.party[1].mp = 0;
  assert.equal(partyUseItem(g, p, 'ether', 1), true);
  assert.equal(r.party[1].mp, 12);
  assert.ok(partyAdd(g, p, 'hero', 2));
  assert.ok(partyAdd(g, p, 'hero', 3));
  assert.equal(partyAdd(g, p, 'hero', 1), false);
  assert.equal(partyRemove(g, NaN), false);
  assert.ok(partyRemove(g, 3));
  assert.ok(partyRest(g, p));
  assert.equal(r.party[0].hp, stats(p, r.party[0]).hp);
});
test('turns validate targets/MP, resolve enemies, statuses, victory XP/gold once', () => {
  const { p, g } = setup(),
    r = g.rpg!;
  assert.ok(startBattle(g, p, 'woods'));
  assert.equal(r.turn, 0);
  assert.equal(battleCommand(g, p, 'attack', '', 0), false);
  assert.equal(battleCommand(g, p, 'skill', 'venom', 4), false);
  assert.ok(battleCommand(g, p, 'skill', 'rally', 0));
  assert.equal(r.party[0].mp, 10);
  assert.equal(r.party[0].statuses[3], 3);
  assert.equal(r.turn, 1);
  assert.ok(battleCommand(g, p, 'skill', 'spark_burst', 4));
  let commands = 0;
  while (r.phase === 'command' && commands++ < 40) {
    const target = r.enemies.findIndex((m) => m.hp > 0) + 4;
    assert.ok(battleCommand(g, p, 'attack', '', target));
  }
  assert.equal(r.phase, 'victory');
  assert.ok(r.gold > 20);
  assert.ok(r.party.some((m) => m.xp > 0));
  const gold = r.gold;
  assert.ok(acknowledgeBattle(g));
  assert.equal(acknowledgeBattle(g), false);
  assert.equal(r.gold, gold);
});
test('seeded combat is deterministic and menus page bounded resources', () => {
  const a = setup(),
    b = setup();
  startBattle(a.g, a.p, 'woods');
  startBattle(b.g, b.p, 'woods');
  for (let i = 0; i < 8 && a.g.rpg!.phase === 'command'; i++) {
    const t = a.g.rpg!.enemies.findIndex((m) => m.hp > 0) + 4;
    battleCommand(a.g, a.p, 'attack', '', t);
    battleCommand(b.g, b.p, 'attack', '', t);
  }
  assert.deepEqual(a.g.rpg, b.g.rpg);
  const { p, g } = setup();
  assert.ok(openParty(g, p));
  assert.ok(rpgOptions(g, p).length <= 8);
  assert.equal(selectRpgOption(g, p, 99), false);
  stepRpgInput(g, p, 64);
  assert.equal(g.rpg!.menuOpen, false);
});
test('party saves round-trip atomically, preserve RNG and inventory, reject battle/corruption', () => {
  const { p, g } = setup(),
    r = g.rpg!;
  r.party[0].hp = 17;
  r.party[0].statuses[0] = 2;
  r.gold = 42;
  random(r);
  g.values.potion = 2;
  const bytes = saveState(g, p);
  r.party[0].hp = 1;
  r.gold = 0;
  g.values.potion = 0;
  assert.ok(restoreState(g, p, bytes));
  assert.equal(g.rpg!.party[0].hp, 17);
  assert.equal(g.rpg!.gold, 42);
  assert.equal(g.values.potion, 2);
  const before = JSON.stringify(g),
    bad = bytes.slice();
  bad[bad.length - 1] ^= 1;
  assert.equal(restoreState(g, p, bad), false);
  assert.equal(JSON.stringify(g), before);
  assert.ok(startBattle(g, p, 'woods'));
  assert.equal(saveState(g, p).length, 0);
  assert.equal(restoreState(g, p, bytes), false);
});

test('long stun chains yield, defeat does not reward and seeded escape remains bounded', () => {
  const { p, g } = setup(),
    r = g.rpg!;
  p.gameplay!.rpg!.statuses![2].turns = 9;
  assert.ok(startBattle(g, p, 'woods'));
  for (const m of [...r.party, ...r.enemies]) m.statuses[2] = 9;
  stepRpgInput(g, p, 0);
  stepRpgInput(g, p, 0);
  assert.ok(r.party.every((m) => m.statuses[2] === 0));
  assert.equal(r.phase, 'command');
  r.party.forEach((m) => {
    m.hp = 1;
    m.statuses[0] = 1;
  });
  for (let i = 0; i < 8 && r.phase === 'command'; i++) battleCommand(g, p, 'guard');
  assert.equal(r.phase, 'defeat');
  assert.equal(r.gold, 20);
  assert.equal(r.party[0].xp, 0);
  assert.ok(acknowledgeBattle(g));
  assert.equal(startBattle(g, p, 'woods'), false);
  assert.ok(partyRest(g, p));
  assert.ok(startBattle(g, p, 'woods'));
  for (let i = 0; i < 20 && r.phase === 'command'; i++) battleCommand(g, p, 'flee');
  assert.ok(['escaped', 'defeat'].includes(r.phase));
});

test('well-checksummed malformed party payloads fail atomically and names preserve save compatibility', () => {
  const { p, g } = setup(),
    bytes = saveState(g, p),
    at = 16 + new DataView(bytes.buffer).getUint32(8, true);
  const before = JSON.stringify(g);
  const mutations = [
    (v: DataView) => v.setUint32(at, 1000001, true),
    (v: DataView) => v.setUint32(at + 4, 0, true),
    (v: DataView) => v.setUint32(at + 8, 0, true),
    (v: DataView) => v.setUint16(at + 12, 65535, true),
    (v: DataView) => v.setUint16(at + 16, 9999, true),
    (v: DataView) => v.setUint8(at + 12 + 12 + 15, 1),
  ];
  for (const mutate of mutations) {
    const bad = bytes.slice(),
      v = new DataView(bad.buffer);
    mutate(v);
    let h = 2166136261;
    for (const b of bad.subarray(0, -4)) h = Math.imul(h ^ b, 16777619) >>> 0;
    v.setUint32(bad.length - 4, h, true);
    assert.equal(restoreState(g, p, bad), false);
    assert.equal(JSON.stringify(g), before);
  }
  p.gameplay!.rpg!.actors[0].name = 'Renamed hero';
  assert.ok(restoreState(g, p, bytes));
});

test('enemy healing uses the exact half-HP threshold even with odd maximum HP', () => {
  const { p, g } = setup();
  const w = p.gameplay!.rpg!.actors.find((a) => a.id === 'wisp')!;
  Object.assign(w, { hp: 7, hpGrowth: 0, mp: 4, skills: ['mend'], speed: 50, attack: 1 });
  p.gameplay!.rpg!.encounters[0].enemyCount = 1;
  p.gameplay!.rpg!.encounters[0].entries = [{ actor: 'wisp', weight: 1, minLevel: 1, maxLevel: 1 }];
  startBattle(g, p, 'woods');
  g.rpg!.enemies[0].hp = 3;
  assert.ok(battleCommand(g, p, 'guard'));
  while (g.rpg!.turn !== 0 && g.rpg!.phase === 'command') battleCommand(g, p, 'guard');
  assert.equal(g.rpg!.enemies[0].hp, 7);
  assert.equal(g.rpg!.enemies[0].mp, 1);
});
