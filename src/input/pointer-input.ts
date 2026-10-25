import type { GameNode } from '../model';

const actionKeys = {
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
  action: ' ',
  interact: 'e',
  menu: 'p',
} as const;

/** Preview pointer ownership is independent of keyboard state. A pointer remains
 * tracked in gaps so a held finger can slide onto another direction. */
export class PointerInput {
  private pointers = new Map<number, { node?: string; key?: string }>();
  readonly pulses = new Set<string>();

  start(id: number, node: GameNode) {
    if (!node.inputAction || !node.visible) return;
    this.pointers.set(id, {});
    this.move(id, node);
  }
  move(id: number, node?: GameNode) {
    if (!this.pointers.has(id)) return;
    const key = node?.visible && node.inputAction ? actionKeys[node.inputAction] : undefined;
    if (key && [' ', 'e', 'p'].includes(key) && !this.keys().has(key)) this.pulses.add(key);
    this.pointers.set(id, { node: node?.id, key });
  }
  end(id: number) {
    this.pointers.delete(id);
  }
  keys(): Set<string> {
    return new Set([...this.pointers.values()].flatMap((p) => (p.key ? [p.key] : [])));
  }
  releaseHidden(nodes: GameNode[]) {
    for (const [id, pointer] of this.pointers) {
      if (pointer.node && !nodes.some((n) => n.id === pointer.node && n.visible && n.inputAction))
        this.pointers.set(id, {});
    }
  }
  clear() {
    this.pointers.clear();
    this.pulses.clear();
  }
}

/** UI is in display coordinates, unaffected by the world camera. Last drawn wins. */
export function controllerAt(nodes: GameNode[], x: number, y: number): GameNode | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (
      n.visible &&
      n.kind === 'button' &&
      x >= n.x &&
      y >= n.y &&
      x < n.x + n.width &&
      y < n.y + n.height
    )
      return n.inputAction ? n : undefined;
  }
}
