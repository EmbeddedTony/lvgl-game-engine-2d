import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { createStarter, readWav, base64ToBytes } from '../src/assets';
import { parseProject, validate, makeNode } from '../src/model';
import { encodeRle, decodeRle, packSprite, packTilemap } from '../src/compression';
import { generate, cString, zipProject } from '../src/exporter';
import { begin, advance } from '../src/simulation';

test('projects round-trip with tile/audio data and reject malformed input', () => {
  const p = createStarter();
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.deepEqual(
    validate(p).filter((i) => i.severity === 'error'),
    [],
  );
  for (const mutate of [
    (p: any) => (p.width = 0),
    (p: any) => (p.scenes[0].nodes[0].tilemap.cells[0] = 999),
    (p: any) => p.sprites[0].pixels.pop(),
    (p: any) => (p.scenes[0].nodes[1].x = null),
    (p: any) => p.scenes.push(p.scenes[0]),
  ]) {
    const invalid = structuredClone(p);
    mutate(invalid);
    assert.throws(() => parseProject(JSON.stringify(invalid)));
  }
});
test('RLE preserves sparse, alternating, empty and >65535 cell runs', () => {
  for (const cells of [
    [],
    [0],
    Array(70000).fill(2),
    [1, 2, 1, 2, 0, 0],
    Array.from({ length: 4000 }, (_, i) => Math.floor(i / 80) % 3),
  ])
    assert.deepEqual(decodeRle(encodeRle(cells), cells.length), cells);
  assert.throws(() => decodeRle([4, 1], 3));
  assert.throws(() => decodeRle([0, 1], 1));
  assert.throws(() => decodeRle([1], 1));
  assert.equal(packTilemap([1, 2, 1, 2]).codec, 'raw8');
  assert.equal(packTilemap(Array(100).fill(1)).codec, 'rle16');
  assert.equal(packTilemap([1, 2, 1, 2]).bytes, 4);
});
test('packed palettes preserve every RGBA pixel including alpha and odd row widths', () => {
  for (const asset of [
    ...createStarter().sprites,
    {
      id: 'odd',
      name: 'Odd',
      width: 3,
      height: 16,
      pixels: Array.from({ length: 16 }, () => [
        255, 0, 0, 255, 0, 255, 0, 100, 0, 0, 255, 0,
      ]).flat(),
    },
    {
      id: 'indexed8',
      name: 'Indexed 8',
      width: 64,
      height: 32,
      pixels: Array.from({ length: 2048 }, (_, i) => [(i % 32) * 7, (i % 32) * 5, 0, 255]).flat(),
    },
  ]) {
    const packed = packSprite(asset),
      out: number[] = [];
    if (packed.format === 'I4' || packed.format === 'I8') {
      const offset = packed.format === 'I4' ? 64 : 1024;
      for (let y = 0; y < asset.height; y++)
        for (let x = 0; x < asset.width; x++) {
          const byte =
            packed.data[
              offset + y * packed.stride + (packed.format === 'I4' ? Math.floor(x / 2) : x)
            ];
          const index = packed.format === 'I4' ? (x % 2 ? byte & 15 : byte >> 4) : byte;
          const [b, g, r, a] = packed.data.slice(index * 4, index * 4 + 4);
          out.push(r, g, b, a);
        }
    } else
      for (let i = 0; i < packed.data.length; i += 4) {
        const [b, g, r, a] = packed.data.slice(i, i + 4);
        out.push(r, g, b, a);
      }
    assert.deepEqual(out, asset.pixels);
  }
});
test('WAV parser reads actual format and rejects truncated/compressed input', () => {
  const cue = createStarter().audio[0],
    bytes = base64ToBytes(cue.data);
  const meta = readWav(bytes);
  assert.equal(meta.sampleRate, 22050);
  assert.equal(meta.channels, 1);
  assert.ok(Math.abs(meta.duration - 0.22) < 0.001);
  assert.throws(() => readWav(bytes.slice(0, 50)));
  const bad = bytes.slice();
  bad[20] = 3;
  assert.throws(() => readWav(bad));
});
test('preview collects exactly once and respects tile collision and pause clock boundaries', () => {
  const p = createStarter(),
    scene = p.scenes[0];
  scene.nodes = [
    makeNode('rect', { id: 'p', player: true, x: 0, y: 0, width: 8, height: 8, speed: 600 }),
    makeNode('sprite', {
      id: 'gem',
      x: 20,
      y: 0,
      width: 8,
      height: 8,
      collectible: true,
      cue: 'hit',
    }),
    makeNode('rect', { id: 'wall', x: 40, y: 0, width: 1, height: 100, solid: true }),
  ];
  const s = begin(scene);
  let cues = 0;
  advance(
    s,
    p,
    new Set(['d']),
    100,
    () => cues++,
    () => {},
  );
  assert.equal(s.nodes[0].x, 32);
  assert.equal(s.score, 1);
  assert.equal(cues, 1);
  assert.equal(s.complete, true);
  advance(
    s,
    p,
    new Set(['d']),
    100,
    () => cues++,
    () => {},
  );
  assert.equal(cues, 1);
  const tile = makeNode('tilemap', {
    width: 64,
    height: 16,
    x: 0,
    y: 0,
    tilemap: {
      tileSize: 16,
      columns: 4,
      rows: 1,
      tiles: ['tile_water'],
      cells: [0, 0, 1, 0],
      solidTiles: [1],
    },
  });
  scene.nodes = [
    tile,
    makeNode('rect', { player: true, x: 0, y: 0, width: 8, height: 8, speed: 600 }),
  ];
  const ts = begin(scene);
  advance(
    ts,
    p,
    new Set(['d']),
    100,
    () => {},
    () => {},
  );
  assert.equal(ts.nodes[1].x, 24);
});
test('export includes compilable boundaries, packed maps, stable audio URIs and source project', async () => {
  const runtime = Object.fromEntries(
    await Promise.all(
      [
        'lge.h',
        'lge.c',
        'lge_physics.c',
        'lge_tile_cache.h',
        'lge_tile_cache.c',
        'lge_lvgl.h',
        'lge_lvgl.c',
        'lge_flow.h',
        'lge_flow.c',
      ].map(async (n) => [n, await readFile(new URL(`../engine/${n}`, import.meta.url), 'utf8')]),
    ),
  );
  const p = createStarter(),
    { files, stats } = generate(p, runtime);
  assert.match(files['ui/generated/game_data.c'] as string, /lge_tilemap_t/);
  assert.match(files['ui/generated/game_assets.c'] as string, /LV_COLOR_FORMAT_I4/);
  assert.match(files['ui/CMakeLists.txt'] as string, /\$\{CMAKE_CURRENT_SOURCE_DIR\}/);
  assert.ok(files['ui/assets/audio/cue_pickup.wav'] instanceof Uint8Array);
  assert.deepEqual(JSON.parse(files['project.lge.json'] as string), p);
  assert.ok(stats.spritePacked < stats.spriteRaw);
  assert.ok(stats.mapPacked < stats.mapRaw);
  const archive = await zipProject(files),
    zip = await JSZip.loadAsync(await archive.arrayBuffer());
  const ownership = JSON.parse(await zip.file('ui/.lge-export.json')!.async('string'));
  assert.equal(ownership.projectId, p.id);
  assert.equal(
    ownership.files['ui.h'],
    createHash('sha256').update(files['ui/ui.h']).digest('hex'),
  );

  assert.equal(cString('"\\\n'), '"\\042\\134\\012"');
  p.scenes[0].nodes.push(makeNode('sprite', { asset: 'missing' }));
  assert.throws(() => generate(p, runtime), /select a sprite asset/);
});
