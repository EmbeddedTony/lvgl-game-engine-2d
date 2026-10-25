import { createStarter, defaultCode } from './assets';
import { makeNode } from './model';
import { makePhysics } from './physics';
import { buildTileset, makeTilemap, sliceSheet, type Sheet } from './tilesets';

/** Original generated pixel tiles, including a duplicate and a transparent slot. */
export function workshopSheet(): Sheet {
  const size = 16,
    width = 69,
    height = 35,
    pixels = new Uint8ClampedArray(width * height * 4);
  for (let cell = 0; cell < 7; cell++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const kind = cell === 6 ? 0 : cell,
          noise = (x * 17 + y * 29) % 13;
        const colors: number[][] = [
          y < 3 ? [116, 166, 91] : [77 + noise, 101 + noise, 61],
          [88 + noise, 68 + noise, 47],
          x === 0 || y === 0 || (y === 8 && x > 6) ? [67, 79, 87] : [112 + noise, 124 + noise, 128],
          (y === 4 || y === 11) && x % 7 < 4 ? [83, 151, 168] : [44 + noise, 91 + noise, 118],
          y % 8 === 0 ? [76, 52, 33] : [133 + noise, 100 + noise, 62],
          x % 8 === 0 || y % 8 === 0 ? [60, 74, 80] : [90 + noise, 110 + noise, 114],
        ];
        const offset = ((1 + Math.floor(cell / 4) * 17 + y) * width + 1 + (cell % 4) * 17 + x) * 4;
        pixels.set([...colors[kind], 255], offset);
      }
  return { width, height, pixels };
}
export function createTilesetDemo() {
  const p = createStarter();
  delete p.flow;
  p.id = 'tileset_workshop';
  p.name = 'Tileset Workshop';
  const grid = sliceSheet(workshopSheet(), {
    tileSize: 16,
    marginX: 1,
    marginY: 1,
    spacingX: 1,
    spacingY: 1,
  });
  const set = buildTileset(
    'Workshop terrain',
    16,
    grid,
    new Set(grid.tiles.map((_, i) => i)),
    true,
    'workshop',
  );
  for (const tile of set.tiles) tile.solid = tile.id !== 'workshop_t4';
  p.tilesets = [set];
  const terrain = makeTilemap(p, set);
  terrain.id = 'terrain';
  terrain.name = 'Terrain';
  const map = terrain.tilemap!;
  for (let row = 12; row < 15; row++)
    for (let col = 0; col < 20; col++) map.cells[row * 20 + col] = row === 12 ? 1 : 2;
  for (let col = 5; col < 9; col++) map.cells[9 * 20 + col] = 5;
  for (let col = 11; col < 16; col++) map.cells[6 * 20 + col] = 3;
  for (let col = 15; col < 18; col++) map.cells[12 * 20 + col] = 4;
  p.scenes = [
    {
      id: 'workshop',
      name: 'Tileset workshop',
      background: '#22323e',
      music: '',
      objective: '',
      completion: '',
      nodes: [
        terrain,
        makeNode('sprite', {
          id: 'player',
          name: 'Player',
          asset: 'spr_player',
          x: 32,
          y: 156,
          width: 24,
          height: 24,
          player: true,
          speed: 100,
          physics: {
            ...makePhysics('character'),
            motion: 'platformer',
            gravity: 800,
            jumpSpeed: 300,
            box: { x: 4, y: 4, width: 16, height: 20 },
          },
        }),
        makeNode('label', {
          id: 'title',
          name: 'Title',
          x: 16,
          y: 14,
          width: 290,
          text: 'TILESET WORKSHOP',
          color: '#e0e8f0',
        }),
        makeNode('label', {
          id: 'help',
          name: 'Controls',
          x: 16,
          y: 36,
          width: 290,
          text: 'A/D move  |  Space jump',
          color: '#abbfce',
        }),
      ],
    },
  ];
  p.code = defaultCode
    .replace('#include "ui.h"', '#include "ui.h"\n#include <stdio.h>')
    .replace(
      '/* Scene loaded. Initialize your own game state here. */',
      'printf("TILESET WORKSHOP READY: tile=%u solid=%u\\n", (unsigned)ui_tile_at("terrain",0,12), (unsigned)ui_tile_is_solid("terrain",0,12));',
    );
  return p;
}
