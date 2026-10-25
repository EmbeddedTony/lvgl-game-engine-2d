import type { TilesetAsset } from '../model';
import { uid } from '../model';
import { pixelHash, samePixels } from '../tile-assets';
import type { Sheet } from '../tilesets';
import { terrainMasks } from './terrain';
export type SheetLayout = 'grid' | 'ace-a1' | 'ace-a2' | 'ace-a3' | 'ace-a4';
export interface TerrainBlock {
  x: number;
  y: number;
  kind: 'floor' | 'wall' | 'waterfall';
  frames: { x: number; y: number }[];
  name: string;
}
export function suggestSheet(
  name: string,
  width: number,
  height: number,
): { tileSize: number; layout: SheetLayout } {
  const unit = width === 768 ? 48 : 32,
    scale = unit / 32;
  if (width === 512 * scale) {
    if (/(?:^|[ _-])a1(?:[a-z]?)(?:[ ._-]|$)/i.test(name) && height === 384 * scale)
      return { tileSize: unit, layout: 'ace-a1' };
    if (/(?:^|[ _-])a2(?:[ ._-]|$)/i.test(name) && height === 384 * scale)
      return { tileSize: unit, layout: 'ace-a2' };
    if (/(?:^|[ _-])a3(?:[ ._-]|$)/i.test(name) && height === 256 * scale)
      return { tileSize: unit, layout: 'ace-a3' };
    if (/(?:^|[ _-])a4(?:[a-z]?)(?:[ ._-]|$)/i.test(name) && height === 480 * scale)
      return { tileSize: unit, layout: 'ace-a4' };
    if (height === 512 * scale) return { tileSize: unit, layout: 'grid' };
  }
  return { tileSize: width === 256 && height === 512 ? 32 : 16, layout: 'grid' };
}
export function terrainBlocks(
  layout: SheetLayout,
  size: number,
  width: number,
  height: number,
): TerrainBlock[] {
  if (layout === 'grid') return [];
  const rows = layout === 'ace-a4' ? 6 : layout === 'ace-a1' ? 2 : 4,
    columns = 8;
  const blocks: TerrainBlock[] = [];
  if (
    width !== size * 16 ||
    height !== size * (layout === 'ace-a4' ? 15 : layout === 'ace-a3' ? 8 : 12)
  )
    throw new Error(
      'Sheet dimensions do not match this RPG Maker layout. Choose Grid for ordinary sheets.',
    );
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const i = row * columns + col;
      let x = col * 2,
        y = row * 3,
        kind: TerrainBlock['kind'] = 'floor',
        frames: { x: number; y: number }[] = [];
      if (layout === 'ace-a4') {
        y = Math.floor(row / 2) * 5 + (row % 2 ? 3 : 0);
        if (row % 2) kind = 'wall';
      }
      if (layout === 'ace-a3') {
        y = row * 2;
        kind = 'wall';
      }
      if (layout === 'ace-a1') {
        if (i < 4) {
          x = i < 2 ? 0 : 6;
          y = (i % 2) * 3;
          frames = i < 2 ? [0, 2, 4, 2].map((dx) => ({ x: x + dx, y })) : [{ x, y }];
        } else {
          x = Math.floor(col / 4) * 8;
          y = row * 6 + (Math.floor(col / 2) % 2) * 3;
          if (col % 2) {
            x += 6;
            kind = 'waterfall';
            frames = [0, 1, 2].map((dy) => ({ x, y: y + dy }));
          } else frames = [0, 2, 4, 2].map((dx) => ({ x: x + dx, y }));
        }
      }
      if (!frames.length) frames = [{ x, y }];
      blocks.push({
        x: x * size,
        y: y * size,
        kind,
        frames: frames.map((f) => ({ x: f.x * size, y: f.y * size })),
        name:
          (kind === 'waterfall' ? 'Waterfall ' : kind === 'wall' ? 'Wall ' : 'Terrain ') + (i + 1),
      });
    }
  return blocks;
}
function quarters(kind: TerrainBlock['kind'], mask: number): number[][] {
  const N = !!(mask & 1),
    E = !!(mask & 2),
    S = !!(mask & 4),
    W = !!(mask & 8);
  if (kind === 'wall')
    return [
      [W ? 2 : 0, N ? 2 : 0],
      [E ? 1 : 3, N ? 2 : 0],
      [W ? 2 : 0, S ? 1 : 3],
      [E ? 1 : 3, S ? 1 : 3],
    ];
  if (kind === 'waterfall')
    return [
      [W ? 2 : 0, 0],
      [E ? 1 : 3, 0],
      [W ? 2 : 0, 1],
      [E ? 1 : 3, 1],
    ];
  return [
    !N && !W ? [0, 2] : !N ? [2, 2] : !W ? [0, 4] : !(mask & 128) ? [2, 0] : [2, 4],
    !N && !E ? [3, 2] : !N ? [1, 2] : !E ? [3, 4] : !(mask & 16) ? [3, 0] : [1, 4],
    !S && !W ? [0, 5] : !S ? [2, 5] : !W ? [0, 3] : !(mask & 64) ? [2, 1] : [2, 3],
    !S && !E ? [3, 5] : !S ? [1, 5] : !E ? [3, 3] : !(mask & 32) ? [3, 1] : [1, 3],
  ];
}
/** Independently assembled quarter tiles; no proprietary engine code is shipped. */
export function composeTerrain(
  sheet: Sheet,
  block: TerrainBlock,
  size: number,
  mask: number,
  frame = 0,
) {
  if (size % 2) throw new Error('RPG autotiles require an even source tile size.');
  const half = size / 2,
    parts = quarters(block.kind, mask),
    base = block.frames[frame % block.frames.length],
    pixels = Array<number>(size * size * 4).fill(0);
  parts.forEach(([qx, qy], q) => {
    for (let y = 0; y < half; y++)
      for (let x = 0; x < half; x++) {
        const from = ((base.y + qy * half + y) * sheet.width + base.x + qx * half + x) * 4,
          to = ((Math.floor(q / 2) * half + y) * size + (q % 2) * half + x) * 4;
        if (sheet.pixels[from + 3])
          for (let c = 0; c < 4; c++) pixels[to + c] = sheet.pixels[from + c];
      }
  });
  return pixels;
}
export function resizeTileset(set: TilesetAsset, size: number) {
  if (size === set.tileSize) return set;
  if (!Number.isInteger(size) || size < 8 || size > 64)
    throw new Error('Output tiles must be 8–64px.');
  const source = set.tileSize;
  for (const t of set.tiles) {
    const pixels: number[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (Math.floor((y * source) / size) * source + Math.floor((x * source) / size)) * 4;
        pixels.push(...t.pixels.slice(i, i + 4));
      }
    t.pixels = pixels;
  }
  set.tileSize = size;
  return set;
}
export function buildTerrainTileset(
  name: string,
  sheet: Sheet,
  layout: SheetLayout,
  size: number,
  selected: ReadonlySet<number>,
  id = uid('tileset'),
): TilesetAsset {
  if (selected.size > 16) throw new Error('Select up to 16 terrain blocks per tileset.');
  const blocks = terrainBlocks(layout, size, sheet.width, sheet.height),
    tiles: TilesetAsset['tiles'] = [],
    terrains: NonNullable<TilesetAsset['terrains']> = [],
    buckets = new Map<string, number[]>();
  const tile = (pixels: number[], label: string) => {
    const hash = pixelHash(pixels),
      bucket = buckets.get(hash) ?? [],
      existing = bucket.find((i) => samePixels(tiles[i].pixels, pixels));
    if (existing !== undefined) return tiles[existing];
    const t: TilesetAsset['tiles'][number] = {
      id: id + '_t' + (tiles.length + 1),
      name: label,
      pixels,
      solid: false,
    };
    bucket.push(tiles.length);
    buckets.set(hash, bucket);
    tiles.push(t);
    return t;
  };
  const cells: string[] = [];
  for (const index of [...selected].sort((a, b) => a - b)) {
    buckets.clear(); // Separate terrain membership even when artwork is identical.
    const b = blocks[index];
    if (!b) continue;
    const variants: Record<number, string> = {};
    for (const mask of b.kind === 'floor'
      ? terrainMasks
      : Array.from({ length: 16 }, (_, i) => i)) {
      const frames = b.frames.map((_, f) =>
        tile(composeTerrain(sheet, b, size, mask, f), b.name + ' / ' + mask),
      );
      // Keep an animated base distinct from a static/shared pixel record.
      let base: TilesetAsset['tiles'][number] = frames[0];
      if (frames.some((t) => t.id !== base.id)) {
        const animation = { fps: 6, frames: frames.map((t) => t.id) };
        if (base.animation && JSON.stringify(base.animation) !== JSON.stringify(animation)) {
          base = { ...base, id: id + '_t' + (tiles.length + 1), pixels: [...base.pixels] };
          tiles.push(base);
        }
        base.animation = animation;
      }
      variants[mask] = base.id;
    }
    const terrain = { id: 'terrain_' + index, name: b.name, variants };
    terrains.push(terrain);
    cells.push(variants[255] ?? variants[15] ?? variants[0]);
  }
  if (!tiles.length) throw new Error('Select at least one terrain block.');
  if (tiles.length > 255)
    throw new Error(
      `${tiles.length} tile images are needed. Select fewer terrain blocks (animated water includes its frames).`,
    );
  const columns = Math.min(8, cells.length),
    rows = Math.ceil(cells.length / columns);
  while (cells.length < columns * rows) cells.push('');
  return {
    id,
    name: name.trim().slice(0, 128) || 'Terrain',
    tileSize: size,
    columns,
    rows,
    cells,
    tiles,
    terrains,
  };
}
