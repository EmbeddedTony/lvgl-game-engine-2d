import { writeFile, mkdir } from 'node:fs/promises';
import { createRpgDemo } from '../src/rpg/demo';
import { createSession } from '../src/gameplay/runtime';
import {
  random,
  partyRest,
  startBattle,
  battleCommand,
  acknowledgeBattle,
} from '../src/rpg/runtime';
import { saveState } from '../src/gameplay/save';
const p = createRpgDemo(),
  g = createSession(p),
  r = g.rpg!;
r.party[0].hp = 17;
r.party[0].statuses[0] = 2;
r.gold = 42;
random(r);
g.values.potion = 2;
await mkdir('.cache', { recursive: true });
await writeFile('.cache/rpg-save.bin', saveState(g, p));

partyRest(g, p);
startBattle(g, p, 'woods');
battleCommand(g, p, 'skill', 'rally', 0);
battleCommand(g, p, 'skill', 'spark_burst', 4);
for (let i = 0; i < 40 && r.phase === 'command'; i++)
  battleCommand(g, p, 'attack', '', r.enemies.findIndex((m) => m.hp > 0) + 4);
acknowledgeBattle(g);
await writeFile('.cache/rpg-final.bin', saveState(g, p));
