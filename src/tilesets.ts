import { paintableTiles } from './tiles/terrain';
import { makeNode, uid, type Project, type TilesetAsset, type TileMap } from './model';
import { packSprite } from './compression';

import { MAX_MAP_TILES, MAX_ATLAS_CELLS, pixelHash, samePixels } from './tile-assets';
export {
  MAX_MAP_TILES,
  MAX_ATLAS_CELLS,
  MAX_PROJECT_TILES,
  projectImages,
  pixelHash,
  samePixels,
} from './tile-assets';
export interface Sheet {
  width: number;
  height: number;
  pixels: ArrayLike<number>;
}
export interface SliceSettings {
  tileSize: number;
  marginX: number;
  marginY: number;
  spacingX: number;
  spacingY: number;
}
export interface SliceGrid {
  columns: number;
  rows: number;
  tiles: number[][];
}
/** Pure slicing: drop transparent RGB noise and never rescale source pixels. */
export function sliceSheet(sheet: Sheet, settings: SliceSettings): SliceGrid {
  const { tileSize: size, marginX, marginY, spacingX, spacingY } = settings;
  if (
    !Number.isInteger(size) ||
    size < 8 ||
    size > 64 ||
    [marginX, marginY, spacingX, spacingY].some((v) => !Number.isInteger(v) || v < 0 || v > 2048)
  )
    throw new Error('Use 8–64px square tiles and non-negative whole-pixel margins/spacing.');
  if (
    sheet.width < 1 ||
    sheet.height < 1 ||
    sheet.width > 2048 ||
    sheet.height > 2048 ||
    sheet.pixels.length !== sheet.width * sheet.height * 4
  )
    throw new Error('Sheet limit: 2048 × 2048 pixels.');
  const columns = Math.floor((sheet.width - 2 * marginX + spacingX) / (size + spacingX));
  const rows = Math.floor((sheet.height - 2 * marginY + spacingY) / (size + spacingY));
  if (columns < 1 || rows < 1)
    throw new Error('No complete tiles fit. Check tile size, margins and spacing.');
  if (columns * rows > MAX_ATLAS_CELLS)
    throw new Error(
      `This grid exceeds ${MAX_ATLAS_CELLS} cells. Crop the sheet or increase tile size.`,
    );
  const tiles: number[][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) {
      const pixels: number[] = [];
      let opaque = false;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const offset =
            ((marginY + r * (size + spacingY) + y) * sheet.width +
              marginX +
              c * (size + spacingX) +
              x) *
            4;
          const alpha = sheet.pixels[offset + 3];
          if (alpha) {
            pixels.push(
              sheet.pixels[offset],
              sheet.pixels[offset + 1],
              sheet.pixels[offset + 2],
              alpha,
            );
            opaque = true;
          } else pixels.push(0, 0, 0, 0);
        }
      tiles.push(opaque ? pixels : []);
    }
  return { columns, rows, tiles };
}
export function analyzeTiles(grid: SliceGrid, selected: ReadonlySet<number>, merge: boolean) {
  const groups: { pixels: number[]; cells: number[] }[] = [],
    buckets = new Map<string, number[]>();
  let transparent = 0;
  for (const cell of [...selected].sort((a, b) => a - b)) {
    const pixels = grid.tiles[cell];
    if (!pixels?.length) {
      transparent++;
      continue;
    }
    const hash = pixelHash(pixels),
      bucket = buckets.get(hash) ?? [];
    const match = merge ? bucket.find((i) => samePixels(groups[i].pixels, pixels)) : undefined;
    if (match !== undefined) groups[match].cells.push(cell);
    else {
      bucket.push(groups.length);
      buckets.set(hash, bucket);
      groups.push({ pixels, cells: [cell] });
    }
  }
  return { groups, transparent, selected: selected.size };
}
export function buildTileset(
  name: string,
  size: number,
  grid: SliceGrid,
  selected: ReadonlySet<number>,
  merge = true,
  id = uid('tileset'),
): TilesetAsset {
  const { groups } = analyzeTiles(grid, selected, merge);
  if (!groups.length) throw new Error('Select at least one non-transparent tile.');
  if (groups.length > MAX_MAP_TILES)
    throw new Error(
      'A tileset can contain up to 255 unique tiles. Select a smaller region or merge identical tiles.',
    );
  const cells = Array<string>(grid.columns * grid.rows).fill('');
  const tiles = groups.map((g, i) => {
    const tileId = `${id}_t${i + 1}`;
    for (const cell of g.cells) cells[cell] = tileId;
    return { id: tileId, name: `Tile ${i + 1}`, pixels: [...g.pixels], solid: false };
  });
  return {
    id,
    name: name.trim().slice(0, 128) || 'Tileset',
    tileSize: size,
    columns: grid.columns,
    rows: grid.rows,
    cells,
    tiles,
  };
}
export function tilesetPackedBytes(set: TilesetAsset): number {
  return set.tiles.reduce(
    (sum, t) => sum + packSprite({ ...t, width: set.tileSize, height: set.tileSize }).data.length,
    0,
  );
}
/** Existing bank indices stay stable. Source atlases never enter the MCU runtime. */
export function attachTileset(map: TileMap, set: TilesetAsset): void {
  if (map.tileSize !== set.tileSize)
    throw new Error(
      `This map uses ${map.tileSize}px tiles. Create a ${set.tileSize}px layer to use this tileset without rescaling.`,
    );
  const missing = paintableTiles(set).filter((t) => !map.tiles.includes(t.id));
  if (map.tiles.length + missing.length > MAX_MAP_TILES)
    throw new Error('This tilemap would exceed 255 tile types. Create another tilemap layer.');
  map.tiles.push(...missing.map((t) => t.id));
  for (const tile of paintableTiles(set)) {
    const value = map.tiles.indexOf(tile.id) + 1;
    map.solidTiles = map.solidTiles.filter((v) => v !== value);
    if (tile.solid) map.solidTiles.push(value);
    if (tile.animation)
      (map.animations ??= {})[value] = {
        fps: tile.animation.fps,
        frames: [...tile.animation.frames],
      };
    else if (map.animations) delete map.animations[value];
    if (tile.slope) (map.slopes ??= {})[value] = tile.slope;
    else if (map.slopes) delete map.slopes[value];
  }
  for (const t of set.terrains ?? []) {
    (map.terrains ??= {})[set.id + '_' + t.id] = Object.fromEntries(
      Object.entries(t.variants).map(([mask, id]) => [mask, map.tiles.indexOf(id) + 1]),
    );
  }
  map.tileset = set.id;
}
export function makeTilemap(p: Pick<Project, 'width' | 'height'>, set: TilesetAsset) {
  const columns = Math.min(128, Math.floor(2048 / set.tileSize), Math.ceil(p.width / set.tileSize)),
    rows = Math.min(128, Math.floor(2048 / set.tileSize), Math.ceil(p.height / set.tileSize));
  const tilemap: TileMap = {
    tileSize: set.tileSize,
    columns,
    rows,
    cells: Array(columns * rows).fill(0),
    tiles: [],
    solidTiles: [],
  };
  attachTileset(tilemap, set);
  return makeNode('tilemap', {
    name: `${set.name} layer`,
    x: 0,
    y: 0,
    width: columns * set.tileSize,
    height: rows * set.tileSize,
    tilemap,
  });
}
export function setTileSolid(p: Project, tileId: string, solid: boolean): boolean {
  const tile = p.tilesets?.flatMap((s) => s.tiles).find((t) => t.id === tileId);
  if (!tile) return false;
  tile.solid = solid;
  if (!solid) delete tile.slope;
  for (const scene of p.scenes)
    for (const n of scene.nodes)
      if (n.tilemap) {
        const index = n.tilemap.tiles.indexOf(tileId) + 1;
        if (!index) continue;
        n.tilemap.solidTiles = n.tilemap.solidTiles.filter((v) => v !== index);
        if (solid) n.tilemap.solidTiles.push(index);
        else if (n.tilemap.slopes) delete n.tilemap.slopes[index];
      }
  return true;
}

export function setTileSlope(p: Project, tileId: string, slope: 'box' | 'up' | 'down') {
  const tile = p.tilesets?.flatMap((s) => s.tiles).find((t) => t.id === tileId);
  if (tile) {
    tile.slope = slope === 'box' ? undefined : slope;
    if (slope !== 'box') tile.solid = true;
  }
  for (const scene of p.scenes)
    for (const n of scene.nodes)
      if (n.tilemap) {
        const map = n.tilemap,
          index = map.tiles.indexOf(tileId) + 1;
        if (!index) continue;
        if (slope === 'box') {
          if (map.slopes) delete map.slopes[index];
        } else {
          (map.slopes ??= {})[index] = slope;
          if (!map.solidTiles.includes(index)) map.solidTiles.push(index);
        }
      }
}
