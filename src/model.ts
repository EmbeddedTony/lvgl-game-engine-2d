import { validInputs, type InputConfig } from './input/model';
import type { Melee } from './action2d/model';
import { validTileAnimation, type TileAnimation } from './tiles/animation';
import type { Terrain } from './tiles/terrain';
import type { Emitter } from './gameplay/toolkit';
import { gameplayIssues, type Gameplay, type EventPage, type Animator } from './gameplay/model';
import { validCamera2D, cameraReferenceValid, type Camera2D } from './camera2d';
import { validRendering, type RenderingConfig } from './rendering/config';
import { flowIssues, validFlow } from './flow';
import { resolveScene, sceneGraphIssues } from './scenes';
import { validNodePhysics, type Physics } from './physics';
import { projectImages, MAX_PROJECT_TILES } from './tile-assets';
import { pixelPerfectEnabled, spritePixelScale } from './pixel-perfect';
import { validTarget, type TargetConfig } from './targets/model';
export type NodeKind =
  'rect' | 'sprite' | 'label' | 'button' | 'tilemap' | 'group' | 'instance' | 'area';
export type SceneOverride = Partial<
  Pick<GameNode, 'x' | 'y' | 'text' | 'color' | 'visible' | 'speed' | 'cue' | 'stateBindings'>
>;
export type Bus = 'sfx' | 'music' | 'ui';
export interface TileMap {
  tileSize: number;
  columns: number;
  rows: number;
  tiles: string[];
  cells: number[];
  solidTiles: number[];
  slopes?: Record<number, 'up' | 'down'>;
  animations?: Record<number, TileAnimation>;
  terrains?: Record<string, Record<number, number>>;
  tileset?: string; /* Editor resource selection; firmware uses the tile bank. */
}
export interface TilesetTile {
  id: string;
  name: string;
  pixels: number[];
  solid: boolean;
  slope?: 'up' | 'down';
  animation?: TileAnimation;
}
export interface TilesetAsset {
  id: string;
  name: string;
  tileSize: number;
  columns: number;
  rows: number;
  /** Atlas coordinates retain empty/omitted cells; repeated IDs share pixels. */
  cells: string[];
  tiles: TilesetTile[];
  terrains?: Terrain[];
}
export interface GameNode {
  id: string;
  name: string;
  kind: NodeKind;
  layer: 'world' | 'ui';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  radius: number;
  text: string;
  asset: string;
  visible: boolean;
  solid: boolean;
  player: boolean;
  collectible: boolean;
  speed: number;
  physics?: Physics;
  emitter?: Emitter;
  melee?: Melee;
  inputAction?: 'left' | 'right' | 'up' | 'down' | 'action' | 'interact' | 'menu';
  events?: EventPage[];
  animator?: Animator;
  zIndex?: number;
  sortY?: boolean;
  stateBindings?: Record<string, string>;
  tilemap?: TileMap;
  binding: 'none' | 'score' | 'status';
  cue: string;
  /** Stable ID of an authored parent in this scene; absent means scene root. */
  parent?: string;
  /** Source scene for an instance. Its children remain linked to that source. */
  scene?: string;
  overrides?: Record<string, SceneOverride>;
  /** Reserved linked instance. Starts inactive; acquire through the prefab spawn API. */
  spawnable?: boolean;
}
export interface SpriteAsset {
  id: string;
  name: string;
  width: number;
  height: number;
  pixels: number[];
}
export interface AudioCue {
  id: string;
  name: string;
  file: string;
  data: string;
  sampleRate: number;
  channels: number;
  duration: number;
  bus: Bus;
  gain: number;
  loop: boolean;
  priority: number;
}
export interface Scene {
  id: string;
  name: string;
  folder?: string;
  /** A reusable 2D object source, edited with the same scene tools. */
  prefab?: boolean;
  background: string;
  objective: string;
  completion: string;
  music: string;
  nodes: GameNode[];
  camera2d?: Camera2D;
  /** Hide mapped controller buttons without changing authored layout. Legacy buttons default on. */
  touchControls?: boolean;
}
export interface Project {
  inputs?: InputConfig;
  board?: 'stm32h7s78-dk';
  version: 1;
  id?: string;
  name: string;
  width: number;
  height: number;
  colorDepth: 16 | 32;
  /** Defaults to true for v1 projects. Integer display scaling; nearest sampling. */
  pixelPerfect?: boolean;
  /** Omitted means 2D, preserving existing projects. */
  dimension?: '2d';
  target?: TargetConfig;
  rendering?: RenderingConfig;
  scenes: Scene[];
  sprites: SpriteAsset[];
  tilesets?: TilesetAsset[];
  audio: AudioCue[];
  code: string;
  flow?: GameFlow;
  gameplay?: Gameplay;
}
export interface SceneFolder {
  id: string;
  name: string;
}
export interface SequenceStep {
  id: string;
  scene: string;
  advance: 'manual' | 'complete' | 'click';
  button?: string;
}
export interface GameSequence {
  id: string;
  name: string;
  steps: SequenceStep[];
  end: 'hold' | 'loop' | 'scene';
  endScene?: string;
}
export interface GameFlow {
  folders: SceneFolder[];
  sequences: GameSequence[];
  entry: {
    kind: 'scene' | 'sequence';
    id: string;
  };
}
export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
export const makeNode = (kind: NodeKind, changes: Partial<GameNode> = {}): GameNode => ({
  id: uid(kind),
  name: {
    rect: 'Rectangle',
    sprite: 'Sprite',
    label: 'Label',
    button: 'Button',
    tilemap: 'Tilemap',
    group: 'Group',
    instance: 'Scene instance',
    area: 'Detection area',
  }[kind],
  kind,
  layer: kind === 'label' || kind === 'button' ? 'ui' : 'world',
  x: 32,
  y: 64,
  width: kind === 'label' ? 160 : kind === 'button' ? 96 : 32,
  height: kind === 'label' ? 20 : 32,
  color: '#81d5ac',
  radius: kind === 'button' ? 4 : 0,
  text: kind === 'button' ? 'Continue' : kind === 'label' ? 'Hello, world' : '',
  asset: '',
  visible: true,
  solid: false,
  player: false,
  collectible: false,
  speed: 72,
  binding: 'none',
  cue: '',
  ...changes,
});
export interface Issue {
  severity: 'error' | 'warning';
  message: string;
}
export function validate(p: Project): Issue[] {
  const graph = sceneGraphIssues(p);
  if (graph.length) return graph;
  const issues: Issue[] = gameplayIssues(p).map((message) => ({ severity: 'error', message }));
  if (p.inputs && !validInputs(p.inputs))
    issues.push({
      severity: 'error',
      message: 'Invalid physical input channels, calibration or packet layout.',
    });
  if (p.inputs?.hardware && p.board !== 'stm32h7s78-dk')
    issues.push({
      severity: 'warning',
      message:
        'The DK pin driver is generated only for STM32H7S78-DK. Generic exports retain the typed input API and require their own acquisition driver.',
    });
  if (
    p.board === 'stm32h7s78-dk' &&
    (p.width !== 800 ||
      p.height !== 480 ||
      p.colorDepth !== 16 ||
      p.rendering?.compositor !== 'neochrom' ||
      p.rendering?.stm32Hal !== 'stm32h7rsxx_hal.h' ||
      p.rendering?.helium)
  )
    issues.push({
      severity: 'error',
      message:
        'STM32H7S78-DK: reapply Configure board & display in Target guidance, or choose Use generic export.',
    });
  for (const scene of p.scenes);
  const images = new Map(projectImages(p).map((a) => [a.id, a]));
  for (const scene of p.scenes) {
    const nodes = resolveScene(p, scene).map((n) => ({
      ...n,
      x: n.worldX,
      y: n.worldY,
      visible: n.effectiveVisible,
    }));
    if (!cameraReferenceValid(scene, nodes))
      issues.push({
        severity: 'error',
        message: `${scene.name}: camera must follow an existing world object.`,
      });
    if (scene.nodes.length > 128)
      issues.push({ severity: 'error', message: `${scene.name}: maximum 128 objects.` });
    if (nodes.filter((n) => n.player).length > 1)
      issues.push({
        severity: 'warning',
        message: `${scene.name}: input controls every player object.`,
      });
    for (const n of nodes) {
      if (!validNodePhysics(n))
        issues.push({ severity: 'error', message: `${n.name}: invalid physics component.` });
      if (
        !['tilemap', 'group', 'instance'].includes(n.kind) &&
        (n.x < 0 ||
          n.y < 0 ||
          n.x + n.width >
            (n.layer === 'world' ? (scene.camera2d?.worldWidth ?? p.width) : p.width) ||
          n.y + n.height >
            (n.layer === 'world' ? (scene.camera2d?.worldHeight ?? p.height) : p.height))
      )
        issues.push({
          severity: 'warning',
          message: `${scene.name} / ${n.name} extends outside the display.`,
        });
      if (n.tilemap && n.tilemap.tiles.some((id) => !images.has(id)))
        issues.push({ severity: 'error', message: `${n.name}: missing tile asset.` });
      if (n.kind === 'sprite' && !images.has(n.asset))
        issues.push({ severity: 'error', message: `${n.name}: select a sprite asset.` });
      if (pixelPerfectEnabled(p)) {
        const source = n.kind === 'sprite' ? images.get(n.asset) : undefined;
        if (source && spritePixelScale(source, n) === null)
          issues.push({
            severity: 'warning',
            message: `${scene.name} / ${n.name}: ${n.width} × ${n.height} resamples ${source.width} × ${source.height} artwork. Choose a whole sprite scale in Inspector for even pixels.`,
          });
        if (
          n.tilemap &&
          n.tilemap.tiles.some((id) => {
            const tile = images.get(id);
            return (
              tile &&
              spritePixelScale(tile, {
                width: n.tilemap!.tileSize,
                height: n.tilemap!.tileSize,
              }) === null
            );
          })
        )
          issues.push({
            severity: 'warning',
            message: `${scene.name} / ${n.name}: tile size resamples source artwork. Use matching tile sizes for even pixels.`,
          });
      }
      if (n.cue && !p.audio.some((a) => a.id === n.cue))
        issues.push({ severity: 'error', message: `${n.name}: missing audio cue.` });
      if (
        n.inputAction &&
        (!['left', 'right', 'up', 'down', 'action', 'interact', 'menu'].includes(n.inputAction) ||
          n.kind !== 'button' ||
          n.layer !== 'ui')
      )
        issues.push({
          severity: 'error',
          message: `${n.name}: controller input requires a UI button.`,
        });
      if (n.player && (n.solid || n.collectible))
        issues.push({
          severity: 'error',
          message: `${n.name}: a player cannot also be a solid or collectible.`,
        });
      if (n.solid && n.collectible)
        issues.push({
          severity: 'error',
          message: `${n.name}: a collectible must be reachable, not solid.`,
        });
    }
    if (scene.music && !p.audio.some((a) => a.id === scene.music))
      issues.push({ severity: 'error', message: `${scene.name}: missing music cue.` });
  }
  return [...issues, ...flowIssues(p)];
}
export function parseProject(json: string): Project {
  if (json.length > 24 * 1024 * 1024) throw new Error('Project exceeds the 24 MB import limit.');
  const p = JSON.parse(json);
  const fail = () => {
    throw new Error(
      'Invalid .lge.json project. Expected version 1 with valid scenes, assets, and display settings.',
    );
  };
  const str = (s: unknown, limit = 4096) =>
    typeof s === 'string' && s.length <= limit && !s.includes('\0');
  const num = (n: unknown, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  const int = (n: unknown, min: number, max: number) => num(n, min, max) && Number.isInteger(n);
  const color = (s: unknown) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  const id = (s: unknown) => typeof s === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(s);
  const unique = (
    items: {
      id: string;
    }[],
  ) => new Set(items.map((i) => i.id)).size === items.length;
  if (
    !p ||
    p.version !== 1 ||
    (p.id !== undefined && !id(p.id)) ||
    !str(p.name, 128) ||
    (p.board !== undefined && p.board !== 'stm32h7s78-dk') ||
    !int(p.width, 16, 2048) ||
    !int(p.height, 16, 2048) ||
    ![16, 32].includes(p.colorDepth) ||
    (p.dimension !== undefined && !['2d'].includes(p.dimension)) ||
    (p.pixelPerfect !== undefined && typeof p.pixelPerfect !== 'boolean') ||
    (p.target !== undefined && !validTarget(p.target)) ||
    (p.rendering !== undefined && !validRendering(p.rendering)) ||
    (p.inputs !== undefined && !validInputs(p.inputs)) ||
    !str(p.code, 128 * 1024)
  )
    fail();
  if (
    !Array.isArray(p.scenes) ||
    !p.scenes.length ||
    p.scenes.length > 256 ||
    !Array.isArray(p.sprites) ||
    p.sprites.length > 2048 ||
    !Array.isArray(p.audio) ||
    p.audio.length > 64
  )
    fail();
  for (const a of p.sprites) {
    if (
      !a ||
      !id(a.id) ||
      !str(a.name, 128) ||
      !int(a.width, 1, 512) ||
      !int(a.height, 1, 512) ||
      !Array.isArray(a.pixels) ||
      a.pixels.length !== a.width * a.height * 4 ||
      a.pixels.some((v: unknown) => !int(v, 0, 255))
    )
      fail();
  }
  if (p.tilesets !== undefined && (!Array.isArray(p.tilesets) || p.tilesets.length > 32)) fail();
  let tileCount = 0;
  for (const set of p.tilesets ?? []) {
    if (
      !set ||
      !id(set.id) ||
      !str(set.name, 128) ||
      !int(set.tileSize, 8, 64) ||
      !int(set.columns, 1, 256) ||
      !int(set.rows, 1, 256) ||
      set.columns * set.rows > 4096 ||
      !Array.isArray(set.cells) ||
      set.cells.length !== set.columns * set.rows ||
      !Array.isArray(set.tiles) ||
      !set.tiles.length ||
      set.tiles.length > 255
    )
      fail();
    for (const tile of set.tiles) {
      if (
        !tile ||
        !id(tile.id) ||
        !str(tile.name, 128) ||
        typeof tile.solid !== 'boolean' ||
        (tile.slope !== undefined && (!tile.solid || !['up', 'down'].includes(tile.slope))) ||
        !Array.isArray(tile.pixels) ||
        tile.pixels.length !== set.tileSize * set.tileSize * 4 ||
        tile.pixels.some((v: unknown) => !int(v, 0, 255))
      )
        fail();
    }
    const ids = new Set(set.tiles.map((t: { id: string }) => t.id));
    if (
      ids.size !== set.tiles.length ||
      set.cells.some((v: unknown) => v !== '' && !ids.has(v)) ||
      set.tiles.some(
        (t: TilesetTile) =>
          t.animation !== undefined && !validTileAnimation(t.animation, (id) => ids.has(id)),
      ) ||
      (set.terrains !== undefined &&
        (!Array.isArray(set.terrains) ||
          set.terrains.length > 16 ||
          new Set(set.terrains.map((t: Terrain) => t?.id)).size !== set.terrains.length ||
          set.terrains.some(
            (t: Terrain) =>
              !t ||
              !id(t.id) ||
              !str(t.name, 128) ||
              !t.variants ||
              typeof t.variants !== 'object' ||
              Array.isArray(t.variants) ||
              !Object.keys(t.variants).length ||
              Object.entries(t.variants).some(
                ([mask, tile]) =>
                  !int(Number(mask), 0, 255) || String(Number(mask)) !== mask || !ids.has(tile),
              ),
          )))
    )
      fail();
    tileCount += set.tiles.length;
  }
  if (
    tileCount > MAX_PROJECT_TILES ||
    (p.tilesets && !unique(p.tilesets)) ||
    !unique(projectImages(p))
  )
    fail();
  for (const a of p.audio) {
    if (
      !a ||
      !id(a.id) ||
      !str(a.name, 128) ||
      !str(a.file, 128) ||
      !/^[a-zA-Z0-9_.-]+\.wav$/i.test(a.file) ||
      !str(a.data, 4 * 1024 * 1024) ||
      !/^[a-zA-Z0-9+/]*={0,2}$/.test(a.data) ||
      !int(a.sampleRate, 8000, 96000) ||
      ![1, 2].includes(a.channels) ||
      !num(a.duration, 0, 600) ||
      !['sfx', 'music', 'ui'].includes(a.bus) ||
      !num(a.gain, 0, 1) ||
      typeof a.loop !== 'boolean' ||
      !int(a.priority, 0, 255)
    )
      fail();
  }
  for (const s of p.scenes) {
    if (
      !s ||
      !id(s.id) ||
      !str(s.name, 128) ||
      !color(s.background) ||
      !str(s.objective) ||
      !str(s.completion) ||
      !str(s.music, 64) ||
      !Array.isArray(s.nodes) ||
      s.nodes.length > 128
    )
      fail();
    if (s.camera2d !== undefined && !validCamera2D(s.camera2d)) fail();
    if (s.touchControls !== undefined && typeof s.touchControls !== 'boolean') fail();
    if ('world3d' in s) throw new Error('This edition accepts 2D scenes only.');
    if (s.prefab !== undefined && typeof s.prefab !== 'boolean') fail();
    for (const n of s.nodes) {
      if (
        !n ||
        !id(n.id) ||
        !str(n.name, 128) ||
        !['rect', 'sprite', 'label', 'button', 'tilemap', 'group', 'instance', 'area'].includes(
          n.kind,
        ) ||
        (n.parent !== undefined && !id(n.parent)) ||
        (n.scene !== undefined && !id(n.scene)) ||
        !['world', 'ui'].includes(n.layer) ||
        !num(n.x, -4096, 4096) ||
        !num(n.y, -4096, 4096) ||
        !int(n.width, 1, 4096) ||
        !int(n.height, 1, 4096) ||
        !color(n.color) ||
        !int(n.radius, 0, 128) ||
        !str(n.text) ||
        !str(n.asset, 64) ||
        !str(n.cue, 64) ||
        !num(n.speed, 0, 600) ||
        !['none', 'score', 'status'].includes(n.binding) ||
        ['visible', 'solid', 'player', 'collectible'].some((k) => typeof n[k] !== 'boolean')
      )
        fail();
      if (
        n.inputAction !== undefined &&
        (!['left', 'right', 'up', 'down', 'action', 'interact', 'menu'].includes(n.inputAction) ||
          n.kind !== 'button' ||
          n.layer !== 'ui')
      )
        fail();
      if (
        !validNodePhysics(n) ||
        (n.zIndex !== undefined && !int(n.zIndex, -128, 127)) ||
        (n.sortY !== undefined && typeof n.sortY !== 'boolean')
      )
        fail();
      if (
        (n.kind === 'group' || n.kind === 'instance') &&
        (n.solid || n.collectible || n.player || n.tilemap)
      )
        fail();
      if (n.kind === 'instance' ? !id(n.scene) : n.scene !== undefined || n.overrides !== undefined)
        fail();
      if (n.spawnable !== undefined && (typeof n.spawnable !== 'boolean' || n.kind !== 'instance'))
        fail();
      if (n.overrides !== undefined) {
        if (
          !n.overrides ||
          typeof n.overrides !== 'object' ||
          Array.isArray(n.overrides) ||
          Object.keys(n.overrides).length > 128
        )
          fail();
        for (const [path, value] of Object.entries(n.overrides)) {
          if (
            path.length > 1024 ||
            !path.split('/').every(id) ||
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value)
          )
            fail();
          for (const [key, v] of Object.entries(value as object)) {
            if (key === 'x' || key === 'y') {
              if (!num(v, -4096, 4096)) fail();
            } else if (key === 'speed') {
              if (!num(v, 0, 600)) fail();
            } else if (key === 'visible') {
              if (typeof v !== 'boolean') fail();
            } else if (key === 'color') {
              if (!color(v)) fail();
            } else if (key === 'text') {
              if (!str(v)) fail();
            } else if (key === 'stateBindings') {
              if (
                !v ||
                typeof v !== 'object' ||
                Array.isArray(v) ||
                Object.keys(v).length > 16 ||
                Object.entries(v).some(([from, to]) => !id(from) || !id(to))
              )
                fail();
            } else if (key === 'cue') {
              if (!str(v, 64)) fail();
            } else fail();
          }
        }
      }
      if (n.kind === 'tilemap') {
        const t = n.tilemap;
        if (
          !t ||
          !int(t.tileSize, 8, 64) ||
          !int(t.columns, 1, 128) ||
          !int(t.rows, 1, 128) ||
          t.columns * t.rows > 16384 ||
          !Array.isArray(t.tiles) ||
          t.tiles.length > 255 ||
          (t.tileset !== undefined &&
            !(p.tilesets ?? []).some((set: TilesetAsset) => set.id === t.tileset)) ||
          !t.tiles.every(id) ||
          !Array.isArray(t.cells) ||
          t.cells.length !== t.columns * t.rows ||
          !t.cells.every((c: unknown) => int(c, 0, t.tiles.length)) ||
          !Array.isArray(t.solidTiles) ||
          !t.solidTiles.every((c: unknown) => int(c, 1, t.tiles.length)) ||
          (t.slopes !== undefined &&
            (!t.slopes ||
              typeof t.slopes !== 'object' ||
              Array.isArray(t.slopes) ||
              Object.entries(t.slopes).some(
                ([v, shape]) =>
                  String(Number(v)) !== v ||
                  !int(Number(v), 1, t.tiles.length) ||
                  !t.solidTiles.includes(Number(v)) ||
                  !(typeof shape === 'string' && ['up', 'down'].includes(shape)),
              )))
        )
          fail();
        if (
          t.animations !== undefined &&
          (!t.animations ||
            typeof t.animations !== 'object' ||
            Array.isArray(t.animations) ||
            Object.entries(t.animations).some(
              ([v, a]) =>
                !int(Number(v), 1, t.tiles.length) ||
                String(Number(v)) !== v ||
                !validTileAnimation(a, (id) =>
                  projectImages(p as Project).some((image) => image.id === id),
                ),
            ))
        )
          fail();
        if (
          t.terrains !== undefined &&
          (!t.terrains ||
            typeof t.terrains !== 'object' ||
            Array.isArray(t.terrains) ||
            Object.values(t.terrains).some(
              (group) =>
                !group ||
                typeof group !== 'object' ||
                Object.entries(group).some(
                  ([mask, v]) => !int(Number(mask), 0, 255) || !int(v, 1, t.tiles.length),
                ),
            ))
        )
          fail();
        if (n.width !== t.columns * t.tileSize || n.height !== t.rows * t.tileSize) fail();
      }
    }
    if (!unique(s.nodes)) fail();
    if (!cameraReferenceValid(s, resolveScene(p as Project, s))) fail();
  }
  if (
    !unique(p.scenes) ||
    !unique(p.sprites) ||
    !unique(p.audio) ||
    sceneGraphIssues(p).length ||
    !validFlow(p) ||
    gameplayIssues(p as Project).length
  )
    fail();
  return p as Project;
}
export function sortedNodes(scene: Scene) {
  return [
    ...scene.nodes.filter((n) => n.layer === 'world'),
    ...scene.nodes.filter((n) => n.layer === 'ui'),
  ];
}
export function projectIdentity(p: Project): string {
  if (p.id) return p.id;
  const ids = JSON.stringify(p.scenes.map((s) => [s.id, ...s.nodes.map((n) => n.id)]));
  let hash = 2166136261;
  for (let i = 0; i < ids.length; i++) hash = Math.imul(hash ^ ids.charCodeAt(i), 16777619);
  return `legacy_${(hash >>> 0).toString(16)}`;
}
