import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarter } from '../src/assets';
import { parseProject, makeNode, validate } from '../src/model';
import {
  sliceSheet,
  buildTileset,
  attachTileset,
  makeTilemap,
  setTileSolid,
  projectImages,
  type Sheet,
} from '../src/tilesets';
import { tileChanges, stampFromRegion } from '../src/editor/tile-tools';
import { generate } from '../src/exporter';

export function sheetFixture(columns = 4, rows = 2, size = 8, margin = 1, spacing = 1): Sheet {
  const width = columns * size + (columns - 1) * spacing + margin * 2,
    height = rows * size + (rows - 1) * spacing + margin * 2;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i =
            ((margin + r * (size + spacing) + y) * width + margin + c * (size + spacing) + x) * 4;
          pixels.set([c + r * columns + 1, 80, 120, 255], i);
        }
  return { width, height, pixels };
}
const slice = { tileSize: 8, marginX: 1, marginY: 1, spacingX: 1, spacingY: 1 };
test('sheet slicing preserves pixels, margins, spacing, transparent holes and optional exact deduplication', () => {
  const sheet = sheetFixture(),
    pixels = sheet.pixels as Uint8ClampedArray;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      pixels.set([1, 80, 120, 255], ((1 + y) * sheet.width + 10 + x) * 4); // duplicate first tile
      pixels.set([220, 30, 200, 0], ((1 + y) * sheet.width + 19 + x) * 4); // transparent RGB noise
    }
  const grid = sliceSheet(sheet, slice),
    selection = new Set(grid.tiles.map((_, i) => i));
  const set = buildTileset('Terrain', 8, grid, selection, true, 'terrain');
  assert.equal(set.tiles.length, 6);
  assert.equal(set.cells[0], set.cells[1]);
  assert.equal(set.cells[2], '');
  assert.deepEqual(set.tiles[0].pixels.slice(0, 4), [1, 80, 120, 255]);
  assert.equal(buildTileset('Terrain', 8, grid, selection, false, 'raw').tiles.length, 7);
  assert.throws(() => sliceSheet(sheet, { ...slice, tileSize: 7 }));
  assert.throws(() => sliceSheet(sheet, { ...slice, marginX: 100 }));
});
test('tilesets attach without shifting existing bank indices and shared collision edits reach all maps', () => {
  const grid = sliceSheet(sheetFixture(5, 7), slice),
    set = buildTileset('World', 8, grid, new Set(grid.tiles.map((_, i) => i)), true, 'world');
  const p = createStarter();
  p.tilesets = [set];
  delete p.flow;
  const a = makeTilemap(p, set),
    b = makeTilemap(p, set);
  b.id = 'second';
  p.scenes[0].nodes = [a, b];
  assert.equal(a.tilemap!.tiles.length, 35);
  setTileSolid(p, set.tiles[34].id, true);
  assert.ok(a.tilemap!.solidTiles.includes(35) && b.tilemap!.solidTiles.includes(35));
  const before = [...a.tilemap!.tiles];
  attachTileset(a.tilemap!, set);
  assert.deepEqual(a.tilemap!.tiles, before);
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.deepEqual(validate(p), []);
  const invalid = structuredClone(p);
  invalid.tilesets![0].cells[0] = 'unknown';
  assert.throws(() => parseProject(JSON.stringify(invalid)));
  const duplicate = structuredClone(p);
  duplicate.tilesets![0].tiles[0].id = p.sprites[0].id;
  assert.throws(() => parseProject(JSON.stringify(duplicate)));
  assert.throws(() => attachTileset({ ...a.tilemap!, tileSize: 16 }, set), /without rescaling/);
  assert.equal(projectImages(p).length, p.sprites.length + 35);
  assert.ok(makeTilemap({ width: 2048, height: 2048 }, { ...set, tileSize: 63 }).width <= 2048);
});
test('brush interpolation, patterned rectangles, holes, clipped erasing and bounded flood fill are predictable', () => {
  const map = {
    tileSize: 8,
    columns: 12,
    rows: 3,
    tiles: ['a', 'b'],
    cells: Array(36).fill(0),
    solidTiles: [],
  };
  const stamp = { width: 1, height: 1, cells: ['a'] };
  assert.equal(
    tileChanges(map, 'brush', stamp, { column: 0, row: 0 }, { column: 11, row: 0 }).size,
    12,
  );
  map.cells[1] = 1;
  const overlap = tileChanges(
    map,
    'brush',
    { width: 2, height: 1, cells: ['a', 'b'] },
    { column: 0, row: 0 },
    { column: 1, row: 0 },
  );
  assert.equal(overlap.get(2), 2);
  assert.equal(
    overlap.has(1),
    false,
    'last stamp restores the original cell instead of retaining an earlier overwrite',
  );
  const region = stampFromRegion(
    ['a', 'b', '', 'a'],
    2,
    { column: 0, row: 0 },
    { column: 1, row: 1 },
  );
  const rectangle = tileChanges(
    map,
    'rectangle',
    region,
    { column: 0, row: 0 },
    { column: 3, row: 2 },
  );
  assert.equal(rectangle.get(0), 1);
  assert.equal(rectangle.has(12), false, 'empty stamp holes preserve existing cells');
  assert.throws(
    () => tileChanges(map, 'brush', { ...stamp, cells: ['missing'] }, { column: 0, row: 0 }),
    /Use this tileset/,
  );
  const large = { ...map, columns: 128, rows: 128, cells: Array(16384).fill(0) };
  assert.equal(tileChanges(large, 'fill', stamp, { column: 0, row: 0 }).size, 16384);
  for (let r = 0; r < 3; r++) map.cells[r * 12 + 5] = 2;
  const fill = tileChanges(map, 'fill', stamp, { column: 0, row: 1 });
  assert.ok([...fill.keys()].every((i) => i % 12 < 5));
  assert.equal(
    tileChanges(
      map,
      'erase',
      { width: 2, height: 2, cells: ['a', 'b', 'a', 'b'] },
      { column: -1, row: 0 },
    ).get(0),
    undefined,
  );
});
test('export keeps byte indices, omits unused tile graphics and shares identical image payloads', () => {
  const grid = sliceSheet(sheetFixture(5, 7), slice),
    set = buildTileset('World', 8, grid, new Set(grid.tiles.map((_, i) => i)), true, 'world');
  const p = createStarter();
  delete p.flow;
  p.tilesets = [set];
  set.tiles[34].solid = true;
  const layer = makeTilemap(p, set);
  layer.id = 'terrain';
  layer.tilemap!.cells[0] = 35;
  p.scenes[0].nodes = [layer];
  const { files, stats } = generate(p, {}),
    data = files['ui/generated/game_data.c'] as string,
    images = files['ui/generated/game_assets.c'] as string;
  assert.match(data, /\.tile_count=35/);
  assert.match(data, /\.solid_bits=map_0_solid/);
  assert.equal((images.match(/const lv_image_dsc_t/g) ?? []).length, 1);
  assert.equal(stats.spriteRaw, 8 * 8 * 4);
  assert.equal((data.match(/NULL/g) ?? []).length >= 34, true);
  const copy = { ...set.tiles[34], id: 'same_pixels' };
  p.sprites.push({ ...copy, width: 8, height: 8 });
  p.scenes[0].nodes.push(makeNode('sprite', { asset: copy.id, width: 8, height: 8 }));
  assert.equal(
    (
      String(generate(p, {}).files['ui/generated/game_assets.c']).match(/const lv_image_dsc_t/g) ??
      []
    ).length,
    1,
  );
});
