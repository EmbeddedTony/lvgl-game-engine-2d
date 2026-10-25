import type { Project, SpriteAsset } from '../model';
import { resolveScene } from '../scenes';
import { imagePackingPolicy } from './image-policy';

/** Extra immutable flash only: no frame cache, allocation or GPU-specific API.
 * Small software targets keep their compact single-tile representation. */
export const TILE_BATCH_FLASH_LIMIT = 64 * 1024;
export const TILE_BATCH_COPIES = 8;
export interface TileBatch {
  asset: string;
  tileSize: number;
  copies: number;
  bytes: number;
  savedDraws: number;
}
interface TileBatchCandidate extends TileBatch {
  runs: Map<number, number>;
}
export const tileBatchKey = (asset: string, tileSize: number) => `${asset}:${tileSize}`;

/** Rank repeated static row runs; never cross rows, holes or animated cells.
 * Deduplicate composed maps before counting benefits or reserving flash. */
export function planTileBatches(project: Project): TileBatch[] {
  if (imagePackingPolicy(project) !== 'direct') return [];
  const candidates = new Map<string, TileBatchCandidate>(),
    maps = new Set<string>();
  for (const scene of project.scenes) {
    let nodes;
    try {
      nodes = resolveScene(project, scene);
    } catch {
      continue; // Guidance reports invalid graphs separately; this optimization is optional.
    }
    for (const node of nodes) {
      const map = node.tilemap;
      if (!map) continue;
      const identity = JSON.stringify(map);
      if (maps.has(identity)) continue;
      maps.add(identity);
      for (let row = 0; row < map.rows; row++)
        for (let col = 0; col < map.columns;) {
          const value = map.cells[row * map.columns + col];
          let end = col + 1;
          while (end < map.columns && map.cells[row * map.columns + end] === value) end++;
          if (value && !map.animations?.[value] && end - col > 1) {
            const asset = map.tiles[value - 1],
              key = tileBatchKey(asset, map.tileSize);
            const candidate = candidates.get(key) ?? {
              asset,
              tileSize: map.tileSize,
              copies: 1,
              bytes: 0,
              savedDraws: 0,
              runs: new Map<number, number>(),
            };
            const length = end - col;
            candidate.runs.set(length, (candidate.runs.get(length) ?? 0) + 1);
            candidates.set(key, candidate);
          }
          col = end;
        }
    }
  }
  // Spend flash on marginal benefit: short strips for several useful tiles can
  // beat one long strip used rarely. Upgrade 1 -> 2 -> 4 -> 8 copies greedily.
  // Every chosen upgrade reduces commands; this is not an FPS prediction.
  let bytes = 0;
  while (true) {
    let best:
      | {
          candidate: TileBatchCandidate;
          copies: number;
          saved: number;
          cost: number;
          gain: number;
          key: string;
        }
      | undefined;
    for (const [key, candidate] of candidates) {
      const copies = candidate.copies * 2;
      if (copies > TILE_BATCH_COPIES) continue;
      const cost = candidate.tileSize ** 2 * copies * 4 - candidate.bytes;
      if (bytes + cost > TILE_BATCH_FLASH_LIMIT) continue;
      let saved = 0;
      for (const [length, count] of candidate.runs)
        saved += (length - Math.ceil(length / copies)) * count;
      const gain = saved - candidate.savedDraws;
      if (saved < 64 || gain <= 0) continue;
      if (
        !best ||
        gain * best.cost > best.gain * cost ||
        (gain * best.cost === best.gain * cost && key < best.key)
      )
        best = { candidate, copies, cost, gain, saved, key };
    }
    if (!best) break;
    bytes += best.cost;
    best.candidate.bytes += best.cost;
    best.candidate.copies = best.copies;
    best.candidate.savedDraws = best.saved;
  }
  return [...candidates.values()]
    .filter((c) => c.copies > 1)
    .map(({ runs: _runs, ...batch }) => batch);
}

/** Copy whole RGBA rows; never resize, filter, quantize or flatten alpha. */
export function repeatTile(tile: SpriteAsset, copies: number): SpriteAsset {
  const pixels: number[] = [];
  for (let y = 0; y < tile.height; y++) {
    const row = tile.pixels.slice(y * tile.width * 4, (y + 1) * tile.width * 4);
    for (let i = 0; i < copies; i++) pixels.push(...row);
  }
  return { ...tile, width: tile.width * copies, pixels };
}
