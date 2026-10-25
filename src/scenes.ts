import { cameraReferenceValid } from './camera2d';
import type { GameNode, Issue, Project, Scene, SceneOverride } from './model';

export const MAX_SCENE_NODES = 128;
export const MAX_SCENE_DEPTH = 16;
export interface ResolvedNode extends GameNode {
  sourceScene: string;
  sourceId: string;
  /** Outermost authored instance; inherited children are edited through this owner. */
  instanceRoot?: string;
  depth: number;
  worldX: number;
  worldY: number;
  effectiveVisible: boolean;
}
interface Overlay {
  prefix: string;
  values: Record<string, SceneOverride>;
}

/** The single composition pass used by Design, preview, validation and C export.
 * Output is parent-before-child. IDs are stable paths only at instance boundaries;
 * reparenting an ordinary node never changes its ID. No project data is mutated. */
export function resolveScene(p: Pick<Project, 'scenes'>, root: Scene): ResolvedNode[] {
  const result: ResolvedNode[] = [];
  const expand = (
    scene: Scene,
    prefix: string,
    parent: ResolvedNode | undefined,
    stack: string[],
    overlays: Overlay[],
    instanceRoot?: string,
  ) => {
    if (stack.includes(scene.id))
      throw new Error(`Scene instances form a cycle: ${[...stack, scene.id].join(' → ')}.`);
    const nextStack = [...stack, scene.id];
    const children = new Map<string, GameNode[]>();
    for (const n of scene.nodes) {
      if (n.parent && !scene.nodes.some((a) => a.id === n.parent))
        throw new Error(`${scene.name} / ${n.name}: missing parent.`);
      const siblings = children.get(n.parent ?? '') ?? [];
      siblings.push(n);
      children.set(n.parent ?? '', siblings);
    }
    let visited = 0;
    const visit = (authored: GameNode, owner: ResolvedNode | undefined) => {
      visited++;
      const id = prefix + authored.id;
      let n = { ...authored };
      // Inner overrides apply first. An outer instance can override a nested value.
      for (const overlay of overlays) {
        const patch = overlay.values[id.slice(overlay.prefix.length)];
        if (id.startsWith(overlay.prefix) && patch) n = { ...n, ...patch };
      }
      // The active scene owns its input overlay, including instanced controls.
      // Only the composed copy changes; disabling/re-enabling preserves authored visibility.
      const visible = n.visible && !(root.touchControls === false && n.inputAction);
      const resolved: ResolvedNode = {
        ...n,
        visible,
        id,
        parent: owner?.id,
        sourceScene: scene.id,
        sourceId: authored.id,
        instanceRoot,
        depth: owner ? owner.depth + 1 : 0,
        worldX: (owner?.worldX ?? 0) + n.x,
        worldY: (owner?.worldY ?? 0) + n.y,
        effectiveVisible: (owner?.effectiveVisible ?? true) && visible && !n.spawnable,
      };
      if (resolved.depth >= MAX_SCENE_DEPTH)
        throw new Error(`${root.name}: scene tree exceeds ${MAX_SCENE_DEPTH} levels.`);
      if (n.spawnable) {
        if (!p.scenes.find((s) => s.id === n.scene)?.prefab)
          throw new Error(`${scene.name} / ${n.name}: a spawn slot needs a prefab source.`);
        for (let at = owner; at; at = result.find((a) => a.id === at!.parent))
          if (at.spawnable)
            throw new Error(`${scene.name}: spawn pools cannot nest inside spawnable copies.`);
      }
      if (Math.abs(resolved.worldX) > 32767 || Math.abs(resolved.worldY) > 32767)
        throw new Error(`${root.name}: a composed position exceeds the LVGL coordinate range.`);
      result.push(resolved);
      if (result.length > MAX_SCENE_NODES)
        throw new Error(
          `${root.name}: expanded scene exceeds ${MAX_SCENE_NODES} nodes (including groups and instances).`,
        );
      if (n.kind === 'instance') {
        const source = p.scenes.find((s) => s.id === n.scene);
        if (!source) throw new Error(`${scene.name} / ${n.name}: missing source scene.`);
        const start = result.length,
          childPrefix = id + '/';
        expand(
          source,
          childPrefix,
          resolved,
          nextStack,
          [{ prefix: childPrefix, values: n.overrides ?? {} }, ...overlays],
          instanceRoot ?? n.id,
        );
        const paths = new Set(result.slice(start).map((r) => r.id.slice(childPrefix.length)));
        for (const path of Object.keys(n.overrides ?? {})) {
          if (!paths.has(path))
            throw new Error(`${scene.name} / ${n.name}: override targets missing node ${path}.`);
        }
      }
      for (const child of children.get(authored.id) ?? []) visit(child, resolved);
    };
    for (const n of children.get('') ?? []) visit(n, parent);
    if (visited !== scene.nodes.length)
      throw new Error(`${scene.name}: parent links form a cycle.`);
  };
  expand(root, '', undefined, [], []);
  return result;
}

export function sceneGraphIssues(p: Pick<Project, 'scenes'>): Issue[] {
  const messages = new Set<string>();
  for (const scene of p.scenes) {
    try {
      const nodes = resolveScene(p, scene);
      if (!cameraReferenceValid(scene, nodes))
        messages.add(
          `${scene.name}: camera must follow an existing world object. Change or disable its 2D camera before removing the target.`,
        );
    } catch (error) {
      messages.add((error as Error).message);
    }
  }
  return [...messages].map((message) => ({ severity: 'error', message }));
}
export function displaySceneNodes(p: Pick<Project, 'scenes'>, scene: Scene): ResolvedNode[] {
  return resolveScene(p, scene).map((n) => ({
    ...n,
    x: n.worldX,
    y: n.worldY,
    visible: n.effectiveVisible,
  }));
}
export function branchIds(scene: Scene, id: string): Set<string> {
  const ids = new Set([id]);
  // Bounded traversal also makes this safe on a draft with invalid parent links.
  for (let pass = 0; pass < scene.nodes.length; pass++) {
    let added = false;
    for (const n of scene.nodes)
      if (n.parent && ids.has(n.parent) && !ids.has(n.id)) {
        ids.add(n.id);
        added = true;
      }
    if (!added) break;
  }
  return ids;
}
/** Keep global position when changing ownership, as in a scene-tree editor. */
export function reparentNode(p: Project, scene: Scene, id: string, parent?: string): void {
  const node = scene.nodes.find((n) => n.id === id);
  if (!node) throw new Error('Select an authored node to reparent.');
  if (parent && branchIds(scene, id).has(parent))
    throw new Error('A node cannot be parented to itself or its descendants.');
  const resolved = resolveScene(p, scene),
    current = resolved.find((n) => n.id === id)!,
    owner = resolved.find((n) => n.id === parent);
  if (parent && (!owner || owner.instanceRoot))
    throw new Error('Choose an authored parent in this scene.');
  const x = current.worldX - (owner?.worldX ?? 0),
    y = current.worldY - (owner?.worldY ?? 0);
  if (Math.abs(x) > 4096 || Math.abs(y) > 4096)
    throw new Error('The new local position exceeds ±4096 pixels.');
  node.parent = parent;
  node.x = x;
  node.y = y;
}

export type TreeDrop = 'inside' | 'before' | 'after' | 'root';
/** One transactional tree move. Array order defines sibling order; IDs stay stable. */
export function moveSceneNode(
  p: Project,
  scene: Scene,
  id: string,
  target: string | undefined,
  placement: TreeDrop,
): void {
  const destination = scene.nodes.find((n) => n.id === target);
  if (placement !== 'root' && !destination)
    throw new Error('Drop onto an authored object or the scene root.');
  if (target && branchIds(scene, id).has(target))
    throw new Error('An object cannot be moved into its own branch.');
  reparentNode(
    p,
    scene,
    id,
    placement === 'root' ? undefined : placement === 'inside' ? target : destination?.parent,
  );
  const node = scene.nodes.find((n) => n.id === id)!;
  scene.nodes.splice(scene.nodes.indexOf(node), 1);
  const index = destination ? scene.nodes.indexOf(destination) : scene.nodes.length;
  scene.nodes.splice(
    placement === 'before' ? index : placement === 'after' ? index + 1 : scene.nodes.length,
    0,
    node,
  );
}

/** Safe choices for the Instance scene picker; excludes dependency cycles. */
export function instanceSources(p: Project, owner: Scene): Scene[] {
  const dependsOn = (id: string, target: string, seen = new Set<string>()): boolean => {
    if (id === target) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (
      p.scenes
        .find((s) => s.id === id)
        ?.nodes.some(
          (n) => n.kind === 'instance' && !!n.scene && dependsOn(n.scene, target, seen),
        ) ?? false
    );
  };
  return p.scenes.filter((s) => !dependsOn(s.id, owner.id));
}
