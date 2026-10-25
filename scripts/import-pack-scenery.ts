import type { Project, SpriteAsset } from '../src/model';
import { readSheet } from './read-sheet';
import { join } from 'node:path';
import type { Sheet } from '../src/tilesets';

/** Offline native-pixel assemblies from 32px source cells; no texture resampling. */
export function replacePackScenery(p: Project, country: string, modern: string) {
  const sheets = new Map<string, Sheet>();
  const source = (root: string, file: string) => {
    const path = join(root, file);
    let s = sheets.get(path);
    if (!s) {
      s = readSheet(path);
      sheets.set(path, s);
    }
    return s;
  };
  const provenance: { asset: string; file: string; rect: number[] }[] = [];
  const crop = (
    id: string,
    name: string,
    root: string,
    file: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): SpriteAsset => {
    const s = source(root, file);
    if (x < 0 || y < 0 || x + width > s.width || y + height > s.height)
      throw new Error('Crop outside ' + file);
    const pixels: number[] = [];
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++) {
        const at = ((y + r) * s.width + x + c) * 4;
        pixels.push(...Array.from({ length: 4 }, (_, k) => s.pixels[at + k]));
      }
    provenance.push({ asset: id, file: join(root, file), rect: [x, y, width, height] });
    return { id, name, width, height, pixels };
  };
  const countryFile = (name: string) => 'Tilesets/Country Woods ACE ' + name;
  const modernFile = (name: string) => 'Tilesets/' + name;
  const blit = (out: SpriteAsset, part: SpriteAsset, x: number, y: number) => {
    for (let py = 0; py < part.height; py++)
      for (let px = 0; px < part.width; px++) {
        if (x + px < 0 || y + py < 0 || x + px >= out.width || y + py >= out.height) continue;
        const from = (py * part.width + px) * 4,
          to = ((y + py) * out.width + x + px) * 4;
        const sa = part.pixels[from + 3] / 255,
          da = out.pixels[to + 3] / 255,
          a = sa + da * (1 - sa);
        if (!sa) continue;
        for (let k = 0; k < 3; k++)
          out.pixels[to + k] = Math.round(
            (part.pixels[from + k] * sa + out.pixels[to + k] * da * (1 - sa)) / a,
          );
        out.pixels[to + 3] = Math.round(a * 255);
      }
  };
  const house = (id: string, red: boolean) => {
    const roof: SpriteAsset = red
      ? crop(id, 'Country Woods · terracotta roof', country, countryFile('4.PNG'), 128, 0, 128, 128)
      : {
          id,
          name: 'Modern+ · slate roof',
          width: 128,
          height: 96,
          pixels: Array(128 * 96 * 4).fill(0),
        };
    if (!red) {
      // This is a modular roof: left slope, repeatable ridge, right slope.
      // Column zero on the sheet is empty; including it shifts the roof off its walls.
      for (const [destination, sourceX] of [
        [0, 32],
        [32, 64],
        [64, 64],
        [96, 96],
      ])
        blit(
          roof,
          crop(
            id,
            'Modern+ · slate roof module',
            modern,
            modernFile('Tile1.png'),
            sourceX,
            0,
            32,
            96,
          ),
          destination,
          0,
        );
    }
    const wall = crop(id, 'Modern+ · brick wall', modern, modernFile('A4.png'), 64, 96, 32, 32);
    const window = crop(
      id,
      'Modern+ · framed window',
      modern,
      modernFile('Tile1.png'),
      256,
      128,
      32,
      32,
    );
    const door = crop(id, 'Modern+ · timber door', modern, 'doors.png', 0, 0, 32, 64);
    const out: SpriteAsset = {
      id,
      name: red ? 'Country Woods + Modern+ · village house' : 'Modern+ · blue-roof workshop',
      width: 128,
      height: roof.height + 64,
      pixels: Array(128 * (roof.height + 64) * 4).fill(0),
    };
    // The pack roof has transparent gable openings. Fill siding beneath its
    // silhouette, preserving the sloped eaves and every original source texel.
    for (let x = 0; x < out.width; x++) {
      let top = 0;
      while (top < roof.height && !roof.pixels[(top * roof.width + x) * 4 + 3]) top++;
      for (let y = top; y < out.height; y++) {
        const from = ((y % 32) * 32 + (x % 32)) * 4,
          to = (y * out.width + x) * 4;
        for (let c = 0; c < 4; c++) out.pixels[to + c] = wall.pixels[from + c];
      }
    }
    blit(out, roof, 0, 0);
    blit(out, window, 8, roof.height + 8);
    blit(out, window, 88, roof.height + 8);
    blit(out, door, 48, roof.height);
    return out;
  };
  const assets: Record<string, SpriteAsset> = {
    cottage: house('pack_cottage', true),
    shed: house('pack_workshop', false),
    oak: crop(
      'pack_oak',
      'Country Woods · broad oak',
      country,
      countryFile('1.PNG'),
      0,
      0,
      128,
      128,
    ),
    fir: crop('pack_fir', 'Modern+ · evergreen', modern, modernFile('Tile4.png'), 192, 448, 64, 64),
    lamp: crop(
      'pack_lamp',
      'Modern+ · globe streetlight',
      modern,
      modernFile('Tile4.png'),
      256,
      384,
      32,
      64,
    ),
    bench: crop(
      'pack_bench',
      'Modern+ · park bench',
      modern,
      modernFile('Tile3.png'),
      384,
      256,
      64,
      64,
    ),
    barrels: crop(
      'pack_barrels',
      'Country Woods · barrel pair',
      country,
      countryFile('4.PNG'),
      256,
      384,
      64,
      64,
    ),
    crates: crop(
      'pack_crates',
      'Country Woods · produce crates',
      country,
      countryFile('1.PNG'),
      256,
      352,
      96,
      32,
    ),
    planter: crop(
      'pack_planter',
      'Modern+ · flower planter',
      modern,
      modernFile('Tile1.png'),
      192,
      96,
      64,
      32,
    ),
    well: crop(
      'pack_vending',
      'Modern+ · drinks machine',
      modern,
      modernFile('Tile3.png'),
      448,
      128,
      32,
      64,
    ),
    sign: crop(
      'pack_sign',
      'Country Woods · ranch sign',
      country,
      countryFile('1.PNG'),
      320,
      0,
      96,
      64,
    ),
    bush: crop(
      'pack_bush',
      'Modern+ · garden shrub',
      modern,
      modernFile('Tile1.png'),
      192,
      32,
      64,
      32,
    ),
    boulder: crop(
      'pack_stump',
      'Country Woods · cut stump',
      country,
      countryFile('1.PNG'),
      0,
      448,
      32,
      32,
    ),
    fountain: crop(
      'pack_pool',
      'Modern+ · garden pool',
      modern,
      modernFile('Tile1.png'),
      320,
      256,
      96,
      96,
    ),
    sacks: crop(
      'pack_hay',
      'Country Woods · hay bundles',
      country,
      countryFile('1.PNG'),
      320,
      256,
      64,
      64,
    ),
    arch: crop(
      'pack_stonework',
      'Country Woods · stone arch',
      country,
      countryFile('4.PNG'),
      256,
      0,
      96,
      128,
    ),
  };
  for (const scene of p.scenes)
    for (const n of scene.nodes) {
      const kind = n.asset.replace(/^village_/, '');
      const asset = assets[kind];
      if (!n.asset.startsWith('village_') || !asset) continue;
      const foot = n.y + n.height,
        center = n.x + n.width / 2;
      n.asset = asset.id;
      n.name = asset.name;
      n.width = asset.width;
      n.height = asset.height;
      n.x = Math.round(center - asset.width / 2);
      n.y = foot - asset.height;
      if (kind === 'sign') n.x -= 256; // Keep the large native ranch sign clear of the NPC patrol.
      delete n.animator;
      if (n.physics) {
        const width = Math.max(10, Math.round(asset.width * 0.55));
        n.physics.box = {
          x: Math.round((asset.width - width) / 2),
          y: asset.height - 12,
          width,
          height: 10,
        };
      }
    }
  p.sprites = p.sprites.filter((s) => !s.id.startsWith('village_'));
  p.sprites.push(...Object.values(assets));
  p.gameplay!.animations = p.gameplay!.animations.filter((c) => c.id !== 'fountain_flow');
  const terrainCrops: Record<string, [string, string, number, number]> = {
    v_bridge: [country, countryFile('2.PNG'), 416, 32],
    v_hedge: [country, countryFile('A2.png'), 448, 288],
    v_stone: [country, countryFile('A5.png'), 64, 96],
    v_wall: [modern, modernFile('A4.png'), 64, 96],
    v_cliff: [country, countryFile('A5.png'), 64, 224],
  };
  for (const tile of p.tilesets![0].tiles) {
    const source = terrainCrops[tile.id];
    if (source)
      tile.pixels = crop(
        tile.id,
        tile.name,
        source[0],
        source[1],
        source[2],
        source[3],
        32,
        32,
      ).pixels;
  }
  return { provenance, sourceFiles: [...sheets.keys()] };
}
