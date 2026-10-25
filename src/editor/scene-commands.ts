import {
  makeNode,
  uid,
  type GameNode,
  type Project,
  type Scene,
  type SceneOverride,
} from '../model';
import { branchIds, resolveScene } from '../scenes';
// Explicitly copy the two owned containers; works on plain data and Immer drafts.
const cloneNode = (n: GameNode): GameNode => ({
  ...n,
  ...(n.melee ? { melee: { ...n.melee } } : {}),
  ...(n.emitter ? { emitter: { ...n.emitter } } : {}),
  ...(n.physics
    ? {
        physics: {
          ...n.physics,
          box: n.physics.box ? { ...n.physics.box } : null,
          ...(n.physics.travel ? { travel: { ...n.physics.travel } } : {}),
        },
      }
    : {}),
  ...(n.stateBindings ? { stateBindings: { ...n.stateBindings } } : {}),
  ...(n.events
    ? { events: n.events.map((e) => ({ ...e, ...(e.when ? { when: { ...e.when } } : {}) })) }
    : {}),
  ...(n.animator ? { animator: { ...n.animator } } : {}),
  ...(n.tilemap
    ? {
        tilemap: {
          ...n.tilemap,
          tiles: [...n.tilemap.tiles],
          cells: [...n.tilemap.cells],
          solidTiles: [...n.tilemap.solidTiles],
          ...(n.tilemap.animations
            ? {
                animations: Object.fromEntries(
                  Object.entries(n.tilemap.animations).map(([v, a]) => [
                    v,
                    { ...a, frames: [...a.frames] },
                  ]),
                ),
              }
            : {}),
          ...(n.tilemap.terrains
            ? {
                terrains: Object.fromEntries(
                  Object.entries(n.tilemap.terrains).map(([id, g]) => [id, { ...g }]),
                ),
              }
            : {}),
          ...(n.tilemap.slopes ? { slopes: { ...n.tilemap.slopes } } : {}),
        },
      }
    : {}),
  ...(n.overrides
    ? {
        overrides: Object.fromEntries(
          Object.entries(n.overrides).map(([id, patch]) => [id, { ...patch }]),
        ),
      }
    : {}),
});

const overrideKeys = new Set([
  'x',
  'y',
  'text',
  'color',
  'visible',
  'speed',
  'cue',
  'stateBindings',
]);
function remapPath(path: string, changes: Map<string, string> | undefined): string {
  const match = [...(changes?.keys() ?? [])]
    .sort((a, b) => b.length - a.length)
    .find((old) => path === old || path.startsWith(old + '/'));
  return match ? changes!.get(match)! + path.slice(match.length) : path;
}
/** Structural commands also migrate authored references through every containing
 * scene. C source is deliberately not rewritten; its generated IDs remain reviewable. */
function referenceMaps(p: Project, target: string, local: Map<string, string>) {
  const cache = new Map<string, Map<string, string>>();
  const build = (scene: Scene): Map<string, string> => {
    if (cache.has(scene.id)) return cache.get(scene.id)!;
    const changes = new Map(scene.id === target ? local : []);
    cache.set(scene.id, changes);
    for (const n of scene.nodes)
      if (n.kind === 'instance') {
        const source = p.scenes.find((s) => s.id === n.scene);
        if (source)
          for (const [old, next] of build(source)) changes.set(`${n.id}/${old}`, `${n.id}/${next}`);
      }
    return changes;
  };
  for (const scene of p.scenes) build(scene);
  return cache;
}
function rewriteReferences(
  p: Project,
  maps: Map<string, Map<string, string>>,
  transformRoots?: Map<string, Map<string, string>>,
) {
  for (const sequence of p.flow?.sequences ?? [])
    for (const step of sequence.steps) {
      if (step.button) step.button = remapPath(step.button, maps.get(step.scene));
    }
  for (const scene of p.scenes)
    if (scene.camera2d)
      scene.camera2d.follow = remapPath(scene.camera2d.follow, maps.get(scene.id));
  for (const scene of p.scenes)
    for (const n of scene.nodes)
      if (n.kind === 'instance' && n.overrides) {
        const rewritten: NonNullable<GameNode['overrides']> = {};
        for (const [path, patch] of Object.entries(n.overrides)) {
          const destination = remapPath(path, maps.get(n.scene!));
          const root = transformRoots?.get(n.scene!)?.get(path);
          // Extraction moves root translation/visibility onto the new instance;
          // visual/behavior overrides still belong to the original inner node.
          for (const [key, value] of Object.entries(patch)) {
            const target = root && ['x', 'y', 'visible'].includes(key) ? root : destination;
            rewritten[target] = { ...rewritten[target], [key]: value };
          }
        }
        n.overrides = rewritten;
      }
}
/** Inherited edits belong to the outer instance, never to the shared source. */
export function patchSceneNode(p: Project, scene: Scene, id: string, changes: Partial<GameNode>) {
  const authored = scene.nodes.find((n) => n.id === id);
  if (authored) {
    Object.assign(authored, changes);
    return;
  }
  const inherited = resolveScene(p, scene).find((n) => n.id === id);
  const owner = scene.nodes.find((n) => n.id === inherited?.instanceRoot);
  if (!owner) throw new Error('The selected node no longer exists.');
  if (Object.keys(changes).some((key) => !overrideKeys.has(key)))
    throw new Error('Open the source scene to change this property.');
  const path = id.slice(owner.id.length + 1);
  owner.overrides ??= {};
  owner.overrides[path] = { ...owner.overrides[path], ...changes } as SceneOverride;
}
export function duplicateBranch(scene: Scene, id: string): string {
  const branch = branchIds(scene, id),
    copies = scene.nodes.filter((n) => branch.has(n.id));
  const ids = new Map(copies.map((n) => [n.id, uid(n.kind)]));
  if (!copies.length) throw new Error('Select an authored branch to duplicate.');
  scene.nodes.push(
    ...copies.map((n) => ({
      ...cloneNode(n),
      id: ids.get(n.id)!,
      parent: n.parent ? (ids.get(n.parent) ?? n.parent) : undefined,
      ...(n.id === id ? { name: `${n.name.slice(0, 120)} copy`, x: n.x + 8, y: n.y + 8 } : {}),
    })),
  );
  return ids.get(id)!;
}
export function extractScene(
  p: Project,
  scene: Scene,
  id: string,
  sourceId = uid('scene'),
): string {
  if (p.scenes.length >= 256) throw new Error('Maximum 256 scenes per project.');
  const root = scene.nodes.find((n) => n.id === id);
  if (!root) throw new Error('Select an authored branch to save as a scene.');
  if (p.scenes.some((s) => s.id === sourceId)) throw new Error('This source ID is already in use.');
  const ids = branchIds(scene, id);
  const maps = referenceMaps(
    p,
    scene.id,
    new Map([...ids].map((nodeId) => [nodeId, `${id}/${nodeId}`])),
  );
  const transformRoots = referenceMaps(p, scene.id, new Map([[id, id]]));
  const source: Scene = {
    id: sourceId,
    name: `${root.name.slice(0, 120)} scene`,
    background: scene.background,
    objective: '',
    completion: '',
    music: '',
    nodes: scene.nodes
      .filter((n) => ids.has(n.id))
      .map((n) => ({
        ...cloneNode(n),
        ...(n.id === id ? { parent: undefined, x: 0, y: 0, visible: true } : {}),
      })),
  };
  p.scenes.push(source);
  const instance = makeNode('instance', {
    id: root.id,
    name: root.name,
    scene: sourceId,
    parent: root.parent,
    x: root.x,
    y: root.y,
    layer: root.layer,
    width: root.width,
    height: root.height,
    visible: root.visible,
  });
  scene.nodes = scene.nodes.flatMap((n) => (n.id === id ? [instance] : ids.has(n.id) ? [] : [n]));
  rewriteReferences(p, maps, transformRoots);
  return sourceId;
}
/** Explicitly break the link; bake effective overrides, keep local transforms. */
export function unpackInstance(p: Project, scene: Scene, id: string): void {
  const instance = scene.nodes.find((n) => n.id === id);
  if (!instance || instance.kind !== 'instance')
    throw new Error('Select a scene instance to unpack.');
  if (instance.spawnable)
    throw new Error('Disable runtime spawning before unpacking a reserved copy.');
  const nodes = resolveScene(p, scene).filter((n) => n.id.startsWith(id + '/'));
  if (nodes.some((n) => n.spawnable))
    throw new Error('Unpack the surrounding scene only after removing its reserved spawn slots.');
  const ids = new Map(nodes.map((n) => [n.id, uid(n.kind === 'instance' ? 'group' : n.kind)]));
  const maps = referenceMaps(p, scene.id, ids);
  const copies = nodes.map((n): GameNode => {
    const {
      sourceScene: _sourceScene,
      sourceId: _sourceId,
      instanceRoot: _instanceRoot,
      worldX: _worldX,
      worldY: _worldY,
      effectiveVisible: _visible,
      depth: _depth,
      ...copy
    } = n;
    return {
      ...cloneNode(copy),
      id: ids.get(n.id)!,
      parent: n.parent === id ? id : ids.get(n.parent!),
      kind: n.kind === 'instance' ? 'group' : n.kind,
      scene: undefined,
      overrides: undefined,
      spawnable: undefined,
    };
  });
  instance.kind = 'group';
  delete instance.scene;
  delete instance.overrides;
  delete instance.spawnable;
  const firstChild = scene.nodes.findIndex((n) => n.parent === id);
  scene.nodes.splice(
    firstChild >= 0 ? firstChild : scene.nodes.indexOf(instance) + 1,
    0,
    ...copies,
  );
  rewriteReferences(p, maps);
}
