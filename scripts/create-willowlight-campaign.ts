/** Private pack-backed campaign. Reads licensed inputs locally; never touches hardware. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseProject, validate, type GameNode, type Project } from '../src/model';
import { importLayeredCharacter } from '../src/animation/import-character';
import { readSheet } from './read-sheet';
import { createWillowlightCampaign } from '../src/examples/willowlight/campaign';
import { chapters, sideStories } from '../src/examples/willowlight/story';
import type { Cast } from '../src/examples/willowlight/world';

const sourcePath = resolve(
  process.argv[2] ?? '.local-examples/WillowlightH7-PackVillage/WillowlightH7-PackVillage.lge.json',
);
const output = resolve(process.argv[3] ?? '.local-examples/Willowlight-TheNamesWeLeave');
const sourceText = await readFile(sourcePath, 'utf8');
const source = parseProject(sourceText);
const downloads = '/Users/tonyexp/Downloads';
const base = join(downloads, '20.01a - Character Base 2.5c (1)');
const cloak = join(downloads, '20.05d - Cloak & Hood 1.3 (comp. v01)');
const coat = join(downloads, "20.11a - Alchemist's Coat 2.1 (comp. v01) (1)");
const cast: Cast = {
  hero: source.scenes[0].nodes.find((n) => n.player)!,
  mira: source.scenes[0].nodes.find((n) => n.id === 'guide')!,
  rowan: source.scenes[0].nodes.find((n) => n.id === 'npc_cloak')!,
};
const provenance: string[] = [];
function outfit(name: string, id: string, parts: [string, string][]): GameNode {
  const imported = importLayeredCharacter(
    name,
    id,
    parts.map(([root, file]) => {
      const path = join(root, 'char_a_p1', file);
      provenance.push(path);
      return { name: file.split('/').at(-1)!, sheet: readSheet(path) };
    }),
    { pixelScale: 2 },
  );
  source.sprites.push(...imported.sprites);
  source.gameplay!.animations.push(...imported.clips);
  return imported.node;
}
cast.tamsin = outfit('Tamsin · russet coat / dark braid', 'cast_tamsin', [
  [base, 'char_a_p1_0bas_humn_v06.png'],
  [coat, '1out/char_a_p1_1out_alch_v04.png'],
  [base, '4har/char_a_p1_4har_bob1_v04.png'],
]);
cast.bram = outfit('Bram · blue coat / silver hair', 'cast_bram', [
  [base, 'char_a_p1_0bas_humn_v04.png'],
  [coat, '1out/char_a_p1_1out_alch_v05.png'],
  [base, '4har/char_a_p1_4har_bob1_v13.png'],
]);
cast.ada = outfit('Ada · open hood / copper hair', 'cast_ada', [
  [cloak, '0bot/char_a_p1_0bot_lnpl_v03.png'],
  [base, 'char_a_p1_0bas_humn_v03.png'],
  [coat, '1out/char_a_p1_1out_alch_v02.png'],
  [cloak, '2clo/char_a_p1_2clo_lnpl_v03.png'],
  [base, '4har/char_a_p1_4har_bob1_v05.png'],
]);
cast.noor = outfit('Noor · green coat / pale hair', 'cast_noor', [
  [base, 'char_a_p1_0bas_humn_v08.png'],
  [coat, '1out/char_a_p1_1out_alch_v03.png'],
  [base, '4har/char_a_p1_4har_bob1_v11.png'],
]);
cast.warden = structuredClone(cast.rowan);
// Native pack floor/wall cells replace the prototype's procedural placeholders.
const a5Path = join(downloads, 'Country Woods - ACE (1)/Tilesets/Country Woods ACE A5.png');
const sheet = readSheet(a5Path);
provenance.push(a5Path);
const crop = (
  id: string,
  name: string,
  path: string,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  const image = readSheet(path);
  provenance.push(path);
  if (x + width > image.width || y + height > image.height)
    throw new Error('Crop outside source: ' + id);
  source.sprites.push({
    id,
    name,
    width,
    height,
    pixels: Array.from(
      { length: width * height * 4 },
      (_, i) =>
        image.pixels[
          ((y + Math.floor(i / (width * 4))) * image.width + x + (Math.floor(i / 4) % width)) * 4 +
            (i % 4)
        ],
    ),
  });
};
const countryProps = join(downloads, 'Country Woods - ACE (1)/Tilesets/Country Woods ACE 1.PNG');
const modernProps = join(downloads, 'Modern+ Outer Basic ACE (1)/Tilesets/Tile3.png');
crop('pack_tall_oak', 'Country Woods · tall canopy', countryProps, 128, 0, 128, 224);
crop('pack_corn', 'Country Woods · growing corn', countryProps, 256, 128, 32, 128);
crop('pack_cart', 'Country Woods · harvest wagon', countryProps, 352, 224, 160, 96);
crop('pack_logs', 'Country Woods · fallen logs', countryProps, 0, 416, 96, 32);
crop('pack_tractor', 'Country Woods · blue tractor', countryProps, 256, 448, 128, 64);
crop('pack_awning', 'Modern+ · shaded station awning', modernProps, 320, 0, 96, 96);
crop('pack_terminal', 'Modern+ · public terminal', modernProps, 384, 288, 64, 96);
crop('pack_station_bench', 'Modern+ · station bench', modernProps, 256, 160, 64, 96);
const set = source.tilesets![0];
for (const [id, x, y, solid] of [
  ['camp_floor', 192, 96, false],
  ['camp_floor_alt', 224, 96, false],
  ['camp_wall', 192, 64, true],
  ['camp_boardwalk', 96, 96, false],
] as const) {
  const pixels = Array.from(
    { length: 32 * 32 * 4 },
    (_, i) =>
      sheet.pixels[
        ((y + Math.floor(i / 128)) * sheet.width + x + (Math.floor(i / 4) % 32)) * 4 + (i % 4)
      ],
  );
  set.tiles.push({ id, name: 'Country Woods · ' + id, pixels, solid });
  set.cells.push(id);
  const map = source.scenes[0].nodes.find((n) => n.tilemap)!.tilemap!;
  map.tiles.push(id);
  if (solid) map.solidTiles.push(map.tiles.length);
}
set.rows = Math.ceil(set.cells.length / set.columns);
while (set.cells.length < set.rows * set.columns) set.cells.push('');
const campaign = createWillowlightCampaign(source, cast);
// The bundled LVGL font contains ASCII, degree, bullet and icons. Keep authored prose
// typographic; cook its runtime punctuation explicitly instead of showing missing glyphs.
const fontText = (text: string) =>
  text
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, ' - ')
    .replace(/·/g, ' / ')
    .replace(/→/g, ' -> ')
    .replace(/…/g, '...');
for (const scene of campaign.scenes) {
  scene.objective = fontText(scene.objective);
  scene.completion = fontText(scene.completion);
  for (const n of scene.nodes) n.text = fontText(n.text);
}
for (const script of campaign.gameplay!.scripts)
  for (const beat of script.actions)
    if (beat.type === 'say') {
      beat.text = fontText(beat.text);
      beat.speaker = fontText(beat.speaker);
      for (const choice of beat.choices) choice.text = fontText(choice.text);
    }
const contentIssues = validate(campaign).filter((i) => i.severity === 'error');
if (contentIssues.length)
  throw new Error(
    JSON.stringify(
      {
        issues: contentIssues,
        longText: campaign.gameplay!.scripts.flatMap((s) =>
          s.actions
            .filter((a) => a.type === 'say' && a.text.length > 512)
            .map((a) => ({
              script: s.id,
              action: a.id,
              length: a.type === 'say' ? a.text.length : 0,
            })),
        ),
      },
      null,
      2,
    ),
  );
const roundtrip = parseProject(JSON.stringify(campaign));
const errors = validate(roundtrip).filter((i) => i.severity === 'error');
if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
await mkdir(output, { recursive: true });
const projectPath = join(output, 'Willowlight-TheNamesWeLeave.lge.json');
const text = JSON.stringify(campaign);
await writeFile(projectPath, text);
const dialogue = campaign
  .gameplay!.scripts.flatMap((s) => s.actions)
  .filter((a) => a.type === 'say');
const report = {
  projectPath,
  sourcePath,
  sourceSha256: createHash('sha256').update(sourceText).digest('hex'),
  projectSha256: createHash('sha256').update(text).digest('hex'),
  chapters: chapters.map((c) => ({
    id: c.id,
    title: c.title,
    areas: c.places,
    objective: c.objective,
  })),
  sideStories: sideStories.map((q) => ({
    id: q.id,
    title: q.title,
    giver: q.giver,
    reward: q.reward,
  })),
  scenes: campaign.scenes.length,
  maxLoadedNodes: Math.max(...campaign.scenes.map((s) => s.nodes.length)),
  scripts: campaign.gameplay!.scripts.length,
  cutscenes: campaign.gameplay!.scripts.filter((s) => s.kind === 'cutscene').length,
  stateFields: campaign.gameplay!.state.length,
  clips: campaign.gameplay!.animations.length,
  dialogueBeats: dialogue.length,
  words: dialogue.reduce((sum, a) => sum + a.text.split(/\s+/).filter(Boolean).length, 0),
  wardActors: campaign.scenes.flatMap((s) => s.nodes).filter((n) => n.emitter).length,
  playtime: {
    designTargetMinutes: [120, 240],
    measuredHumanCompletionMinutes: null,
    status: 'Requires full human playtest; automation is not a duration measurement.',
  },
  storage:
    '34 guarded milestone autosaves plus manual rest lamps; compatible 492-byte checkpoint format. Native LVGL: atomic profile-local save; fast preview: localStorage; DK: bounded 16 KiB flash journal.',
  assetPolicy:
    'Private local use of supplied licensed packs. Existing sprites retain original texels; layered costumes are baked once at export. No new AI-generated art.',
  importedCharacterLayers: provenance,
};
await writeFile(join(output, 'campaign-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, importedCharacterLayers: provenance.length }, null, 2));
