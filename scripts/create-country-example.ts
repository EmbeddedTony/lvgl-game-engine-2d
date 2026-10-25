/** Local, licensed-asset example. Supply pack directories; artwork is never bundled in the app. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { createRpgDemo } from '../src/rpg/demo';
import {
  buildTerrainTileset,
  resizeTileset,
  composeTerrain,
  terrainBlocks,
} from '../src/tiles/rpg-import';
import { buildTileset, sliceSheet, attachTileset, makeTilemap, type Sheet } from '../src/tilesets';
import { refreshTerrain } from '../src/tiles/terrain';
import { makeNode, parseProject, validate, type TilesetAsset } from '../src/model';
import { makePhysics } from '../src/physics';
import { generate, zipProject } from '../src/exporter';
const country = resolve(process.argv[2] ?? '/Users/tonyexp/Downloads/Country Woods - ACE (1)'),
  modern = resolve(process.argv[3] ?? '/Users/tonyexp/Downloads/Modern+ Outer Basic ACE (1)'),
  out = resolve(process.argv[4] ?? '.local-examples');
await mkdir(out, { recursive: true });
function sheet(path: string): Sheet {
  const b = execFileSync(
    'python3',
    [
      '-c',
      'from PIL import Image;import sys,struct;im=Image.open(sys.argv[1]).convert("RGBA");sys.stdout.buffer.write(struct.pack("<II",*im.size)+im.tobytes())',
      path,
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return {
    width: b.readUInt32LE(0),
    height: b.readUInt32LE(4),
    pixels: new Uint8Array(b.subarray(8)),
  };
}
const a1 = sheet(join(country, 'Tilesets/Country Woods ACE A1.png')),
  a2 = sheet(join(country, 'Tilesets/Country Woods ACE A2.png')),
  a5 = sheet(join(country, 'Tilesets/Country Woods ACE A5.png')),
  trees = sheet(join(country, 'Tilesets/Country Woods ACE 1.PNG')),
  props = sheet(join(modern, 'Tilesets/Tile1.png'));
const walls = sheet(join(modern, 'Tilesets/A4.png'));
const brick = composeTerrain(
  walls,
  terrainBlocks('ace-a4', 32, walls.width, walls.height)[10],
  32,
  15,
);
const housePixels: number[] = [];
for (let y = 0; y < 48; y++)
  for (let x = 0; x < 64; x++) {
    const at = (((y * 2) % 32) * 32 + ((x * 2) % 32)) * 4;
    housePixels.push(...brick.slice(at, at + 4));
  }
const water = resizeTileset(
  buildTerrainTileset('Country Woods · animated pond', a1, 'ace-a1', 32, new Set([0]), 'cw_water'),
  16,
);
for (const t of water.tiles) t.solid = true;
const path = resizeTileset(
  buildTerrainTileset('Country Woods · paths', a2, 'ace-a2', 32, new Set([2]), 'cw_path'),
  16,
);
const grass = resizeTileset(
  buildTileset(
    'Country Woods · grass',
    32,
    sliceSheet(a5, { tileSize: 32, marginX: 0, marginY: 0, spacingX: 0, spacingY: 0 }),
    new Set([0]),
    true,
    'cw_grass',
  ),
  16,
);
const modernSet = resizeTileset(
  buildTileset(
    'Modern+ · fences & garden',
    32,
    sliceSheet(props, { tileSize: 32, marginX: 0, marginY: 0, spacingX: 0, spacingY: 0 }),
    new Set([
      11 * 16 + 3,
      11 * 16 + 4,
      11 * 16 + 5,
      11 * 16 + 6,
      15 * 16 + 3,
      15 * 16 + 4,
      15 * 16 + 5,
      15 * 16 + 6,
      3 * 16 + 6,
      3 * 16 + 7,
    ]),
    true,
    'modern_garden',
  ),
  16,
);
for (const t of modernSet.tiles) t.solid = true;
const p = createRpgDemo();
p.id = 'country_crossing';
p.name = 'Country Crossing';
p.tilesets = [grass, path, water, modernSet];
p.sprites.push({
  id: 'modern_brick',
  name: 'Modern+ · cottage brick',
  width: 64,
  height: 48,
  pixels: housePixels,
});
const scene = p.scenes[0];
scene.name = 'Country crossing · village & pond';
scene.nodes = scene.nodes.filter((n) => n.kind !== 'tilemap');
function layer(set: TilesetAsset, id: string, z: number) {
  const n = makeTilemap(p, set);
  n.id = id;
  n.name = set.name;
  n.zIndex = z;
  n.tilemap!.columns = 30;
  n.tilemap!.rows = 20;
  n.tilemap!.cells = Array(600).fill(0);
  n.width = 480;
  n.height = 320;
  scene.nodes.unshift(n);
  return n.tilemap!;
}
const base = layer(grass, 'ground', -30);
base.cells.fill(1);
const road = layer(path, 'paths', -20),
  pond = layer(water, 'pond', -10),
  garden = layer(modernSet, 'garden', -5);
function fill(m: typeof road, x: number, y: number, w: number, h: number, value = 1) {
  for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) m.cells[r * 30 + c] = value;
}
fill(road, 1, 9, 28, 3);
fill(road, 8, 3, 3, 14);
fill(road, 19, 6, 3, 10);
refreshTerrain(road);
fill(pond, 16, 2, 10, 5);
fill(pond, 18, 7, 6, 1);
refreshTerrain(pond);
for (let x = 2; x < 8; x++) garden.cells[6 * 30 + x] = 1 + (x % Math.min(4, garden.tiles.length));
for (let x = 2; x < 8; x++) garden.cells[14 * 30 + x] = 1 + (x % Math.min(4, garden.tiles.length));
function crop(source: Sheet, id: string, name: string, x: number, y: number, w: number, h: number) {
  const pixels: number[] = [];
  for (let r = 0; r < h; r += 2)
    for (let c = 0; c < w; c += 2) {
      const at = ((y + r) * source.width + x + c) * 4;
      for (let k = 0; k < 4; k++) pixels.push(source.pixels[at + k]);
    }
  const a = { id, name, width: w / 2, height: h / 2, pixels };
  p.sprites.push(a);
  return a;
}
const tree = crop(trees, 'country_tree', 'Country Woods · oak', 0, 0, 96, 128);
for (const [i, x, y] of [
  [0, 0, 0],
  [1, 176, 176],
  [2, 352, 128],
  [3, 416, 224],
])
  scene.nodes.push(
    makeNode('sprite', {
      id: 'oak_' + i,
      name: 'Oak ' + i,
      x,
      y,
      width: tree.width,
      height: tree.height,
      asset: tree.id,
      sortY: true,
      physics: {
        ...makePhysics('static'),
        box: { x: 18, y: 50, width: 12, height: 12 },
        layer: 1,
        mask: 2,
      },
    }),
  );
const roof = crop(props, 'modern_roof', 'Modern+ · cottage roof', 0, 0, 128, 96),
  window = crop(props, 'modern_window', 'Modern+ · cottage window', 256, 96, 32, 32);
scene.nodes.push(
  makeNode('sprite', {
    id: 'cottage_wall',
    name: 'Cottage · collider',
    x: 48,
    y: 56,
    width: 64,
    height: 48,
    asset: 'modern_brick',
    color: '#9d8c76',
    solid: true,
  }),
  makeNode('sprite', {
    id: 'cottage_roof',
    name: roof.name,
    x: 48,
    y: 16,
    width: 64,
    height: 48,
    asset: roof.id,
  }),
  makeNode('sprite', {
    id: 'cottage_window',
    name: window.name,
    x: 56,
    y: 64,
    width: 16,
    height: 16,
    asset: window.id,
  }),
  makeNode('sprite', {
    id: 'cottage_window_b',
    name: window.name,
    x: 88,
    y: 64,
    width: 16,
    height: 16,
    asset: window.id,
  }),
);
const player = scene.nodes.find((n) => n.player)!;
player.x = 128;
player.y = 160;
scene.nodes.find((n) => n.id === 'mira')!.x = 160;
scene.nodes.find((n) => n.id === 'mira')!.y = 160;
scene.nodes.find((n) => n.id === 'dialogue_speaker')!.text = 'COUNTRY CROSSING';
scene.nodes.find((n) => n.id === 'dialogue_text')!.text =
  'WASD explore | Battle meets wisps.\nMira: rest | P: party inventory.';
const fightButton = scene.nodes.find((n) => n.id === 'battle_button')!,
  restButton = scene.nodes.find((n) => n.id === 'rest_button')!;
Object.assign(fightButton, { x: 8, y: 4, width: 60, height: 20 });
Object.assign(restButton, { x: 76, y: 4, width: 60, height: 20 });
scene.nodes.push(
  makeNode('rect', {
    id: 'cottage_door',
    name: 'Cottage door',
    x: 76,
    y: 80,
    width: 12,
    height: 24,
    color: '#42362c',
  }),
);
scene.camera2d = { worldWidth: 480, worldHeight: 320, follow: 'player', axis: 'both' };
const checked = parseProject(JSON.stringify(p));
const errors = validate(checked).filter((v) => v.severity === 'error');
if (errors.length) throw new Error(JSON.stringify(errors));
const files = [
  'lge.h',
  'lge.c',
  'lge_physics.c',
  'lge_melee.h',
  'lge_melee.c',
  'lge_gameplay.h',
  'lge_gameplay.c',
  'lge_story.h',
  'lge_story.c',
  'lge_rpg.h',
  'lge_rpg.c',
  'lge_rpg_ui.c',
  'lge_rpg_save.c',
  'lge_rpg_view.h',
  'lge_rpg_view.c',
  'lge_tile_cache.h',
  'lge_tile_cache.c',
  'lge_lvgl.h',
  'lge_lvgl.c',
  'lge_lvgl_compat.h',
  'lge_flow.h',
  'lge_flow.c',
];
const runtime = Object.fromEntries(
  await Promise.all(files.map(async (f) => [f, await readFile(resolve('engine', f), 'utf8')])),
);
const output = generate(checked, runtime);
await writeFile(join(out, 'CountryCrossing.lge.json'), JSON.stringify(checked));
await writeFile(
  join(out, 'CountryCrossing.lvgl.zip'),
  Buffer.from(await (await zipProject(output.files)).arrayBuffer()),
);
await writeFile(
  join(out, 'README.txt'),
  'Country Crossing — local example\nOpen CountryCrossing.lge.json in LVGL Game Engine. Battle starts turn-based encounters. P opens party inventory. Rest restores HP/MP. Use preview checkpoints outside battles; native C exposes ui_save_* caller buffers.\nArt: selected, reduced tiles from the supplied Country Woods ACE and Modern+ Outer Basic ACE packs. Original files stay in their source folders. The app does not distribute these packs. Retain your asset licenses if sharing the project/export.\n',
);
console.log(
  JSON.stringify(
    {
      project: join(out, 'CountryCrossing.lge.json'),
      tiles: p.tilesets.map((s) => ({ name: s.name, images: s.tiles.length })),
      ...output.stats,
    },
    null,
    2,
  ),
);
