import { engineLicense } from './license';
import { liveInputGuide } from './input/monitor/guide';
import { inputFiles, inputGuide } from './input/export';
import { boardFiles } from './boards/export';
import { attackTicks } from './action2d/model';
import { toolkitData } from './gameplay/toolkit-export';
import { animatorKeys } from './gameplay/model';
import { animationFrames, initialAnimationImage } from './animation/layers';
import { storyData } from './gameplay/export';
import { renderingFiles } from './rendering/export';
import JSZip from 'jszip';
import type { Project, AudioCue, TileMap } from './model';
import { parseProject, validate, projectIdentity } from './model';
import { resolveScene } from './scenes';
import { base64ToBytes, readWav } from './assets';
import { packTilemap, packSprite, resizeSprite } from './compression';
import { imagePackingPolicy } from './rendering/image-policy';
import { planTileBatches, repeatTile, tileBatchKey } from './rendering/tile-batches';
import { apiGuide, uiCmake, uiHeader, uiIds, uiSource } from './ui-api';
import { flowData } from './flow-export';
import { projectImages, pixelHash, samePixels } from './tile-assets';
import { pixelPerfectEnabled } from './pixel-perfect';
import { analyzeTarget, measureWorkload } from './targets/analyze';
export type ExportFiles = Record<string, string | Uint8Array>;
export type RuntimeFiles = Record<string, string>;
/* Octal UTF-8 escapes preserve strings without letting names become C source. */
export function cString(text: string): string {
  return (
    '"' +
    [...new TextEncoder().encode(text)]
      .map((b) =>
        b >= 32 && b < 127 && b !== 34 && b !== 92
          ? String.fromCharCode(b)
          : '\\' + b.toString(8).padStart(3, '0'),
      )
      .join('') +
    '"'
  );
}
const bool = (v: boolean) => (v ? 'true' : 'false');
const color = (s: string) => '0x' + s.slice(1);
const number = (n: number) => (Number.isInteger(n) ? `${n}.0f` : `${n.toFixed(6)}f`);
export interface ExportStats {
  spriteRaw: number;
  spritePacked: number;
  mapRaw: number;
  mapPacked: number;
  audioBytes: number;
}
export function generate(
  p: Project,
  runtime: RuntimeFiles,
): {
  files: ExportFiles;
  stats: ExportStats;
} {
  parseProject(JSON.stringify(p));
  const errors = validate(p).filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.message).join('\n'));
  const files: ExportFiles = {};
  for (const [name, source] of Object.entries(runtime)) files[`engine/${name}`] = source;
  const stats: ExportStats = {
    spriteRaw: 0,
    spritePacked: 0,
    mapRaw: 0,
    mapPacked: 0,
    audioBytes: 0,
  };
  const assets = [
    `#include "game.h"
/* GPU texture addresses must be word aligned, independent of toolchain defaults. */
#if defined(__GNUC__) || defined(__clang__)
#define LGE_IMAGE_ALIGN __attribute__((aligned(16)))
#elif defined(_MSC_VER)
#define LGE_IMAGE_ALIGN __declspec(align(16))
#elif defined(__ICCARM__)
#define LGE_IMAGE_ALIGN _Pragma("data_alignment=16")
#else
#define LGE_IMAGE_ALIGN LV_ATTRIBUTE_MEM_ALIGN
#endif
`,
  ];
  const packing = imagePackingPolicy(p);
  const tileBatches = new Map(
    planTileBatches(p).map((b) => [tileBatchKey(b.asset, b.tileSize), b]),
  );
  const imageManifest: {
    symbol: string;
    asset: string;
    width: number;
    height: number;
    format: string;
    stride: number;
    bytes: number;
  }[] = [];
  const declarations: string[] = [];
  const variants = new Map<string, string>();
  const images = new Map(projectImages(p).map((a) => [a.id, a]));
  const opaqueImages = new Map<string, boolean>();
  const isOpaque = (id: string) => {
    if (!opaqueImages.has(id)) {
      const a = images.get(id);
      opaqueImages.set(id, !!a && a.pixels.every((v, i) => i % 4 !== 3 || v === 255));
    }
    return opaqueImages.get(id)!;
  };
  const imagePixels = new Map<
    string,
    {
      name: string;
      pixels: number[];
    }[]
  >();
  const image = (id: string, w: number, h: number, copies = 1) => {
    const key = `${id}:${w}:${h}:${copies}`;
    if (variants.has(key)) return variants.get(key)!;
    const original = images.get(id);
    if (!original) throw new Error(`Missing sprite ${id}`);
    const tile = resizeSprite(original, w, h);
    const sprite = copies === 1 ? tile : repeatTile(tile, copies);
    w = sprite.width;
    const fingerprint = `${w}:${h}:${pixelHash(sprite.pixels)}`,
      bucket = imagePixels.get(fingerprint) ?? [];
    const shared = bucket.find((item) => samePixels(item.pixels, sprite.pixels));
    if (shared) {
      variants.set(key, shared.name);
      return shared.name;
    }
    const packed = packSprite(sprite, packing),
      name = `game_image_${variants.size}`;
    bucket.push({ name, pixels: sprite.pixels });
    imagePixels.set(fingerprint, bucket);
    variants.set(key, name);
    stats.spriteRaw += packed.rawBytes;
    stats.spritePacked += packed.data.length;
    imageManifest.push({
      symbol: name,
      asset: id,
      width: w,
      height: h,
      format: packed.format,
      stride: packed.stride,
      bytes: packed.data.length,
    });
    declarations.push(`extern const lv_image_dsc_t ${name};`);
    assets.push(
      `LGE_IMAGE_ALIGN static const uint8_t ${name}_data[] = {\n${packed.data
        .reduce<string[]>((lines, v, i) => {
          if (i % 24 === 0) lines.push('    ');
          lines[lines.length - 1] += `0x${v.toString(16).padStart(2, '0')},`;
          return lines;
        }, [])
        .join(
          '\n',
        )}\n};\nconst lv_image_dsc_t ${name} = {\n    .header = {.magic=LV_IMAGE_HEADER_MAGIC, .cf=LV_COLOR_FORMAT_${packed.format}, .w=${w}, .h=${h}, .stride=${packed.stride}},\n    .data_size=sizeof(${name}_data), .data=${name}_data\n};\n`,
    );
    return name;
  };
  const cue = (id: string) => {
    const i = p.audio.findIndex((a) => a.id === id);
    return i < 0 ? 'NULL' : `&game_cues[${i}]`;
  };
  const bus = (a: AudioCue) => `LGE_BUS_${a.bus.toUpperCase()}`;
  const cues = p.audio.map((a) => {
    const bytes = base64ToBytes(a.data),
      meta = readWav(bytes);
    if (meta.sampleRate !== a.sampleRate || meta.channels !== a.channels)
      throw new Error(`${a.name}: WAV metadata mismatch.`);
    files[`assets/audio/${a.id}.wav`] = bytes;
    stats.audioBytes += bytes.length;
    return `    {.id=${cString(a.id)}, .uri=${cString(`assets/audio/${a.id}.wav`)}, .sample_rate=${a.sampleRate}, .channels=${a.channels}, .bus=${bus(a)}, .gain=${number(a.gain)}, .loop=${bool(a.loop)}, .priority=${a.priority}}`;
  });
  const game = ['#include "game.h"\n'];
  game.push(
    `const lge_cue_t game_cues[${Math.max(1, cues.length)}] = {\n${cues.length ? cues.join(',\n') : '    {0}'}\n};\n`,
  );
  // Composition shares immutable tile data as well as image variants in flash.
  const tilemaps = new Map<string, string>();
  const tilemap = (t: TileMap): string => {
    const key = JSON.stringify(t);
    const cached = tilemaps.get(key);
    if (cached) return '&' + cached;
    const packed = packTilemap(t.cells),
      name = `map_${tilemaps.size}`;
    tilemaps.set(key, name);
    stats.mapRaw += t.cells.length;
    stats.mapPacked += packed.bytes;
    const used = new Set(t.cells);
    const sources = t.tiles.map((id, i) =>
      used.has(i + 1) ? '&' + image(id, t.tileSize, t.tileSize) : 'NULL',
    );
    game.push(
      `static const void * const ${name}_tiles[${Math.max(1, sources.length)}] = {${sources.join(',') || 'NULL'}};`,
    );
    game.push(
      `static const ${packed.codec === 'rle16' ? 'uint16_t' : 'uint8_t'} ${name}_data[] = {${packed.data.join(',')}};`,
    );
    if (packed.seek.length)
      game.push(`static const uint32_t ${name}_seek[] = {${packed.seek.join(',')}};`);
    const mask = t.solidTiles
      .filter((v) => v <= 32)
      .reduce((m, v) => (m | (1 << (v - 1))) >>> 0, 0);
    const solid = Array(Math.max(1, Math.ceil(t.tiles.length / 8))).fill(0);
    for (const value of t.solidTiles) solid[(value - 1) >> 3] |= 1 << ((value - 1) & 7);
    game.push(`static const uint8_t ${name}_solid[] = {${solid.join(',')}};`);
    if (t.slopes)
      game.push(
        `static const uint8_t ${name}_slopes[]={${t.tiles.map((_, i) => (t.slopes?.[i + 1] === 'up' ? 1 : t.slopes?.[i + 1] === 'down' ? 2 : 0)).join(',') || '0'}};`,
      );
    const animations = t.tiles.map((_, i) => {
      const a = t.animations?.[i + 1];
      if (!a || !used.has(i + 1)) return 'NULL';
      const id = name + '_animation_' + i;
      game.push(
        `static const void *const ${id}_frames[]={${a.frames.map((id) => '&' + image(id, t.tileSize, t.tileSize)).join(',')}};`,
      );
      game.push(
        `static const lge_tile_animation_t ${id}={.frames=${id}_frames,.count=${a.frames.length},.fps=${a.fps}};`,
      );
      return '&' + id;
    });
    const animated = animations.some((v) => v !== 'NULL');
    if (animated)
      game.push(
        `static const lge_tile_animation_t *const ${name}_animations[]={${animations.join(',')}};`,
      );
    const strips = t.tiles.map((id, i) => {
      const batch = tileBatches.get(tileBatchKey(id, t.tileSize));
      return batch && used.has(i + 1) && !t.animations?.[i + 1]
        ? '&' + image(id, t.tileSize, t.tileSize, batch.copies)
        : 'NULL';
    });
    const batched = strips.some((value) => value !== 'NULL');
    const opaque =
      !used.has(0) &&
      [...used].every(
        (value) =>
          isOpaque(t.tiles[value - 1]) && (t.animations?.[value]?.frames ?? []).every(isOpaque),
      );
    if (batched) game.push(`static const void *const ${name}_strips[]={${strips.join(',')}};`);
    game.push(
      `static const lge_tilemap_t ${name} = {.tile_size=${t.tileSize}, .columns=${t.columns}, .rows=${t.rows}, .tile_count=${t.tiles.length}, .tiles=${name}_tiles, .${packed.codec === 'rle16' ? 'runs' : 'cells'}=${name}_data, .run_count=${packed.codec === 'rle16' ? packed.data.length / 2 : 0}, .solid_mask=UINT32_C(${mask}), .solid_bits=${name}_solid,.animations=${animated ? name + '_animations' : 'NULL'},.slopes=${t.slopes ? name + '_slopes' : 'NULL'},.run_seek=${packed.seek.length ? name + '_seek' : 'NULL'},.row_strips=${batched ? name + '_strips' : 'NULL'},.opaque=${opaque}};\n`,
    );
    return '&' + name;
  };
  const story = storyData(p, cString, cue);
  const physicsDefinitions = new Map<string, string>();
  const scenes = p.scenes.map((scene) => resolveScene(p, scene));
  p.scenes.forEach((_scene, si) => {
    const nodes = scenes[si].map((n, ni) => {
      let map = 'NULL';
      if (n.kind === 'tilemap' && n.tilemap) map = tilemap(n.tilemap);
      // Bake nearest-neighbor sizes into palette-packed variants. This avoids
      // runtime transforms, whose palette color rounding differs across LVGL ports.
      const img =
        n.kind === 'sprite' ? '&' + image(initialAnimationImage(n, p), n.width, n.height) : 'NULL';
      let physics = 'NULL';
      if (n.physics) {
        const p = n.physics,
          b = p.box ?? { x: 0, y: 0, width: 0, height: 0 };
        const key = JSON.stringify([
          p.body,
          p.motion,
          b.x,
          b.y,
          b.width,
          b.height,
          p.layer,
          p.mask,
          p.gravity,
          p.jumpSpeed,
          p.velocityX,
          p.velocityY,
          p.worldBounds,
          p.gridSize,
          p.oneWay,
          p.coyoteMs,
          p.bufferMs,
          p.slope,
          p.travel,
        ]);
        let name = physicsDefinitions.get(key);
        if (!name) {
          name = `game_physics_${physicsDefinitions.size}`;
          physicsDefinitions.set(key, name);
          game.push(
            `static const lge_physics_def_t ${name} = {.body=LGE_BODY_${p.body.toUpperCase()}, .motion=LGE_MOTION_${p.motion.toUpperCase()}, .box={${number(b.x)},${number(b.y)},${number(b.width)},${number(b.height)}}, .layer=${p.layer}, .mask=${p.mask}, .gravity=${number(p.gravity)}, .jump_speed=${number(p.jumpSpeed)}, .velocity_x=${number(p.velocityX)}, .velocity_y=${number(p.velocityY)}, .world_bounds=${bool(p.worldBounds)},.grid_size=${p.gridSize ?? 16},.one_way=${!!p.oneWay},.coyote_ms=${p.coyoteMs ?? 0},.buffer_ms=${p.bufferMs ?? 0},.slope=LGE_SLOPE_${p.slope?.toUpperCase() ?? 'BOX'},.travel_x=${number(p.travel?.x ?? 0)},.travel_y=${number(p.travel?.y ?? 0)},.travel_seconds=${number((p.travel?.durationMs ?? 0) / 1000)}};\n`,
          );
        }
        physics = '&' + name;
      }
      const stateBindings = story.bindings(n, `bindings_${si}_${ni}`);
      const events = story.events(n, `events_${si}_${ni}`);
      let animator = 'NULL';
      if (n.animator) {
        const clips = animatorKeys.map((mode) => {
          const clip = p.gameplay?.animations.find(
            (c) => c.id === n.animator![mode as keyof typeof n.animator],
          );
          if (!clip) return `.${mode.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())}=NULL`;
          const name = `anim_${si}_${ni}_${mode}`;
          game.push(
            `static const void * const ${name}_frames[]={${animationFrames(clip)
              .map((id) => '&' + image(id, n.width, n.height))
              .join(',')}};`,
          );
          game.push(
            `static const lge_animation_clip_t ${name}={.frames=${name}_frames,.count=${clip.frames.length},.fps=${clip.fps},.loop=${clip.loop}};`,
          );
          return `.${mode.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())}=&${name}`;
        });
        game.push(`static const lge_animator_def_t animator_${si}_${ni}={${clips.join(',')}};`);
        animator = `&animator_${si}_${ni}`;
      }
      let melee = 'NULL';
      if (n.melee) {
        const m = n.melee,
          [windup, active, recovery] = attackTicks(m);
        melee = `&melee_${si}_${ni}`;
        game.push(
          `static const lge_melee_def_t melee_${si}_${ni}={.reach=${m.reach},.width=${m.width},.windup=${windup},.active=${active},.recovery=${recovery},.damage=${m.damage},.mask=${m.mask},.lock_movement=${m.lockMovement}};`,
        );
      }
      const parent = n.parent ? scenes[si].findIndex((a) => a.id === n.parent) + 1 : 0;
      const prefab = n.spawnable ? cString(n.scene!) : 'NULL';
      return `    {.id=${cString(n.id)}, .name=${cString(n.name)}, .kind=LGE_${n.kind.toUpperCase()}, .x=${number(n.x)}, .y=${number(n.y)}, .width=${n.width}, .height=${n.height}, .color=${color(n.color)}, .radius=${n.radius}, .text=${cString(n.text)}, .image=${img}, .visible=${bool(n.visible)}, .solid=${bool(n.solid)}, .player=${bool(n.player)}, .collectible=${bool(n.collectible)}, .speed=${number(n.speed)}, .binding=LGE_BIND_${n.binding.toUpperCase()}, .cue=${cue(n.cue)}, .tilemap=${map}, .parent=${parent}, .prefab=${prefab}, .ui_layer=${bool(n.layer === 'ui')}, .physics=${physics}, .event_pages=${events}, .event_count=${n.events?.length ?? 0}, .animator=${animator},.z_index=${n.zIndex ?? 0},.sort_y=${!!n.sortY},.state_bindings=${stateBindings},.state_binding_count=${Object.keys(n.stateBindings ?? {}).length},.pattern=${n.emitter ? '&game_patterns[' + (p.gameplay?.patterns?.findIndex((v) => v.id === n.emitter!.pattern) ?? -1) + ']' : 'NULL'},.emitter_autoplay=${!!n.emitter?.autoplay},.melee=${melee},.input_action=${n.inputAction ? { left: 1, right: 2, up: 4, down: 8, action: 16, interact: 32, menu: 64 }[n.inputAction] : 0}}`;
    });
    game.push(
      `static const lge_node_def_t scene_${si}_nodes[${Math.max(1, nodes.length)}] = {\n${nodes.join(',\n') || '    {0}'}\n};\n`,
    );
  });
  p.scenes.forEach((s, i) => {
    if (s.camera2d)
      game.push(
        `static const lge_camera2d_def_t scene_${i}_camera={.world_width=${s.camera2d.worldWidth},.world_height=${s.camera2d.worldHeight},.follow=${scenes[i].findIndex((n) => n.id === s.camera2d!.follow) + 1},.follow_y=${s.camera2d.axis === 'both'}};\n`,
      );
  });
  game.push(
    `const lge_scene_def_t game_scenes[GAME_SCENE_COUNT] = {\n${p.scenes.map((s, i) => `    {.id=${cString(s.id)}, .name=${cString(s.name)}, .width=GAME_WIDTH, .height=GAME_HEIGHT, .background=${color(s.background)}, .objective=${cString(s.objective)}, .completion=${cString(s.completion)}, .nodes=scene_${i}_nodes, .count=${scenes[i].length}, .music=${cue(s.music)}, .projectile_capacity=${p.gameplay?.projectileLimit ?? 64}, .camera2d=${s.camera2d ? '&scene_' + i + '_camera' : 'NULL'}}`).join(',\n')}\n};`,
  );
  const toolkitSource = toolkitData(p, cString, (id) => {
    const a = images.get(id);
    return a ? '&' + image(id, a.width, a.height) : 'NULL';
  });
  const dataHeader = `#ifndef GENERATED_GAME_H\n#define GENERATED_GAME_H\n#include "engine/lge_lvgl.h"\n#ifdef __cplusplus\nextern "C" {\n#endif\n#define GAME_WIDTH ${p.width}\n#define GAME_HEIGHT ${p.height}\n#define GAME_COLOR_DEPTH ${p.colorDepth}\n#define GAME_PIXEL_PERFECT ${pixelPerfectEnabled(p) ? 1 : 0}\n#define GAME_CUE_COUNT ${p.audio.length}\n#define GAME_SCENE_COUNT ${p.scenes.length}\nextern const lge_scene_def_t game_scenes[GAME_SCENE_COUNT];\nextern const lge_cue_t game_cues[${Math.max(1, p.audio.length)}];\n${declarations.join('\n')}\n#ifdef __cplusplus\n}\n#endif\n#endif\n`;
  files['audio-manifest.json'] = JSON.stringify(
    p.audio.map(({ data, ...a }) => ({
      ...a,
      uri: `assets/audio/${a.id}.wav`,
      encoding: 'pcm_s16le',
    })),
    null,
    2,
  );
  files['project.lge.json'] = JSON.stringify(p);
  files['compression-report.json'] = JSON.stringify(stats, null, 2);
  const clean: ExportFiles = {};
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith('engine/') || name.startsWith('assets/')) clean[`ui/${name}`] = data;
  }
  game.splice(2, 0, toolkitSource, story.source.join('\n'));
  clean['ui/generated/game_data.c'] = game.join('\n') + '\n';
  clean['ui/generated/game_assets.c'] = assets.join('\n');
  clean['ui/image-manifest.json'] = JSON.stringify(
    {
      version: 1,
      packing,
      alignment: 16,
      images: imageManifest,
      tileBatches: [...tileBatches.values()],
    },
    null,
    2,
  );
  clean['ui/generated/game_data.h'] = dataHeader;
  clean['ui/LICENSE.md'] = engineLicense;
  clean['ui/ui.h'] = uiHeader;
  Object.assign(clean, inputFiles(p));
  clean['ui/INPUTS.md'] = inputGuide(p);
  clean['ui/LiveInputMonitor.md'] = liveInputGuide;
  const flow = flowData(p, cString);
  clean['ui/generated/game_flow.h'] = flow.header;
  clean['ui/generated/game_flow.c'] = flow.source;
  clean['ui/ui.c'] = uiSource;
  clean['ui/ui_ids.h'] = uiIds(p);
  clean['ui/game.h'] =
    '/* Compatibility include for v0.1 project hooks. */\n#ifndef LGE_GAME_COMPAT_H\n#define LGE_GAME_COMPAT_H\n#include "ui.h"\n#endif\n';
  clean['ui/user/game_hooks.c'] = p.code;
  Object.assign(clean, renderingFiles(p, uiCmake), boardFiles(p));
  clean['ui/tile-manifest.json'] = JSON.stringify(
    {
      version: 1,
      maps: p.scenes.flatMap((scene) =>
        resolveScene(p, scene)
          .filter((n) => n.tilemap)
          .map((n) => {
            const t = n.tilemap!,
              used = new Set(t.cells);
            return {
              scene: scene.id,
              node: n.id,
              name: n.name,
              tileSize: t.tileSize,
              columns: t.columns,
              rows: t.rows,
              tiles: t.tiles.map((id, i) => ({
                value: i + 1,
                id,
                name: images.get(id)?.name ?? id,
                solid: t.solidTiles.includes(i + 1),
                slope: t.slopes?.[i + 1] ?? null,
                animation: t.animations?.[i + 1] ?? null,
                used: used.has(i + 1),
              })),
            };
          }),
      ),
    },
    null,
    2,
  );
  clean['ui/audio-manifest.json'] = files['audio-manifest.json'];
  clean['ui/compression-report.json'] = files['compression-report.json'];
  clean['ui/target-guidance.json'] = JSON.stringify(
    {
      version: 1,
      purpose:
        'Advisory planning snapshot. Does not configure a board port, linker, decoder, accelerator or storage driver.',
      limits:
        'Memory includes explicit allowances; image storage is conservative and may exceed exact export after pixel deduplication. No custom-C timing or compiled binary size is measured.',
      ...analyzeTarget(p, measureWorkload(p)),
      exactExportPayload: stats,
    },
    null,
    2,
  );
  clean['ui/README.md'] = apiGuide(p);
  clean['ui/examples/board_port.example.c'] = boardExample;
  clean['project.lge.json'] = files['project.lge.json'];
  clean['README.md'] =
    `# ${p.name}\n\nAdd the ui folder to your firmware and include ui/ui.h. Start with ui_init(). Read ui/README.md for the coding API, audio backend and CMake integration.\n\nproject.lge.json is the editable authoring source; it is not needed by firmware.\n`;
  return { files: clean, stats };
}
export async function zipProject(files: ExportFiles): Promise<Blob> {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  // ZIP and native exports share ownership metadata, so an unpacked UI can be re-exported safely.
  if (typeof files['project.lge.json'] === 'string' && files['ui/ui.h']) {
    const project = parseProject(files['project.lge.json']);
    const hashes = await Promise.all(
      Object.entries(files)
        .filter(([name]) => name.startsWith('ui/'))
        .map(async ([name, data]) => {
          const bytes =
            typeof data === 'string' ? new TextEncoder().encode(data) : Uint8Array.from(data);
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          return [
            name.slice(3),
            [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''),
          ];
        }),
    );
    zip.file(
      'ui/.lge-export.json',
      JSON.stringify(
        { version: 1, projectId: projectIdentity(project), files: Object.fromEntries(hashes) },
        null,
        2,
      ),
    );
  }
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}
export const boardExample = `/* Integration sketch. Replace board_* with your hardware implementation.
 * Not included in CMake. Initialize LVGL/display/touch/tick before game_create.
 */
#include "ui.h"

/* Queue commands; the audio worker owns WAV decoding, mixing and DMA.
 * Queue payloads must COPY the token/gain; cue definitions have static lifetime.
 */
extern bool board_audio_enqueue_play(uint32_t voice, const char *uri, float gain, bool loop);
extern void board_audio_enqueue_stop(uint32_t voice);
extern void board_audio_enqueue_pause(bool paused);
extern void board_audio_enqueue_gain(uint32_t voice, float gain);

static bool audio_play(void *ctx, uint32_t voice, const lge_cue_t *cue, float gain) {
    (void)ctx;
    return board_audio_enqueue_play(voice, cue->uri, gain, cue->loop);
}
static void audio_stop(void *ctx, uint32_t voice) { (void)ctx; board_audio_enqueue_stop(voice); }
static void audio_pause(void *ctx, bool p) { (void)ctx; board_audio_enqueue_pause(p); }
static void audio_gain(void *ctx, uint32_t voice, float gain) { (void)ctx; board_audio_enqueue_gain(voice, gain); }
void board_game_start(void) {
    const lge_audio_backend_t audio={NULL,audio_play,audio_stop,audio_pause,audio_gain};
    const ui_config_t config={.audio=&audio};
    ui_init_with_config(&config);
    /* Or pass NULL for a fully playable, silent game. */
}
void board_game_input(uint8_t actions) {
    /* Call on LVGL's owning thread, under the same lock as lv_timer_handler. */
    ui_set_input(actions);
}
void board_game_audio_finished(uint32_t voice) {
    /* Drain the worker's completion queue ON THE LVGL THREAD. */
    ui_audio_complete(voice);
}
void board_game_pause(bool pause) { ui_set_paused(pause); }
void board_game_shutdown(void) { ui_deinit(); }
`;
