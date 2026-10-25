import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarter } from '../src/assets';
import { generate } from '../src/exporter';
import { defaultRendering } from '../src/rendering/config';
import { planTileBatches, repeatTile, TILE_BATCH_FLASH_LIMIT } from '../src/rendering/tile-batches';
import { measureWorkload } from '../src/targets/analyze';

function project() {
  const p = createStarter();
  p.rendering = { ...defaultRendering, compositor: 'neochrom' };
  const n = p.scenes[0].nodes.find((n) => n.tilemap)!;
  const t = n.tilemap!;
  t.columns = 64;
  t.rows = 16;
  t.cells = Array(t.columns * t.rows).fill(1);
  n.width = t.columns * t.tileSize;
  n.height = t.rows * t.tileSize;
  return p;
}

test('terrain strips preserve every RGBA byte, including transparent and partial-alpha pixels', () => {
  const tile = {
    id: 'test',
    name: 'test',
    width: 32,
    height: 32,
    pixels: Array.from({ length: 32 * 32 }, (_, i) => [
      i % 256,
      (i * 7) % 256,
      (i * 13) % 256,
      [0, 127, 255][i % 3],
    ]).flat(),
  };
  const before = structuredClone(tile),
    strip = repeatTile(tile, 8);
  assert.deepEqual(tile, before);
  assert.equal(strip.width, 256);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 256; x++)
      assert.deepEqual(
        strip.pixels.slice((y * 256 + x) * 4, (y * 256 + x + 1) * 4),
        tile.pixels.slice((y * 32 + (x % 32)) * 4, (y * 32 + (x % 32) + 1) * 4),
      );
});

test('batch planning stays within its flash budget and preserves animated/software fallbacks', () => {
  const p = project(),
    t = p.scenes[0].nodes.find((n) => n.tilemap)!.tilemap!;
  const selected = planTileBatches(p);
  assert.ok(selected.length > 0);
  assert.ok(selected.reduce((n, b) => n + b.bytes, 0) <= TILE_BATCH_FLASH_LIMIT);
  // A row boundary ends a run even when the next row starts with the same tile.
  assert.equal(selected[0].savedDraws, 16 * (64 - 8));
  t.cells = t.cells.map((_, i) => (Math.floor(i / 64) % t.tiles.length) + 1);
  const constrained = planTileBatches(p);
  assert.equal(constrained.length, t.tiles.length);
  assert.ok(constrained.some((batch) => batch.copies < 8));
  assert.ok(constrained.reduce((n, b) => n + b.bytes, 0) <= TILE_BATCH_FLASH_LIMIT);
  t.cells.fill(1);
  t.animations = { 1: { frames: [t.tiles[0], t.tiles[1]], fps: 5 } };
  assert.deepEqual(planTileBatches(p), []);
  delete t.animations;
  p.rendering = { ...defaultRendering };
  assert.deepEqual(planTileBatches(p), []);
  // Alternating cells never justify a strip, including a matching row seam.
  p.rendering.compositor = 'neochrom';
  t.cells = t.cells.map((_, i) => ((i + Math.floor(i / 64)) % 2) + 1);
  assert.deepEqual(planTileBatches(p), []);
});

test('exported strips remain aligned direct-color assets and guidance budgets their flash', () => {
  const p = project(),
    { files, stats } = generate(p, {});
  const manifest = JSON.parse(String(files['ui/image-manifest.json']));
  assert.match(String(files['ui/generated/game_data.c']), /\.row_strips=map_0_strips/);
  assert.ok(manifest.images.some((i: { width: number }) => i.width === 256));
  assert.equal(manifest.tileBatches.length, 1);
  assert.ok(
    manifest.images.every(
      (i: { format: string; stride: number; width: number }) =>
        ['ARGB8888', 'XRGB8888'].includes(i.format) && i.stride === i.width * 4,
    ),
  );
  assert.equal(
    manifest.images.reduce((n: number, i: { bytes: number }) => n + i.bytes, 0),
    stats.spritePacked,
  );
  assert.ok(measureWorkload(p).imageBytes >= stats.spritePacked);
});
