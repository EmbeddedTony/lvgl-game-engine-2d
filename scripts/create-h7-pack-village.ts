/** Local-only integration of the user's scenery and layered character packs. Never flashes. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createImportedH7Adventure } from '../src/examples/h7-imported-terrain';
import { importLayeredCharacter, importLayeredToolSwing } from '../src/animation/import-character';
import { addSwordSweep } from './character-sword';
import { readSheet } from './read-sheet';
import { replacePackScenery } from './import-pack-scenery';
import { parseProject, validate } from '../src/model';
import { generate } from '../src/exporter';
const downloads = '/Users/tonyexp/Downloads';
const country = join(downloads, 'Country Woods - ACE (1)'),
  modern = join(downloads, 'Modern+ Outer Basic ACE (1)');
const base = join(downloads, '20.01a - Character Base 2.5c (1)');
const cloak = join(downloads, '20.05d - Cloak & Hood 1.3 (comp. v01)');
const alchemist = join(downloads, "20.11a - Alchemist's Coat 2.1 (comp. v01) (1)");
const out = resolve(process.argv[2] ?? '.local-examples/WillowlightH7-PackVillage');
await mkdir(out, { recursive: true });
const p = createImportedH7Adventure({
  grass: readSheet(join(country, 'Tilesets/Country Woods ACE A5.png')),
  paths: readSheet(join(country, 'Tilesets/Country Woods ACE A2.png')),
  water: readSheet(join(country, 'Tilesets/Country Woods ACE A1.png')),
});
const scenery = replacePackScenery(p, country, modern);
const characterFiles: string[] = [];
const layer = (root: string, file: string, page = 'p1') => {
  const path = join(root, `char_a_${page}`, file.replace('_p1_', `_${page}_`));
  characterFiles.push(path);
  return { name: path.split('/').at(-1)!, sheet: readSheet(path) };
};
const alch = importLayeredCharacter(
  'Mira · alchemist',
  'npc_alchemist',
  [
    layer(base, 'char_a_p1_0bas_humn_v03.png'),
    layer(alchemist, '1out/char_a_p1_1out_alch_v01.png'),
    layer(alchemist, '3fac/char_a_p1_3fac_gogl_v01.png'),
    layer(base, '4har/char_a_p1_4har_bob1_v03.png'),
  ],
  { pixelScale: 2 },
);
const ranger = importLayeredCharacter(
  'Rowan · cloaked traveller',
  'npc_cloak',
  [
    layer(cloak, '0bot/char_a_p1_0bot_lnpl_v03.png'),
    layer(base, 'char_a_p1_0bas_humn_v06.png'),
    layer(alchemist, '1out/char_a_p1_1out_alch_v03.png'),
    layer(cloak, '2clo/char_a_p1_2clo_lnpl_v03.png'),
    layer(cloak, '2clo/char_a_p1_2clo_mnpl_v03.png'),
    layer(cloak, '5hat/char_a_p1_5hat_hdpl_v03.png'),
  ],
  { pixelScale: 2 },
);
const heroParts: [string, string][] = [
  [cloak, '0bot/char_a_p1_0bot_lnpl_v06.png'],
  [base, 'char_a_p1_0bas_humn_v03.png'],
  [alchemist, '1out/char_a_p1_1out_alch_v02.png'],
  [cloak, '2clo/char_a_p1_2clo_lnpl_v06.png'],
  [cloak, '5hat/char_a_p1_5hat_hdpl_v06.png'],
];
const hero = importLayeredCharacter(
  'Traveller · robed adventurer',
  'player_pack',
  heroParts.map(([root, file]) => layer(root, file)),
  { fullCell: true, pixelScale: 2 },
);
const attacks = importLayeredToolSwing(
  hero.node.name,
  'player_pack_p2',
  heroParts.map(([root, file]) => layer(root, file, 'p2')),
);
hero.sprites.push(...attacks.sprites, ...addSwordSweep(attacks.clips));
hero.clips.push(...attacks.clips);
for (const clip of attacks.clips) {
  const direction = clip.id.split('_').at(-1)!;
  hero.node.animator![`attack${direction}` as keyof typeof hero.node.animator] = clip.id;
}
const scene = p.scenes[0],
  guide = scene.nodes.find((n) => n.id === 'guide')!,
  oldHero = scene.nodes.find((n) => n.id === 'player')!;
// Preserve world feet, interaction hooks, input and combat while replacing the visual.
const feet = (n: typeof hero.node) => {
  const box = n.physics!.box!;
  return { x: n.x + box.x + box.width / 2, y: n.y + box.y + box.height };
};
const placeFeet = (n: typeof hero.node, at: { x: number; y: number }) => {
  const box = n.physics!.box!;
  n.x = at.x - box.x - box.width / 2;
  n.y = at.y - box.y - box.height;
};
Object.assign(hero.node, {
  id: 'player',
  player: true,
  speed: oldHero.speed,
  melee: oldHero.melee,
  events: oldHero.events,
});
placeFeet(hero.node, feet(oldHero));
Object.assign(alch.node, {
  id: 'guide',
  events: guide.events,
});
placeFeet(alch.node, feet(guide));
scene.nodes = scene.nodes.filter((n) => !['guide', 'player'].includes(n.id));
placeFeet(ranger.node, { x: 1504, y: 991 });
ranger.node.physics!.motion = 'code';
ranger.node.events = [
  { id: 'ranger_talk', trigger: 'interact', script: 'ranger_dialogue' },
  { id: 'ranger_start', trigger: 'start', script: 'ranger_patrol' },
];
p.gameplay!.scripts.push({
  id: 'ranger_patrol',
  name: 'Rowan · shared preview/native patrol',
  folder: 'village/npcs',
  blocking: false,
  actions: [
    { id: 'east', type: 'velocity', node: 'npc_cloak', x: 28, y: 0 },
    { id: 'east_walk', type: 'wait', ms: 3400 },
    { id: 'west', type: 'velocity', node: 'npc_cloak', x: -28, y: 0 },
    { id: 'west_walk', type: 'wait', ms: 3400 },
    { id: 'loop', type: 'jump', target: 'east' },
  ],
});
p.gameplay!.scripts.push({
  id: 'ranger_dialogue',
  name: 'Rowan explains the layered outfit',
  folder: 'village/npcs',
  blocking: true,
  actions: [
    {
      id: 'say',
      type: 'say',
      speaker: 'ROWAN',
      text: 'My cloak has rear and front layers.\nEvery piece follows the same walk frame.\nThe export draws me as one sprite.',
      choices: [],
    },
    { id: 'done', type: 'end' },
  ],
});
p.gameplay!.animations = p.gameplay!.animations.filter(
  (c) => !c.frames.some((id) => id.startsWith('hero_')),
);
for (const actor of [hero, alch, ranger]) {
  p.sprites.push(...actor.sprites);
  p.gameplay!.animations.push(...actor.clips);
  scene.nodes.push(actor.node);
}
// Remove unused original/generated characters. Keep only authored sprite references;
// layered source cells remain editable, including hidden outfit layers.
const used = new Set(p.scenes.flatMap((s) => s.nodes.map((n) => n.asset)));
for (const clip of p.gameplay!.animations) {
  clip.frames.forEach((id) => used.add(id));
  clip.layers?.forEach((l) => l.frames.forEach((id) => used.add(id)));
}
p.sprites = p.sprites.filter((s) => used.has(s.id));
// Initial velocity starts the same patrol in both editor and generated C.
ranger.node.physics!.velocityX = 28;
p.id = 'willowlight_pack_village';
p.name = 'Willowlight - Native Pack Village';
scene.objective =
  'Explore native 32px scenery and talk to Mira and Rowan. Review layered clips under Gameplay.';
const checked = parseProject(JSON.stringify(p));
const errors = validate(checked).filter((i) => i.severity === 'error');
if (errors.length) throw new Error(JSON.stringify(errors));
const file = join(out, 'WillowlightH7-PackVillage.lge.json');
await writeFile(file, JSON.stringify(checked));
const report = {
  file,
  nativeTileSize: 32,
  scenery: scenery.provenance,
  characterSources: await Promise.all(
    characterFiles.map(async (file) => ({
      file,
      sha256: createHash('sha256')
        .update(await readFile(file))
        .digest('hex'),
    })),
  ),
  characters: [
    {
      name: hero.node.name,
      layers: 5,
      pixelScale: 2,
      displaySize: [128, 128],
      toolPosePage: 'P2',
      swordEffect: 'deterministic overlay',
    },
    { name: alch.node.name, layers: 4, pixelScale: 2, displaySize: [64, 96] },
    { name: ranger.node.name, layers: 6, pixelScale: 2, displaySize: [64, 96] },
  ],
  spriteSources: p.sprites.length,
  clips: p.gameplay!.animations.length,
  generatedSceneryRemaining: p.sprites.filter((s) => s.id.startsWith('village_')).length,
  generatedCharacterSpritesRemaining: p.sprites.filter(
    (s) => s.id.startsWith('hero_') || s.id === 'mira_village',
  ).length,
  stats: generate(checked, {}).stats,
  hardwareFlashed: false,
};
await writeFile(join(out, 'asset-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      file,
      sprites: report.spriteSources,
      clips: report.clips,
      imageBytes: report.stats.spritePacked,
    },
    null,
    2,
  ),
);
