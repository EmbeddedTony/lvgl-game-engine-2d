import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createStarter } from '../src/assets';
import { parseProject } from '../src/model';
import { generate } from '../src/exporter';
import { commands } from '../src/automation/manifest';

test('public edition exports only the 2D runtime and carries its license', async () => {
  const runtime = Object.fromEntries(
    await Promise.all(
      (await readdir('engine')).map(async (name) => [
        name,
        await readFile(`engine/${name}`, 'utf8'),
      ]),
    ),
  );
  const { files } = generate(createStarter(), runtime);
  assert.equal(files['ui/LICENSE.md'], await readFile('LICENSE.md', 'utf8'));
  assert.ok(files['ui/engine/lge_physics.c']);
  assert.match(String(files['ui/CMakeLists.txt']), /add_library\(lvgl_game_ui STATIC/);
  for (const [name, value] of Object.entries(files)) {
    if (!/\.(c|h|txt)$/.test(name)) continue;
    assert.doesNotMatch(name, /lge_3d|three-manifest/);
    assert.doesNotMatch(String(value), /lge_3d_|ui_3d_|world3d|LGE_ENABLE_3D/);
  }
});

test('public edition rejects incompatible dimensions and scene data without silent conversion', () => {
  const p = createStarter();
  assert.throws(() => parseProject(JSON.stringify({ ...p, dimension: '3d' })));
  const serialized = JSON.parse(JSON.stringify(p));
  serialized.scenes[0].world3d = {};
  assert.throws(() => parseProject(JSON.stringify(serialized)), /2D scenes only/);
});

test('public authoring commands omit orbit and depth-buffer controls', () => {
  assert.doesNotMatch(JSON.stringify(commands), /board\.camera|internal3dDepth/);
});
