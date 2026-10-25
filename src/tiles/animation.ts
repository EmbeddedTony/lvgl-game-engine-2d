import type { Project, TileMap, TilesetTile } from '../model';
export interface TileAnimation {
  fps: number;
  frames: string[];
}
export function validTileAnimation(
  a: unknown,
  exists: (id: string) => boolean,
): a is TileAnimation {
  if (!a || typeof a !== 'object') return false;
  const v = a as TileAnimation;
  return (
    Number.isInteger(v.fps) &&
    v.fps >= 1 &&
    v.fps <= 30 &&
    Array.isArray(v.frames) &&
    v.frames.length >= 1 &&
    v.frames.length <= 8 &&
    v.frames.every((id) => typeof id === 'string' && exists(id))
  );
}
/** Collision/map values never change. Only the image is sampled from the scene clock. */
export function tileFrame(map: TileMap, value: number, ticks: number): string {
  const a = map.animations?.[value];
  return a
    ? a.frames[Math.floor((Math.max(0, ticks) * a.fps) / 60) % a.frames.length]
    : map.tiles[value - 1];
}
export function setTileAnimation(p: Project, tileId: string, animation?: TileAnimation) {
  const tile = p.tilesets?.flatMap((s) => s.tiles).find((t) => t.id === tileId);
  if (!tile) throw new Error('Select a tile from a tileset resource.');
  tile.animation = animation ? { fps: animation.fps, frames: [...animation.frames] } : undefined;
  for (const scene of p.scenes)
    for (const n of scene.nodes)
      if (n.tilemap) {
        const v = n.tilemap.tiles.indexOf(tileId) + 1;
        if (!v) continue;
        if (animation)
          (n.tilemap.animations ??= {})[v] = { fps: animation.fps, frames: [...animation.frames] };
        else if (n.tilemap.animations) delete n.tilemap.animations[v];
      }
}
export const tileHasAnimation = (tile?: TilesetTile) => !!tile?.animation;
