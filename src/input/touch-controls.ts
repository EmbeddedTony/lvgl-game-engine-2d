import { makeNode, type GameNode, type Project, type Scene } from '../model';
import { MAX_SCENE_NODES, resolveScene } from '../scenes';
export function touchControlsEnabled(project: Project, scene: Scene): boolean {
  return scene.touchControls !== false && resolveScene(project, scene).some((n) => n.inputAction);
}
/** An authored UI preset, not a second input/rendering system. Children remain editable,
 * can be saved as a reusable scene, and use the normal fixed-size runtime node pool. */
export function createTouchControls(
  display: Pick<Project, 'width' | 'height'>,
  existingIds: ReadonlySet<string> = new Set(),
  actionLabel = 'ACTION',
): GameNode[] {
  if (display.width < 128 || display.height < 96)
    throw new Error(
      'The touch preset needs at least 128 × 96. For smaller displays, map your own UI buttons in Inspector → Controller input.',
    );
  const ids = new Set(existingIds);
  const unique = (base: string) => {
    let id = base,
      suffix = 2;
    while (ids.has(id)) id = `${base}_${suffix++}`;
    ids.add(id);
    return id;
  };
  const size = Math.min(56, Math.floor(Math.min(display.width / 8, display.height / 4)));
  const gap = Math.max(2, Math.floor(size / 12)),
    margin = Math.max(4, Math.floor(size / 6));
  const step = size + gap,
    left = margin,
    top = display.height - margin - size - step * 2;
  const parent = unique('touch_controls');
  const group = makeNode('group', { id: parent, name: 'Touch controls', layer: 'ui', x: 0, y: 0 });
  const button = (
    id: string,
    text: string,
    x: number,
    y: number,
    action: GameNode['inputAction'],
    width = size,
  ) =>
    makeNode('button', {
      id: unique(id),
      name: `Touch ${action}`,
      parent,
      layer: 'ui',
      text,
      x,
      y,
      width,
      height: size,
      radius: Math.min(8, Math.floor(size / 6)),
      color: '#29434b',
      inputAction: action,
    });
  const actionWidth = size * 2 + gap,
    right = display.width - margin - actionWidth;
  return [
    group,
    button('pad_up', '^', left + step, top, 'up'),
    button('pad_left', '<', left, top + step, 'left'),
    button('pad_right', '>', left + step * 2, top + step, 'right'),
    button('pad_down', 'v', left + step, top + step * 2, 'down'),
    button(
      'touch_action',
      actionWidth < 64 ? 'A' : actionLabel,
      right,
      display.height - margin - size,
      'action',
      actionWidth,
    ),
    button(
      'touch_interact',
      actionWidth < 64 ? 'B' : 'TALK',
      right,
      display.height - margin - size - step,
      'interact',
      actionWidth,
    ),
  ];
}
/** Used inside the editor's validated undo transaction. Never duplicates existing
 * authored/instanced buttons, and checks the expanded MCU node budget before adding. */
export function setTouchControls(project: Project, scene: Scene, enabled: boolean): void {
  const resolved = resolveScene(project, scene);
  if (enabled && !resolved.some((n) => n.inputAction)) {
    const platformer = resolved.some((n) => n.player && n.physics?.motion === 'platformer');
    const ids = new Set(scene.nodes.map((n) => n.id));
    const nodes = createTouchControls(project, ids, platformer ? 'JUMP' : 'ACTION');
    if (resolved.length + nodes.length > MAX_SCENE_NODES)
      throw new Error(
        `Touch controls need ${nodes.length} free scene nodes. This scene has ${MAX_SCENE_NODES - resolved.length}; reuse or remove objects first.`,
      );
    scene.nodes.push(...nodes);
  }
  scene.touchControls = enabled;
}
