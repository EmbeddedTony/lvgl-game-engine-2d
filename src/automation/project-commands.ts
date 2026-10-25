import { addInputPreset, validInputs } from '../input/model';
import {
  makeNode,
  parseProject,
  uid,
  validate,
  type GameNode,
  type NodeKind,
  type Project,
  type Scene,
} from '../model';
import { emptyGameplay } from '../gameplay/model';
import { emptyRpg } from '../gameplay/toolkit';
import { branchIds, moveSceneNode, reparentNode, resolveScene, type TreeDrop } from '../scenes';
import { createPrefab, createPrefabPool } from '../editor/prefab-commands';
import {
  duplicateBranch,
  extractScene,
  patchSceneNode,
  unpackInstance,
} from '../editor/scene-commands';
import { makeTilemap } from '../tilesets';
import {
  AutomationError,
  object,
  safeJson,
  textParam,
  type Parameters,
  type ProjectCommand,
} from './protocol';
import { byName } from './manifest';
export const nodeKinds: NodeKind[] = [
  'rect',
  'sprite',
  'label',
  'button',
  'tilemap',
  'group',
  'instance',
  'area',
];
const nodeKeys = new Set([
  'id',
  'name',
  'kind',
  'layer',
  'x',
  'y',
  'width',
  'height',
  'color',
  'radius',
  'text',
  'asset',
  'visible',
  'solid',
  'player',
  'collectible',
  'speed',
  'binding',
  'cue',
  'physics',
  'emitter',
  'melee',
  'inputAction',
  'events',
  'animator',
  'zIndex',
  'sortY',
  'stateBindings',
  'tilemap',
  'parent',
  'scene',
  'overrides',
  'spawnable',
]);
const sceneKeys = new Set([
  'name',
  'folder',
  'background',
  'objective',
  'completion',
  'music',
  'camera2d',
  'touchControls',
  'prefab',
]);
function allowed(patch: Parameters, keys: Set<string>) {
  for (const key of Object.keys(patch))
    if (!keys.has(key))
      throw new AutomationError('INVALID_ARGUMENT', `Unsupported property: ${key}.`);
}
export function checkParameters(name: string, params: unknown): Parameters {
  const spec = byName.get(name);
  if (!spec)
    throw new AutomationError('UNKNOWN_COMMAND', `Unknown command: ${name}. Use lge commands.`);
  const p = object(params, 'params');
  safeJson(p);
  for (const key of Object.keys(p))
    if (!Object.hasOwn(spec.params, key))
      throw new AutomationError('INVALID_ARGUMENT', `Unknown parameter ${key} for ${name}.`);
  for (const [key, param] of Object.entries(spec.params)) {
    const v = p[key];
    if (v === undefined) {
      if (param.required) throw new AutomationError('INVALID_ARGUMENT', `${name} requires ${key}.`);
    } else if (
      param.type === 'array'
        ? !Array.isArray(v)
        : param.type === 'object'
          ? !v || typeof v !== 'object' || Array.isArray(v)
          : typeof v !== param.type
    )
      throw new AutomationError('INVALID_ARGUMENT', `${key} must be ${param.type}.`);
  }
  return p;
}
function sceneById(p: Project, id: string): Scene {
  const s = p.scenes.find((s) => s.id === id);
  if (!s) throw new AutomationError('NOT_FOUND', `Scene not found: ${id}.`);
  return s;
}
function requireId(id: unknown): string {
  if (typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(id))
    throw new AutomationError(
      'INVALID_ARGUMENT',
      'IDs must begin with a letter and contain up to 64 letters, digits or underscores.',
    );
  return id;
}
function resourceTable(
  p: Project,
  name: string,
  create = false,
): {
  id: string;
  [key: string]: unknown;
}[] {
  let table: unknown;
  if (['sprites', 'tilesets', 'audio'].includes(name)) {
    if (create && name === 'tilesets') p.tilesets ??= [];
    table = p[name as 'sprites'];
  } else if (['state', 'scripts', 'animations', 'patterns'].includes(name)) {
    if (create) p.gameplay ??= emptyGameplay();
    if (create && name === 'patterns') p.gameplay!.patterns ??= [];
    table = p.gameplay?.[name as 'state'];
  } else if (['items', 'skills', 'actors', 'encounters'].includes(name)) {
    if (create) {
      p.gameplay ??= emptyGameplay();
      p.gameplay.rpg ??= emptyRpg();
    }
    table = p.gameplay?.rpg?.[name as 'items'];
  } else if (['folders', 'sequences'].includes(name)) {
    if (create)
      p.flow ??= { folders: [], sequences: [], entry: { kind: 'scene', id: p.scenes[0].id } };
    table = p.flow?.[name as 'folders'];
  } else throw new AutomationError('INVALID_ARGUMENT', `Unknown resource table: ${name}.`);
  return (table ?? []) as {
    id: string;
    [key: string]: unknown;
  }[];
}
function compact(value: Record<string, unknown>) {
  const { pixels, tilemap, nodes, frames, layers, tiles, cells, actions, ...rest } = value;
  return {
    ...rest,
    ...(pixels ? { pixelBytes: (pixels as number[]).length } : {}),
    ...(nodes ? { nodeCount: (nodes as unknown[]).length } : {}),
    ...(tiles ? { tileCount: (tiles as unknown[]).length } : {}),
    ...(cells ? { cellCount: (cells as unknown[]).length } : {}),
    ...(actions ? { actionCount: (actions as unknown[]).length } : {}),
    ...(frames ? { frameCount: (frames as unknown[]).length } : {}),
    ...(layers ? { layerCount: (layers as unknown[]).length } : {}),
    ...(tilemap
      ? {
          tilemap: {
            tileSize: (tilemap as GameNode['tilemap'])!.tileSize,
            columns: (tilemap as GameNode['tilemap'])!.columns,
            rows: (tilemap as GameNode['tilemap'])!.rows,
          },
        }
      : {}),
  };
}
export function summary(p: Project) {
  return {
    id: p.id,
    name: p.name,
    dimension: p.dimension ?? '2d',
    display: {
      width: p.width,
      height: p.height,
      colorDepth: p.colorDepth,
      pixelPerfect: p.pixelPerfect !== false,
    },
    board: p.board ?? null,
    target: p.target ?? null,
    scenes: p.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      folder: s.folder,
      prefab: !!s.prefab,
      nodes: s.nodes.length,
      expandedNodes: resolveScene(p, s).length,
    })),
    resources: Object.fromEntries(
      [
        'sprites',
        'tilesets',
        'audio',
        'state',
        'scripts',
        'animations',
        'patterns',
        'items',
        'skills',
        'actors',
        'encounters',
        'folders',
        'sequences',
      ].map((n) => [n, resourceTable(p, n).length]),
    ),
    codeBytes: p.code.length,
  };
}
function pointerParts(path: string) {
  if (path === '') return [];
  if (!path.startsWith('/') || /~(?:[^01]|$)/.test(path))
    throw new AutomationError(
      'INVALID_ARGUMENT',
      'Use an RFC 6901 JSON Pointer, e.g. /scenes/0/camera2d.',
    );
  const parts = path
    .slice(1)
    .split('/')
    .map((x) => x.replace(/~1/g, '/').replace(/~0/g, '~'));
  safeJson(Object.fromEntries(parts.map((k) => [k, 0])));
  return parts;
}
function keyFor(parent: unknown, key: string, append = false): string | number {
  if (Array.isArray(parent)) {
    if (append && key === '-') return parent.length;
    if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) > parent.length)
      throw new AutomationError('INVALID_ARGUMENT', `Invalid array index: ${key}.`);
    return Number(key);
  }
  return key;
}
export function readPointer(root: unknown, path = ''): unknown {
  let value = root;
  for (const part of pointerParts(path)) {
    if (!value || typeof value !== 'object')
      throw new AutomationError('NOT_FOUND', `Pointer not found: ${path}.`);
    const key = keyFor(value, part);
    if (!Object.hasOwn(value, key))
      throw new AutomationError('NOT_FOUND', `Pointer not found: ${path}.`);
    value = (value as Record<string | number, unknown>)[key];
  }
  return value;
}
function equalJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a),
    right = b as Record<string, unknown>;
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) && equalJson((a as Record<string, unknown>)[key], right[key]),
    )
  );
}
function patchProject(p: Project, operations: unknown[]) {
  if (operations.length > 1024)
    throw new AutomationError('INVALID_ARGUMENT', 'Maximum 1024 patch operations.');
  for (const item of operations) {
    const op = object(item, 'operation');
    allowed(op, new Set(['op', 'path', 'value']));
    const path = textParam(op, 'path'),
      parts = pointerParts(path);
    if (!['add', 'replace', 'remove', 'test'].includes(String(op.op)))
      throw new AutomationError(
        'INVALID_ARGUMENT',
        'Patch supports add, replace, remove and test.',
      );
    const key = parts.pop()!;
    const parent = readPointer(
      p,
      parts.length
        ? '/' + parts.map((x) => x.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')
        : '',
    ) as Record<string | number, unknown>;
    // Root-level properties have the project as their parent.
    const target = parts.length ? parent : (p as unknown as Record<string | number, unknown>);
    if (!target || typeof target !== 'object')
      throw new AutomationError('NOT_FOUND', `Pointer parent not found: ${path}.`);
    const index = keyFor(target, key, op.op === 'add');
    if (op.op !== 'add' && !Object.hasOwn(target, index))
      throw new AutomationError('NOT_FOUND', `Pointer not found: ${path}.`);
    if (op.op === 'test') {
      if (!Object.hasOwn(op, 'value'))
        throw new AutomationError('INVALID_ARGUMENT', 'test requires value.');
      if (!equalJson(target[index], op.value))
        throw new AutomationError('CONFLICT', `Patch test failed: ${path}.`);
    } else if (op.op === 'remove') {
      if (Array.isArray(target)) target.splice(Number(index), 1);
      else delete target[index];
    } else {
      if (!Object.hasOwn(op, 'value'))
        throw new AutomationError('INVALID_ARGUMENT', 'add/replace requires value.');
      if (op.op === 'add' && Array.isArray(target))
        target.splice(Number(index), 0, structuredClone(op.value));
      else target[index] = structuredClone(op.value);
    }
  }
}
export function queryProject(p: Project, name: string, params: Parameters): unknown {
  const v = checkParameters(name, params);
  switch (name) {
    case 'project.inspect':
      return summary(p);
    case 'project.get':
      return readPointer(p, v.path as string | undefined);
    case 'input.list':
      return p.inputs ?? { sources: [], channels: [] };
    case 'scene.list':
      return summary(p).scenes;
    case 'prefab.list':
      return summary(p).scenes.filter((s) => s.prefab);
    case 'scene.get':
      return sceneById(p, textParam(v, 'scene'));
    case 'node.list': {
      const s = sceneById(p, textParam(v, 'scene'));
      return (v.resolved ? resolveScene(p, s) : s.nodes).map((n) =>
        compact(n as unknown as Record<string, unknown>),
      );
    }
    case 'node.get': {
      const s = sceneById(p, textParam(v, 'scene'));
      const n = (v.resolved ? resolveScene(p, s) : s.nodes).find((n) => n.id === v.id);
      if (!n)
        throw new AutomationError(
          'NOT_FOUND',
          `Node not found: ${v.id}. Use resolved=true for inherited nodes.`,
        );
      return n;
    }
    case 'resource.list':
      return resourceTable(p, textParam(v, 'resource')).map(compact);
    case 'resource.get': {
      const r = resourceTable(p, textParam(v, 'resource')).find((r) => r.id === v.id);
      if (!r) throw new AutomationError('NOT_FOUND', `Resource not found: ${v.id}.`);
      return r;
    }
    case 'code.get':
      return { text: p.code };
    default:
      throw new AutomationError('UNKNOWN_COMMAND', `Not a project query: ${name}.`);
  }
}
function mutate(p: Project, name: string, v: Parameters): unknown {
  const scene = () => sceneById(p, textParam(v, 'scene'));
  const node = () => {
    const n = scene().nodes.find((n) => n.id === v.id);
    if (!n) throw new AutomationError('NOT_FOUND', `Authored node not found: ${v.id}.`);
    return n;
  };
  switch (name) {
    case 'input.preset': {
      const kind = textParam(v, 'kind');
      if (kind !== 'adc' && kind !== 'serial' && kind !== 'ble')
        throw new AutomationError(
          'INVALID_ARGUMENT',
          'Input preset kind must be adc, serial or ble.',
        );
      const next = addInputPreset(p.inputs ?? { sources: [], channels: [] }, kind);
      if (!validInputs(next))
        throw new AutomationError(
          'INVALID_ARGUMENT',
          'Input limit exceeded: 8 devices / 32 channels.',
        );
      p.inputs = next;
      return next;
    }
    case 'input.configure':
      if (!validInputs(v.config))
        throw new AutomationError(
          'INVALID_ARGUMENT',
          'Invalid InputConfig: check types, calibration, IDs and wire formats.',
        );
      p.inputs = structuredClone(v.config);
      return p.inputs;
    case 'project.patch':
      patchProject(p, v.operations as unknown[]);
      return { operations: (v.operations as unknown[]).length };
    case 'scene.create': {
      const id = v.id === undefined ? uid('scene') : requireId(v.id),
        data = object(v.data ?? {});
      allowed(data, sceneKeys);
      if (p.scenes.some((s) => s.id === id))
        throw new AutomationError('CONFLICT', `Scene already exists: ${id}.`);
      p.scenes.push({
        id,
        name: textParam(v, 'name'),
        background: '#18212b',
        objective: '',
        completion: '',
        music: '',
        nodes: [],
        ...data,
      });
      return { id };
    }
    case 'scene.update': {
      const patch = object(v.patch);
      allowed(patch, sceneKeys);
      Object.assign(scene(), patch);
      return { id: v.scene };
    }
    case 'scene.delete': {
      const s = scene();
      p.scenes.splice(p.scenes.indexOf(s), 1);
      return { id: s.id };
    }
    case 'node.create': {
      if (!nodeKinds.includes(v.kind as NodeKind))
        throw new AutomationError('INVALID_ARGUMENT', 'Unknown node kind.');
      const data = object(v.data ?? {});
      allowed(data, new Set([...nodeKeys].filter((k) => !['id', 'kind'].includes(k))));
      const id = v.id === undefined ? uid(v.kind as string) : requireId(v.id);
      if (scene().nodes.some((n) => n.id === id))
        throw new AutomationError('CONFLICT', `Node already exists: ${id}.`);
      scene().nodes.push(makeNode(v.kind as NodeKind, { ...data, id }));
      return { id };
    }
    case 'node.update': {
      const patch = object(v.patch);
      allowed(patch, new Set([...nodeKeys].filter((k) => !['id', 'kind', 'parent'].includes(k))));
      patchSceneNode(p, scene(), textParam(v, 'id'), patch);
      return { id: v.id };
    }
    case 'node.delete': {
      node();
      const s = scene(),
        ids = branchIds(s, textParam(v, 'id'));
      s.nodes = s.nodes.filter((n) => !ids.has(n.id));
      return { removed: [...ids] };
    }
    case 'node.reparent':
      reparentNode(p, scene(), textParam(v, 'id'), (v.parent as string | undefined) || undefined);
      return { id: v.id };
    case 'node.move': {
      if (!['inside', 'before', 'after', 'root'].includes(v.placement as string))
        throw new AutomationError(
          'INVALID_ARGUMENT',
          'Placement must be inside, before, after or root.',
        );
      moveSceneNode(
        p,
        scene(),
        textParam(v, 'id'),
        v.target as string | undefined,
        v.placement as TreeDrop,
      );
      return { id: v.id };
    }
    case 'prefab.create':
      return { prefab: createPrefab(p, scene(), textParam(v, 'id')) };
    case 'prefab.pool':
      return { id: createPrefabPool(p, scene(), textParam(v, 'prefab'), Number(v.capacity ?? 4)) };
    case 'node.duplicate':
      return { id: duplicateBranch(scene(), textParam(v, 'id')) };
    case 'node.extract':
      return { scene: extractScene(p, scene(), textParam(v, 'id')) };
    case 'node.unpack':
      unpackInstance(p, scene(), textParam(v, 'id'));
      return { id: v.id };
    case 'resource.upsert': {
      const data = object(v.data);
      requireId(data.id);
      const table = resourceTable(p, textParam(v, 'resource'), true),
        index = table.findIndex((r) => r.id === data.id);
      if (index < 0)
        table.push(
          structuredClone(data) as {
            id: string;
          },
        );
      else
        table[index] = structuredClone(data) as {
          id: string;
        };
      return { id: data.id, created: index < 0 };
    }
    case 'resource.delete': {
      const table = resourceTable(p, textParam(v, 'resource')),
        index = table.findIndex((r) => r.id === v.id);
      if (index < 0) throw new AutomationError('NOT_FOUND', `Resource not found: ${v.id}.`);
      table.splice(index, 1);
      return { id: v.id };
    }
    case 'code.set':
      if (typeof v.text !== 'string')
        throw new AutomationError('INVALID_ARGUMENT', 'Provide text or file.');
      p.code = v.text;
      return { bytes: p.code.length };
    case 'tilemap.create': {
      const set = p.tilesets?.find((s) => s.id === v.tileset);
      if (!set) throw new AutomationError('NOT_FOUND', `Tileset not found: ${v.tileset}.`);
      const n = makeTilemap(p, set);
      if (v.id !== undefined) n.id = requireId(v.id);
      if (v.name !== undefined) n.name = v.name as string;
      const map = n.tilemap!;
      map.columns = (v.columns as number) ?? map.columns;
      map.rows = (v.rows as number) ?? map.rows;
      if (
        ![map.columns, map.rows].every((v) => Number.isInteger(v) && v >= 1 && v <= 128) ||
        map.columns * map.rows > 16384
      )
        throw new AutomationError('INVALID_ARGUMENT', 'Map dimensions must be integers in 1–128.');
      map.cells = Array(map.columns * map.rows).fill(0);
      n.width = map.columns * map.tileSize;
      n.height = map.rows * map.tileSize;
      scene().nodes.push(n);
      return { id: n.id, tiles: map.tiles };
    }
    case 'tilemap.paint': {
      const map = node().tilemap;
      if (!map) throw new AutomationError('INVALID_ARGUMENT', 'Node is not a tilemap.');
      if ((v.cells as unknown[]).length > 16384)
        throw new AutomationError('INVALID_ARGUMENT', 'Maximum 16384 cells per operation.');
      for (const raw of v.cells as unknown[]) {
        const c = object(raw);
        allowed(c, new Set(['x', 'y', 'tile']));
        const { x, y, tile } = c as {
          x: number;
          y: number;
          tile: number;
        };
        if (
          ![x, y, tile].every(Number.isInteger) ||
          x < 0 ||
          y < 0 ||
          x >= map.columns ||
          y >= map.rows ||
          tile < 0 ||
          tile > map.tiles.length
        )
          throw new AutomationError(
            'INVALID_ARGUMENT',
            'Cell coordinates or tile-bank index are out of range.',
          );
        map.cells[y * map.columns + x] = tile;
      }
      return { painted: (v.cells as unknown[]).length };
    }
    default:
      throw new AutomationError(
        'INVALID_ARGUMENT',
        `${name} cannot run inside a project transaction.`,
      );
  }
}
export function checkedProject(text: string): Project {
  let p: Project;
  try {
    p = parseProject(text);
  } catch (e) {
    throw new AutomationError('VALIDATION_FAILED', (e as Error).message);
  }
  return p;
}
/** Copy first, validate once, commit once. A failed command never mutates the caller. */
export function applyCommands(source: Project, commands: ProjectCommand[]) {
  if (!Array.isArray(commands) || !commands.length || commands.length > 256)
    throw new AutomationError('INVALID_ARGUMENT', 'Use 1–256 commands per transaction.');
  safeJson(commands);
  const p = structuredClone(source),
    results: unknown[] = [];
  for (const [index, raw] of commands.entries()) {
    const c = object(raw, 'command');
    allowed(c, new Set(['command', 'params']));
    const name = textParam(c, 'command');
    if (!byName.get(name)?.mutates || ['project.create', 'project.apply'].includes(name))
      throw new AutomationError(
        'INVALID_ARGUMENT',
        `Command ${name} is not a transaction operation.`,
        { index },
      );
    try {
      results.push(mutate(p, name, checkParameters(name, c.params ?? {})));
    } catch (e) {
      if (e instanceof AutomationError) e.details = { index, command: name, cause: e.details };
      throw e;
    }
  }
  const parsed = checkedProject(JSON.stringify(p)),
    issues = validate(parsed);
  if (issues.some((i) => i.severity === 'error'))
    throw new AutomationError('VALIDATION_FAILED', 'Transaction would create an invalid project.', {
      issues,
    });
  return { project: parsed, results, warnings: issues.filter((i) => i.severity === 'warning') };
}
