import { exampleSprites } from '../examples/art';
import { createStarter } from '../assets';
import { makeNode, type Project } from '../model';
import { makePhysics } from '../physics';
import { emptyGameplay } from './model';
import { defaultPattern } from './toolkit';
/** A compact integration fixture as well as an editable teaching project. */
export function createToolkitDemo(): Project {
  const p = createStarter();
  p.id = 'toolkit_lab';
  p.name = '2D Toolkit Lab';
  delete p.flow;
  p.sprites = exampleSprites();
  const ramp = (id: string, up: boolean) => {
    const pixels: number[] = [];
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 32; x++)
        pixels.push(
          ...(y >= (up ? 23 - (x * 24) / 32 : (x * 24) / 32) ? [92, 146, 109, 255] : [0, 0, 0, 0]),
        );
    p.sprites.push({
      id,
      name: up ? 'Rising ramp' : 'Falling ramp',
      width: 32,
      height: 24,
      pixels,
    });
    return id;
  };
  const up = ramp('ramp_up', true),
    down = ramp('ramp_down', false);
  const label = (id: string, text: string, y: number, height = 20) =>
    makeNode('label', {
      id,
      name: id,
      layer: 'ui',
      x: 12,
      y,
      width: 296,
      height,
      text,
      color: '#dbe8ef',
    });
  const hero = p.sprites[0].id;
  p.scenes = [
    {
      id: 'platform_lab',
      name: '01 · Ramps & platforms',
      background: '#202b38',
      music: '',
      objective: '',
      completion: '',
      nodes: [
        label('title', 'RAMPS & MOVING PLATFORMS', 10),
        label(
          'instructions',
          'A/D move · Space jump\nGreen ramps · purple platforms carry riders.',
          215,
          24,
        ),
        makeNode('rect', {
          id: 'floor_left',
          x: 0,
          y: 200,
          width: 72,
          height: 12,
          color: '#49634f',
          solid: true,
        }),
        makeNode('sprite', {
          id: 'ramp',
          name: 'Ramp rises right',
          x: 72,
          y: 152,
          width: 64,
          height: 48,
          asset: up,
          solid: true,
          physics: { ...makePhysics('static'), slope: 'up' },
        }),
        makeNode('rect', {
          id: 'crest',
          x: 136,
          y: 152,
          width: 48,
          height: 60,
          color: '#49634f',
          solid: true,
        }),
        makeNode('sprite', {
          id: 'ramp_down',
          name: 'Ramp falls right',
          x: 184,
          y: 152,
          width: 64,
          height: 48,
          asset: down,
          solid: true,
          physics: { ...makePhysics('static'), slope: 'down' },
        }),
        makeNode('rect', {
          id: 'floor_right',
          x: 248,
          y: 200,
          width: 72,
          height: 12,
          color: '#49634f',
          solid: true,
        }),
        makeNode('rect', {
          id: 'lift',
          name: 'Ping-pong lift',
          x: 252,
          y: 132,
          width: 48,
          height: 8,
          color: '#ac8cda',
          solid: true,
          physics: { ...makePhysics('platform'), travel: { x: 0, y: -48, durationMs: 2000 } },
        }),
        makeNode('rect', {
          id: 'code_platform',
          name: 'Platform moved by update hook',
          x: 24,
          y: 96,
          width: 48,
          height: 8,
          color: '#ac8cda',
          solid: true,
          physics: { ...makePhysics('platform'), motion: 'code' },
        }),
        makeNode('sprite', {
          id: 'player',
          name: 'Player',
          x: 20,
          y: 184,
          width: 16,
          height: 16,
          asset: hero,
          player: true,
          speed: 80,
          physics: {
            ...makePhysics('character'),
            motion: 'platformer',
            gravity: 700,
            jumpSpeed: 280,
            coyoteMs: 90,
            bufferMs: 90,
          },
        }),
      ],
    },
    {
      id: 'bullet_lab',
      name: '02 · Bullet patterns',
      background: '#202b38',
      music: '',
      objective: '',
      completion: '',
      nodes: [
        label('title', 'BULLET PATTERN ARENA', 10),
        label(
          'instructions',
          'WASD dodge · orange shots use a fixed pool.\nHit events update saved state; inspect Session.',
          212,
          28,
        ),
        makeNode('rect', {
          id: 'emitter',
          name: 'Spiral emitter',
          x: 156,
          y: 48,
          width: 8,
          height: 8,
          color: '#90b9df',
          emitter: { pattern: 'spiral', autoplay: true },
        }),
        makeNode('sprite', {
          id: 'player',
          name: 'Player',
          x: 152,
          y: 170,
          width: 16,
          height: 16,
          asset: hero,
          player: true,
          speed: 80,
          physics: makePhysics('character'),
          events: [{ id: 'hit_page', trigger: 'hit', script: 'count_hits' }],
        }),
      ],
    },
  ];
  p.gameplay = {
    ...emptyGameplay(),
    projectileLimit: 32,
    patterns: [
      {
        ...defaultPattern('spiral'),
        name: 'Gentle spiral',
        mode: 'ring',
        count: 8,
        rotation: 15,
        intervalMs: 800,
        lifetimeMs: 2800,
        speed: 45,
      },
    ],
    state: [
      {
        id: 'hits',
        name: 'Arena hits',
        folder: 'Arena',
        kind: 'counter',
        initial: 0,
        min: 0,
        max: 9999,
        persistent: false,
      },
      {
        id: 'potions',
        name: 'Potion count',
        folder: 'Inventory',
        kind: 'item',
        initial: 3,
        min: 0,
        max: 99,
        persistent: true,
      },
    ],
    scripts: [
      {
        id: 'count_hits',
        name: 'Record projectile hit',
        folder: 'Arena',
        blocking: false,
        actions: [
          { id: 'add', type: 'state', key: 'hits', operation: 'add', value: 1 },
          { id: 'end', type: 'end' },
        ],
      },
    ],
    rpg: {
      items: [
        {
          id: 'potion',
          name: 'Amber potion',
          folder: 'Consumables',
          description: 'Restores 20 HP. Inventory count is saved as normal gameplay state.',
          icon: '',
          stack: 'potions',
          price: 25,
          heal: 20,
        },
      ],
      skills: [
        {
          id: 'strike',
          name: 'Strike',
          folder: 'Combat',
          description: 'Simple physical attack.',
          effect: 'damage',
          power: 8,
          cost: 0,
          accuracy: 95,
        },
        {
          id: 'mend',
          name: 'Mend',
          folder: 'Support',
          description: 'Restores 12 HP.',
          effect: 'heal',
          power: 12,
          cost: 3,
          accuracy: 100,
        },
      ],
      actors: [
        {
          id: 'ranger',
          name: 'Ranger',
          folder: 'Party',
          sprite: hero,
          hp: 40,
          attack: 10,
          defense: 6,
          speed: 8,
          hpGrowth: 6,
          attackGrowth: 2,
          defenseGrowth: 1,
          speedGrowth: 1,
          skills: ['strike', 'mend'],
          experience: 0,
        },
        {
          id: 'wisp',
          name: 'Grove wisp',
          folder: 'Creatures',
          sprite: hero,
          hp: 18,
          attack: 6,
          defense: 2,
          speed: 5,
          hpGrowth: 3,
          attackGrowth: 1,
          defenseGrowth: 1,
          speedGrowth: 1,
          skills: ['strike'],
          experience: 12,
        },
      ],
      encounters: [
        {
          id: 'grove',
          name: 'Grove encounters',
          folder: 'Overworld',
          entries: [{ actor: 'wisp', weight: 100, minLevel: 1, maxLevel: 4 }],
        },
      ],
    },
  };
  p.code = `#include "ui.h"
#include <string.h>
static float platform_direction = 1;
void game_on_event(lge_engine_t *game, lge_event_t event, lge_node_t *node, void *user) {
    (void)game; (void)node; (void)user;
    if (event == LGE_EVENT_START) platform_direction = 1;
    /* On PROJECTILE_HIT, ui_projectile_hit()->pattern->damage is available.
       The authored Hit script counts hits; add your invulnerability/combat rules here. */
}
void game_on_update(lge_engine_t *game, float dt_seconds, void *user) {
    (void)game; (void)user;
    lge_node_t *platform = ui_find_node("code_platform");
    if (!platform) return;
    if (platform->x >= 104) platform_direction = -1;
    if (platform->x <= 24) platform_direction = 1;
    /* Velocity is px/s; displacement is velocity * dt. This carries passengers.
       Built-in ping-pong/velocity motion runs in both previews; custom C runs in Native Play. */
    ui_platform_move("code_platform", platform_direction * 40 * dt_seconds, 0);
}
`;
  return p;
}
