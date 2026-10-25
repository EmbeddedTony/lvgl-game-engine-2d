import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject } from '../src/project-file';
import { createGameplayDemo } from '../src/gameplay/demo';
import { parseProject } from '../src/model';

test('a large valid layered-art document remains reopenable after saving', () => {
  const p = createGameplayDemo();
  for (let i = 0; i < 3; i++)
    p.sprites.push({
      id: `large_${i}`,
      name: 'Large imported art',
      width: 512,
      height: 512,
      pixels: new Array(512 * 512 * 4).fill(255),
    });
  assert.ok(
    Buffer.byteLength(JSON.stringify(p, null, 2)) > 24 * 1024 * 1024,
    'fixture catches the indentation expansion bug',
  );
  const saved = serializeProject(p);
  assert.ok(Buffer.byteLength(saved) < 24 * 1024 * 1024);
  const restored = parseProject(saved);
  assert.equal(restored.sprites.length, p.sprites.length);
  assert.deepEqual(restored.sprites.at(-1)!.pixels, p.sprites.at(-1)!.pixels);
});
