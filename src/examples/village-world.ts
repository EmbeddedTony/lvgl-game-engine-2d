import scenery from './village-art.json' with { type: 'json' };
import { makeNode, type Project, type TilesetTile, type GameNode } from '../model';
import { makePhysics } from '../physics';
/** Offline scenery composition. Tall visuals sort at ground colliders, never full-image tops. */
export function dressVillage(p: Project) {
  const scene = p.scenes[0],
    map = scene.nodes.find((n) => n.id === 'terrain')!.tilemap!;
  p.sprites.push(...scenery);
  const tiles: TilesetTile[] = [];
  const add = (
    id: string,
    pixels: number[],
    solid = false,
    animation?: TilesetTile['animation'],
  ) => {
    tiles.push({
      id,
      name: id.replaceAll('_', ' '),
      pixels,
      solid,
      ...(animation ? { animation } : {}),
    });
    return tiles.length;
  };
  const grass = (x: number, y: number) => {
    const c = [96, 144, 99];
    const tuft = (x * 13 + y * 7) % 97 < 2 && y % 5 < 2;
    return tuft ? [76, 126, 88, 255] : [...c, 255];
  };
  const pixels = (paint: (x: number, y: number) => number[]) =>
    Array.from({ length: 1024 }, (_, i) => paint(i % 32, Math.floor(i / 32))).flat();
  const land = pixels(grass);
  add('v_grass', land);
  add('v_path', pathTile(15));
  add(
    'v_hedge',
    pixels((x, y) => [37 + ((x + y) % 5), 88 + ((x * 3 + y) % 8), 65, 255]),
    true,
  );
  add('v_water', waterTile(15, 0), true, {
    fps: 5,
    frames: ['v_water', 'v_water_f1', 'v_water_f2'],
  });
  add(
    'v_stone',
    pixels((x, y) =>
      x % 16 === 0 || y % 16 === 0
        ? [117, 132, 122, 255]
        : [162 + ((x + y) % 4), 171 + ((x + y) % 4), 152, 255],
    ),
  );
  add(
    'v_wall',
    pixels((x, y) =>
      y < 5
        ? [190, 184, 153, 255]
        : y % 10 === 0 || (x + (y < 16 ? 8 : 0)) % 16 === 0
          ? [76, 93, 87, 255]
          : [119, 131, 115, 255],
    ),
    true,
  );
  add('v_flower', land);
  add(
    'v_cliff',
    pixels((x, y) =>
      y < 4
        ? [134, 165, 108, 255]
        : y < 8
          ? [68, 105, 75, 255]
          : [126 + ((x + y) % 7), 102 + ((x + y) % 7), 76, 255],
    ),
    true,
  );
  add(
    'v_bridge',
    pixels((x, y) =>
      y < 3 || y > 28
        ? [77, 73, 57, 255]
        : x % 8 === 0
          ? [114, 83, 52, 255]
          : x % 8 === 1
            ? [207, 174, 110, 255]
            : [166 + ((x + y) % 5), 131 + ((x + y) % 5), 80, 255],
    ),
  );
  add('v_water_f1', waterTile(15, 1), true);
  add('v_water_f2', waterTile(15, 2), true);
  const paths: number[] = [],
    waters: number[] = [];
  for (let mask = 0; mask < 16; mask++) {
    paths[mask] = mask === 15 ? 2 : add(`v_path_${mask}`, pathTile(mask));
    if (mask === 15) {
      waters[mask] = 4;
      continue;
    }
    const id = `v_shore_${mask}`;
    waters[mask] = add(id, waterTile(mask, 0), true, {
      fps: 5,
      frames: [id, id + '_f1', id + '_f2'],
    });
    add(id + '_f1', waterTile(mask, 1), true);
    add(id + '_f2', waterTile(mask, 2), true);
  }
  const width = map.columns,
    height = map.rows;
  const water = (x: number, y: number) =>
    (x >= 56 && x <= 61 && y > 5 && y < 58 && Math.abs(y - 30) >= 2) ||
    (x - 27) ** 2 + (y - 20) ** 2 < 60;
  const road = (x: number, y: number) =>
    !water(x, y) && (Math.abs(y - 30) < 2 || Math.abs(x - 45) < 2 || (y > 40 && y < 44));
  const mask = (fn: (x: number, y: number) => boolean, x: number, y: number) =>
    (fn(x, y - 1) ? 1 : 0) |
    (fn(x + 1, y) ? 2 : 0) |
    (fn(x, y + 1) ? 4 : 0) |
    (fn(x - 1, y) ? 8 : 0);
  map.cells = Array.from({ length: width * height }, (_, i) => {
    const x = i % width,
      y = Math.floor(i / width);
    if (!x || !y || x === width - 1 || y === height - 1) return 3;
    if (water(x, y)) return waters[mask(water, x, y)];
    if (x >= 56 && x <= 61 && Math.abs(y - 30) < 2) return 9;
    if (road(x, y)) return paths[mask(road, x, y)];
    return 1;
  });
  map.tiles = tiles.map((t) => t.id);
  map.solidTiles = tiles.flatMap((t, i) => (t.solid ? [i + 1] : []));
  map.animations = Object.fromEntries(
    tiles.flatMap((t, i) => (t.animation ? [[i + 1, t.animation]] : [])),
  );
  map.tileset = 'village_ground';
  scene.nodes[0].zIndex = -10;
  p.tilesets = [
    {
      id: 'village_ground',
      name: 'Village · grass, path edges & animated river',
      tileSize: 32,
      columns: 8,
      rows: Math.ceil(tiles.length / 8),
      cells: Array.from({ length: Math.ceil(tiles.length / 8) * 8 }, (_, i) => tiles[i]?.id ?? ''),
      tiles,
    },
  ];
  scene.nodes.push(
    makeNode('group', {
      id: 'village',
      name: 'Village scenery · ground footprints',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    }),
  );
  const prop = (kind: string, x: number, y: number, index: number) => {
    const asset = scenery.find((a) => a.id === 'village_' + kind)!;
    const w = asset.width * 2,
      h = asset.height * 2;
    const narrow = kind === 'lamp' || kind === 'sign',
      boxWidth = narrow ? 12 : Math.round(w * 0.55);
    scene.nodes.push(
      makeNode('sprite', {
        id: `prop_${kind}_${index}`,
        name: asset.name,
        parent: 'village',
        asset: asset.id,
        x,
        y,
        width: w,
        height: h,
        sortY: true,
        physics: {
          ...makePhysics('static'),
          layer: 1,
          box: { x: Math.round((w - boxWidth) / 2), y: h - 18, width: boxWidth, height: 12 },
        },
      }),
    );
  };
  const placements: [string, number, number][] = [
    ['cottage', 1216, 736],
    ['shed', 1528, 764],
    ['well', 1288, 1032],
    ['bench', 1488, 1040],
    ['lamp', 1344, 752],
    ['lamp', 1632, 880],
    ['planter', 1216, 848],
    ['planter', 1544, 848],
    ['barrels', 1616, 1056],
    ['crates', 1688, 1024],
    ['sacks', 1176, 1040],
    ['sign', 1476, 960],
    ['oak', 1104, 744],
    ['oak', 1184, 1080],
    ['fir', 1712, 704],
    ['fir', 1696, 1120],
    ['boulder', 1144, 944],
    ['fountain', 1350, 1104],
    ['arch', 2128, 800],
    ['cottage', 2200, 736],
    ['bench', 2112, 1060],
    ['lamp', 2048, 824],
    ['planter', 2320, 856],
    ['barrels', 2352, 1048],
    ['oak', 1936, 1104],
    ['fir', 2304, 1104],
    ['well', 2416, 1008],
    ['shed', 2528, 768],
    ['boulder', 2000, 688],
    ['cottage', 512, 744],
    ['lamp', 768, 816],
    ['bench', 848, 1040],
    ['planter', 672, 872],
    ['well', 624, 1104],
    ['oak', 416, 1056],
    ['fir', 992, 1072],
  ];
  placements.forEach(([kind, x, y], i) => prop(kind, x, y, i));
  for (let i = 0; i < 22; i++) {
    const x = 256 + ((i * 173) % 2528),
      y = i % 2 ? 1280 + ((i * 41) % 480) : 256 + ((i * 37) % 384);
    prop(i % 3 ? 'oak' : 'fir', x, y, 100 + i);
  }
  for (const n of scene.nodes)
    if (n.id.startsWith('bush_')) {
      n.asset = 'village_bush';
      n.width = n.height = 48;
    }
  // A small water sparkle cycle is baked into the fountain's image, not a particle system.
  const fountain = p.sprites.find((a) => a.id === 'village_fountain')!;
  for (let phase = 1; phase < 3; phase++)
    p.sprites.push({
      ...fountain,
      id: `village_fountain_${phase}`,
      pixels: fountain.pixels.map((v, i) => {
        const base = i - (i % 4),
          r = fountain.pixels[base],
          g = fountain.pixels[base + 1],
          b = fountain.pixels[base + 2];
        return i % 4 < 3 && b > r * 1.25 && g > r * 1.1
          ? Math.max(0, Math.min(255, v + (phase === 1 ? 12 : -8)))
          : v;
      }),
    });
  p.gameplay!.animations.push({
    id: 'fountain_flow',
    name: 'Fountain · flowing water',
    fps: 5,
    loop: true,
    frames: ['village_fountain', 'village_fountain_1', 'village_fountain_2'],
  });
  for (const n of scene.nodes)
    if (n.asset === 'village_fountain')
      n.animator = { idle: 'fountain_flow', move: '', jump: '', fall: '' };
  scene.name = 'Willowlight · riverside village';
  scene.objective = 'Explore the village, find Mira, and cross the eastern bridge.';
  const title = scene.nodes.find((n) => n.id === 'title');
  if (title) title.text = 'WILLOWLIGHT / RIVERSIDE VILLAGE';
  function pathTile(mask: number) {
    return pixels((x, y) => {
      const edge =
        (!(mask & 1) && y < 3 + ((x * 3) % 5 === 0 ? 1 : 0)) ||
        (!(mask & 2) && x > 28) ||
        (!(mask & 4) && y > 28) ||
        (!(mask & 8) && x < 3);
      if (edge) return grass(x, y);
      if ((!(mask & 1) && y === 4) || (!(mask & 8) && x === 4)) return [196, 177, 119, 255];
      return (x * 17 + y * 7) % 127 < 2 ? [184, 160, 108, 255] : [210, 188, 132, 255];
    });
  }
  function waterTile(mask: number, phase: number) {
    return pixels((x, y) => {
      const distance = Math.min(
        !(mask & 1) ? y : 32,
        !(mask & 2) ? 31 - x : 32,
        !(mask & 4) ? 31 - y : 32,
        !(mask & 8) ? x : 32,
      );
      if (distance < 3) return grass(x, y);
      if (distance < 5) return [113, 157, 111, 255];
      if (distance < 7) return [181, 199, 151, 255];
      if (distance < 9) return [99, 176, 168, 255];
      const ripple = (x + phase * 5 + Math.floor(y / 8) * 9) % 25 < 9 && (y + phase * 3) % 14 === 2;
      return ripple ? [119, 194, 188, 255] : [61, 143 + ((x + y) % 3), 156, 255];
    });
  }
}
