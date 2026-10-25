import { dressTraveller } from './village-traveller';
import { dressVillage } from './village-world';
import { makeNode, type Project, type SpriteAsset, type GameNode } from '../model';
import { makePhysics } from '../physics';
import { emptyGameplay, type Animator } from '../gameplay/model';
import { defaultMelee } from '../action2d/model';
import { useH7Board } from '../boards/stm32h7s78';
import { exampleProject } from './common';
import { exampleSprites, exampleTiles } from './art';

/** Original art, deterministic assets and a single RLE world: no copyrighted game data. */
export function createH7Adventure(): Project {
  const p = exampleProject('h7_meadow', 'Willowlight - H7 Adventure');
  useH7Board(p);
  p.audio = [];
  p.gameplay = emptyGameplay();
  const hero = exampleSprites()[0];
  p.sprites = exampleSprites().filter((s) => s.id !== 'hero');
  const animator: Animator = { idle: '', move: '', jump: '', fall: '' };
  for (const dir of ['Down', 'Up', 'Left', 'Right'] as const) {
    for (const mode of ['idle', 'move', 'attack'] as const) {
      const frames: string[] = [];
      const count = mode === 'idle' ? 1 : 4;
      for (let phase = 0; phase < count; phase++) {
        const id = `hero_${mode}_${dir}_${phase}`;
        frames.push(id);
        p.sprites.push(travellerFrame(hero, id, dir, mode, phase));
      }
      const id = `${mode}${dir}`;
      p.gameplay.animations.push({
        id,
        name: `Traveller ${mode} ${dir}`,
        fps: 12,
        loop: mode !== 'attack',
        frames,
      });
      animator[id as keyof Animator] = id;
    }
  }
  animator.idle = 'idleDown';
  animator.move = 'moveDown';
  const set = exampleTiles();
  set.id = 'meadow_tiles';
  set.name = 'Meadow terrain - 32 px';
  set.tileSize = 32;
  set.tiles = set.tiles.map((t) => ({ ...t, pixels: scale2(t.pixels, 16) }));
  for (let phase = 1; phase <= 2; phase++) {
    const pixels = Array.from({ length: 32 * 32 }, (_, i) => {
      const x = i % 32,
        y = Math.floor(i / 32),
        wave = (x + phase * 5) % 16 < 10 && (y + phase * 4) % 16 === 6;
      return wave ? [122, 209, 213, 255] : [48, 116 + ((x + y) % 12), 153, 255];
    }).flat();
    set.tiles.push({ id: `water_${phase}`, name: `Water frame ${phase}`, pixels, solid: true });
  }
  set.columns = 4;
  set.rows = 3;
  set.cells = Array.from({ length: 12 }, (_, i) => set.tiles[i]?.id ?? '');
  const water = { fps: 5, frames: ['terrain_3', 'water_1', 'water_2'] };
  set.tiles[3].animation = water;
  p.tilesets = [set];
  const columns = 96,
    rows = 64;
  const cells = Array.from({ length: columns * rows }, (_, i) => {
    const x = i % columns,
      y = Math.floor(i / columns);
    if (x === 0 || y === 0 || x === columns - 1 || y === rows - 1) return 3;
    // A broad continuous trail, with connected clearings and a bridge over the stream.
    const trail = Math.abs(y - 30) < 2 || Math.abs(x - 45) < 2 || (y > 40 && y < 44);
    if (x >= 56 && x <= 61 && y > 5 && y < 58) return Math.abs(y - 30) < 2 ? 9 : 4;
    if ((x - 27) ** 2 + (y - 20) ** 2 < 60) return 4;
    if (trail) return 2;
    if ((x % 17 === 4 || x % 17 === 5) && (y % 13 === 5 || y % 13 === 6)) return 3;
    return 1;
  });
  const nodes: GameNode[] = [
    makeNode('tilemap', {
      id: 'terrain',
      x: 0,
      y: 0,
      name: 'Meadow · forest · river · bridge',
      width: columns * 32,
      height: rows * 32,
      tilemap: {
        tileSize: 32,
        columns,
        rows,
        tiles: set.tiles.map((t) => t.id),
        cells,
        solidTiles: [3, 4, 6, 7, 8],
        animations: { 4: water },
        tileset: set.id,
      },
    }),
    makeNode('sprite', {
      id: 'player',
      name: 'Traveller · camera target',
      asset: 'hero_idle_Down_0',
      x: 45 * 32 - 32,
      y: 30 * 32 - 32,
      width: 64,
      height: 64,
      player: true,
      speed: 160,
      sortY: true,
      animator,
      melee: { ...defaultMelee(), reach: 30, width: 44 },
      physics: {
        ...makePhysics('character'),
        layer: 2,
        mask: 1,
        box: { x: 22, y: 34, width: 20, height: 14 },
      },
    }),
  ];
  for (let i = 0; i < 12; i++) {
    const x = (i < 6 ? 48 + i * 3 : 36 - (i - 6) * 3) * 32,
      y = (i % 2 ? 29 : 31) * 32;
    const id = `bush_${i}`;
    nodes.push(
      makeNode('sprite', {
        id,
        name: `Cuttable grass ${i + 1}`,
        asset: 'flower',
        x,
        y,
        width: 32,
        height: 32,
        sortY: true,
        physics: {
          ...makePhysics('area'),
          layer: 4,
          mask: 0,
          box: { x: 3, y: 8, width: 26, height: 24 },
        },
        events: [{ id: `hit_${i}`, trigger: 'hit', script: `cut_${i}` }],
      }),
    );
    p.gameplay.scripts.push({
      id: `cut_${i}`,
      name: `Cut grass ${i + 1}`,
      folder: 'meadow/grass',
      blocking: false,
      actions: [
        { id: 'hide', type: 'visible', node: id, value: false },
        { id: 'end', type: 'end' },
      ],
    });
  }
  nodes.push(
    makeNode('sprite', {
      id: 'guide',
      name: 'Mira · talk with E',
      asset: 'guide',
      x: 43 * 32,
      y: 28 * 32,
      width: 32,
      height: 32,
      sortY: true,
      events: [{ id: 'talk', trigger: 'interact', script: 'welcome' }],
    }),
  );
  p.gameplay.scripts.push({
    id: 'welcome',
    name: 'Mira explains the meadow',
    folder: 'meadow/dialogue',
    blocking: true,
    actions: [
      {
        id: 'hello',
        type: 'say',
        speaker: 'MIRA',
        text: 'Follow the trail east to the bridge.\nSwing your sword to cut the wildflowers.\nThe river and pond have animated water.',
        choices: [],
      },
      { id: 'end', type: 'end' },
    ],
  });
  nodes.push(
    makeNode('rect', {
      id: 'hud_bg',
      x: 0,
      y: 0,
      name: 'HUD',
      layer: 'ui',
      width: 800,
      height: 36,
      color: '#22343b',
    }),
    makeNode('label', {
      id: 'title',
      name: 'Meadow title',
      x: 16,
      y: 8,
      width: 340,
      height: 24,
      text: 'WILLOWLIGHT  /  H7 ADVENTURE',
      color: '#f2d49a',
    }),
    makeNode('label', {
      id: 'hint',
      name: 'Control hint',
      x: 370,
      y: 8,
      width: 420,
      height: 24,
      text: 'Hold arrows to move | SWORD / TALK',
      color: '#dbebd8',
    }),
  );
  const button = (
    id: string,
    text: string,
    x: number,
    y: number,
    w: number,
    action: GameNode['inputAction'],
  ) =>
    makeNode('button', {
      id,
      name: `Touch ${text}`,
      text,
      layer: 'ui',
      x,
      y,
      width: w,
      height: 44,
      color: '#29434b',
      inputAction: action,
      radius: 6,
    });
  nodes.push(
    button('pad_up', '^', 64, 328, 48, 'up'),
    button('pad_left', '<', 12, 376, 48, 'left'),
    button('pad_right', '>', 116, 376, 48, 'right'),
    button('pad_down', 'v', 64, 424, 48, 'down'),
    button('slash', 'SWORD', 688, 416, 96, 'action'),
    button('talk', 'TALK', 688, 364, 96, 'interact'),
  );
  p.scenes = [
    {
      id: 'meadow',
      name: 'Willowlight Meadow',
      folder: 'overworld',
      background: '#558b50',
      music: '',
      objective: 'Explore the meadow. Find Mira above the crossroads.',
      completion: '',
      nodes,
      camera2d: { worldWidth: 3072, worldHeight: 2048, follow: 'player', axis: 'both' },
      touchControls: true,
    },
  ];
  p.flow = {
    folders: [{ id: 'overworld', name: 'World / Overworld' }],
    sequences: [],
    entry: { kind: 'scene', id: 'meadow' },
  };
  p.code = `/* Built-in camera, physics, melee and event scripts run in both previews.
 * Board input: touch arrows / SWORD / TALK. Desktop: WASD / Space / E.
 * Override game_on_event to react to ui_melee_hit(game), or add Hit event pages.
 * Audio can be linked with ui_init_with_config(&config); hardware owns I2S/DMA.
 */\n#include "ui.h"\nvoid game_on_event(lge_engine_t *g, lge_event_t event, lge_node_t *node, void *user) {\n    (void)g; (void)event; (void)node; (void)user;\n}\nvoid game_on_update(lge_engine_t *g, float dt, void *user) {\n    (void)g; (void)dt; (void)user;\n}\n`;
  dressVillage(p);
  dressTraveller(p);
  return p;
}
function scale2(src: number[], size: number): number[] {
  return Array.from({ length: size * size * 4 }, (_, i) => i).flatMap((i) => {
    const x = i % (size * 2),
      y = Math.floor(i / (size * 2));
    return src.slice(
      (Math.floor(y / 2) * size + Math.floor(x / 2)) * 4,
      (Math.floor(y / 2) * size + Math.floor(x / 2)) * 4 + 4,
    );
  });
}
function travellerFrame(
  hero: SpriteAsset,
  id: string,
  dir: string,
  mode: string,
  phase: number,
): SpriteAsset {
  const pixels = new Array<number>(32 * 32 * 4).fill(0);
  const put = (x: number, y: number, c: number[]) => {
    if (x >= 0 && y >= 0 && x < 32 && y < 32) pixels.splice((y * 32 + x) * 4, 4, ...c);
  };
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const sourceX = dir === 'Left' ? 15 - x : x;
      let c = hero.pixels.slice((y * 16 + sourceX) * 4, (y * 16 + sourceX) * 4 + 4);
      if (dir === 'Up' && y >= 3 && y <= 5 && c[3]) c = [103, 65, 57, 255];
      const stride = mode === 'move' && y >= 12 ? (phase % 2 ? (x < 8 ? 1 : -1) : 0) : 0;
      put(x + 8, y + 8 + stride, c);
    }
  if (mode === 'attack') {
    const angle = { Down: Math.PI / 2, Up: -Math.PI / 2, Left: Math.PI, Right: 0 }[dir]!;
    const a = angle + [-0.8, -0.3, 0.3, 0.8][phase];
    for (let radius = 7; radius < 16; radius++) {
      const x = Math.round(16 + Math.cos(a) * radius),
        y = Math.round(17 + Math.sin(a) * radius);
      put(x, y, [239, 244, 221, 255]);
      put(x + 1, y, [136, 198, 202, 255]);
    }
    for (let step = 0; step < 12; step++) {
      const b = a - 0.6 + step * 0.1;
      put(
        Math.round(16 + Math.cos(b) * 14),
        Math.round(17 + Math.sin(b) * 14),
        [245, 208, 121, 255],
      );
    }
  }
  return { id, name: id.replaceAll('_', ' '), width: 32, height: 32, pixels };
}
