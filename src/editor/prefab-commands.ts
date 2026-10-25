import { makeNode, type Project, type Scene } from '../model';
import { instanceSources, resolveScene } from '../scenes';
import { extractScene } from './scene-commands';

/** Prefabs share the scene composition pipeline, ID migration and override rules. */
export function createPrefab(p: Project, scene: Scene, root: string): string {
  const selected = scene.nodes.find((n) => n.id === root);
  if (!selected) throw new Error('Select an authored object to create a prefab.');
  if (selected.spawnable) throw new Error('Open this prefab source to edit its shared structure.');
  const name = selected.name;
  const stem =
    'prefab_' +
    (name
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'object');
  let sourceId = stem,
    suffix = 2;
  while (p.scenes.some((s) => s.id === sourceId)) sourceId = `${stem}_${suffix++}`;
  const id = extractScene(p, scene, root, sourceId);
  const source = p.scenes.find((s) => s.id === id)!;
  source.name = name;
  source.prefab = true;
  return id;
}

/** Explicit, inspectable slots: no hidden allocation or second composition format. */
export function createPrefabPool(
  p: Project,
  scene: Scene,
  sourceId: string,
  capacity: number,
): string {
  const source = instanceSources(p, scene).find((s) => s.id === sourceId && s.prefab);
  if (!source) throw new Error('Choose a prefab that does not depend on this scene.');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 16)
    throw new Error('Reserve between 1 and 16 copies per pool.');
  if (resolveScene(p, source).some((n) => n.spawnable))
    throw new Error('A spawnable prefab cannot contain another spawn pool.');
  const group = makeNode('group', {
    name: `${source.name.slice(0, 100)} pool (${capacity})`,
    x: 0,
    y: 0,
  });
  scene.nodes.push(group);
  for (let i = 0; i < capacity; i++)
    scene.nodes.push(
      makeNode('instance', {
        name: `${source.name.slice(0, 100)} slot ${i + 1}`,
        scene: source.id,
        parent: group.id,
        x: 0,
        y: 0,
        spawnable: true,
      }),
    );
  resolveScene(p, scene); // Reject capacity/depth overflow in the caller's transaction.
  return group.id;
}
