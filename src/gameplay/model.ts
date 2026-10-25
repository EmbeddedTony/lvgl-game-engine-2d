import { meleeIssues } from '../action2d/model';
import { MAX_TEXT_SPEED } from './text-reveal';
import type { PartyDefinition } from '../rpg/model';
import { toolkitIssues, type BulletPattern, type RpgDatabase } from './toolkit';
import type { GameNode, Project } from '../model';
import { resolveScene } from '../scenes';
import { animationFrames, layeredAnimationIssues, type AnimationLayer } from '../animation/layers';

export type Trigger =
  'start' | 'interact' | 'enter' | 'exit' | 'collect' | 'click' | 'complete' | 'hit';
export type Compare = 'eq' | 'ne' | 'lt' | 'gte';
export interface StateField {
  id: string;
  name: string;
  folder: string;
  kind: 'flag' | 'counter' | 'item';
  initial: number;
  min: number;
  max: number;
  persistent: boolean;
}
export interface Condition {
  key: string;
  compare: Compare;
  value: number;
}
export interface EventPage {
  id: string;
  trigger: Trigger;
  script: string;
  when?: Condition;
}
export type Action = { id: string } & (
  | { type: 'state'; key: string; operation: 'set' | 'add'; value: number }
  | { type: 'branch'; condition: Condition; yes: string; no: string }
  | { type: 'jump'; target: string }
  | {
      type: 'say';
      speaker: string;
      text: string;
      /** Characters/second; omitted = 30, 0 = instant. */ textSpeed?: number;
      choices: { text: string; target: string }[];
    }
  | { type: 'wait'; ms: number }
  | { type: 'warp'; scene: string; x: number; y: number }
  | { type: 'visible'; node: string; value: boolean }
  | { type: 'velocity'; node: string; x: number; y: number }
  | { type: 'move'; node: string; x: number; y: number; ms: number }
  | { type: 'camera'; mode: 'pan' | 'follow'; x: number; y: number; ms: number }
  | { type: 'checkpoint'; operation: 'save' | 'load'; success: string; failure: string }
  | { type: 'emitter'; node: string; enabled: boolean }
  | { type: 'sound'; cue: string }
  | { type: 'battle'; encounter: string; win: string; lose: string; escape: string }
  | { type: 'party-rest' }
  | { type: 'end' }
);
export interface EventScript {
  id: string;
  name: string;
  folder: string;
  blocking: boolean;
  actions: Action[];
  /** Cutscenes use the same bounded VM and export format as ordinary events. */
  kind?: 'event' | 'cutscene';
  /** Optional explicit completion beat. Skipping still executes authored quest changes. */
  skipTo?: string;
}
export interface AnimationClip {
  id: string;
  name: string;
  fps: number;
  loop: boolean;
  frames: string[];
  /** Ordered bottom to top; exported as ordinary precomposed image frames. */
  layers?: AnimationLayer[];
}
export const animatorKeys = [
  'attack',
  'attackUp',
  'attackDown',
  'attackLeft',
  'attackRight',
  'idle',
  'move',
  'jump',
  'fall',
  'idleUp',
  'moveUp',
  'idleDown',
  'moveDown',
  'idleLeft',
  'moveLeft',
  'idleRight',
  'moveRight',
] as const;
export interface Animator {
  attack?: string;
  attackUp?: string;
  attackDown?: string;
  attackLeft?: string;
  attackRight?: string;
  idleUp?: string;
  moveUp?: string;
  idleDown?: string;
  moveDown?: string;
  idleLeft?: string;
  moveLeft?: string;
  idleRight?: string;
  moveRight?: string;
  idle: string;
  move: string;
  jump: string;
  fall: string;
}
export interface Gameplay {
  state: StateField[];
  scripts: EventScript[];
  animations: AnimationClip[];
  patterns?: BulletPattern[];
  projectileLimit?: number;
  rpg?: RpgDatabase;
  party?: PartyDefinition;
}
export const emptyGameplay = (): Gameplay => ({ state: [], scripts: [], animations: [] });
export const triggers: Trigger[] = [
  'start',
  'interact',
  'enter',
  'exit',
  'collect',
  'click',
  'complete',
  'hit',
];
export const compare = (a: number, op: Compare, b: number) =>
  op === 'eq' ? a === b : op === 'ne' ? a !== b : op === 'lt' ? a < b : a >= b;
export const int = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
const id = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(s);
const str = (s: unknown, max: number): s is string =>
  typeof s === 'string' && s.length <= max && !s.includes('\0');
const path = (s: unknown): s is string => str(s, 1024) && s.split('/').every(id);
const unique = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;
const bounded = <T>(xs: unknown, max: number, check: (x: T) => boolean): xs is T[] =>
  Array.isArray(xs) && xs.length <= max && xs.every((x) => x && typeof x === 'object' && check(x));
export function validCondition(c: Condition, g: Gameplay) {
  return (
    !!c &&
    g.state.some((v) => v.id === c.key) &&
    ['eq', 'ne', 'lt', 'gte'].includes(c.compare) &&
    int(c.value, -1000000, 1000000)
  );
}
/** Structural and referential validation runs at import and before export. */
export function gameplayIssues(p: Project): string[] {
  const g = p.gameplay ?? emptyGameplay();
  const fail = (s: string) => [s];
  if (
    !g ||
    !bounded<StateField>(
      g.state,
      512,
      (v) =>
        id(v.id) &&
        str(v.name, 128) &&
        str(v.folder, 128) &&
        ['flag', 'counter', 'item'].includes(v.kind) &&
        int(v.min, -1000000, 1000000) &&
        int(v.max, v.min, 1000000) &&
        int(v.initial, v.min, v.max) &&
        typeof v.persistent === 'boolean' &&
        (v.kind !== 'flag' || (v.min === 0 && v.max === 1)),
    ) ||
    !unique(g.state)
  )
    return fail('Gameplay state: use up to 512 unique, bounded integer fields.');
  if (
    !bounded<AnimationClip>(
      g.animations,
      64,
      (c) =>
        id(c.id) &&
        str(c.name, 128) &&
        int(c.fps, 1, 60) &&
        typeof c.loop === 'boolean' &&
        Array.isArray(c.frames) &&
        c.frames.length > 0 &&
        c.frames.length <= 32 &&
        c.frames.every((f) => p.sprites.some((s) => s.id === f)),
    ) ||
    !unique(g.animations)
  )
    return fail('Animation clips need 1–32 existing sprite frames, 1–60 FPS and unique IDs.');
  if (
    !bounded<EventScript>(
      g.scripts,
      512,
      (s) =>
        id(s.id) &&
        str(s.name, 128) &&
        str(s.folder, 128) &&
        typeof s.blocking === 'boolean' &&
        (s.kind === undefined || ['event', 'cutscene'].includes(s.kind)) &&
        (s.kind !== 'cutscene' || s.blocking) &&
        (s.skipTo === undefined || s.actions.some((a) => a.id === s.skipTo)) &&
        Array.isArray(s.actions) &&
        s.actions.length <= 128 &&
        s.actions.every((a) => a && id(a.id)) &&
        unique(s.actions),
    ) ||
    !unique(g.scripts)
  )
    return fail(
      'Gameplay scripts: use up to 512 scripts and 128 uniquely identified actions per script.',
    );
  for (const s of g.scripts) {
    const dest = (v: string) => v === '' || s.actions.some((a) => a.id === v);
    for (const a of s.actions) {
      let ok = false;
      switch (a.type) {
        case 'state':
          ok =
            g.state.some((v) => v.id === a.key) &&
            ['set', 'add'].includes(a.operation) &&
            int(a.value, -1000000, 1000000);
          break;
        case 'branch':
          ok = validCondition(a.condition, g) && dest(a.yes) && dest(a.no);
          break;
        case 'jump':
          ok = dest(a.target);
          break;
        case 'say':
          ok =
            str(a.speaker, 64) &&
            str(a.text, 512) &&
            (a.textSpeed === undefined || int(a.textSpeed, 0, MAX_TEXT_SPEED)) &&
            bounded<{ text: string; target: string }>(
              a.choices,
              4,
              (c) => str(c.text, 64) && dest(c.target),
            );
          break;
        case 'wait':
          ok = int(a.ms, 0, 600000);
          break;
        case 'warp':
          ok =
            p.scenes.some((s) => s.id === a.scene && resolveScene(p, s).some((n) => n.player)) &&
            int(a.x, -4096, 4096) &&
            int(a.y, -4096, 4096);
          break;
        case 'visible':
          ok = path(a.node) && typeof a.value === 'boolean';
          break;
        case 'velocity':
          ok = path(a.node) && int(a.x, -1200, 1200) && int(a.y, -1200, 1200);
          break;
        case 'move':
          ok =
            s.kind === 'cutscene' &&
            s.blocking &&
            path(a.node) &&
            int(a.x, -4096, 4096) &&
            int(a.y, -4096, 4096) &&
            int(a.ms, 0, 60000);
          break;
        case 'camera':
          ok =
            s.kind === 'cutscene' &&
            s.blocking &&
            ['pan', 'follow'].includes(a.mode) &&
            int(a.x, 0, 4096) &&
            int(a.y, 0, 4096) &&
            int(a.ms, 0, 60000);
          break;
        case 'checkpoint':
          ok = ['save', 'load'].includes(a.operation) && dest(a.success) && dest(a.failure);
          break;
        case 'emitter':
          ok = path(a.node) && typeof a.enabled === 'boolean';
          break;
        case 'sound':
          ok = p.audio.some((c) => c.id === a.cue);
          break;
        case 'battle':
          ok =
            !!g.party &&
            !!g.rpg?.encounters.some((e) => e.id === a.encounter) &&
            dest(a.win) &&
            dest(a.lose) &&
            dest(a.escape);
          break;
        case 'party-rest':
          ok = !!g.party;
          break;
        case 'end':
          ok = true;
          break;
      }
      if (!ok)
        return fail(`${s.name}: invalid ${a.type ?? 'unknown'} action or missing resource/step.`);
    }
  }
  for (const scene of p.scenes)
    for (const n of scene.nodes) {
      if (
        n.stateBindings !== undefined &&
        (!n.stateBindings ||
          typeof n.stateBindings !== 'object' ||
          Array.isArray(n.stateBindings) ||
          Object.keys(n.stateBindings).length > 16 ||
          Object.entries(n.stateBindings).some(
            ([from, to]) =>
              !g.state.some((v) => v.id === from) || !g.state.some((v) => v.id === to),
          ))
      )
        return fail(`${n.name}: state remaps need existing fields (maximum 16).`);
      if (
        n.events !== undefined &&
        !bounded<EventPage>(
          n.events,
          8,
          (e) =>
            id(e.id) &&
            triggers.includes(e.trigger) &&
            g.scripts.some((s) => s.id === e.script) &&
            (e.when === undefined || validCondition(e.when, g)),
        )
      )
        return fail(`${scene.name} / ${n.name}: invalid event page.`);
      if (n.events && !unique(n.events)) return fail(`${n.name}: duplicate event page IDs.`);
      if (
        n.animator !== undefined &&
        (!n.animator ||
          typeof n.animator !== 'object' ||
          Array.isArray(n.animator) ||
          n.kind !== 'sprite' ||
          animatorKeys.some((k) =>
            n.animator![k] === undefined
              ? ['idle', 'move', 'jump', 'fall'].includes(k)
              : typeof n.animator![k] !== 'string' ||
                (!!n.animator![k] && !g.animations.some((c) => c.id === n.animator![k])),
          ))
      )
        return fail(`${n.name}: animator must reference existing clips on a sprite.`);
    }
  // Literal node paths are scene-local. self/player/other keep scripts reusable across instances.
  for (const scene of p.scenes) {
    const nodes = resolveScene(p, scene);
    for (const n of nodes)
      if (
        n.stateBindings &&
        Object.entries(n.stateBindings).some(
          ([from, to]) => !g.state.some((v) => v.id === from) || !g.state.some((v) => v.id === to),
        )
      )
        return fail(`${scene.name} / ${n.name}: an instance state remap has a missing field.`);
    for (const n of nodes)
      for (const page of n.events ?? []) {
        const script = g.scripts.find((s) => s.id === page.script)!;
        for (const a of script.actions)
          if (
            (a.type === 'visible' ||
              a.type === 'velocity' ||
              a.type === 'emitter' ||
              a.type === 'move') &&
            !['self', 'player', 'other'].includes(a.node) &&
            !nodes.some((x) => x.id === a.node)
          )
            return fail(
              `${scene.name} / ${script.name}: node ${a.node} does not exist. Use self/player/other for reusable scripts.`,
            );
      }
  }
  return [...layeredAnimationIssues(p), ...toolkitIssues(p), ...meleeIssues(p)];
}
export function animationAsset(
  n: GameNode,
  clips: AnimationClip[],
  seconds: number,
  motion = 'idle',
): string {
  const id = n.animator?.[motion as keyof Animator] || n.animator?.idle;
  const clip = clips.find((c) => c.id === id);
  if (!clip) return n.asset;
  const tick = Math.floor(seconds * clip.fps + 0.00001);
  return animationFrames(clip)[
    clip.loop ? tick % clip.frames.length : Math.min(tick, clip.frames.length - 1)
  ];
}
