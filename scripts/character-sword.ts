import type { SpriteAsset } from '../src/model';
import type { AnimationClip } from '../src/gameplay/model';

/** Small deterministic weapon/VFX layer, separate from the pack's body/outfit poses.
 * Full 64px cells share the character origin; normal layered export bakes the result. */
export function addSwordSweep(clips: AnimationClip[]): SpriteAsset[] {
  const sprites: SpriteAsset[] = [];
  for (const clip of clips) {
    const direction = clip.id.split('_').at(-1) as 'Down' | 'Up' | 'Left' | 'Right';
    const baseAngle = { Down: Math.PI / 2, Up: -Math.PI / 2, Left: Math.PI, Right: 0 }[direction];
    if (baseAngle === undefined || clip.frames.length !== 4 || !clip.layers)
      throw new Error('Sword sweep needs a four-frame directional layered swing.');
    const frames = [0, 1, 2, 3].map((phase) => {
      const id = `${clip.id}_sword_${phase}`,
        pixels = Array(64 * 64 * 4).fill(0);
      const put = (x: number, y: number, color: number[]) => {
        if (x >= 0 && y >= 0 && x < 64 && y < 64) pixels.splice((y * 64 + x) * 4, 4, ...color);
      };
      const angle = baseAngle + [-0.9, -0.3, 0.3, 0.9][phase];
      for (let radius = 12; radius < 28; radius++) {
        const x = Math.round(32 + Math.cos(angle) * radius),
          y = Math.round(34 + Math.sin(angle) * radius);
        put(x, y, [243, 242, 207, 255]);
        put(x + 1, y, [134, 185, 187, 255]);
        put(x, y + 1, [186, 214, 204, 255]);
      }
      for (let i = 0; i < 20; i++) {
        const a = angle - 0.6 + i * 0.06;
        put(
          Math.round(32 + Math.cos(a) * 28),
          Math.round(34 + Math.sin(a) * 28),
          [237, 204, 123, 255],
        );
      }
      sprites.push({
        id,
        name: `Sword sweep / ${direction} ${phase + 1}`,
        width: 64,
        height: 64,
        pixels,
      });
      return id;
    });
    const layer = { name: 'Sword sweep', frames, visible: true, x: 0, y: 0 };
    if (direction === 'Up') clip.layers.unshift(layer);
    else clip.layers.push(layer);
  }
  return sprites;
}
