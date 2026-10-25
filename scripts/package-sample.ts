import { createH7Adventure } from '../src/examples/h7-adventure';
import { createRpgDemo } from '../src/rpg/demo';
import { createToolkitDemo } from '../src/gameplay/toolkit-demo';
import { createGameplayDemo } from '../src/gameplay/demo';
import { createSideScrollerDemo } from '../src/examples/side-scroller';
import { createAdventureDemo } from '../src/examples/topdown-adventure';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createStarter } from '../src/assets';
import { createFlowDemo } from '../src/flow-demo';
import { createSceneDemo } from '../src/scene-demo';
import { createPhysicsDemo } from '../src/physics-demo';
import { createTilesetDemo, workshopSheet } from '../src/tileset-demo';
import { pngRgba } from './png';
import { generate, zipProject } from '../src/exporter';
const runtime = Object.fromEntries(
  await Promise.all(
    [
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
    ].map(async (name) => [
      name,
      await readFile(new URL(`../engine/${name}`, import.meta.url), 'utf8'),
    ]),
  ),
);
const project = createStarter();
const { files, stats } = generate(project, runtime);
await mkdir('examples', { recursive: true });
await mkdir('docs', { recursive: true });
await writeFile('docs/CodingAPI.md', files['ui/README.md']);
await writeFile('examples/TheLittleGrove.lge.json', JSON.stringify(project, null, 2));
const zip = await zipProject(files);
await writeFile('examples/TheLittleGrove.lvgl.zip', Buffer.from(await zip.arrayBuffer()));
console.log(
  JSON.stringify(
    { package: 'examples/TheLittleGrove.lvgl.zip', zipBytes: zip.size, ...stats },
    null,
    2,
  ),
);

const journey = createFlowDemo();
await writeFile('examples/SceneJourney.lge.json', JSON.stringify(journey, null, 2));
await writeFile('examples/SceneComposition.lge.json', JSON.stringify(createSceneDemo(), null, 2));
await writeFile(
  'examples/PhysicsPlayground.lge.json',
  JSON.stringify(createPhysicsDemo(), null, 2),
);

await writeFile('examples/TilesetWorkshop.lge.json', JSON.stringify(createTilesetDemo(), null, 2));
const sheet = workshopSheet();
await writeFile('examples/WorkshopTilesheet.png', pngRgba(sheet.width, sheet.height, sheet.pixels));




for (const [name, demo] of [
  ['AmberTrail', createSideScrollerDemo()],
  ['WillowlightAdventure', createAdventureDemo()],
] as const) {
  await writeFile(`examples/${name}.lge.json`, JSON.stringify(demo, null, 2));
  const output = generate(demo, runtime);
  await writeFile(
    `examples/${name}.lvgl.zip`,
    Buffer.from(await (await zipProject(output.files)).arrayBuffer()),
  );
  console.log(
    `${name}: ${demo.scenes.length} scenes, ${output.stats.spritePacked} sprite bytes, ${output.stats.mapPacked} map bytes.`,
  );
}

const gameplayDemo = createGameplayDemo();
await writeFile('examples/2DGameplayLab.lge.json', JSON.stringify(gameplayDemo, null, 2));
await writeFile(
  'examples/2DGameplayLab.lvgl.zip',
  Buffer.from(await (await zipProject(generate(gameplayDemo, runtime).files)).arrayBuffer()),
);

const toolkit = createToolkitDemo();
await writeFile('examples/2DToolkitLab.lge.json', JSON.stringify(toolkit, null, 2));
await writeFile(
  'examples/2DToolkitLab.lvgl.zip',
  Buffer.from(await (await zipProject(generate(toolkit, runtime).files)).arrayBuffer()),
);

const rpgDemo = createRpgDemo();
await writeFile('examples/RpgBattleLab.lge.json', JSON.stringify(rpgDemo, null, 2));
await writeFile(
  'examples/RpgBattleLab.lvgl.zip',
  Buffer.from(await (await zipProject(generate(rpgDemo, runtime).files)).arrayBuffer()),
);

const h7 = createH7Adventure();
await writeFile('examples/WillowlightH7.lge.json', JSON.stringify(h7, null, 2));
const h7Export = generate(h7, runtime);
await writeFile(
  'examples/WillowlightH7.lvgl.zip',
  Buffer.from(await (await zipProject(h7Export.files)).arrayBuffer()),
);
console.log({ package: 'examples/WillowlightH7.lvgl.zip', stats: h7Export.stats });
