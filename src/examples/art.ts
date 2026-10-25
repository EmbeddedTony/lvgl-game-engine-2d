import type { SpriteAsset, TilesetAsset } from '../model';
const colors: Record<string, number[]> = {
  '.': [0, 0, 0, 0],
  k: [35, 42, 57, 255],
  s: [226, 164, 114, 255],
  h: [103, 65, 57, 255],
  t: [62, 137, 151, 255],
  u: [111, 204, 192, 255],
  w: [248, 232, 181, 255],
  a: [241, 180, 81, 255],
  r: [195, 97, 78, 255],
  v: [124, 104, 159, 255],
  b: [67, 86, 115, 255],
  g: [80, 117, 76, 255],
};
/** Original, deterministic 16px art; source pixels remain editable in the asset bank. */
function sprite(id: string, name: string, rows: string[]): SpriteAsset {
  return {
    id,
    name,
    width: 16,
    height: 16,
    pixels: rows.flatMap((row) => [...row.padEnd(16, '.')].flatMap((c) => colors[c])),
  };
}
export function exampleSprites(): SpriteAsset[] {
  return [
    sprite('hero', 'Teal traveller', [
      '................',
      '......hhhh......',
      '.....hhhhhkh....',
      '.....hssssh.....',
      '.....sskssk.....',
      '......ssss......',
      '.....ttwwtt.....',
      '....tttwwttt....',
      '....stttttts....',
      '....sttuutts....',
      '.....tuuuut.....',
      '.....tuuuut.....',
      '.....kk..kk.....',
      '.....bb..bb.....',
      '....bbb..bbb....',
      '................',
    ]),
    sprite('courier', 'Scarf courier', [
      '................',
      '.....kkkkkk.....',
      '.....kaaaak.....',
      '.....kssss......',
      '.....sskssk.....',
      '......ssss......',
      '.....rrrrrrr....',
      '....tttrrtrrr...',
      '....stttttts....',
      '....sttuuuts....',
      '.....ttuuut.....',
      '.....tttttt.....',
      '.....kk..kk.....',
      '.....bb..bb.....',
      '....bbb..bbb....',
      '................',
    ]),
    sprite('guide', 'Mira the scout', [
      '......vvvv......',
      '.....vvvvvv.....',
      '....vvwwwwvv....',
      '.....wssssw.....',
      '.....sskssk.....',
      '......ssss......',
      '.....vvwwvv.....',
      '....vvvwwvvv....',
      '....svvvvvvs....',
      '....svvvvvvs....',
      '.....vvvvvv.....',
      '.....vvvvvv.....',
      '.....kk..kk.....',
      '.....hh..hh.....',
      '....hhh..hhh....',
      '................',
    ]),
    sprite('spark', 'Amber spark', [
      '................',
      '.......aa.......',
      '......awwa......',
      '.....awwwwa.....',
      '....aawwwwaa....',
      '....aawwwwaa....',
      '...aaawwwwaaa...',
      '....aaawwaaa....',
      '.....aaaaaa.....',
      '......aaaa......',
      '.......aa.......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ]),
    sprite('relic', 'Sunstone relic', [
      '................',
      '......kkkk......',
      '.....kawwak.....',
      '....kawwwwak....',
      '....kawwwwak....',
      '.....kawwak.....',
      '......kaak......',
      '......kaak......',
      '......kaaaa.....',
      '......kaakk.....',
      '......kaaaa.....',
      '......kkkkk.....',
      '................',
      '................',
      '................',
      '................',
    ]),
    sprite('banner', 'Trail marker', [
      '...hh...........',
      '...hhaaaaaaa....',
      '...hhawwwaaa....',
      '...hhaaaaaa.....',
      '...hhaaaaaaa....',
      '...hh...........',
      '...hh...........',
      '...hh...........',
      '...hh...........',
      '...hh...........',
      '...hh...........',
      '...hh...........',
      '...hh...........',
      '..hhhh..........',
      '.hhhhhh.........',
      '................',
    ]),
    sprite('flower', 'White wildflowers', [
      '................',
      '................',
      '...w.........w..',
      '..waw.......waw.',
      '...w.........w..',
      '...g.........g..',
      '..ggg.......ggg.',
      '...g.........g..',
      '................',
      '........w.......',
      '.......waw......',
      '........w.......',
      '........g.......',
      '.......ggg......',
      '........g.......',
      '................',
    ]),
    sprite('cloud', 'Soft cloud', [
      '................',
      '................',
      '......wwww......',
      '.....wwwwww.....',
      '..wwwwwwwwwww...',
      '.wwwwwwwwwwwwww.',
      '.wwwwwwwwwwwwww.',
      '..wwwwwwwwwwww..',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ]),
  ];
}
export function exampleTiles(): TilesetAsset {
  const names = [
    'Meadow',
    'Sand path',
    'Hedge',
    'Water',
    'Shrine floor',
    'Shrine wall',
    'Earth',
    'Grass ledge',
    'Timber',
  ];
  const tiles = names.map((name, kind) => {
    const pixels: number[] = [];
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const noise = (x * 11 + y * 7) % 19;
        let rgb: number[];
        switch (kind) {
          case 0:
            rgb = noise === 0 ? [103, 155, 91] : noise === 1 ? [70, 120, 75] : [85, 139, 80];
            break;
          case 1:
            rgb = noise < 2 ? [197, 170, 111] : [215, 191, 136];
            break;
          case 2:
            rgb =
              (x + y) % 7 < 2
                ? [62, 110, 65]
                : y < 3
                  ? [113, 158, 79]
                  : [44 + noise, 89 + noise, 59];
            break;
          case 3:
            rgb = (y === 4 || y === 11) && x % 8 < 5 ? [103, 188, 195] : [55, 122 + noise, 157];
            break;
          case 4:
            rgb =
              x === 0 || y === 0 ? [106, 119, 124] : noise < 2 ? [155, 163, 152] : [139, 150, 143];
            break;
          case 5:
            rgb =
              y % 8 === 0 || (x + (y < 8 ? 0 : 8)) % 16 === 0
                ? [55, 66, 84]
                : [83 + noise, 94 + noise, 111 + noise];
            break;
          case 6:
            rgb = noise < 3 ? [134, 89, 63] : [100 + noise, 71 + noise, 58];
            break;
          case 7:
            rgb = y < 3 ? [149, 184, 100] : y < 6 ? [87, 134, 72] : [104 + noise, 73 + noise, 56];
            break;
          default:
            rgb =
              y % 8 === 0
                ? [99, 64, 48]
                : x === 2 || x === 13
                  ? [220, 179, 115]
                  : [166 + noise, 117 + noise, 75];
        }
        pixels.push(...rgb, 255);
      }
    return { id: `terrain_${kind}`, name, pixels, solid: [2, 3, 5, 6, 7, 8].includes(kind) };
  });
  return {
    id: 'example_terrain',
    name: 'Willowlight pixel terrain',
    tileSize: 16,
    columns: 3,
    rows: 3,
    cells: tiles.map((t) => t.id),
    tiles,
  };
}
