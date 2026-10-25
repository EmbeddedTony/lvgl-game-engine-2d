import frames from './traveller-art.json' with { type: 'json' };
import type { Project } from '../model';
/** Animation frames share padded bounds and ground baseline; the collider stays small. */
export function dressTraveller(p: Project) {
  const byId = new Map(frames.map((f) => [f.id, f]));
  p.sprites = p.sprites.filter((s) => !s.id.startsWith('hero_'));
  for (const direction of ['Down', 'Up', 'Left', 'Right'] as const) {
    for (const mode of ['idle', 'move', 'attack'])
      for (let phase = 0; phase < (mode === 'idle' ? 1 : 4); phase++) {
        const frame = byId.get(`walk_${direction}_${mode === 'move' ? phase : 1}`)!;
        const pixels = [...frame.pixels];
        if (mode === 'attack') {
          const angle =
            { Down: Math.PI / 2, Up: -Math.PI / 2, Left: Math.PI, Right: 0 }[direction] +
            [-0.9, -0.3, 0.3, 0.9][phase];
          const put = (x: number, y: number, c: number[]) => {
            if (x >= 0 && y >= 0 && x < 64 && y < 64) pixels.splice((y * 64 + x) * 4, 4, ...c);
          };
          for (let r = 12; r < 30; r++) {
            const x = Math.round(32 + Math.cos(angle) * r),
              y = Math.round(34 + Math.sin(angle) * r);
            put(x, y, [243, 242, 207, 255]);
            put(x + 1, y, [134, 185, 187, 255]);
            put(x, y + 1, [186, 214, 204, 255]);
          }
          for (let i = 0; i < 20; i++) {
            const a = angle - 0.6 + i * 0.06;
            put(
              Math.round(32 + Math.cos(a) * 29),
              Math.round(34 + Math.sin(a) * 29),
              [237, 204, 123, 255],
            );
          }
        }
        p.sprites.push({
          ...frame,
          id: `hero_${mode}_${direction}_${phase}`,
          name: `Traveller ${mode} ${direction} ${phase}`,
          pixels,
        });
      }
  }
  const hero = p.scenes[0].nodes.find((n) => n.id === 'player')!;
  hero.physics!.box = { x: 22, y: 38, width: 20, height: 14 };
  const guide = p.scenes[0].nodes.find((n) => n.id === 'guide')!;
  const base = byId.get('walk_Down_1')!;
  p.sprites.push({
    ...base,
    id: 'mira_village',
    name: 'Mira · plum coat',
    pixels: base.pixels.map((v, i) => {
      const at = i - (i % 4),
        r = base.pixels[at],
        g = base.pixels[at + 1],
        b = base.pixels[at + 2];
      return g > r * 1.12 && b > r && i % 4 < 3
        ? [Math.min(255, b + 35), g, Math.min(255, r + 70)][i % 4]
        : v;
    }),
  });
  guide.asset = 'mira_village';
  guide.width = guide.height = 64;
  guide.physics = {
    body: 'none',
    box: { x: 22, y: 38, width: 20, height: 14 },
    layer: 1,
    mask: 0,
    motion: 'topdown',
    gravity: 0,
    jumpSpeed: 0,
    velocityX: 0,
    velocityY: 0,
    worldBounds: true,
  };
}
