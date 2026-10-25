import { makeNode, type GameNode, type Project, type Scene } from '../../model';
import { makePhysics } from '../../physics';
import { chapters } from './story';
export const WORLD_WIDTH = 2048,
  WORLD_HEIGHT = 1280;
export const SPAWN = { x: 248, y: 546 };
export type Cast = Record<string, GameNode>;
export function atFeet(n: GameNode, x: number, y: number) {
  const box = n.physics?.box ?? { x: 0, y: 0, width: n.width, height: n.height };
  n.x = x - box.x - box.width / 2;
  n.y = y - box.y - box.height;
  return n;
}
export function actor(cast: Cast, skin: string, id: string, name: string, x: number, y: number) {
  const n = structuredClone(cast[skin]);
  n.id = id;
  n.name = name;
  n.player = false;
  n.parent = undefined;
  n.events = [];
  n.melee = undefined;
  n.emitter = undefined;
  n.physics!.velocityX = 0;
  n.physics!.velocityY = 0;
  n.physics!.motion = 'code';
  return atFeet(n, x, y);
}
export function prop(p: Project, id: string, asset: string, x: number, y: number, solid = true) {
  const image = p.sprites.find((s) => s.id === asset);
  if (!image) throw new Error('Missing native pack object: ' + asset);
  return makeNode('sprite', {
    id,
    name: image.name,
    asset,
    x,
    y,
    width: image.width,
    height: image.height,
    sortY: true,
    ...(solid
      ? {
          physics: {
            ...makePhysics('static'),
            box: {
              x: Math.round(image.width * 0.25),
              y: image.height - 14,
              width: Math.round(image.width * 0.5),
              height: 12,
            },
          },
        }
      : {}),
  });
}
export function marker(id: string, text: string, x: number, y: number, width = 280) {
  return makeNode('label', {
    id,
    name: text,
    text,
    layer: 'world',
    x,
    y,
    width,
    height: 24,
    color: '#f6e4b7',
    zIndex: 2,
  });
}
/** Terrain is assembled from original pack texels. No image filtering or generated art. */
export function terrain(p: Project, chapter: number, part: number) {
  const source = p.scenes[0].nodes.find((n) => n.tilemap)!.tilemap!;
  const map = structuredClone(source);
  map.columns = 64;
  map.rows = 40;
  const tile = (id: string) => {
    const v = map.tiles.indexOf(id) + 1;
    if (!v) throw new Error('Missing terrain: ' + id);
    return v;
  };
  const indoor =
    ((chapter === 1 || chapter === 4) && part >= 1) ||
    (chapter === 2 && part === 1) ||
    (chapter === 5 && part === 2);
  const water = (x: number, y: number) => {
    if (indoor) return part === 3 && (x < 6 || x > 57) && y > 3 && y < 36;
    if (chapter === 3)
      return (
        (x > 54 && y > 2 && y < 37) || (part === 3 && x > 25 && x < 30 && Math.abs(y - 20) > 3)
      );
    if (part === 2) return x > 34 && x < 40 && y > 4 && y < 36 && Math.abs(y - 20) > 2;
    if (part === 3) return ((y > 5 && y < 10) || (y > 30 && y < 35)) && x > 12 && x < 55;
    if (chapter === 2)
      return (x - 31) ** 2 + (y - 10) ** 2 < 35 || (x - 49) ** 2 + (y - 30) ** 2 < 24;
    if (chapter === 5) return (x < 8 && y > 6) || (x > 58 && y < 34);
    return (
      (x > 23 + part * 4 && x < 34 + part * 3 && y > 5 && y < 13) ||
      (x > 35 && x < 54 && y > 29 && y < 34)
    );
  };
  const road = (x: number, y: number) =>
    !water(x, y) &&
    (Math.abs(y - 20) <= 1 ||
      Math.abs(x - 14) <= 1 ||
      Math.abs(x - 49) <= 1 ||
      (y > 28 && y < 31) ||
      (y > 9 && y < 12 && x > 11 && x < 51));
  const mask = (fn: (x: number, y: number) => boolean, x: number, y: number) =>
    (fn(x, y - 1) ? 1 : 0) |
    (fn(x + 1, y) ? 2 : 0) |
    (fn(x, y + 1) ? 4 : 0) |
    (fn(x - 1, y) ? 8 : 0);
  map.cells = Array.from({ length: map.columns * map.rows }, (_, i) => {
    const x = i % map.columns,
      y = Math.floor(i / map.columns);
    if (x === 0 || y === 0 || x === 63 || y === 39) return tile('camp_wall');
    if (water(x, y)) {
      const m = mask(water, x, y);
      return tile(m === 15 ? 'v_water' : `v_shore_${m}`);
    }
    if (indoor)
      return tile(
        chapter === 2 ? 'camp_boardwalk' : (x + y) % 9 === 0 ? 'camp_floor_alt' : 'camp_floor',
      );
    if (
      ((chapter === 1 && part === 0) || chapter === 4 || chapter === 5) &&
      x > 18 &&
      x < 53 &&
      y > 15 &&
      y < 26
    )
      return tile('camp_floor');
    if (road(x, y)) {
      const m = mask(road, x, y);
      return tile(m === 15 ? 'v_path' : `v_path_${m}`);
    }
    return tile('v_grass');
  });
  return makeNode('tilemap', {
    id: 'terrain',
    name: 'Native 32px terrain · animated water',
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    x: 0,
    y: 0,
    zIndex: -10,
    tilemap: map,
  });
}
export function makeArea(p: Project, cast: Cast, index: number): Scene {
  const ci = Math.floor(index / 4),
    part = index % 4,
    chapter = chapters[ci];
  const nodes: GameNode[] = [terrain(p, ci, part)];
  const add = (asset: string, x: number, y: number, solid = true) =>
    nodes.push(prop(p, `set_${nodes.length}`, asset, x, y, solid));
  // Foreground canopies, ground footprints and eye-level props give the scene depth.
  // All navigation routes are at least 96px wide around the 28px player footprint.
  for (let j = 0; j < 10; j++) {
    add(ci === 2 || ci === 5 ? 'pack_fir' : 'pack_oak', 96 + j * 192, 64 + (j % 2) * 32);
    add(j % 2 ? 'pack_fir' : 'pack_oak', 80 + j * 192, 1088 + (j % 2) * 32);
  }
  if (part === 0 || part === 1) {
    for (const [x, y, red] of [
      [288, 416, 1],
      [1088, 416, 0],
      [1312, 736, 1],
      [608, 768, 0],
    ]) {
      add(red ? 'pack_cottage' : 'pack_workshop', x, y);
      add('pack_planter', x + 16, y + (red ? 196 : 164));
      add('pack_lamp', x - 48, y + 108);
    }
  } else {
    for (const [x, y] of [
      [320, 280],
      [736, 288],
      [1152, 256],
      [1552, 256],
    ])
      add('pack_stonework', x, y);
    add('pack_pool', 912, 848);
    add('pack_bench', 736, 864);
  }
  for (let j = 0; j < 6; j++) {
    add(
      j % 3 === 0 ? 'pack_barrels' : j % 3 === 1 ? 'pack_crates' : 'pack_bush',
      224 + j * 256,
      968,
    );
    add('pack_lamp', 256 + j * 288, 500);
  }
  add('pack_bench', 600, 500);
  add('pack_hay', 128, 864);
  add('pack_planter', 1696, 900);
  if (ci === 0) {
    add('pack_cart', 928, 864);
    add('pack_tractor', 1600, 352);
    for (let j = 0; j < 5; j++) add('pack_corn', 704 + j * 64, 192, false);
  } else if (ci === 1) {
    add('pack_awning', 1280, 448);
    add('pack_terminal', 960, 480);
    add('pack_station_bench', 1408, 480);
  } else if (ci === 2) {
    for (let j = 0; j < 4; j++) add('pack_planter', 672 + j * 160, 832);
    add('pack_tall_oak', 1472, 96);
    add('pack_logs', 256, 896);
  } else if (ci === 3) {
    add('pack_terminal', 1344, 384);
    add('pack_terminal', 1728, 832);
    add('pack_awning', 832, 736);
    add('pack_barrels', 928, 768);
  } else if (ci === 4) {
    for (let j = 0; j < 4; j++) {
      add('pack_station_bench', 704 + j * 192, 832);
      add('pack_terminal', 704 + j * 192, 400);
    }
  } else {
    add('pack_tall_oak', 384, 96);
    add('pack_logs', 1344, 896);
    add('pack_stonework', 1728, 352);
    add('pack_planter', 960, 864);
  }
  const player = structuredClone(cast.hero);
  player.id = 'player';
  player.parent = undefined;
  player.x = SPAWN.x;
  player.y = SPAWN.y;
  player.events = [{ id: 'hurt', trigger: 'hit', script: 'player_hurt' }];
  nodes.push(player);
  nodes.push(
    actor(cast, ci >= 3 ? 'ada' : 'mira', 'companion', ci >= 3 ? 'Ada' : 'Mira', 520, 640),
  );
  const baseUi = p.scenes[0].nodes.filter((n) => n.layer === 'ui' && n.inputAction);
  nodes.push(...structuredClone(baseUi));
  nodes.push(
    makeNode('rect', {
      id: 'hud',
      layer: 'ui',
      x: 0,
      y: 0,
      width: 800,
      height: 64,
      color: '#162432',
    }),
  );
  nodes.push(
    makeNode('label', {
      id: 'area_title',
      x: 12,
      y: 6,
      width: 560,
      height: 20,
      color: '#eac887',
      text: chapter.places[part],
    }),
  );
  nodes.push(
    makeNode('label', {
      id: 'health_title',
      x: 12,
      y: 34,
      width: 60,
      height: 20,
      color: '#f3d0b4',
      text: 'HEALTH',
    }),
  );
  for (let j = 0; j < 8; j++)
    nodes.push(
      makeNode('rect', {
        id: `heart_${j}`,
        layer: 'ui',
        x: 82 + j * 15,
        y: 38,
        width: 11,
        height: 12,
        color: '#e59787',
        radius: 2,
      }),
    );
  nodes.push(
    makeNode('label', {
      id: 'hurt_hint',
      x: 210,
      y: 34,
      width: 160,
      height: 20,
      text: 'Hit! Find a gap.',
      color: '#e59787',
      visible: false,
    }),
  );
  nodes.push(
    makeNode('button', {
      id: 'journal',
      x: 448,
      y: 26,
      width: 100,
      height: 32,
      text: 'JOURNAL',
      color: '#29434b',
      events: [{ id: 'open', trigger: 'click', script: 'journal' }],
    }),
  );
  nodes.push(
    makeNode('button', {
      id: 'tonic',
      x: 554,
      y: 26,
      width: 100,
      height: 32,
      text: 'TONIC',
      color: '#29434b',
      events: [{ id: 'drink', trigger: 'click', script: 'drink_tonic' }],
    }),
  );
  nodes.push(
    makeNode('button', {
      id: 'home',
      x: 660,
      y: 26,
      width: 128,
      height: 32,
      text: 'SAFE RETURN',
      color: '#29434b',
      events: [{ id: 'home', trigger: 'click', script: `home_${ci}` }],
    }),
  );
  return {
    id: `area_${index}`,
    name: chapter.places[part],
    folder: chapter.id,
    background: '#558b50',
    objective: chapter.objective,
    completion: '',
    music: '',
    nodes,
    touchControls: true,
    camera2d: {
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      follow: 'player',
      axis: 'both',
    },
  };
}
/** Keep interaction footprints and their approach lanes traversable when dressing a room.
 * Water crossings become native boardwalk cells; distant canopies keep their full pixels. */
export function connectInteractions(scene: Scene) {
  const map = scene.nodes.find((n) => n.tilemap)?.tilemap;
  if (!map) return;
  const ground = map.tiles.indexOf('camp_boardwalk') + 1;
  for (let row = 19; row <= 21; row++)
    for (let col = 1; col < map.columns - 1; col++)
      if (map.solidTiles.includes(map.cells[row * map.columns + col]))
        map.cells[row * map.columns + col] = ground;
  const lanes: {
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];
  for (const n of scene.nodes.filter(
    (n) => n.layer === 'world' && n.events?.some((e) => e.trigger === 'interact'),
  )) {
    const x = Math.round((n.x + n.width / 2) / 32),
      y = Math.round((n.y + n.height / 2 + 30) / 32);
    const y0 = Math.min(20, y) - 1,
      y1 = Math.max(20, y) + 1;
    lanes.push({ x: (x - 1) * 32, y: y0 * 32, width: 96, height: (y1 - y0 + 1) * 32 });
    for (let row = Math.max(1, y0); row <= Math.min(38, y1); row++)
      for (let col = Math.max(1, x - 1); col <= Math.min(62, x + 1); col++)
        if (map.solidTiles.includes(map.cells[row * map.columns + col]))
          map.cells[row * map.columns + col] = ground;
  }
  scene.nodes = scene.nodes.filter((n) => {
    if (!n.id.startsWith('set_') || !n.physics) return true;
    const b = n.physics.box!;
    return !lanes.some(
      (l) =>
        n.x + b.x < l.x + l.width &&
        n.x + b.x + b.width > l.x &&
        n.y + b.y < l.y + l.height &&
        n.y + b.y + b.height > l.y,
    );
  });
}
