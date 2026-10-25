import type { GameNode, Project } from './model';
import { resolveScene, type ResolvedNode } from './scenes';
import type { Simulation } from './simulation';
import { physicsFor } from './physics';
import { signal } from './gameplay/runtime';
import { cancelBattle } from './rpg/runtime';
import { releaseTrack } from './gameplay/cinematics';

export interface PrefabHandle {
  id: string;
  generation: number;
}
export interface PrefabState {
  definitions: ResolvedNode[];
  live: Record<string, number>;
  counted: Set<string>;
  collected: Set<string>;
}
let serial = 0;
export function createPrefabState(
  p: Pick<Project, 'scenes'>,
  scene: Project['scenes'][number],
): PrefabState {
  const definitions = structuredClone(resolveScene(p, scene));
  return {
    definitions,
    live: {},
    counted: new Set(
      definitions.filter((n) => n.collectible && n.effectiveVisible).map((n) => n.id),
    ),
    collected: new Set(),
  };
}
function members(s: Simulation, root: string) {
  const ids = new Set([root]);
  for (const n of s.prefabs.definitions) if (n.parent && ids.has(n.parent)) ids.add(n.id);
  return ids;
}
export function prefabNode(
  s: Simulation,
  handle: PrefabHandle,
  childPath = '',
): GameNode | undefined {
  if (!handle.generation || s.prefabs.live[handle.id] !== handle.generation) return;
  const id = childPath ? `${handle.id}/${childPath}` : handle.id;
  return s.nodes.find((n) => n.id === id && members(s, handle.id).has(id));
}
/** Reset contacts and work owned by a slot before it can be reused. */
function clear(s: Simulation, ids: Set<string>) {
  for (const contact of s.areaContacts)
    if (contact.split('\0').some((id) => ids.has(id))) s.areaContacts.delete(contact);
  for (let i = 0; i < s.projectiles.slots.length; i++)
    if (ids.has(s.projectiles.slots[i]?.owner ?? '')) s.projectiles.slots[i] = null;
  for (let i = 0; i < s.nodes.length; i++) {
    const n = s.nodes[i],
      attack = s.melee[n.id];
    if (ids.has(n.id)) {
      delete s.animations[n.id];
      if (attack) {
        attack.tick = 0;
        attack.swinging = false;
        attack.facing = 'Down';
        attack.hits.fill(0);
      }
      const p = physicsFor(n);
      s.bodies[n.id] = {
        velocityX: p.velocityX,
        velocityY: p.velocityY,
        onFloor: false,
        onWall: false,
        onCeiling: false,
      };
      if (n.emitter)
        s.projectiles.emitters[n.id] = { time: 0, angle: 0, enabled: n.emitter.autoplay };
    }
    if (ids.has(n.id))
      for (const state of Object.values(s.melee)) state.hits[i >>> 5] &= ~(1 << (i & 31));
  }
  const session = s.gameplay;
  if (session) {
    const retired = session.runners.filter(
      (r) => ids.has(r.owner) || ids.has(r.other) || ids.has(r.track?.node ?? ''),
    );
    for (const r of retired) releaseTrack(s, r);
    if (retired.some((r) => r.cinematic)) s.cameraOverride = undefined;
    if (retired.some((r) => r.battle)) cancelBattle(session);
    if (retired.some((r) => r.checkpointPending)) session.checkpointFeedback?.notify('failed');
    if (session.dialogue && retired.includes(session.dialogue.runner)) session.dialogue = null;
    session.runners = session.runners.filter((r) => !retired.includes(r));
  }
}
export function spawnPrefab(
  s: Simulation,
  p: Project,
  source: string,
  x: number,
  y: number,
): PrefabHandle | undefined {
  if (![x, y].every(Number.isFinite)) return;
  const root = s.nodes.find(
    (n) =>
      n.spawnable &&
      n.scene === source &&
      !s.prefabs.live[n.id] &&
      (!n.parent || s.nodes.find((a) => a.id === n.parent)?.visible),
  );
  if (!root) return;
  const ids = members(s, root.id),
    definitions = s.prefabs.definitions.filter((n) => ids.has(n.id)),
    origin = definitions[0];
  if (
    definitions.some(
      (n) =>
        Math.abs(x + n.worldX - origin.worldX) > 32767 ||
        Math.abs(y + n.worldY - origin.worldY) > 32767,
    )
  )
    return;
  clear(s, ids);
  const handle = { id: root.id, generation: ++serial };
  s.prefabs.live[root.id] = handle.generation;
  for (const d of definitions) {
    const n = s.nodes.find((n) => n.id === d.id)!;
    Object.assign(n, structuredClone(d), {
      x: x + d.worldX - origin.worldX,
      y: y + d.worldY - origin.worldY,
    });
    s.hierarchy[n.id] = { x: n.x, y: n.y, visible: d.visible };
    n.visible = d.visible && (!n.parent || !!s.nodes.find((a) => a.id === n.parent)?.visible);
    s.prefabs.collected.delete(n.id);
    if (n.collectible && n.visible && s.total < 65535) {
      s.total++;
      s.prefabs.counted.add(n.id);
    }
  }
  for (const d of definitions) {
    const n = s.nodes.find((n) => n.id === d.id)!;
    if (n.visible && s.gameplay) signal(s.gameplay, p, 'start', n);
  }
  return handle;
}
export function despawnPrefab(s: Simulation, handle: PrefabHandle): boolean {
  if (!prefabNode(s, handle)) return false;
  const ids = members(s, handle.id);
  clear(s, ids);
  for (const n of s.nodes)
    if (ids.has(n.id)) {
      if (s.prefabs.counted.has(n.id) && !s.prefabs.collected.has(n.id)) s.total--;
      s.prefabs.counted.delete(n.id);
      n.visible = false;
    }
  delete s.prefabs.live[handle.id];
  return true;
}
