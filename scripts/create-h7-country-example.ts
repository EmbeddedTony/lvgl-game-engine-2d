/** Original-resolution local example. Pack artwork stays outside the distributed editor. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createImportedH7Adventure } from '../src/examples/h7-imported-terrain';
import { createH7Adventure } from '../src/examples/h7-adventure';
import { parseProject, validate } from '../src/model';
import { packSprite } from '../src/compression';
import { generate } from '../src/exporter';
import { readSheet } from './read-sheet';
import { pngRgba } from './png';

const pack = resolve(process.argv[2] ?? '/Users/tonyexp/Downloads/Country Woods - ACE (1)');
const out = resolve(process.argv[3] ?? '.local-examples/WillowlightH7-Country32');
await mkdir(out, { recursive: true });
const files = {
  grass: join(pack, 'Tilesets/Country Woods ACE A5.png'),
  paths: join(pack, 'Tilesets/Country Woods ACE A2.png'),
  water: join(pack, 'Tilesets/Country Woods ACE A1.png'),
};
const project = parseProject(
  JSON.stringify(
    createImportedH7Adventure({
      grass: readSheet(files.grass),
      paths: readSheet(files.paths),
      water: readSheet(files.water),
    }),
  ),
);
const errors = validate(project).filter((v) => v.severity === 'error');
if (errors.length) throw new Error(JSON.stringify(errors));
const original = createH7Adventure();
const sourceGrass = readSheet(files.grass);
const before = original.tilesets![0].tiles[0].pixels;
const imported = project.tilesets![0].tiles[0].pixels;
const cooked = packSprite(
  { id: 'grass', name: 'grass', width: 32, height: 32, pixels: imported },
  'direct',
);
let sourceMismatches = 0,
  exportMismatches = 0;
for (let y = 0; y < 32; y++)
  for (let x = 0; x < 32; x++)
    for (let c = 0; c < 4; c++) {
      const at = (y * 32 + x) * 4 + c;
      if (imported[at] !== sourceGrass.pixels[(y * sourceGrass.width + 32 + x) * 4 + c])
        sourceMismatches++;
      if (cooked.data[at - c + [2, 1, 0, 3][c]] !== imported[at]) exportMismatches++;
    }
if (sourceMismatches || exportMismatches)
  throw new Error('Native terrain pixels changed during import/export');
const colors = (pixels: number[]) =>
  new Set(
    Array.from({ length: pixels.length / 4 }, (_, i) => pixels.slice(i * 4, i * 4 + 4).join(',')),
  ).size;
const file = join(out, 'WillowlightH7-Country32.lge.json');
await writeFile(file, JSON.stringify(project));
const report = {
  file,
  tileSize: 32,
  filtering: 'nearest / no resampling',
  sourceMismatches,
  exportMismatches,
  sourceFiles: await Promise.all(
    Object.values(files).map(async (file) => ({
      file,
      sha256: createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    })),
  ),
  grassColorsBefore: colors(before),
  grassColorsImported: colors(imported),
  imageBytesBefore: generate(original, {}).stats.spritePacked,
  imageBytesAfter: generate(project, {}).stats.spritePacked,
  mapCellsUnchanged:
    JSON.stringify(project.scenes[0].nodes[0].tilemap) ===
    JSON.stringify(original.scenes[0].nodes[0].tilemap),
};
await writeFile(join(out, 'import-report.json'), JSON.stringify(report, null, 2) + '\n');
const strip = Array.from({ length: 32 * 4 * 32 }, (_, i) => {
  const x = i % 128,
    y = Math.floor(i / 128),
    col = Math.floor(x / 32),
    at = (y * 32 + (x % 32)) * 4;
  return col === 0
    ? before.slice(at, at + 4)
    : col === 1
      ? Array.from(
          { length: 4 },
          (_, c) => sourceGrass.pixels[(y * sourceGrass.width + 32 + (x % 32)) * 4 + c],
        )
      : col === 2
        ? imported.slice(at, at + 4)
        : [cooked.data[at + 2], cooked.data[at + 1], cooked.data[at], cooked.data[at + 3]];
}).flat();
await writeFile(join(out, 'grass-before-source-import-export.png'), pngRgba(128, 32, strip));
console.log(JSON.stringify(report, null, 2));
