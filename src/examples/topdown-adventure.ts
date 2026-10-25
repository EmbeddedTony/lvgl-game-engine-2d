import { makeNode, type Scene } from '../model';
import { makePhysics } from '../physics';
import {
  exampleProject,
  terrain,
  textbox,
  hud,
  pickup,
  results,
  journey,
  exampleHooks,
} from './common';
function roomCells(shrine: boolean) {
  const cells: number[] = Array.from({ length: 20 * 11 }, (_, i) => {
    const x = i % 20,
      y = Math.floor(i / 20);
    return x === 0 || x === 19 || y < 2 || y === 10 ? (shrine ? 6 : 3) : shrine ? 5 : 1;
  });
  if (!shrine) {
    for (let y = 2; y < 10; y++)
      for (let x = 2; x < 18; x++) if (x === 3 || y === 8 || x === 16) cells[y * 20 + x] = 2;
    for (let y = 4; y <= 6; y++) for (let x = 7; x <= 10; x++) cells[y * 20 + x] = 4;
    for (const [x, y] of [
      [5, 3],
      [5, 4],
      [12, 2],
      [13, 2],
      [14, 6],
    ])
      cells[y * 20 + x] = 3;
  } else {
    for (const [x, y] of [
      [5, 3],
      [6, 3],
      [7, 3],
      [12, 3],
      [13, 3],
      [14, 3],
      [5, 7],
      [6, 7],
      [12, 7],
      [13, 7],
    ])
      cells[y * 20 + x] = 6;
    for (let y = 2; y <= 8; y++) cells[y * 20 + 10] = 6;
    cells[5 * 20 + 10] = 5; // A deliberate central doorway connects both halves.
  }
  return cells;
}
function room(p: ReturnType<typeof exampleProject>, shrine: boolean): Scene {
  const instructions = shrine
    ? 'Three relics restore the shrine.\nSearch both sides of the hall.'
    : 'Find three stones in the grove.\nThe old shrine is our next stop.';
  return {
    id: shrine ? 'shrine' : 'grove',
    name: shrine ? 'The Sunstone Shrine' : 'Willowlight Grove',
    folder: 'levels',
    background: '#547f51',
    music: '',
    objective: instructions,
    completion: 'The path ahead is open.\nYour next chapter awaits.',
    nodes: [
      terrain(p, 20, 11, roomCells(shrine)),
      ...(!shrine
        ? [
            [80, 112],
            [192, 112],
            [240, 80],
          ].map(([x, y], i) =>
            makeNode('sprite', {
              id: `flowers_${i}`,
              name: 'Wildflowers',
              asset: 'flower',
              x,
              y,
              width: 16,
              height: 16,
            }),
          )
        : []),
      makeNode('sprite', {
        id: 'guide',
        name: 'Mira the scout',
        asset: 'guide',
        x: 256,
        y: 32,
        width: 16,
        height: 16,
      }),
      makeNode('sprite', {
        id: 'player',
        name: 'Traveller player',
        asset: 'hero',
        x: 32,
        y: 128,
        width: 16,
        height: 16,
        player: true,
        speed: 72,
        physics: {
          ...makePhysics('character'),
          box: { x: 3, y: 9, width: 10, height: 7 },
          mask: 1,
        },
      }),
      ...(shrine
        ? [
            [64, 64],
            [224, 64],
            [272, 128],
          ]
        : [
            [96, 128],
            [208, 48],
            [272, 128],
          ]
      ).map(([x, y], i) => pickup(`spark_${i + 1}`, x, y, shrine)),
      ...hud(shrine ? 'SUNSTONE SHRINE' : 'WILLOWLIGHT', 'STONES'),
      ...textbox('MIRA - Village scout', instructions),
    ],
  };
}
/** Original handheld-style room exploration; no copyrighted game art or maps. */
export function createAdventureDemo() {
  const p = exampleProject('willowlight_adventure', 'Willowlight - Top-down Adventure');
  journey(p, [
    room(p, false),
    room(p, true),
    results(
      'THE GROVE IS RESTORED',
      'MIRA - Village scout',
      'The sunstones shine once more.\nThank you, traveller!',
    ),
  ]);
  p.code = exampleHooks;
  return p;
}
