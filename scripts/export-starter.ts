import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createFlowDemo } from '../src/flow-demo';
import { generate } from '../src/exporter';
import { parseProject } from '../src/model';
const out = resolve(process.argv[2] ?? '.cache/generated');
const runtime = Object.fromEntries(
  await Promise.all(
    [
      'lge_inputs.h',
      'lge_inputs.c',
      'lge_input_codec.h',
      'lge_input_codec.c',
      'lge.h',
      'lge.c',
      'lge_physics.c',
      'lge_melee.h',
      'lge_melee.c',
      'lge_gameplay.h',
      'lge_gameplay.c',
      'lge_rpg.h',
      'lge_rpg.c',
      'lge_rpg_ui.c',
      'lge_rpg_save.c',
      'lge_rpg_view.h',
      'lge_rpg_view.c',
      'lge_story.h',
      'lge_story.c',
      'lge_tile_cache.h',
      'lge_tile_cache.c',
      'lge_lvgl.h',
      'lge_lvgl_compat.h',
      'lge_lvgl.c',
      'lge_flow.h',
      'lge_flow.c',
    ].map(async (n) => [n, await readFile(new URL(`../engine/${n}`, import.meta.url), 'utf8')]),
  ),
);
const project = process.argv[3]
  ? parseProject(await readFile(process.argv[3], 'utf8'))
  : createFlowDemo();
const { files, stats } = generate(project, runtime);
for (const [name, data] of Object.entries(files)) {
  const target = resolve(out, name);
  await mkdir(dirname(target), { recursive: true });
  const old = await readFile(target).catch(() => null);
  const next = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
  if (!old || !old.equals(next)) await writeFile(target, data);
}
console.log(JSON.stringify({ out, stats }, null, 2));
