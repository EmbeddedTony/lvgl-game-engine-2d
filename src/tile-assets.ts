import type { Project, SpriteAsset } from './model';
import { layeredImages } from './animation/layers';

export const MAX_MAP_TILES = 255;
export const MAX_ATLAS_CELLS = 4096;
export const MAX_PROJECT_TILES = 2048;

export function projectImages(
  p: Pick<Project, 'sprites' | 'tilesets'> & Partial<Pick<Project, 'gameplay'>>,
): SpriteAsset[] {
  return [
    ...p.sprites,
    ...layeredImages(p),
    ...(p.tilesets ?? []).flatMap((set) =>
      set.tiles.map((t) => ({ ...t, width: set.tileSize, height: set.tileSize })),
    ),
  ];
}
export function pixelHash(pixels: ArrayLike<number>): string {
  let hash = 2166136261;
  for (let i = 0; i < pixels.length; i++) hash = Math.imul(hash ^ pixels[i], 16777619);
  return (hash >>> 0).toString(16);
}
export function samePixels(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
