import { createMelee, prepareMelee, stepMelee, type MeleeState } from './action2d/runtime';
import { stepRpgInput } from './rpg/view';
import { inputMask } from './gameplay/runtime';
import { createProjectiles, stepProjectiles } from './gameplay/projectiles';
import type { ProjectileState } from './gameplay/projectiles';
import { signal } from './gameplay/runtime';
import {
  createSession,
  enterGameplay,
  gameplayBlocking,
  stepGameplay,
  animate,
  type GameplaySession,
} from './gameplay/runtime';
import type { Camera2D } from './camera2d';
import type { Project, Scene, GameNode } from './model';
import { sortedNodes } from './model';
import { displaySceneNodes } from './scenes';
import { physicsFor } from './physics';
import { physicsStep, type BodyState } from './physics-simulation';
import { createPrefabState, type PrefabState } from './prefabs';
export interface Simulation {
  prefabs: PrefabState;
  projectiles: ProjectileState;
  melee: Record<string, MeleeState>;
  meleePrevious: number;
  gameplay?: GameplaySession;
  animations: Record<
    string,
    {
      clip: string;
      time: number;
      facing?: string;
    }
  >;
  camera2d?: Camera2D;
  cameraOverride?: {
    x: number;
    y: number;
  };
  time: number;
  nodes: GameNode[];
  bodies: Record<string, BodyState>;
  areaContacts: Set<string>;
  jumpHeld: boolean;
  score: number;
  total: number;
  complete: boolean;
  accumulator: number;
  hierarchy: Record<
    string,
    {
      x: number;
      y: number;
      visible: boolean;
    }
  >;
}
export function begin(
  scene: Scene,
  project: Pick<Project, 'scenes'> & Partial<Project> = { scenes: [scene] },
  session?: GameplaySession,
): Simulation {
  const nodes = structuredClone(displaySceneNodes(project, scene));
  const gameplay = project.gameplay ? (session ?? createSession(project as Project)) : undefined;
  if (gameplay) enterGameplay(gameplay, project as Project, nodes);
  return {
    prefabs: createPrefabState(project, scene),
    gameplay,
    melee: createMelee(nodes),
    meleePrevious: 0,
    projectiles: createProjectiles(nodes, project.gameplay?.projectileLimit ?? 64),
    animations: {},
    camera2d: scene.camera2d ? { ...scene.camera2d } : undefined,
    time: 0,
    nodes: sortedNodes({ ...scene, nodes }),
    bodies: Object.fromEntries(
      nodes.map((n) => [
        n.id,
        {
          velocityX: physicsFor(n).velocityX,
          velocityY: physicsFor(n).velocityY,
          onFloor: false,
          onWall: false,
          onCeiling: false,
        },
      ]),
    ),
    areaContacts: new Set(),
    jumpHeld: false,
    score: 0,
    total: nodes.filter((n) => n.visible && n.collectible).length,
    complete: false,
    accumulator: 0,
    hierarchy: Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y, visible: n.visible }])),
  };
}
function syncHierarchy(s: Simulation) {
  const deltas = new Map<
    string,
    {
      x: number;
      y: number;
    }
  >();
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const sync = (
    n: GameNode,
  ): {
    x: number;
    y: number;
  } => {
    if (deltas.has(n.id)) return deltas.get(n.id)!;
    const previous = s.hierarchy[n.id],
      parent = n.parent ? byId.get(n.parent) : undefined;
    if (parent) {
      const delta = sync(parent);
      n.x += delta.x;
      n.y += delta.y;
    }
    n.visible =
      previous.visible && (!n.spawnable || !!s.prefabs.live[n.id]) && (!parent || parent.visible);
    const delta = { x: n.x - previous.x, y: n.y - previous.y };
    previous.x = n.x;
    previous.y = n.y;
    deltas.set(n.id, delta);
    return delta;
  };
  for (const n of s.nodes) sync(n);
}
export function setSimulationPosition(s: Simulation, id: string, x: number, y: number) {
  const n = s.nodes.find((n) => n.id === id);
  if (!n) return false;
  n.x = x;
  n.y = y;
  if (s.bodies[id]) s.bodies[id].gridActive = false;
  syncHierarchy(s);
  return true;
}
export function advance(
  s: Simulation,
  p: Pick<Project, 'width' | 'height'> & Partial<Project>,
  keys: Set<string>,
  ms: number,
  onCue: (id: string) => void,
  onEvent: (message: string) => void,
) {
  s.accumulator += Math.min(100, Math.max(0, ms)) / 1000;
  while (s.accumulator + 0.000001 >= 1 / 60) {
    s.accumulator -= 1 / 60;
    s.time += 1 / 60;
    const blocked = s.gameplay && gameplayBlocking(s.gameplay, p as Project);
    syncHierarchy(s);
    if (!blocked) prepareMelee(s, keys);
    if (!blocked)
      physicsStep(
        s,
        { width: s.camera2d?.worldWidth ?? p.width, height: s.camera2d?.worldHeight ?? p.height },
        keys,
        () => syncHierarchy(s),
        onCue,
        onEvent,
        (trigger, node, other) => {
          if (s.gameplay) signal(s.gameplay, p as Project, trigger, node, other);
        },
      );
    if (!blocked) stepMelee(s, p as Project, onEvent);
    if (!blocked) stepProjectiles(s, p as Project, onEvent);
    if (s.gameplay) {
      stepGameplay(s.gameplay, s, p as Project, keys, onCue);
      stepRpgInput(s.gameplay, p as Project, inputMask(keys) & 255);
    }
    animate(s, p as Project);
    syncHierarchy(s);
  }
}
