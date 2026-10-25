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
/** A complete three-screen course, with no demo-specific runtime path. */
export function createSideScrollerDemo() {
  const p = exampleProject('amber_trail', 'Amber Trail - Side Scroller'),
    columns = 48,
    rows = 11,
    cells = Array(columns * rows).fill(0);
  for (let col = 0; col < columns; col++) cells[10 * columns + col] = 8;
  for (const [row, start, end] of [
    [7, 9, 13],
    [8, 22, 27],
    [6, 34, 38],
    [8, 31, 34],
  ])
    for (let col = start; col < end; col++) cells[row * columns + col] = 9;
  // A low step teaches jumping without lethal pits or a preview-only reset rule.
  cells[9 * columns + 18] = 8;
  cells[9 * columns + 19] = 8;
  const instructions = 'A/D move. Space or Up jumps.\nCollect all six amber sparks.';
  const level: Scene = {
    id: 'trail',
    name: 'Amber Trail',
    folder: 'levels',
    background: '#789ca3',
    music: '',
    objective: instructions,
    completion: 'All sparks found! Nice jumping.\nThe courier route is complete.',
    camera2d: { worldWidth: 768, worldHeight: 240, follow: 'player', axis: 'x' },
    nodes: [
      ...[48, 248, 468, 664].map((x, i) =>
        makeNode('sprite', {
          id: `cloud_${i}`,
          name: 'Cloud',
          asset: 'cloud',
          x,
          y: 40 + (i % 2) * 12,
          width: 16,
          height: 16,
        }),
      ),
      terrain(p, columns, rows, cells),
      makeNode('sprite', {
        id: 'player',
        name: 'Courier player',
        asset: 'courier',
        x: 32,
        y: 144,
        width: 16,
        height: 16,
        player: true,
        speed: 96,
        physics: {
          ...makePhysics('character'),
          motion: 'platformer',
          gravity: 800,
          jumpSpeed: 285,
          box: { x: 3, y: 2, width: 10, height: 14 },
          mask: 1,
        },
      }),
      ...[
        [80, 144],
        [176, 96],
        [256, 144],
        [384, 112],
        [576, 80],
        [720, 144],
      ].map(([x, y], i) => pickup(`spark_${i + 1}`, x, y)),
      makeNode('sprite', {
        id: 'finish_marker',
        name: 'Finish marker',
        asset: 'banner',
        x: 744,
        y: 144,
        width: 16,
        height: 16,
      }),
      ...hud('AMBER TRAIL', 'SPARKS'),
      ...textbox('PIP - Trail courier', instructions),
    ],
  };
  journey(p, [
    level,
    results(
      'DELIVERY COMPLETE',
      'PIP - Trail courier',
      'Every spark made it home.\nPlay again to try a faster run.',
    ),
  ]);
  p.code = exampleHooks;
  return p;
}
