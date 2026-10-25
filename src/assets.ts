import type { SpriteAsset, AudioCue, Project, GameNode } from './model';
import { makeNode, uid } from './model';
const palette: Record<string, number[]> = {
  '.': [0, 0, 0, 0],
  a: [22, 51, 44, 255],
  b: [35, 80, 57, 255],
  c: [55, 109, 65, 255],
  d: [86, 142, 77, 255],
  e: [125, 170, 89, 255],
  t: [78, 61, 46, 255],
  u: [115, 84, 54, 255],
  s: [173, 187, 161, 255],
  w: [237, 229, 189, 255],
  h: [215, 157, 109, 255],
  r: [190, 93, 73, 255],
  k: [38, 45, 52, 255],
  m: [74, 153, 144, 255],
  n: [109, 207, 180, 255],
  l: [182, 244, 211, 255],
  f: [235, 189, 103, 255],
};
function sprite(id: string, name: string, rows: string[]): SpriteAsset {
  const pixels: number[] = [];
  for (const row of rows)
    for (let repeat = 0; repeat < 2; repeat++)
      for (const ch of row.padEnd(16, '.')) for (let x = 0; x < 2; x++) pixels.push(...palette[ch]);
  return { id, name, width: 32, height: rows.length * 2, pixels };
}
export const starterSprites: SpriteAsset[] = [
  sprite('spr_tree', 'Pine tree', [
    '.......bb.......',
    '......bccb......',
    '.....bcddcb.....',
    '....bccddccb....',
    '...bccddddccb...',
    '..bbccddddccbb..',
    '....bccddccb....',
    '...bccddddccb...',
    '..bccddeddcccb..',
    '.bbccddddddccbb.',
    '...bccddddccb...',
    '..bccddddddccb..',
    '.bccddddddddccb.',
    'bbccccccccccccbb',
    '......tuut......',
    '......tttt......',
  ]),
  sprite('spr_player', 'Little explorer', [
    '................',
    '................',
    '......kkkk......',
    '.....khhhhk.....',
    '.....hhhhhh.....',
    '.....hkhhkh.....',
    '......hhhh......',
    '.....rwwrrr.....',
    '....rrwrrrrr....',
    '....hrrmrrrh....',
    '....hmmmmmmh....',
    '.....mmmmmm.....',
    '.....kk.kk......',
    '.....kk.kk......',
    '.....tt.tt......',
    '................',
  ]),
  sprite('spr_crystal', 'Amber crystal', [
    '................',
    '................',
    '................',
    '.......ff.......',
    '......fwwf......',
    '.....ffwwff.....',
    '.....ffwwff.....',
    '....ffwwwfff....',
    '....fffwwfff....',
    '.....ffffff.....',
    '......ffff......',
    '.......ff.......',
    '................',
    '................',
    '................',
    '................',
  ]),
  sprite('spr_stone', 'Mossy stone', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....ssssss.....',
    '....sswwwsss....',
    '...ssswwsssss...',
    '...sssssccsss...',
    '...ssssccccss...',
    '...bssssccssb...',
    '....bbbbbbbb....',
    '................',
    '................',
    '................',
    '................',
  ]),
];
export function bytesToBase64(bytes: Uint8Array) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function base64ToBytes(s: string) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function tone(): AudioCue {
  const rate = 22050,
    count = Math.floor(rate * 0.22),
    bytes = new Uint8Array(44 + count * 2),
    v = new DataView(bytes.buffer);
  const text = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    const env = Math.min(1, t / 0.008) * Math.pow(1 - i / count, 2);
    v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * (t < 0.09 ? 880 : 1320) * t) * env * 12000, true);
  }
  return {
    id: 'cue_pickup',
    name: 'Crystal pickup',
    file: 'crystal_pickup.wav',
    data: bytesToBase64(bytes),
    sampleRate: rate,
    channels: 1,
    duration: 0.22,
    bus: 'sfx',
    gain: 0.65,
    loop: false,
    priority: 128,
  };
}
function terrain(id: string, name: string, base: number[], accent: number[]): SpriteAsset {
  const pixels: number[] = [];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const speck = (x * 37 + y * 73 + x * y * 3) % 113 < 3;
      pixels.push(...(speck ? accent : base), 255);
    }
  return { id, name, width: 32, height: 32, pixels };
}
starterSprites.push(terrain('tile_grass', 'Grass tile', [41, 75, 57], [56, 92, 62]));
starterSprites.push(terrain('tile_path', 'Path tile', [73, 102, 75], [85, 113, 79]));
starterSprites.push(terrain('tile_water', 'Water tile', [43, 88, 91], [66, 120, 120]));
export const defaultCode = `#include "ui.h"

/* Native hooks run on the LVGL thread. Keep them short and non-blocking.
 * Built-in movement, collection and audio run before this callback.
 * Preview runs built-in behaviors; compile this C with your firmware.
 * Public API: ui_request_scene, ui_label_set_text, ui_audio_play.
 * Stable scene/node/sound constants are in ui_ids.h.
 */
void game_on_event(lge_engine_t *game, lge_event_t event,
                   lge_node_t *node, void *user)
{
    (void)game;
    (void)node;
    (void)user;
    switch (event) {
    case LGE_EVENT_START:
        /* Scene loaded. Initialize your own game state here. */
        break;
    case LGE_EVENT_COLLECT:
        /* game->score is already updated; node is the collected object. */
        break;
    case LGE_EVENT_COMPLETE:
        /* All visible collectibles were found. */
        break;
    case LGE_EVENT_CLICK:
        /* Route a UI button using node->definition->id. */
        break;
    case LGE_EVENT_AREA_ENTER:
        /* node is the area; game->event_other is the entering body/area.
         * Example: a Hitbox area detects only the Hurtbox collision layer. */
        break;
    case LGE_EVENT_PROJECTILE_HIT:
    case LGE_EVENT_AREA_EXIT:
        /* game->event_other has left, or its visibility was disabled. */
        break;
    case LGE_EVENT_EXIT:
        /* Release scene-owned user resources; old nodes still exist here. */
        break;
    default:
        /* Optional lifecycle events, including prefab SPAWN / DESPAWN. */
        break;
    }
}

void game_on_update(lge_engine_t *game, float dt_seconds, void *user)
{
    (void)game;
    (void)dt_seconds;
    (void)user;
    /* Fixed 60 Hz, paused with the game. Extend your game rules here. */
}
`;
export function createStarter(): Project {
  const nodes: GameNode[] = [];
  const add = (kind: GameNode['kind'], n: Partial<GameNode>) => nodes.push(makeNode(kind, n));
  const cells = Array.from({ length: 70 }, (_, i) => {
    const x = i % 10,
      y = Math.floor(i / 10);
    return x === 4 || x === 5 || ((y === 3 || y === 4) && x > 0 && x < 9) ? 2 : 1;
  });
  add('tilemap', {
    id: 'terrain',
    name: 'Terrain',
    x: 0,
    y: 16,
    width: 320,
    height: 224,
    tilemap: {
      tileSize: 32,
      columns: 10,
      rows: 7,
      tiles: ['tile_grass', 'tile_path', 'tile_water'],
      cells,
      solidTiles: [3],
    },
  });
  const trees = [
    [8, 35],
    [37, 30],
    [80, 32],
    [218, 28],
    [253, 36],
    [282, 48],
    [4, 76],
    [282, 91],
    [12, 173],
    [44, 190],
    [91, 198],
    [213, 190],
    [258, 178],
    [285, 164],
  ];
  trees.forEach(([x, y], i) =>
    add('sprite', {
      id: `tree_${i}`,
      name: `Pine ${String(i + 1).padStart(2, '0')}`,
      x,
      y,
      asset: 'spr_tree',
    }),
  );
  [
    [76, 81],
    [213, 93],
    [91, 167],
    [204, 161],
  ].forEach(([x, y], i) =>
    add('sprite', {
      id: `stone_${i}`,
      name: `Stone ${i + 1}`,
      x,
      y,
      asset: 'spr_stone',
      solid: true,
      width: 24,
      height: 24,
    }),
  );
  [
    [67, 121],
    [218, 127],
    [144, 48],
  ].forEach(([x, y], i) =>
    add('sprite', {
      id: `crystal_${i}`,
      name: `Crystal ${i + 1}`,
      x,
      y,
      asset: 'spr_crystal',
      collectible: true,
      cue: 'cue_pickup',
      width: 24,
      height: 24,
    }),
  );
  add('sprite', {
    id: 'player',
    name: 'Player',
    x: 144,
    y: 174,
    asset: 'spr_player',
    player: true,
    speed: 72,
    width: 24,
    height: 24,
  });
  add('rect', {
    id: 'hud_panel',
    name: 'HUD background',
    layer: 'ui',
    x: 0,
    y: 0,
    width: 320,
    height: 27,
    color: '#182f28',
  });
  add('label', {
    id: 'title',
    name: 'Game title',
    x: 10,
    y: 6,
    width: 150,
    height: 18,
    text: 'THE LITTLE GROVE',
    color: '#e3e7c7',
  });
  add('label', {
    id: 'score',
    name: 'Crystal counter',
    x: 191,
    y: 6,
    width: 125,
    height: 18,
    text: 'GEMS',
    binding: 'score',
    color: '#ecc778',
  });
  add('label', {
    id: 'objective',
    name: 'Objective',
    x: 48,
    y: 219,
    width: 250,
    height: 18,
    text: '',
    binding: 'status',
    color: '#c3d5ac',
  });
  return {
    version: 1,
    id: uid('project'),
    name: 'The Little Grove',
    width: 320,
    height: 240,
    colorDepth: 16,
    scenes: [
      {
        id: 'grove',
        name: 'Forest clearing',
        background: '#294b39',
        objective: 'Find the three amber crystals',
        completion: 'All crystals found. Nicely done!',
        music: '',
        nodes,
      },
    ],
    sprites: structuredClone(starterSprites),
    audio: [tone()],
    code: defaultCode,
  };
}
export function spriteUrl(asset: SpriteAsset) {
  const canvas = document.createElement('canvas');
  canvas.width = asset.width;
  canvas.height = asset.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(
    new ImageData(Uint8ClampedArray.from(asset.pixels), asset.width, asset.height),
    0,
    0,
  );
  return canvas.toDataURL();
}
export function readWav(bytes: Uint8Array): {
  sampleRate: number;
  channels: number;
  duration: number;
} {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (bytes.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE')
    throw new Error('Use an uncompressed PCM WAV file (16-bit, mono or stereo).');
  let fmt = false,
    channels = 0,
    rate = 0,
    data = 0;
  for (let o = 12; o + 8 <= bytes.length;) {
    const size = v.getUint32(o + 4, true),
      start = o + 8;
    if (start + size > bytes.length) throw new Error('The WAV file is truncated.');
    if (tag(o) === 'fmt ' && size >= 16) {
      channels = v.getUint16(start + 2, true);
      rate = v.getUint32(start + 4, true);
      fmt =
        v.getUint16(start, true) === 1 &&
        v.getUint16(start + 14, true) === 16 &&
        [1, 2].includes(channels) &&
        rate >= 8000 &&
        rate <= 96000 &&
        v.getUint16(start + 12, true) === channels * 2;
    }
    if (tag(o) === 'data') data = size;
    o = start + size + (size % 2);
  }
  if (!fmt || !data || data % (channels * 2) !== 0)
    throw new Error('Use PCM WAV: 16-bit, mono/stereo, 8–96 kHz.');
  return { sampleRate: rate, channels, duration: data / (rate * channels * 2) };
}
