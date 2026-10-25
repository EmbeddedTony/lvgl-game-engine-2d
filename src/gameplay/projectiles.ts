import type { GameNode, Project } from '../model';
import { makeNode } from '../model';
import type { Simulation } from '../simulation';
import { colliderBox, physicsFor } from '../physics';
import type { BulletPattern } from './toolkit';
import { signal } from './runtime';
export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  remaining: number;
  pattern: BulletPattern;
  owner: string;
}
export interface ProjectileState {
  slots: (Projectile | null)[];
  dropped: number;
  emitters: Record<string, { time: number; angle: number; enabled: boolean }>;
}
export const createProjectiles = (nodes: GameNode[], capacity = 64): ProjectileState => ({
  slots: Array(capacity).fill(null),
  dropped: 0,
  emitters: Object.fromEntries(
    nodes
      .filter((n) => n.emitter)
      .map((n) => [n.id, { time: 0, angle: 0, enabled: n.emitter!.autoplay }]),
  ),
});
export function setEmitter(sim: Simulation, id: string, enabled: boolean) {
  const e = sim.projectiles.emitters[id];
  if (!e) return false;
  if (enabled && !e.enabled) {
    e.time = 0;
    e.angle = 0;
  }
  e.enabled = enabled;
  return true;
}
/** Segment/AABB slab test mirrors C. A hit retires the shot; no per-frame node spawning. */
function hitTime(b: Projectile, dx: number, dy: number, n: GameNode) {
  const a = colliderBox(n),
    r = b.pattern.radius;
  let near = 0,
    far = 1;
  for (const [origin, delta, lo, hi] of [
    [b.x, dx, a.x - r, a.x + a.width + r],
    [b.y, dy, a.y - r, a.y + a.height + r],
  ]) {
    if (Math.abs(delta) < 0.000001) {
      if (origin < lo || origin > hi) return 2;
    } else {
      const v = (lo - origin) / delta,
        w = (hi - origin) / delta;
      near = Math.max(near, Math.min(v, w));
      far = Math.min(far, Math.max(v, w));
      if (near > far) return 2;
    }
  }
  return near;
}
export function stepProjectiles(s: Simulation, p: Project, onEvent: (message: string) => void) {
  const pool = s.projectiles,
    byId = new Map(s.nodes.map((n) => [n.id, n]));
  const related = (a: GameNode, b: GameNode) => {
    for (let n: GameNode | undefined = a; n; n = n.parent ? byId.get(n.parent) : undefined)
      if (n === b) return true;
    for (let n: GameNode | undefined = b; n; n = n.parent ? byId.get(n.parent) : undefined)
      if (n === a) return true;
    const character = (n: GameNode) => {
      for (let p: GameNode | undefined = n; p; p = p.parent ? byId.get(p.parent) : undefined)
        if (physicsFor(p).body === 'character') return p;
    };
    const owner = character(a);
    return !!owner && owner === character(b);
  };
  for (let slot = 0; slot < pool.slots.length; slot++) {
    const b = pool.slots[slot];
    if (!b || b.remaining <= 0) continue;
    const seconds = Math.min(1 / 60, b.remaining),
      dx = b.vx * seconds,
      dy = b.vy * seconds;
    let best = 2,
      hit: GameNode | undefined;
    for (const n of s.nodes) {
      const physics = physicsFor(n),
        owner = byId.get(b.owner);
      if (
        !n.visible ||
        !['character', 'area'].includes(physics.body) ||
        !(b.pattern.mask & physics.layer) ||
        (owner && related(owner, n))
      )
        continue;
      const t = hitTime(b, dx, dy, n);
      if (t < best) {
        best = t;
        hit = n;
      }
    }
    b.x += dx * (hit ? best : 1);
    b.y += dy * (hit ? best : 1);
    b.remaining -= seconds;
    if (hit) {
      if (s.gameplay) signal(s.gameplay, p, 'hit', hit, b.owner);
      onEvent(
        `Projectile hit ${hit.name} · ${b.pattern.name} · ${b.pattern.damage} damage payload`,
      );
      b.remaining = 0;
    }
  }
  for (const n of s.nodes) {
    const emitter = pool.emitters[n.id],
      pattern = p.gameplay?.patterns?.find((v) => v.id === n.emitter?.pattern);
    if (!emitter?.enabled || !pattern || !n.visible) continue;
    emitter.time -= 1 / 60;
    if (emitter.time > 0.000001) continue;
    const x = n.x + n.width / 2,
      y = n.y + n.height / 2;
    let angle = pattern.angle + emitter.angle;
    if (pattern.mode === 'aimed') {
      const target = s.nodes.find((n) => n.player && n.visible);
      if (target)
        angle +=
          (Math.atan2(target.y + target.height / 2 - y, target.x + target.width / 2 - x) * 180) /
          Math.PI;
    }
    for (let shot = 0; shot < pattern.count; shot++) {
      const slot = pool.slots.findIndex((b) => !b || b.remaining <= 0);
      if (slot < 0) {
        pool.dropped = Math.min(0xffffffff, pool.dropped + 1);
        continue;
      }
      const spread =
        pattern.mode === 'ring'
          ? (360 * shot) / pattern.count
          : pattern.count === 1
            ? 0
            : pattern.spread * (shot / (pattern.count - 1) - 0.5);
      const radians = ((angle + spread) * Math.PI) / 180;
      pool.slots[slot] = {
        x,
        y,
        vx: Math.cos(radians) * pattern.speed,
        vy: Math.sin(radians) * pattern.speed,
        remaining: pattern.lifetimeMs / 1000,
        pattern,
        owner: n.id,
      };
    }
    emitter.angle = (emitter.angle + pattern.rotation) % 360;
    emitter.time += pattern.intervalMs / 1000;
  }
}
/** Transient render records. They never enter the authored tree or collision index. */
export function projectileNodes(s?: Simulation): GameNode[] {
  return s
    ? s.projectiles.slots.flatMap((b, i) =>
        b && b.remaining > 0
          ? [
              makeNode('rect', {
                id: '__projectile_' + i,
                name: 'Projectile',
                x: b.x - b.pattern.radius,
                y: b.y - b.pattern.radius,
                width: b.pattern.radius * 2,
                height: b.pattern.radius * 2,
                radius: b.pattern.radius,
                color: b.pattern.color,
              }),
            ]
          : [],
      )
    : [];
}
