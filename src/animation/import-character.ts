import { makeNode, type SpriteAsset } from '../model';
import { makePhysics } from '../physics';
import type { Sheet } from '../tilesets';
import type { AnimationClip, Animator } from '../gameplay/model';
import { animationFrames } from './layers';
import { pixelHash, samePixels } from '../tile-assets';

export interface CharacterSheet {
  name: string;
  sheet: Sheet;
}
export interface CharacterImportOptions {
  /** Whole-pixel display scale. Source layers retain their original pixels. */
  pixelScale?: 1 | 2 | 3 | 4;
  /** Keep the full source cell for actors that also use wide tool/action poses. */
  fullCell?: boolean;
}
const order = ['0bot', '0bas', '1out', '2clo', '3fac', '4har', '5hat', '6tla', '7tlb'];
// Mana Seed P1/P2 rows run Down, Up, Right, Left. Keep clip presentation order
// independent of source layout; never mirror pixels or invert movement input.
const directionRows = [
  ['Down', 0],
  ['Up', 1],
  ['Left', 3],
  ['Right', 2],
] as const;
export function characterLayerName(file: string) {
  if (file.includes('_2clo_lnpl_')) return 'Front cloak';
  if (file.includes('_2clo_mnpl_')) return 'Mantle';
  const code = file.match(/_(0bot|0bas|1out|2clo|3fac|4har|5hat|6tla|7tlb)_/)?.[1];
  return (
    (
      {
        '0bot': 'Rear cloak',
        '0bas': 'Body',
        '1out': 'Outfit',
        '2clo': 'Cloak / mantle',
        '3fac': 'Facewear',
        '4har': 'Hair',
        '5hat': 'Hood / hat',
        '6tla': 'Main tool',
        '7tlb': 'Offhand',
      } as Record<string, string>
    )[code ?? ''] ?? file.replace(/\.png$/i, '')
  );
}
export function sortCharacterSheets(sheets: CharacterSheet[]) {
  const rank = (name: string) => {
    const code = name.match(/_(0bot|0bas|1out|2clo|3fac|4har|5hat|6tla|7tlb)_/)?.[1];
    return (code ? order.indexOf(code) : 9) * 10 + (name.includes('_mnpl_') ? 1 : 0);
  };
  return [...sheets].sort((a, b) => rank(a.name) - rank(b.name));
}
function validateSheets(sources: CharacterSheet[], page: 'p1' | 'p2') {
  if (!sources.length || sources.length > 8)
    throw new Error('Choose 1–8 compatible character layers.');
  if (
    sources.some(
      (s) =>
        s.sheet.width !== 512 ||
        s.sheet.height !== 512 ||
        !s.name.toLowerCase().includes(`_${page}_`),
    )
  )
    throw new Error(
      `Choose matching Mana Seed ${page.toUpperCase()} sheets (512 × 512). Pages must match across all layers.`,
    );
  if (sources.filter((s) => s.name.includes('_0bas_')).length !== 1)
    throw new Error(
      'Include exactly one Character Base body layer. Choose one color variant per part.',
    );
  if (sources.filter((s) => s.name.includes('_5hat_')).length > 1)
    throw new Error('Choose one hood or hat. Hood-up and hood-down sheets are alternatives.');
  return sortCharacterSheets(sources);
}

/** Share exact duplicate source cells (especially empty rear-cloak frames), with
 * collision-safe pixel comparison. This saves authoring slots as well as export storage. */
function frameImporter(name: string, prefix: string, sheets: CharacterSheet[], fullCell: boolean) {
  const sprites: SpriteAsset[] = [],
    cells = new Map<string, string>(),
    images = new Map<string, SpriteAsset[]>();
  const [left, top, width, height] = fullCell ? [0, 0, 64, 64] : [16, 8, 32, 48];
  const extract = (layer: number, row: number, col: number) => {
    const id = `${prefix}_l${layer}_r${row}_c${col}`;
    if (!cells.has(id)) {
      const sheet = sheets[layer].sheet,
        pixels: number[] = [];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const at = ((row * 64 + top + y) * sheet.width + col * 64 + left + x) * 4;
          const alpha = sheet.pixels[at + 3];
          pixels.push(
            ...(alpha ? Array.from({ length: 4 }, (_, c) => sheet.pixels[at + c]) : [0, 0, 0, 0]),
          );
        }
      const hash = pixelHash(pixels),
        candidates = images.get(hash) ?? [];
      const duplicate = candidates.find((s) => samePixels(s.pixels, pixels));
      if (duplicate) {
        cells.set(id, duplicate.id);
        return duplicate.id;
      }
      const sprite: SpriteAsset = {
        id,
        name: `${name} / ${characterLayerName(sheets[layer].name)} / ${row}:${col}`,
        width,
        height,
        pixels,
      };
      sprites.push(sprite);
      candidates.push(sprite);
      images.set(hash, candidates);
      cells.set(id, id);
    }
    return cells.get(id)!;
  };
  return { sprites, extract, width, height };
}

/** Mana Seed P1 import. One common crop preserves layer registration and original pixels.
 * Source sheets and rows are authoring data; only composed, used frames reach firmware.
 */
export function importLayeredCharacter(
  name: string,
  prefix: string,
  sources: CharacterSheet[],
  options: CharacterImportOptions = {},
) {
  const sheets = validateSheets(sources, 'p1');
  const scale = options.pixelScale ?? 1;
  if (![1, 2, 3, 4].includes(scale))
    throw new Error('Character display scale must be 1×, 2×, 3× or 4×.');
  const { sprites, extract, width, height } = frameImporter(
    name,
    prefix,
    sheets,
    !!options.fullCell,
  );
  const clips: AnimationClip[] = [];
  const animator: Animator = { idle: '', move: '', jump: '', fall: '' };
  const body = sheets.findIndex((s) => s.name.includes('_0bas_'));
  for (const [direction, row] of directionRows) {
    for (const motion of ['idle', 'move'] as const) {
      const sourceRow = row + (motion === 'move' ? 4 : 0),
        count = motion === 'move' ? 6 : 1;
      const layers = sheets.map((s, layer) => ({
        name: characterLayerName(s.name),
        visible: true,
        x: 0,
        y: 0,
        frames: Array.from({ length: count }, (_, col) => extract(layer, sourceRow, col)),
      }));
      const id = `${prefix}_${motion}_${direction}`;
      clips.push({
        id,
        name: `${name} / ${motion} ${direction}`,
        fps: 8,
        loop: true,
        frames: [...layers[body].frames],
        layers,
      });
      animator[`${motion}${direction}` as keyof Animator] = id;
    }
  }
  animator.idle = animator.idleDown!;
  animator.move = animator.moveDown!;
  const node = makeNode('sprite', {
    id: prefix,
    name,
    width: width * scale,
    height: height * scale,
    asset: animationFrames(clips[0])[0],
    animator,
    sortY: true,
    physics: {
      ...makePhysics('character'),
      mask: 1,
      box: {
        x: (options.fullCell ? 25 : 9) * scale,
        y: (options.fullCell ? 38 : 30) * scale,
        width: 14 * scale,
        height: 9 * scale,
      },
    },
  });
  return { sprites, clips, node };
}

/** Page 2's four overhead-tool poses, shared by hoe/chop/mine animations.
 * Uses full 64px cells, so a matching fullCell P1 actor keeps the same origin.
 * Tool/weapon art is an ordinary editable layer, independent of these body poses. */
export function importLayeredToolSwing(name: string, prefix: string, sources: CharacterSheet[]) {
  const sheets = validateSheets(sources, 'p2');
  const { sprites, extract } = frameImporter(name, prefix, sheets, true);
  const body = sheets.findIndex((s) => s.name.includes('_0bas_'));
  const clips: AnimationClip[] = directionRows.map(([direction, row]) => {
    const layers = sheets.map((s, layer) => ({
      name: characterLayerName(s.name),
      visible: true,
      x: 0,
      y: 0,
      frames: Array.from({ length: 4 }, (_, col) => extract(layer, row, col)),
    }));
    return {
      id: `${prefix}_attack_${direction}`,
      name: `${name} / attack ${direction}`,
      fps: 12,
      loop: false,
      frames: [...layers[body].frames],
      layers,
    };
  });
  return { sprites, clips };
}
