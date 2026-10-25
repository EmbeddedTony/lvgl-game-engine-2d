import { inputRamBytes } from '../input/model';
import { animationFrames, initialAnimationImage } from '../animation/layers';
import type { Project, SpriteAsset } from '../model';
import { projectImages } from '../tile-assets';
import { resolveScene } from '../scenes';
import { packTilemap, type ImagePacking } from '../compression';
import { imagePackingPolicy } from '../rendering/image-policy';
import { planTileBatches, tileBatchKey } from '../rendering/tile-batches';
import { H7_TERRAIN_CACHE_BYTES } from '../boards/terrain';
import { familyById, guidanceSources, catalogDate, catalogVersion } from './catalog';
import { targetDefaults, type TargetConfig } from './model';
export interface Guidance {
  id: string;
  level: 'warning' | 'attention' | 'info';
  title: string;
  detail: string;
  suggestion: string;
  source?: string;
}
export interface Workload {
  imageBytes: number;
  terrainCacheBytes: number;
  mapBytes: number;
  tableBytes: number;
  audioBytes: number;
  largestDecode: number;
  visibleNodes: number;
  maxNodes: number;
  prefabSlots: number;
  coverage: number;
  blendPixels: number;
  roundedPixels: number;
  mapVisitedCells: number;
  collisionPairs: number;
  projectileSlots: number;
  projectileDemand: number;
  projectilePairs: number;
  platforms: number;
  simulationBodies: number;
  rpgRamBytes: number;
  inputRamBytes: number;
  checkpointBytes: number;
  animatedPixelsPerSecond: number;
  audioBytesPerSecond: number;
  variants: number;
  sceneErrors: string[];
}
type PaletteCache = WeakMap<
  SpriteAsset,
  {
    colors: number;
    partialAlpha: boolean;
  }
>;
function palette(a: SpriteAsset, paletteCache: PaletteCache) {
  let result = paletteCache.get(a);
  if (result) return result;
  const colors = new Set<number>();
  let partialAlpha = false;
  for (let i = 0; i < a.pixels.length; i += 4) {
    if (colors.size <= 256)
      colors.add(
        ((a.pixels[i] << 24) |
          (a.pixels[i + 1] << 16) |
          (a.pixels[i + 2] << 8) |
          a.pixels[i + 3]) >>>
          0,
      );
    if (a.pixels[i + 3] > 0 && a.pixels[i + 3] < 255) partialAlpha = true;
  }
  result = { colors: colors.size, partialAlpha };
  paletteCache.set(a, result);
  return result;
}
/** Conservative payload estimate, without allocating huge resized RGBA arrays on edits.
 * Exact export may use fewer colors after downsampling or merge identical asset IDs. */
export function imageBudget(
  asset: SpriteAsset,
  width: number,
  height: number,
  cache: PaletteCache = new WeakMap(),
  packing: ImagePacking = 'compact',
) {
  if (packing === 'direct') return width * height * 4;
  const colors = palette(asset, cache).colors;
  const raw = width * height * 4;
  const indexed =
    colors <= 16 ? 64 + Math.ceil(width / 2) * height : colors <= 256 ? 1024 + width * height : raw;
  return Math.min(raw, indexed);
}
export function createWorkloadMeasurer() {
  const cache: PaletteCache = new WeakMap();
  return (project: Project) => measureWorkload(project, cache);
}
export function measureWorkload(p: Project, cache: PaletteCache = new WeakMap()): Workload {
  const result: Workload = {
    imageBytes: 0,
    terrainCacheBytes:
      p.board === 'stm32h7s78-dk' && p.rendering?.compositor === 'neochrom'
        ? H7_TERRAIN_CACHE_BYTES
        : 0,
    mapBytes: 0,
    tableBytes: 0,
    audioBytes: 0,
    largestDecode: 0,
    visibleNodes: 0,
    maxNodes: 0,
    prefabSlots: 0,
    coverage: 0,
    blendPixels: 0,
    roundedPixels: 0,
    mapVisitedCells: 0,
    collisionPairs: 0,
    projectileSlots: 0,
    projectileDemand: 0,
    projectilePairs: 0,
    platforms: 0,
    simulationBodies: 0,
    rpgRamBytes: p.gameplay?.party ? 4096 : 0,
    inputRamBytes: inputRamBytes(p.inputs),
    checkpointBytes: p.gameplay?.scripts.some((s) => s.actions.some((a) => a.type === 'checkpoint'))
      ? 16 +
        p.gameplay.state.filter((v) => v.persistent).length * 4 +
        (p.gameplay.party ? 32 + p.gameplay.party.members.length * 28 : 0)
      : 0,
    animatedPixelsPerSecond: 0,
    audioBytesPerSecond: 0,
    variants: 0,
    sceneErrors: [],
  };
  const images = new Map(projectImages(p).map((a) => [a.id, a]));
  const tileBatches = new Map(
    planTileBatches(p).map((b) => [tileBatchKey(b.asset, b.tileSize), b]),
  );
  for (const batch of tileBatches.values()) {
    result.imageBytes += batch.bytes;
    result.largestDecode = Math.max(result.largestDecode, batch.bytes);
    result.tableBytes += 32;
  }
  const variants = new Set<string>(),
    maps = new Set<string>();
  const image = (id: string, width: number, height: number) => {
    const asset = images.get(id),
      key = `${id}:${width}:${height}`;
    if (!asset || variants.has(key)) return;
    variants.add(key);
    result.imageBytes += imageBudget(asset, width, height, cache, imagePackingPolicy(p));
    result.largestDecode = Math.max(result.largestDecode, width * height * 4);
    result.tableBytes += 32; // Image descriptor allowance on a 32-bit port.
  };
  for (const scene of p.scenes) {
    try {
      const nodes = resolveScene(p, scene);
      result.prefabSlots = Math.max(result.prefabSlots, nodes.filter((n) => n.spawnable).length);
      // Reserve widgets up front and budget the peak where every pool slot is live.
      // Initial effective visibility deliberately hides inactive slots in the editor.
      const potential = new Map<string, boolean>();
      for (const n of nodes) {
        n.effectiveVisible = n.visible && (!n.parent || !!potential.get(n.parent));
        potential.set(n.id, n.effectiveVisible);
      }
      result.maxNodes = Math.max(result.maxNodes, nodes.length);
      result.tableBytes += nodes.length * 160; // Definition/physics/table allowance, not compiler sizeof.
      let coverage = 0,
        blend = 0,
        visible = 0,
        characters = 0,
        areas = 0,
        blockers = 0,
        platforms = 0,
        emitters = 0,
        projectileDemand = 0,
        rounded = 0,
        mapCells = 0,
        animatedPixels = 0;
      for (const n of nodes) {
        if (n.kind === 'sprite') {
          image(initialAnimationImage(n, p), n.width, n.height);
          if (n.animator)
            for (const clip of p.gameplay?.animations ?? [])
              if (Object.values(n.animator).includes(clip.id))
                for (const frame of animationFrames(clip)) image(frame, n.width, n.height);
        }
        result.tableBytes +=
          (n.events?.length ?? 0) * 32 + Object.keys(n.stateBindings ?? {}).length * 4;
        if (n.animator)
          for (const clip of p.gameplay?.animations ?? [])
            if (Object.values(n.animator).includes(clip.id))
              result.tableBytes += 64 + clip.frames.length * 4;
        if (n.tilemap) {
          const t = n.tilemap,
            key = JSON.stringify(t);
          if (!maps.has(key)) {
            maps.add(key);
            result.mapBytes += packTilemap(t.cells).bytes;
            result.tableBytes +=
              Math.max(1, Math.ceil(t.tiles.length / 8)) +
              t.tiles.length * 4 +
              56 +
              (t.slopes ? t.tiles.length : 0);
            if (
              t.tiles.some(
                (id, i) => tileBatches.has(tileBatchKey(id, t.tileSize)) && !t.animations?.[i + 1],
              )
            )
              result.tableBytes += t.tiles.length * 4;
          }
          for (const value of new Set(t.cells))
            if (value) {
              image(t.tiles[value - 1], t.tileSize, t.tileSize);
              const a = t.animations?.[value];
              if (a) {
                for (const frame of a.frames) image(frame, t.tileSize, t.tileSize);
                result.tableBytes += 16 + a.frames.length * 4;
              }
            }
          const animated = t.cells.reduce(
            (sum, value) => sum + (t.animations?.[value]?.fps ?? 0) * t.tileSize * t.tileSize,
            0,
          );
          animatedPixels += Math.min(animated, p.width * p.height * 30);
          if (n.effectiveVisible && (!n.physics || n.physics.body === 'static')) {
            const solid = new Set(t.solidTiles);
            blockers += t.cells.reduce((sum, value) => sum + (solid.has(value) ? 1 : 0), 0);
          }
        }
        if (!n.effectiveVisible) continue;
        if (n.tilemap)
          mapCells +=
            Math.min(n.tilemap.columns, Math.ceil(p.width / n.tilemap.tileSize) + 1) *
            Math.min(n.tilemap.rows, Math.ceil(p.height / n.tilemap.tileSize) + 1);
        if (!['group', 'instance', 'area'].includes(n.kind)) visible += n.kind === 'button' ? 2 : 1;
        const area =
          Math.max(0, Math.min(p.width, n.worldX + n.width) - Math.max(0, n.worldX)) *
          Math.max(0, Math.min(p.height, n.worldY + n.height) - Math.max(0, n.worldY));
        if (!['group', 'instance', 'area'].includes(n.kind)) coverage += area;
        if ((n.kind === 'rect' || n.kind === 'button') && n.radius > 0) rounded += area;
        const asset = images.get(n.asset);
        if (n.kind === 'sprite' && asset && palette(asset, cache).partialAlpha) blend += area;
        if (
          n.tilemap &&
          n.tilemap.tiles.some((id) => {
            const a = images.get(id);
            return a && palette(a, cache).partialAlpha;
          })
        )
          blend += area;
        const body =
          n.physics?.body ??
          (n.kind === 'area' || n.collectible
            ? 'area'
            : n.player
              ? 'character'
              : n.solid || n.tilemap
                ? 'static'
                : 'none');
        if (body === 'character') characters++;
        if (body === 'area') areas++;
        if (body === 'static' && !n.tilemap) blockers++;
        if (body === 'platform') {
          platforms++;
          blockers++;
        }
        if (n.emitter) {
          emitters++;
          const b = p.gameplay?.patterns?.find((v) => v.id === n.emitter!.pattern);
          if (b) projectileDemand += b.count * Math.ceil(b.lifetimeMs / b.intervalMs);
        }
      }
      if (emitters) {
        result.projectileSlots = Math.max(
          result.projectileSlots,
          p.gameplay?.projectileLimit ?? 64,
        );
        result.projectileDemand = Math.max(result.projectileDemand, projectileDemand);
        result.projectilePairs = Math.max(
          result.projectilePairs,
          (p.gameplay?.projectileLimit ?? 64) * (characters + areas),
        );
        result.tableBytes += emitters * 8;
      }
      result.animatedPixelsPerSecond = Math.max(result.animatedPixelsPerSecond, animatedPixels);
      result.platforms = Math.max(result.platforms, platforms);
      result.simulationBodies = Math.max(result.simulationBodies, characters + areas + platforms);
      result.coverage = Math.max(result.coverage, coverage);
      result.blendPixels = Math.max(result.blendPixels, blend);
      result.roundedPixels = Math.max(result.roundedPixels, rounded);
      result.mapVisitedCells = Math.max(result.mapVisitedCells, mapCells);
      result.visibleNodes = Math.max(result.visibleNodes, visible);
      result.collisionPairs = Math.max(
        result.collisionPairs,
        characters * blockers + areas * nodes.length + platforms * characters * blockers,
      );
    } catch (error) {
      result.sceneErrors.push(`${scene.name}: ${(error as Error).message}`);
    }
  }
  result.tableBytes +=
    (p.inputs?.sources.length ?? 0) * 4 +
    (p.inputs?.channels ?? []).reduce((bytes, c) => bytes + 64 + c.id.length + 1, 0);
  if (p.gameplay) {
    for (const item of p.gameplay.rpg?.items ?? []) {
      const a = images.get(item.icon);
      if (a) image(a.id, a.width, a.height);
      result.tableBytes +=
        48 + new TextEncoder().encode(item.name + item.description + item.id + item.stack).length;
    }
    for (const actor of p.gameplay.rpg?.actors ?? []) {
      const a = images.get(actor.sprite);
      if (a) image(a.id, a.width, a.height);
      result.tableBytes +=
        80 + actor.skills.length * 68 + new TextEncoder().encode(actor.id + actor.name).length;
    }
    for (const skill of p.gameplay.rpg?.skills ?? [])
      result.tableBytes +=
        32 + new TextEncoder().encode(skill.id + skill.name + skill.description).length;
    for (const table of p.gameplay.rpg?.encounters ?? [])
      result.tableBytes += 32 + table.entries.length * 72;
    result.tableBytes += (p.gameplay.rpg?.statuses ?? []).reduce(
      (n, s) => n + 32 + s.id.length + s.name.length + 2,
      0,
    );
    result.tableBytes += (p.gameplay.patterns?.length ?? 0) * 128;
    result.tableBytes += p.gameplay.state.reduce(
      (bytes, v) => bytes + 32 + new TextEncoder().encode(v.id).length + 1,
      0,
    );
    for (const script of p.gameplay.scripts)
      for (const action of script.actions) {
        result.tableBytes += 128;
        if (action.type === 'say')
          result.tableBytes +=
            new TextEncoder().encode(
              action.text + action.speaker + action.choices.map((c) => c.text).join(''),
            ).length +
            action.choices.length * 8;
      }
  }
  result.variants = variants.size;
  for (const cue of p.audio) {
    // The canonical export keeps the complete WAV file, including headers/chunks.
    result.audioBytes += Math.max(
      0,
      Math.floor((cue.data.length * 3) / 4) -
        (cue.data.endsWith('==') ? 2 : cue.data.endsWith('=') ? 1 : 0),
    );
  }
  result.audioBytesPerSecond = p.audio
    .map((cue) => cue.sampleRate * cue.channels * 2)
    .sort((a, b) => b - a)
    .slice(0, 8)
    .reduce((sum, rate) => sum + rate, 0);
  return result;
}
export const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
    : `${(bytes / 1024).toFixed(1)} KiB`;
export function analyzeTarget(
  p: Pick<
    Project,
    'width' | 'height' | 'colorDepth' | 'target' | 'board' | 'dimension' | 'rendering'
  >,
  work: Workload,
) {
  const configured = !!p.target,
    config = p.target ?? targetDefaults('generic');
  const family = familyById(config.family)!;
  const frameBytes = (p.width * p.height * p.colorDepth) / 8;
  const drawBytes =
    config.buffers === 'partial'
      ? ((p.width * Math.min(p.height, config.partialRows) * p.colorDepth) / 8) * config.bufferCount
      : frameBytes * (config.buffers === 'double' ? 2 : 1);
  const nodeCapacity = Math.max(8, Math.ceil(work.maxNodes / 8) * 8);
  const runtimeBytes =
    8 * 1024 +
    nodeCapacity * 144 +
    nodeCapacity * Math.ceil(nodeCapacity / 8) +
    work.visibleNodes * 256 +
    (work.projectileSlots ? 3072 : 0) +
    work.rpgRamBytes +
    work.inputRamBytes +
    (work.checkpointBytes ?? 0) +
    (work.rpgRamBytes ? 22 * 256 : 0);
  const scanoutBytes = frameBytes * config.scanoutBuffers;
  const decodeBytes = config.decode === 'full-image' ? work.largestDecode : 0;
  const audioRam = work.audioBytes ? config.audioBufferKiB * 1024 : 0;
  const internalNeed =
    runtimeBytes + config.reserveRamKiB * 1024 + audioRam + 0 + (work.terrainCacheBytes ? 8192 : 0);
  const ramBytes =
    internalNeed + drawBytes + scanoutBytes + decodeBytes + work.terrainCacheBytes + 0;
  const ramBudget = (config.ramKiB + config.externalRamKiB) * 1024;
  const graphicsBytes = work.imageBytes + work.mapBytes + work.tableBytes + 0;
  const nvmBytes =
    graphicsBytes +
    config.reserveNvmKiB * 1024 +
    (config.audioStorage === 'internal' ? work.audioBytes : 0);
  const nvmBudget = (config.nvmKiB + config.externalFlashKiB) * 1024;
  const effectiveRedrawFps = Math.max(config.fps * (config.redrawPercent / 100), 0);
  const transferMbps = (frameBytes * effectiveRedrawFps * 8) / 1e6;
  const repaintMPixels = (work.coverage * config.fps * (config.redrawPercent / 100)) / 1e6;
  const alerts: Guidance[] = [];
  const add = (
    id: string,
    level: Guidance['level'],
    title: string,
    detail: string,
    suggestion: string,
    source?: string,
  ) => alerts.push({ id, level, title, detail, suggestion, source });
  // OS targets keep engine validation, but never receive routine MCU resource/CPU advice.
  const active = configured && config.enabled && family.kind === 'mcu';
  if (active) {
    if (p.board === 'stm32h7s78-dk' && p.rendering?.compositor === 'neochrom')
      add(
        'terrain-cache-policy',
        'info',
        'Terrain caching is opt-in on the DK',
        'Matched village benchmarks found the PSRAM terrain cache slower. The default board build reserves no terrain pixel cache.',
        'Profile your own scene before enabling --terrain-cache-kib 2048. Include that external RAM plus up to 8 KiB of metadata in manual port budgets; project estimates do not infer command-line overrides.',
      );
    if (work.terrainCacheBytes)
      add(
        'terrain-cache',
        'info',
        'Terrain cache uses bounded external RAM',
        'The default DK build leaves the optional PSRAM cache disabled after matched hardware runs measured it slower. Custom cache reservations must be included in the port RAM budget.',
        'The board build accepts --terrain-cache-kib 0 to disable caching. Smaller budgets fall back to individual tiles when full; animation, alpha and source resolution are preserved. Generic ports allocate no cache unless supplied by the application.',
      );
    if (work.prefabSlots)
      add(
        'prefab-pools',
        'info',
        'Reserved prefab copies use memory before spawning',
        `${work.prefabSlots} peak reserved copies. Widget RAM, flash tables and potential drawing/collision work include all slots, even when initially inactive.`,
        'Reserve the maximum simultaneous live copies you need. Reuse slots with despawn; reduce capacity or split a level into scenes when its budget is tight.',
      );
    const check = (id: string, used: number, limit: number, label: string, suggestion: string) => {
      if (used > limit)
        add(
          id,
          'attention',
          `${label} exceeds the planned budget`,
          `${formatBytes(used)} planned / ${formatBytes(limit)} available. Estimates are not linker measurements.`,
          suggestion,
        );
      else if (limit > 0 && used > limit * 0.8)
        add(
          id,
          'warning',
          `${label} has little headroom`,
          `${Math.round((used / limit) * 100)}% of the planned budget is occupied.`,
          suggestion,
        );
    };
    check(
      'ram',
      ramBytes,
      ramBudget,
      'RAM',
      'Use fewer/shorter partial draw buffers or RGB565. External PSRAM/SDRAM or a larger-RAM MCU may be appropriate; verify DMA access, cache and bandwidth.',
    );
    if (config.externalRamKiB && internalNeed > config.ramKiB * 1024)
      add(
        'internal-ram',
        'attention',
        'Internal RAM is still under pressure',
        `${formatBytes(internalNeed)} is reserved for engine/widgets, audio and your system before external draw/decode buffers.`,
        'External RAM does not replace all internal/DMA/stack allocations. Increase internal RAM or reduce reservations and live widgets.',
      );
    check(
      'nvm',
      nvmBytes,
      nvmBudget,
      'Code / graphics storage',
      'Reduce sprite variants or use a larger-flash MCU / external memory-mapped flash. Generated C image arrays need linker placement; an SD card alone does not relocate them.',
    );
    if (config.nvmKiB === 0 && config.externalFlashKiB === 0)
      add(
        'boot-flash',
        'attention',
        'Confirm external boot/code flash',
        `${family.reference} has no code NVM assumed by this profile. Module/package flash is not included.`,
        'Enter the flash actually populated on your board. This only sets a planning budget; your firmware still configures boot/XIP/linker placement.',
        family.source,
      );
    if (work.audioBytes) {
      const limit =
        config.audioStorage === 'sd'
          ? config.sdMiB * 1024 * 1024
          : config.audioStorage === 'external-flash'
            ? config.externalFlashKiB * 1024
            : nvmBudget;
      if (config.audioStorage !== 'internal' && work.audioBytes > limit)
        add(
          'audio-storage',
          'attention',
          'Audio exceeds the selected storage',
          `${formatBytes(work.audioBytes)} of WAV files / ${formatBytes(limit)} in the selected ${config.audioStorage} budget.`,
          'Add SD/eMMC or external flash capacity, or shorten/downsample WAVs. Copy assets and stream through the existing audio hardware backend.',
        );
      if (
        config.audioStorage === 'internal' &&
        work.audioBytes > Math.max(256 * 1024, nvmBudget * 0.25)
      )
        add(
          'audio-stream',
          'warning',
          'External audio storage is suggested',
          `${formatBytes(work.audioBytes)} of PCM WAV assets consume code/graphics storage.`,
          'Consider an SD card or external flash and stream WAVs through your audio backend. Storage capacity does not add working RAM.',
        );
      if (config.audioStorage === 'external-flash' && nvmBytes + work.audioBytes > nvmBudget)
        add(
          'shared-flash',
          'attention',
          'External flash is shared with code/assets',
          `${formatBytes(nvmBytes + work.audioBytes)} combined planned occupancy / ${formatBytes(nvmBudget)} total NVM.`,
          'Budget code, images and external WAV files together; a second allocation cannot reuse the same flash capacity.',
        );
    }
    if (config.displayMbps > 0 && transferMbps > config.displayMbps * 0.8)
      add(
        'display-link',
        transferMbps > config.displayMbps ? 'attention' : 'warning',
        'Display transfer bandwidth is tight',
        `${transferMbps.toFixed(1)} Mbit/s required at ${config.fps} FPS and ${config.redrawPercent}% redraw / ${config.displayMbps} Mbit/s effective payload budget.${''}`,
        'Reduce redraw area, resolution, color depth or FPS, or use a faster display link. A GPU cannot fix a saturated SPI/display bus.',
      );
    if (config.displayMbps === 0 && transferMbps > 40)
      add(
        'display-unknown',
        'info',
        'Check your display link',
        `A full planned redraw needs ${transferMbps.toFixed(1)} Mbit/s before protocol overhead. Effective payload throughput is unspecified.`,
        'Enter measured payload throughput, rather than raw SPI clock. Partial invalidation can reduce traffic.',
      );
    const ported = (feature: TargetConfig['acceleration'][number]) =>
      config.acceleration.includes(feature) && (family.id === 'generic' || !!family[feature]);
    const generalGraphics =
      ported('graphics') && (family.id === 'generic' || family.graphicsScope === 'general-2d');
    const drawDma = ported('dma2d') && (family.id === 'generic' || family.dma2dScope === 'draw');
    if (
      (repaintMPixels > 16 || work.blendPixels * config.fps > 4e6) &&
      !ported('graphics') &&
      !drawDma
    )
      add(
        'draw-load',
        'warning',
        'Consider 2D rendering acceleration',
        `${repaintMPixels.toFixed(1)} million covered pixels/s in the planned redraw; large alpha artwork or layered coverage can increase cost. This is a workload indicator, not a CPU benchmark.`,
        family.graphics || family.dma2d
          ? `Your reference advertises ${family.graphics ?? family.dma2d}. Confirm a compatible LVGL draw unit is enabled, plus DMA-visible memory and supported formats.`
          : 'Consider a DMA2D/Chrom-ART MCU for supported fills/blends, or a 2D GPU for suitable graphics. First reduce overdraw and alpha coverage.',
        guidanceSources.draw,
      );
    if (work.roundedPixels * config.fps > 4e6 && !generalGraphics && !ported('helium'))
      add(
        'rounded-shapes',
        'warning',
        'Large rounded shapes may need software rendering',
        `${((work.roundedPixels * config.fps) / 1e6).toFixed(1)} million bounding-box pixels/s for rounded rectangles/buttons before invalidation. This is a conservative workload indicator.`,
        'Reduce rounded coverage or use a supported GPU / optimized software renderer. STM32 DMA2D does not generally accelerate rounded corners; confirm supported draw operations on your port.',
        guidanceSources.dma2d,
      );
    if (work.animatedPixelsPerSecond > p.width * p.height * 6)
      add(
        'animated-tiles',
        'warning',
        'Animated tiles increase display traffic',
        `${(work.animatedPixelsPerSecond / 1e6).toFixed(1)} million animated tile pixels/s in the largest layer before clipping. Party battles reserve a 4 KiB context/stack allowance plus temporary LVGL menu widgets.`,
        'Animate fewer cells, lower tile FPS or downscale artwork. Frames share bank indices; terrain edges are resolved offline.',
      );
    if (work.mapVisitedCells > 8192)
      add(
        'map-traversal',
        'warning',
        'Large tilemap layers add traversal work',
        `${work.mapVisitedCells.toLocaleString()} potentially visible cells across the largest scene, including one edge tile per axis. Drawing visits only the dirty window; sparse flash checkpoints bound compressed seeks.`,
        'Use larger tiles, fewer overlapping layers or a smaller output viewport. Compression saves flash; GPU drawing still needs CPU task submission. Profile before adding a RAM map cache.',
      );
    const softwareFloat = /\bCortex-M(?:0\+?|3)\b(?!\d)/i.test(family.core);
    if (softwareFloat && (work.simulationBodies > 8 || work.projectileSlots >= 16 || undefined))
      add(
        'software-float',
        'warning',
        'Budget software floating-point simulation',
        `${family.core} has no hardware FPU. The portable float solver still builds with the matching soft-float ABI, but physics and game logic consume CPU time.`,
        'Reduce active bodies, bullet counts and animated objects; use lower render resolution/FPS while retaining fixed-step simulation. For heavier scenes consider an MCU with an enabled FPU. DMA/GPU does not accelerate scalar physics.',
        family.source,
      );
    if ((config.externalRamKiB || config.externalFlashKiB) && repaintMPixels > 16)
      add(
        'external-memory-traffic',
        'warning',
        'External memory bandwidth and cache policy matter',
        `${repaintMPixels.toFixed(1)} million covered pixels/s can compete with texture reads, display scanout and DMA. Available bytes alone do not establish bandwidth.`,
        'Measure bus stalls and render/flush times. Keep DMA/GPU buffers in accessible memory, align cache maintenance to the port’s cache lines, and clean/invalidate at ownership handoff. Avoid disabling all CPU caches or adding a full-frame cache without measuring RAM and copy costs.',
        family.id.startsWith('stm32')
          ? 'https://www.st.com/resource/en/application_note/an4839-level-1-cache-on-stm32f7-series-and-stm32h7-series-stmicroelectronics.pdf'
          : guidanceSources.draw,
      );
    if (config.effects.includes('transforms') && !generalGraphics)
      add(
        'transforms',
        'warning',
        'Planned runtime transforms need a rendering budget',
        'Rotation/scaling effects declared for custom C may need temporary images and extra sampling. Built-in sprite sizing is prebaked and is not counted as a runtime transform.',
        'Consider a supported 2D GPU, or prebake frames. STM32 DMA2D does not generally accelerate rotation, arbitrary scaling or rounded shapes. PPA/PxP have operation/angle restrictions; confirm your exact effect instead of assuming general GPU support.',
        guidanceSources.dma2d,
      );
    if (
      (config.effects.includes('blur') || config.effects.includes('vector-dsp')) &&
      !ported('helium') &&
      !ported('simd')
    )
      add(
        'vector',
        'warning',
        'Consider Helium / SIMD for custom pixel processing',
        'Declared blur/filter/DSP work may be CPU-intensive; no custom C analysis or timing benchmark is performed.',
        family.helium || family.simd
          ? `This reference advertises ${family.helium ? 'Arm Helium' : family.simd}. Compile optimized routines and confirm the LVGL/toolchain integration; merely selecting the MCU does not enable them.`
          : 'Consider Cortex-M55/M85 with Helium (for example STM32N6, RA8D1 or Apollo510), or an appropriate SIMD/GPU implementation. DMA2D is not a general blur/filter engine.',
        guidanceSources.helium,
      );
    for (const feature of config.acceleration)
      if (family.id !== 'generic' && !family[feature])
        add(
          `unconfirmed-${feature}`,
          'warning',
          'An enabled accelerator is not confirmed by this reference',
          `${feature} is selected in your port assumptions, but is absent from this reference profile.`,
          'Check the exact variant and its LVGL integration. Unsupported assumptions are not credited.',
        );
    if (decodeBytes > Math.max(64 * 1024, ramBudget * 0.25))
      add(
        'decode',
        'warning',
        'A decoded image may dominate RAM',
        `${formatBytes(decodeBytes)} is allowed for one largest exported image variant, independently of its packed flash size.`,
        'Use smaller sprites/tilemaps or a verified scanline decoder/cache policy. Selecting scanline only changes this estimate; confirm the actual LVGL decoder supports the asset/format.',
      );
    if (work.projectileDemand > work.projectileSlots)
      add(
        'projectile-overflow',
        'attention',
        'Bullet patterns can fill the scene pool',
        `${work.projectileDemand} estimated live shots exceed ${work.projectileSlots} slots before collisions. New shots will be dropped.`,
        'Reduce burst count/lifetime/rate, stagger emitters, or raise the pool limit up to 64.',
      );
    if (work.projectilePairs > 1024 || work.platforms > 8)
      add(
        'gameplay-cpu',
        'warning',
        'Budget projectile and platform collision work',
        `${work.projectilePairs} possible swept projectile/body tests per 60 Hz step; ${work.platforms} moving platforms also preflight passengers.`,
        'Use fewer active emitters, smaller pools and precise collision masks. Profile on the MCU; DMA2D/GPU accelerates drawing, not these gameplay tests.',
      );
    if (work.collisionPairs > 4096)
      add(
        'physics',
        'warning',
        'Dense collision checks may dominate the CPU',
        `${work.collisionPairs.toLocaleString()} rough body/cell pairs before the engine’s movement sampling and masks.`,
        'Reduce active characters/areas and solid-cell density, split scenes, and profile the fixed 60 Hz solver. A graphics GPU does not accelerate this C physics solver.',
      );
    if (work.audioBytesPerSecond > 768000)
      add(
        'audio-mix',
        'warning',
        'Plan for simultaneous PCM audio traffic',
        `${formatBytes(work.audioBytesPerSecond)}/s if the eight highest-rate cues overlap (a worst-case assumption).`,
        'Use fewer voices, mono/lower sample rates, and DMA-backed I2S/DAC streaming. Mixer buffers and CPU load belong to the hardware audio backend.',
      );
  }
  return {
    catalogDate,
    catalogVersion,
    configured,
    active,
    family,
    config,
    work,
    width: p.width,
    height: p.height,
    colorDepth: p.colorDepth,
    frameBytes,
    drawBytes,
    scanoutBytes,
    runtimeBytes,
    nodeCapacity,
    decodeBytes,
    audioRam,
    internalNeed,
    effectiveRedrawFps,
    ramBytes,
    ramBudget,
    graphicsBytes,
    nvmBytes,
    nvmBudget,
    transferMbps,
    repaintMPixels,
    alerts: alerts.sort(
      (a, b) =>
        ({ attention: 0, warning: 1, info: 2 })[a.level] -
        { attention: 0, warning: 1, info: 2 }[b.level],
    ),
  };
}
export type TargetReport = ReturnType<typeof analyzeTarget>;
