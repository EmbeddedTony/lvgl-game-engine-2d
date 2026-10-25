import type { TileMap, TilesetAsset } from '../model';
export interface Terrain {
  id: string;
  name: string;
  variants: Record<number, string>;
}
/** N,E,S,W,NE,SE,SW,NW. Diagonal corners only matter between two connected edges. */
export function terrainMask(mask: number) {
  if ((mask & 3) !== 3) mask &= ~16;
  if ((mask & 6) !== 6) mask &= ~32;
  if ((mask & 12) !== 12) mask &= ~64;
  if ((mask & 9) !== 9) mask &= ~128;
  return mask;
}
export const terrainMasks = Array.from({ length: 256 }, (_, i) => i).filter(
  (i) => terrainMask(i) === i,
);
export function paintableTiles(set: TilesetAsset) {
  const ids = new Set([
    ...set.cells,
    ...(set.terrains ?? []).flatMap((t) => Object.values(t.variants)),
  ]);
  return set.tiles.filter((t) => ids.has(t.id));
}
/** Editor-only neighbor resolution. Firmware sees ordinary compressed byte cells. */
export function refreshTerrain(map: TileMap, changes?: Iterable<number>) {
  if (!map.terrains) return;
  const groups = Object.values(map.terrains),
    byValue = new Map<number, (typeof groups)[number]>();
  for (const group of groups) for (const value of Object.values(group)) byValue.set(value, group);
  const indices = new Set<number>();
  if (changes)
    for (const i of changes)
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++) {
          const c = (i % map.columns) + x,
            r = Math.floor(i / map.columns) + y;
          if (c >= 0 && c < map.columns && r >= 0 && r < map.rows) indices.add(r * map.columns + c);
        }
  else for (let i = 0; i < map.cells.length; i++) indices.add(i);
  for (const i of indices) {
    const group = byValue.get(map.cells[i]);
    if (!group) continue;
    const c = i % map.columns,
      r = Math.floor(i / map.columns);
    let mask = 0;
    const offsets = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ];
    offsets.forEach(([x, y], bit) => {
      const cx = c + x,
        ry = r + y;
      if (
        cx >= 0 &&
        cx < map.columns &&
        ry >= 0 &&
        ry < map.rows &&
        byValue.get(map.cells[ry * map.columns + cx]) === group
      )
        mask |= 1 << bit;
    });
    mask = terrainMask(mask);
    map.cells[i] = group[mask] ?? group[mask & 15] ?? map.cells[i];
  }
}
