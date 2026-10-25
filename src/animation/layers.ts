import type { Project, SpriteAsset } from '../model';
import type { GameNode } from '../model';
import type { AnimationClip } from '../gameplay/model';

export interface AnimationLayer {
  name: string;
  frames: string[];
  visible: boolean;
  x: number;
  y: number;
}
type AnimationProject = Pick<Project, 'sprites'> & Partial<Pick<Project, 'gameplay'>>;
const MAX_COMPOSITE_PIXELS = 4 * 1024 * 1024;
/** Virtual IDs cannot collide with authored IDs (which cannot contain colons). */
export function animationFrames(clip: AnimationClip): string[] {
  return clip.layers ? clip.frames.map((_, i) => `layered:${clip.id}:${i}`) : clip.frames;
}
export function initialAnimationImage(node: GameNode, p: Partial<Pick<Project, 'gameplay'>>) {
  const clip = p.gameplay?.animations.find((c) => c.id === node.animator?.idle);
  return clip?.layers ? animationFrames(clip)[0] : node.asset;
}
export function layeredAnimationIssues(p: AnimationProject): string[] {
  const sprites = new Map(p.sprites.map((s) => [s.id, s]));
  let pixels = 0;
  for (const c of Array.isArray(p.gameplay?.animations) ? p.gameplay.animations : []) {
    if (!c || c.layers === undefined) continue;
    if (
      !Array.isArray(c.frames) ||
      !c.frames.length ||
      !Array.isArray(c.layers) ||
      c.layers.length < 1 ||
      c.layers.length > 8
    )
      return ['Layered clips need 1–8 layers and a shared frame timeline.'];
    const base = sprites.get(c.frames[0]);
    if (!base || base.width > 128 || base.height > 128 || c.frames.length > 32)
      return ['Layered animation canvas must be at most 128 × 128 with at most 32 frames.'];
    for (const l of c.layers) {
      if (
        !l ||
        typeof l.name !== 'string' ||
        l.name.length > 128 ||
        l.name.includes('\0') ||
        typeof l.visible !== 'boolean' ||
        !Number.isInteger(l.x) ||
        Math.abs(l.x) > 128 ||
        !Number.isInteger(l.y) ||
        Math.abs(l.y) > 128 ||
        !Array.isArray(l.frames) ||
        ![1, c.frames.length].includes(l.frames.length) ||
        l.frames.some((id) => !sprites.has(id))
      )
        return [
          `${c.name}: each layer needs existing sprite frames (one static frame or the full timeline), visibility and integer offsets.`,
        ];
    }
    pixels += base.width * base.height * c.frames.length;
    if (pixels > MAX_COMPOSITE_PIXELS)
      return ['Layered animation previews exceed 4 million pixels. Use fewer/smaller clips.'];
  }
  return [];
}
/** Straight-alpha source-over. Source pixels remain immutable; all layers use one frame index. */
export function composeAnimationFrame(
  clip: AnimationClip,
  frame: number,
  sprites: ReadonlyMap<string, SpriteAsset>,
): SpriteAsset {
  const base = sprites.get(clip.frames[0])!;
  const output: SpriteAsset = {
    id: animationFrames(clip)[frame],
    name: `${clip.name} / ${frame + 1}`,
    width: base.width,
    height: base.height,
    pixels: Array(base.width * base.height * 4).fill(0),
  };
  for (const layer of clip.layers ?? []) {
    if (!layer.visible) continue;
    const image = sprites.get(layer.frames[layer.frames.length === 1 ? 0 : frame])!;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const dx = x + layer.x,
          dy = y + layer.y;
        if (dx < 0 || dy < 0 || dx >= base.width || dy >= base.height) continue;
        const from = (y * image.width + x) * 4,
          to = (dy * base.width + dx) * 4;
        const sa = image.pixels[from + 3] / 255,
          da = output.pixels[to + 3] / 255,
          alpha = sa + da * (1 - sa);
        if (!sa) continue;
        for (let k = 0; k < 3; k++)
          output.pixels[to + k] = Math.round(
            (image.pixels[from + k] * sa + output.pixels[to + k] * da * (1 - sa)) / alpha,
          );
        output.pixels[to + 3] = Math.round(alpha * 255);
      }
  }
  return output;
}
// Cache only the current source revision and the latest bake per clip. Undo history
// must not retain another complete set of derived images for every clothing edit.
let cachedSources: SpriteAsset[] | undefined;
const cache = new Map<string, { clip: AnimationClip; images: SpriteAsset[] }>();
export function layeredImages(p: AnimationProject): SpriteAsset[] {
  if (layeredAnimationIssues(p).length) return [];
  const immutable =
    Object.isFrozen(p.sprites) &&
    p.sprites.every((s) => Object.isFrozen(s) && Object.isFrozen(s.pixels));
  if (cachedSources !== p.sprites) {
    cachedSources = p.sprites;
    cache.clear();
  }
  const sprites = new Map(p.sprites.map((s) => [s.id, s]));
  return (Array.isArray(p.gameplay?.animations) ? p.gameplay.animations : []).flatMap((c) => {
    if (!c?.layers) return [];
    const cacheable =
      immutable &&
      Object.isFrozen(c) &&
      Object.isFrozen(c.frames) &&
      Object.isFrozen(c.layers) &&
      c.layers.every((l) => Object.isFrozen(l) && Object.isFrozen(l.frames));
    const entry = cache.get(c.id);
    let images = cacheable && entry?.clip === c ? entry.images : undefined;
    if (!images) {
      images = c.frames.map((_, i) => composeAnimationFrame(c, i, sprites));
      if (cacheable) cache.set(c.id, { clip: c, images });
    }
    return images;
  });
}
