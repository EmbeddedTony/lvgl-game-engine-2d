import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sliceSheet, buildTileset, type Sheet } from '../src/tilesets';
import { packSprite, type ImagePacking } from '../src/compression';
import { createImportedH7Adventure } from '../src/examples/h7-imported-terrain';
import { createH7Adventure } from '../src/examples/h7-adventure';
import { parseProject, validate } from '../src/model';

test('native tile slicing and both export policies preserve every one-pixel detail and RGBA color', () => {
  for (const count of [16, 200, 1024]) {
    const pixels = Array.from({ length: 32 * 32 }, (_, i) => {
      const c = (i * 127) % count;
      return [c % 256, Math.floor(c / 256) * 63, (c * 13) % 256, 255];
    }).flat();
    const tile = buildTileset(
      'Detail',
      32,
      sliceSheet(
        { width: 32, height: 32, pixels },
        {
          tileSize: 32,
          marginX: 0,
          marginY: 0,
          spacingX: 0,
          spacingY: 0,
        },
      ),
      new Set([0]),
    ).tiles[0];
    assert.deepEqual(tile.pixels, pixels);
    for (const policy of ['compact', 'direct'] as ImagePacking[]) {
      const packed = packSprite({ ...tile, width: 32, height: 32 }, policy);
      const decoded: number[] = [];
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          let at = (y * 32 + x) * 4;
          if (!['ARGB8888', 'XRGB8888'].includes(packed.format)) {
            const capacity = packed.format === 'I4' ? 16 : 256;
            const byte =
              packed.data[capacity * 4 + y * packed.stride + (capacity === 16 ? x >> 1 : x)];
            at = (capacity === 16 ? (x % 2 ? byte & 15 : byte >> 4) : byte) * 4;
          }
          decoded.push(
            packed.data[at + 2],
            packed.data[at + 1],
            packed.data[at],
            packed.data[at + 3],
          );
        }
      assert.deepEqual(decoded, pixels, `${count} colors / ${packed.format} must be lossless`);
    }
  }
});

test('imported H7 terrain keeps native pixels, world/collision/animations and source ownership', () => {
  const sheet = (width: number, height: number): Sheet => ({
    width,
    height,
    pixels: Uint8Array.from(
      Array.from({ length: width * height }, (_, i) => [
        (i % width) % 256,
        Math.floor(i / width) % 256,
        ((i % width) * Math.floor(i / width)) % 256,
        255,
      ]).flat(),
    ),
  });
  const sheets = { grass: sheet(256, 512), paths: sheet(512, 384), water: sheet(512, 384) };
  const before = Uint8Array.from(sheets.grass.pixels);
  const p = createImportedH7Adventure(sheets),
    original = createH7Adventure();
  assert.deepEqual(validate(p), []);
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.deepEqual(sheets.grass.pixels, before);
  assert.deepEqual(p.scenes, original.scenes);
  assert.deepEqual(p.sprites, original.sprites);
  const tiles = p.tilesets![0].tiles;
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const at = (y * 32 + x) * 4,
        from = (y * 256 + 32 + x) * 4;
      assert.deepEqual(tiles[0].pixels.slice(at, at + 4), Array.from(before.slice(from, from + 4)));
    }
  assert.deepEqual(
    tiles.map((t) => [t.id, t.solid, t.animation]),
    original.tilesets![0].tiles.map((t) => [t.id, t.solid, t.animation]),
  );
  assert.notDeepEqual(
    tiles.find((t) => t.id === 'v_water')!.pixels,
    tiles.find((t) => t.id === 'v_water_f1')!.pixels,
  );
});
