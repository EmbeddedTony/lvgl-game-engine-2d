import { createH7Adventure } from './h7-adventure';
import { buildTerrainTileset } from '../tiles/rpg-import';
import { terrainMask } from '../tiles/terrain';
import { sliceSheet, type Sheet } from '../tilesets';
import type { TilesetAsset } from '../model';

/** Local pack integration; callers supply their own artwork, never bundled pack data.
 * Keep the existing 32px world, collision, animation tables and image bank indices.
 */
export function createImportedH7Adventure(sheets: { grass: Sheet; paths: Sheet; water: Sheet }) {
  const p = createH7Adventure();
  const grass = sliceSheet(sheets.grass, {
    tileSize: 32,
    marginX: 0,
    marginY: 0,
    spacingX: 0,
    spacingY: 0,
  }).tiles[1];
  if (grass?.length !== 32 * 32 * 4 || grass.some((v, i) => i % 4 === 3 && v !== 255))
    throw new Error('The village base requires an opaque 32px grass tile at A5 cell 1.');
  const paths = buildTerrainTileset(
    'Imported paths',
    sheets.paths,
    'ace-a2',
    32,
    new Set([2]),
    'local_path',
  );
  const water = buildTerrainTileset(
    'Imported water',
    sheets.water,
    'ace-a1',
    32,
    new Set([0]),
    'local_water',
  );
  const variant = (set: TilesetAsset, mask: number, frame = 0) => {
    // The demonstration uses cardinal neighbors; connected diagonals form filled corners.
    const id = set.terrains![0].variants[terrainMask(mask | 240)];
    const tile = set.tiles.find((t) => t.id === id)!;
    const pixels = tile.animation
      ? set.tiles.find(
          (t) => t.id === tile.animation!.frames[frame % tile.animation!.frames.length],
        )!.pixels
      : tile.pixels;
    // Bake transparent terrain edges over the grass, without resampling either image.
    return pixels.map((v, i) => {
      if (i % 4 === 3) return 255;
      const alpha = pixels[i - (i % 4) + 3];
      return Math.round((v * alpha + grass[i] * (255 - alpha)) / 255);
    });
  };
  for (const tile of p.tilesets![0].tiles) {
    if (tile.id === 'v_grass' || tile.id === 'v_flower') tile.pixels = [...grass];
    else if (/^v_path(?:_\d+)?$/.test(tile.id))
      tile.pixels = variant(paths, tile.id === 'v_path' ? 15 : Number(tile.id.slice(7)));
    else {
      const match = tile.id.match(/^v_(water|shore_(\d+))(?:_f(\d+))?$/);
      if (match)
        tile.pixels = variant(water, match[2] ? Number(match[2]) : 15, Number(match[3] ?? 0));
    }
  }
  p.id = 'willowlight_country_h7';
  p.name = 'Willowlight - Country Woods 32px';
  p.tilesets![0].name = 'Country Woods · original 32px terrain';
  return p;
}
