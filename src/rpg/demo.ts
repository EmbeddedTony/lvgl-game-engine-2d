import { exampleProject, terrain, textbox } from '../examples/common';
import { makeNode, type Project } from '../model';
import { makePhysics } from '../physics';
import { emptyGameplay, type Action } from '../gameplay/model';
export function createRpgDemo(): Project {
  const p = exampleProject('rpg_battle_lab', 'RPG Battle Lab');
  const g = (p.gameplay = emptyGameplay());
  g.state = ['potion', 'ether', 'antidote', 'revive'].map((id, i) => ({
    id,
    name: ['Potion', 'Ether', 'Antidote', 'Revive'][i] + ' quantity',
    folder: 'Inventory',
    kind: 'item' as const,
    initial: i === 0 ? 8 : 3,
    min: 0,
    max: 99,
    persistent: true,
  }));
  g.rpg = {
    items: [
      {
        id: 'potion',
        name: 'Potion',
        folder: 'Recovery',
        description: 'Restores 35 HP.',
        icon: 'relic',
        stack: 'potion',
        price: 10,
        heal: 35,
      },
      {
        id: 'ether',
        name: 'Ether',
        folder: 'Recovery',
        description: 'Restores 12 MP.',
        icon: 'spark',
        stack: 'ether',
        price: 15,
        heal: 0,
        mpHeal: 12,
      },
      {
        id: 'antidote',
        name: 'Antidote',
        folder: 'Recovery',
        description: 'Cures poison.',
        icon: 'spark',
        stack: 'antidote',
        price: 8,
        heal: 0,
        cure: 'poison',
      },
      {
        id: 'revive',
        name: 'Revive',
        folder: 'Recovery',
        description: 'Revives a fallen member with 20 HP.',
        icon: 'relic',
        stack: 'revive',
        price: 25,
        heal: 20,
        revive: true,
      },
    ],
    skills: [
      {
        id: 'spark_burst',
        name: 'Spark burst',
        folder: 'Magic',
        description: 'Hits all enemies.',
        effect: 'damage',
        power: 14,
        cost: 4,
        accuracy: 100,
        target: 'all-enemies',
      },
      {
        id: 'mend',
        name: 'Mend',
        folder: 'Magic',
        description: 'Restores 28 HP.',
        effect: 'heal',
        power: 28,
        cost: 3,
        accuracy: 100,
        target: 'ally',
      },
      {
        id: 'venom',
        name: 'Venom',
        folder: 'Enemy',
        description: 'Poisons a target.',
        effect: 'damage',
        power: 1,
        cost: 1,
        accuracy: 100,
        status: 'poison',
        statusChance: 100,
      },
      {
        id: 'rally',
        name: 'Rally',
        folder: 'Magic',
        description: 'Boosts own attack for three turns.',
        effect: 'heal',
        power: 0,
        cost: 2,
        accuracy: 100,
        target: 'self',
        status: 'might',
        statusChance: 100,
      },
      {
        id: 'regenerate',
        name: 'Renew',
        folder: 'Magic',
        description: 'Regenerates an ally.',
        effect: 'heal',
        power: 0,
        cost: 3,
        accuracy: 100,
        target: 'ally',
        status: 'regen',
        statusChance: 100,
      },
      {
        id: 'daze',
        name: 'Daze',
        folder: 'Magic',
        description: 'Briefly stuns an enemy.',
        effect: 'damage',
        power: 1,
        cost: 3,
        accuracy: 100,
        status: 'stun',
        statusChance: 100,
      },
    ],
    actors: [],
    encounters: [
      {
        id: 'woods',
        name: 'Woodland wisps',
        folder: 'Country',
        enemyCount: 2,
        entries: [
          { actor: 'wisp', weight: 3, minLevel: 1, maxLevel: 2 },
          { actor: 'mossling', weight: 1, minLevel: 1, maxLevel: 1 },
        ],
      },
    ],
    statuses: [
      { id: 'poison', name: 'Poison', folder: 'Harmful', kind: 'poison', potency: 10, turns: 3 },
      { id: 'regen', name: 'Regen', folder: 'Helpful', kind: 'regen', potency: 15, turns: 3 },
      { id: 'stun', name: 'Stun', folder: 'Harmful', kind: 'stun', potency: 0, turns: 1 },
      { id: 'might', name: 'Might', folder: 'Helpful', kind: 'attack-up', potency: 40, turns: 3 },
    ],
  };
  const actor = (
    id: string,
    name: string,
    hp: number,
    attack: number,
    defense: number,
    speed: number,
    mp: number,
    skills: string[],
    sprite: string,
  ) => ({
    id,
    name,
    folder: id === 'hero' || id === 'mira' ? 'Party' : 'Enemies',
    sprite,
    hp,
    attack,
    defense,
    speed,
    mp,
    mpGrowth: 2,
    hpGrowth: 6,
    attackGrowth: 2,
    defenseGrowth: 1,
    speedGrowth: 1,
    experience: 25,
    gold: 8,
    skills,
  });
  g.rpg.actors = [
    actor('hero', 'Arin', 68, 12, 6, 12, 12, ['rally', 'daze'], 'hero'),
    actor('mira', 'Mira', 52, 9, 4, 10, 20, ['spark_burst', 'mend', 'regenerate'], 'guide'),
    actor('wisp', 'Wisp', 25, 5, 2, 5, 4, ['venom'], 'spark'),
    actor('mossling', 'Mossling', 35, 7, 3, 4, 0, [], 'relic'),
  ];
  // Use existing original art IDs without imposing asset naming on the engine.
  for (const a of g.rpg.actors)
    if (!p.sprites.some((s) => s.id === a.sprite)) a.sprite = p.sprites[0].id;
  g.party = {
    members: [
      { id: 'arin', actor: 'hero', level: 1 },
      { id: 'mira_member', actor: 'mira', level: 1 },
    ],
    gold: 20,
    seed: 12345,
    allowFlee: true,
  };
  const say = (id: string, text: string): Action => ({
    id,
    type: 'say',
    speaker: 'Mira',
    text,
    choices: [],
  });
  g.scripts = [
    {
      id: 'fight',
      name: 'Woodland encounter',
      folder: 'Battle',
      blocking: true,
      actions: [
        {
          id: 'battle',
          type: 'battle',
          encounter: 'woods',
          win: 'win',
          lose: 'lose',
          escape: 'escape',
        },
        say('win', 'The path is clear! XP and gold are awarded automatically.'),
        { id: 'finish_win', type: 'end' },
        say('lose', 'Rest at camp and try again. Defeat keeps inventory and the party.'),
        { id: 'finish_lose', type: 'end' },
        say('escape', 'We escaped. Our health and supplies carry over.'),
        { id: 'finish_escape', type: 'end' },
      ],
    },
    {
      id: 'rest',
      name: 'Camp · restore party',
      folder: 'Party',
      blocking: true,
      actions: [
        { id: 'heal', type: 'party-rest' },
        say(
          'rested',
          'Everyone is rested. P opens party inventory. Supplies persist in your save.',
        ),
        { id: 'done', type: 'end' },
      ],
    },
  ];
  const set = p.tilesets![0];
  const frames = [0, 1, 2].map((f) => ({
    id: 'water_' + f,
    name: 'Water ' + f,
    solid: true,
    pixels: Array.from({ length: 16 * 16 }, (_, i) => {
      const x = i % 16,
        y = Math.floor(i / 16),
        light = (x + f * 3) % 12 < 5 && y % 6 === 2;
      return light ? [91, 169, 192, 255] : [46, 104, 151, 255];
    }).flat(),
  }));
  frames[0].name = 'Animated pond';
  set.tiles.push(...frames);
  set.tiles[set.tiles.length - 3].animation = {
    fps: 4,
    frames: ['water_0', 'water_1', 'water_2', 'water_1'],
  };
  set.columns += 1;
  set.cells.push('water_0');
  set.rows = Math.ceil(set.cells.length / set.columns);
  while (set.cells.length < set.columns * set.rows) set.cells.push('');
  const cells = Array(20 * 15).fill(1);
  const waterIndex = set.tiles.findIndex((t) => t.id === 'water_0') + 1;
  for (let y = 3; y < 7; y++) for (let x = 12; x < 18; x++) cells[y * 20 + x] = waterIndex;
  const map = terrain(p, 20, 15, cells);
  map.zIndex = -10;
  map.tilemap!.animations = {
    [waterIndex]: { fps: 4, frames: ['water_0', 'water_1', 'water_2', 'water_1'] },
  };
  p.scenes = [
    {
      id: 'camp',
      name: 'Camp & animated pond',
      background: '#51734b',
      objective: 'Try a battle, then open party inventory.',
      completion: '',
      music: '',
      nodes: [
        map,
        makeNode('sprite', {
          id: 'player',
          name: 'Arin',
          asset: g.rpg.actors[0].sprite,
          x: 64,
          y: 112,
          width: 16,
          height: 16,
          player: true,
          physics: { ...makePhysics('character'), layer: 2, mask: 1 },
          speed: 80,
        }),
        makeNode('sprite', {
          id: 'mira',
          name: 'Mira · rest at camp',
          asset: g.rpg.actors[1].sprite,
          x: 96,
          y: 112,
          width: 16,
          height: 16,
          events: [{ id: 'rest_talk', trigger: 'interact', script: 'rest' }],
        }),
        makeNode('button', {
          id: 'battle_button',
          name: 'Encounter · play',
          layer: 'ui',
          x: 8,
          y: 30,
          width: 100,
          height: 24,
          text: 'Battle',
          color: '#69547e',
          events: [{ id: 'fight_click', trigger: 'click', script: 'fight' }],
        }),
        makeNode('button', {
          id: 'rest_button',
          name: 'Camp · restore HP/MP',
          layer: 'ui',
          x: 116,
          y: 30,
          width: 100,
          height: 24,
          text: 'Rest',
          color: '#47664e',
          events: [{ id: 'rest_click', trigger: 'click', script: 'rest' }],
        }),
        ...textbox(
          'RPG BATTLE LAB',
          'Battle: attack / skills / items / guard.\nP: party | E / Enter: confirm. Rest heals.',
        ),
      ],
    },
  ];
  return p;
}
