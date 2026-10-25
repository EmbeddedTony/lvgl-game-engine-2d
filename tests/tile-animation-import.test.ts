import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileFrame, setTileAnimation } from '../src/tiles/animation';
import { terrainMasks, terrainMask, refreshTerrain } from '../src/tiles/terrain';
import {
  buildTerrainTileset,
  terrainBlocks,
  composeTerrain,
  suggestSheet,
  resizeTileset,
} from '../src/tiles/rpg-import';
import { attachTileset } from '../src/tilesets';
import { createRpgDemo } from '../src/rpg/demo';
test('animated map indices, collision and bank stay stable while frames loop on fixed time', () => {
  const p = createRpgDemo(),
    m = p.scenes[0].nodes[0].tilemap!,
    bank = m.tiles.slice(),
    cells = m.cells.slice(),
    value = m.cells.find((v) => m.animations?.[v])!;
  assert.equal(tileFrame(m, value, 0), 'water_0');
  assert.equal(tileFrame(m, value, 15), 'water_1');
  assert.equal(tileFrame(m, value, 30), 'water_2');
  assert.equal(tileFrame(m, value, 45), 'water_1');
  assert.equal(tileFrame(m, value, 60), 'water_0');
  assert.deepEqual(m.tiles, bank);
  assert.deepEqual(m.cells, cells);
  setTileAnimation(p, 'water_0', { fps: 2, frames: ['water_0', 'water_2'] });
  assert.equal(tileFrame(m, value, 30), 'water_2');
});
test('ACE/MV suggestions, logical blocks, independent quarter assembly and nearest reduction', () => {
  assert.deepEqual(suggestSheet('Country Woods ACE A1.png', 512, 384), {
    tileSize: 32,
    layout: 'ace-a1',
  });
  assert.deepEqual(suggestSheet('Tile A2.png', 768, 576), { tileSize: 48, layout: 'ace-a2' });
  assert.equal(terrainMasks.length, 47);
  assert.equal(terrainMask(16), 0);
  const sheet = { width: 512, height: 384, pixels: new Uint8Array(512 * 384 * 4) };
  for (let y = 0; y < 384; y++)
    for (let x = 0; x < 512; x++) {
      const at = (y * 512 + x) * 4;
      sheet.pixels.set([Math.floor(x / 16), Math.floor(y / 16), 0, 255], at);
    }
  const blocks = terrainBlocks('ace-a2', 32, 512, 384);
  assert.equal(blocks.length, 32);
  const px = composeTerrain(sheet, blocks[0], 32, 255);
  assert.deepEqual(px.slice(0, 4), [2, 4, 0, 255]);
  assert.deepEqual(px.slice(16 * 4, 16 * 4 + 4), [1, 4, 0, 255]);
  const set = buildTerrainTileset('Land', sheet, 'ace-a2', 32, new Set([0]), 'land');
  assert.equal(Object.keys(set.terrains![0].variants).length, 47);
  resizeTileset(set, 16);
  assert.equal(set.tiles[0].pixels.length, 16 * 16 * 4);
});
test('terrain paint updates local neighbors and removal without runtime masks', () => {
  const sheet = { width: 512, height: 384, pixels: Array(512 * 384 * 4).fill(255) };
  const set = buildTerrainTileset('Land', sheet, 'ace-a2', 32, new Set([0]), 'land');
  const map = {
    tileSize: 32,
    columns: 3,
    rows: 3,
    cells: Array(9).fill(0),
    tiles: [],
    solidTiles: [],
  };
  attachTileset(map, set);
  map.cells[4] = 1;
  map.cells[5] = 1;
  refreshTerrain(map, [4, 5]);
  assert.ok(map.cells[4] > 0);
  map.cells[5] = 0;
  refreshTerrain(map, [5]);
  assert.equal(map.cells[5], 0);
});
