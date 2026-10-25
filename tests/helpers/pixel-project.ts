import { createStarter } from '../../src/assets';
import { makeNode } from '../../src/model';

export const pixelColors = [
  [255, 0, 0, 255],
  [0, 255, 0, 255],
  [0, 0, 255, 255],
  [255, 255, 255, 255],
];
export function pixelProject() {
  const p = createStarter();
  delete p.flow;
  p.id = 'pixel_test';
  p.name = 'Pixel art test';
  p.pixelPerfect = true;
  p.audio = [];
  p.sprites = [
    {
      id: 'checker',
      name: 'Pixel checker',
      width: 8,
      height: 8,
      pixels: Array.from(
        { length: 64 },
        (_, i) => pixelColors[(i % 2) + (Math.floor(i / 8) % 2) * 2],
      ).flat(),
    },
  ];
  p.scenes = [
    {
      ...p.scenes[0],
      background: '#000000',
      nodes: [
        makeNode('group', { id: 'origin', x: 12.25, y: 12.25, width: 1, height: 1 }),
        makeNode('sprite', {
          id: 'art',
          name: 'Pixel checker',
          parent: 'origin',
          x: 3.25,
          y: 3.25,
          width: 16,
          height: 16,
          asset: 'checker',
        }),
        makeNode('tilemap', {
          id: 'pixels_map',
          x: 48.5,
          y: 32.5,
          width: 16,
          height: 8,
          tilemap: {
            tileSize: 8,
            columns: 2,
            rows: 1,
            cells: [1, 1],
            tiles: ['checker'],
            solidTiles: [],
          },
        }),
      ],
    },
  ];
  return p;
}
