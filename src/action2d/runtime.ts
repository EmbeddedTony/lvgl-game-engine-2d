import type { Simulation } from '../simulation';
import type { Project, GameNode } from '../model';
import { physicsFor } from '../physics';
import { signal, inputMask } from '../gameplay/runtime';
import { attackTicks } from './model';
export interface MeleeState {
  tick: number;
  swinging: boolean;
  facing: 'Down' | 'Up' | 'Left' | 'Right';
  hits: Uint32Array;
}
export function createMelee(nodes: GameNode[]) {
  return Object.fromEntries(
    nodes
      .filter((n) => n.melee)
      .map((n) => [
        n.id,
        { tick: 0, swinging: false, facing: 'Down' as const, hits: new Uint32Array(4) },
      ]),
  );
}
export function prepareMelee(s: Simulation, keys: Set<string>) {
  const mask = inputMask(keys),
    pressed = mask & ~s.meleePrevious;
  s.meleePrevious = mask;
  for (const n of s.nodes) {
    const a = s.melee[n.id],
      d = n.melee;
    if (!a || !d) continue;
    if (!n.visible) {
      a.swinging = false;
      continue;
    }
    const timings = attackTicks(d);
    if (a.swinging && ++a.tick >= timings.reduce((a, b) => a + b, 0)) a.swinging = false;
    if (!a.swinging && n.player) {
      if (mask & 3) a.facing = mask & 2 ? 'Right' : 'Left';
      else if (mask & 12) a.facing = mask & 8 ? 'Down' : 'Up';
      if (pressed & 16) {
        a.tick = 0;
        a.swinging = true;
        a.hits.fill(0);
      }
    }
  }
}
function bounds(n: GameNode) {
  const b = physicsFor(n).box ?? { x: 0, y: 0, width: n.width, height: n.height };
  return { ...b, x: b.x + n.x, y: b.y + n.y };
}
export function stepMelee(s: Simulation, p: Project, onEvent: (m: string) => void) {
  for (const n of s.nodes) {
    const a = s.melee[n.id],
      d = n.melee;
    if (!a || !d || !n.visible || !a.swinging) continue;
    const [windup, active] = attackTicks(d);
    if (a.tick < windup || a.tick >= windup + active) continue;
    const b = bounds(n),
      cx = b.x + b.width / 2,
      cy = b.y + b.height / 2,
      side = a.facing === 'Left' || a.facing === 'Right';
    const hit = side
      ? {
          x: a.facing === 'Left' ? b.x - d.reach : b.x + b.width,
          y: cy - d.width / 2,
          width: d.reach,
          height: d.width,
        }
      : {
          x: cx - d.width / 2,
          y: a.facing === 'Up' ? b.y - d.reach : b.y + b.height,
          width: d.width,
          height: d.reach,
        };
    for (let j = 0; j < s.nodes.length; j++) {
      const t = s.nodes[j],
        body = physicsFor(t),
        bit = 1 << (j % 32);
      if (
        t === n ||
        !t.visible ||
        t.tilemap ||
        body.body === 'none' ||
        !(body.layer & d.mask) ||
        a.hits[j >>> 5] & bit
      )
        continue;
      let parent = t.parent,
        child = false;
      while (parent) {
        if (parent === n.id) child = true;
        parent = s.nodes.find((v) => v.id === parent)?.parent;
      }
      if (child) continue;
      const q = bounds(t);
      if (
        hit.x >= q.x + q.width ||
        hit.x + hit.width <= q.x ||
        hit.y >= q.y + q.height ||
        hit.y + hit.height <= q.y
      )
        continue;
      a.hits[j >>> 5] |= bit;
      if (s.gameplay) signal(s.gameplay, p, 'hit', t, n.id);
      onEvent(`Melee hit · ${n.name} → ${t.name} · ${d.damage}`);
    }
  }
}
export const meleeLocked = (s: Simulation, n: GameNode) =>
  !!n.melee?.lockMovement && !!s.melee[n.id]?.swinging;
