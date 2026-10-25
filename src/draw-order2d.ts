import { colliderBox } from './physics';
import type { GameNode } from './model';
/** Drawing order never changes scene hierarchy, physics iteration, IDs or serialized array order. */
export function drawNodes2D(nodes: GameNode[]): GameNode[] {
  return [...nodes].sort(
    (a, b) =>
      Number(a.layer === 'ui') - Number(b.layer === 'ui') ||
      (a.zIndex ?? 0) - (b.zIndex ?? 0) ||
      (a.sortY ? colliderBox(a).y + colliderBox(a).height : 0) -
        (b.sortY ? colliderBox(b).y + colliderBox(b).height : 0),
  );
}
