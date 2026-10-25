import { animationFrames } from '../animation/layers';
import { cinematicCamera, stepTrack, releaseTrack, type CinematicTrack } from './cinematics';
import { saveState, restoreState } from './save';
import type { CheckpointFeedback } from './checkpoint-feedback';
import {
  createRpg,
  cancelBattle,
  startBattle,
  partyRest,
  rpgBlocking,
  battleActive,
  type RpgSession,
} from '../rpg/runtime';
import { setEmitter } from './projectiles';
import { dialogueBottom, dialoguePages } from './dialogue';
import {
  createTextReveal,
  isTextRevealing,
  revealAllText,
  stepTextReveal,
  type TextReveal,
} from './text-reveal';
import type { GameNode, Project } from '../model';
import type { Simulation } from '../simulation';
import { compare, emptyGameplay, type Action, type Condition, type Trigger } from './model';

export interface Runner {
  script: string;
  pc: number;
  owner: string;
  other: string;
  wait: number;
  dialog: boolean;
  battle?: boolean;
  track?: CinematicTrack;
  cinematic?: boolean;
  started?: boolean;
  checkpointPending?: boolean;
}
export interface Dialogue {
  speaker: string;
  text: string;
  choices: string[];
  selected: number;
  runner: Runner;
  pages: string[];
  page: number;
  bottom: number;
  reveal: TextReveal;
}
export interface GameplaySession {
  checkpointStore?: { read: () => Uint8Array | null; write: (data: Uint8Array) => void };
  checkpointFeedback?: CheckpointFeedback;
  rpg?: RpgSession;
  values: Record<string, number>;
  runners: Runner[];
  dialogue: Dialogue | null;
  previous: number;
  facingX: number;
  facingY: number;
  warp: { scene: string; x: number; y: number } | null;
  diagnostic: string;
}
export const inputMask = (keys: Set<string>) =>
  (keys.has('a') || keys.has('arrowleft') ? 1 : 0) |
  (keys.has('d') || keys.has('arrowright') ? 2 : 0) |
  (keys.has('w') || keys.has('arrowup') ? 4 : 0) |
  (keys.has('s') || keys.has('arrowdown') ? 8 : 0) |
  (keys.has(' ') ? 16 : 0) |
  (keys.has('e') || keys.has('z') || keys.has('enter') ? 32 : 0) |
  (keys.has('p') ? 64 : 0);
export function createSession(p: Project): GameplaySession {
  return {
    rpg: createRpg(p),
    values: Object.fromEntries((p.gameplay?.state ?? []).map((v) => [v.id, v.initial])),
    runners: [],
    dialogue: null,
    previous: 0,
    facingX: 0,
    facingY: 1,
    warp: null,
    diagnostic: '',
  };
}
export function conditionMet(s: GameplaySession, c?: Condition, owner?: GameNode) {
  return !c || compare(s.values[owner?.stateBindings?.[c.key] ?? c.key] ?? 0, c.compare, c.value);
}
export function stateSet(s: GameplaySession, p: Project, key: string, value: number) {
  const field = p.gameplay?.state.find((v) => v.id === key);
  if (!field || !Number.isFinite(value)) return false;
  s.values[key] = Math.max(field.min, Math.min(field.max, Math.trunc(value)));
  return true;
}
export function startScript(s: GameplaySession, p: Project, id: string, owner = '', other = '') {
  if (
    !p.gameplay?.scripts.some((x) => x.id === id) ||
    s.runners.some((r) => r.script === id && r.owner === owner)
  )
    return false;
  if (
    p.gameplay?.scripts.find((x) => x.id === id)?.kind === 'cutscene' &&
    s.runners.some((r) => p.gameplay?.scripts.find((x) => x.id === r.script)?.kind === 'cutscene')
  )
    return false;
  if (s.runners.length >= 8) {
    s.diagnostic = 'Eight event scripts are already active.';
    return false;
  }
  s.runners.push({
    script: id,
    pc: 0,
    owner,
    other,
    wait: 0,
    dialog: false,
    cinematic: p.gameplay?.scripts.find((x) => x.id === id)?.kind === 'cutscene',
  });
  return true;
}
export function signal(
  s: GameplaySession,
  p: Project,
  trigger: Trigger,
  node: GameNode,
  other = '',
) {
  const page = [...(node.events ?? [])]
    .reverse()
    .find((e) => e.trigger === trigger && conditionMet(s, e.when, node));
  return !!page && startScript(s, p, page.script, node.id, other);
}
export function enterGameplay(s: GameplaySession, p: Project, nodes: GameNode[]) {
  cancelBattle(s);
  if (s.runners.some((r) => r.checkpointPending)) s.checkpointFeedback?.notify('failed');
  s.runners = [];
  s.dialogue = null;
  s.warp = null;
  // Preserve held input across a warp: it must be released to confirm the next conversation.
  for (const n of nodes) if (n.visible) signal(s, p, 'start', n);
}
export function gameplayBlocking(s: GameplaySession, p: Project) {
  return (
    rpgBlocking(s.rpg) ||
    !!s.dialogue ||
    s.runners.some((r) => p.gameplay?.scripts.find((x) => x.id === r.script)?.blocking)
  );
}
function target(sim: Simulation, r: Runner, id: string) {
  return id === 'player'
    ? sim.nodes.find((n) => n.player)
    : sim.nodes.find((n) => n.id === (id === 'self' ? r.owner : id === 'other' ? r.other : id));
}
function destination(actions: Action[], id: string, otherwise: number) {
  return id ? actions.findIndex((a) => a.id === id) : otherwise;
}
/** Fixed bounded coroutines. No eval, JS snippets, recursive calls or unbounded event queue. */
export function stepGameplay(
  s: GameplaySession,
  sim: Simulation,
  p: Project,
  keys: Set<string>,
  onCue: (id: string) => void,
) {
  const mask = inputMask(keys),
    pressed = mask & ~s.previous;
  s.previous = mask;
  if (!gameplayBlocking(s, p)) {
    if (mask & 3) {
      s.facingX = mask & 2 ? 1 : -1;
      s.facingY = 0;
    } else if (mask & 12) {
      s.facingY = mask & 8 ? 1 : -1;
      s.facingX = 0;
    }
  }
  if (s.dialogue) {
    const d = s.dialogue;
    if (!isTextRevealing(d.text, d.reveal) && d.choices.length && pressed & 12)
      d.selected = (d.selected + (pressed & 8 ? 1 : -1) + d.choices.length) % d.choices.length;
    if (pressed & 32) {
      chooseDialogue(s, p, d.selected);
    } else stepTextReveal(d.text, d.reveal, 1 / 60);
  } else if (pressed & 32 && !gameplayBlocking(s, p)) {
    const player = sim.nodes.find((n) => n.player && n.visible);
    if (player) {
      const px = player.x + player.width / 2,
        py = player.y + player.height / 2;
      const nearby = sim.nodes
        .filter(
          (n) =>
            n.visible &&
            n.id !== player.id &&
            (n.events ?? []).some((e) => e.trigger === 'interact' && conditionMet(s, e.when, n)),
        )
        .map((n) => ({ n, dx: n.x + n.width / 2 - px, dy: n.y + n.height / 2 - py }))
        .filter(
          (v) => v.dx * v.dx + v.dy * v.dy <= 40 * 40 && v.dx * s.facingX + v.dy * s.facingY >= -8,
        )
        .sort((a, b) => a.dx * a.dx + a.dy * a.dy - (b.dx * b.dx + b.dy * b.dy));
      if (nearby[0]) signal(s, p, 'interact', nearby[0].n, player.id);
    }
  }
  for (const r of [...s.runners]) {
    if (r.dialog) continue;
    if (stepTrack(sim, p, r)) continue;
    if (r.wait > 0) {
      r.wait -= 1000 / 60;
      if (r.wait > 0.001) continue;
    }
    const script = p.gameplay?.scripts.find((x) => x.id === r.script);
    if (!script) {
      if (r.checkpointPending) s.checkpointFeedback?.notify('failed');
      s.runners = s.runners.filter((x) => x !== r);
      continue;
    }
    r.started = true;
    let budget = 32;
    while (r.pc >= 0 && r.pc < script.actions.length && budget-- > 0) {
      const a = script.actions[r.pc];
      const owner = sim.nodes.find((n) => n.id === r.owner);
      const stateKey = (id: string) => owner?.stateBindings?.[id] ?? id;
      switch (a.type) {
        case 'state':
          stateSet(
            s,
            p,
            stateKey(a.key),
            (a.operation === 'add' ? s.values[stateKey(a.key)] : 0) + a.value,
          );
          r.pc++;
          break;
        case 'branch':
          r.pc = destination(
            script.actions,
            conditionMet(s, a.condition, owner) ? a.yes : a.no,
            r.pc + 1,
          );
          break;
        case 'jump':
          r.pc = destination(script.actions, a.target, r.pc + 1);
          break;
        case 'say':
          if (rpgBlocking(s.rpg)) {
            budget = 0;
            break;
          }
          if (!s.dialogue) {
            const bottom = dialogueBottom(p.height, sim.nodes, a.choices.length);
            const pages = dialoguePages(a.text, p.width, bottom + 8, a.choices.length);
            s.dialogue = {
              speaker: a.speaker,
              text: pages[0],
              reveal: createTextReveal(pages[0], a.textSpeed),
              pages,
              page: 0,
              bottom,
              choices: pages.length === 1 ? a.choices.map((c) => c.text) : [],
              selected: 0,
              runner: r,
            };
            r.dialog = true;
          }
          budget = 0;
          break;
        case 'wait':
          r.wait = a.ms;
          r.pc++;
          budget = 0;
          break;
        case 'warp':
          if (!s.warp) s.warp = { scene: a.scene, x: a.x, y: a.y };
          r.pc = script.actions.length;
          break;
        case 'visible': {
          const n = target(sim, r, a.node);
          if (n) {
            n.visible = a.value;
            sim.hierarchy[n.id].visible = a.value;
          }
          r.pc++;
          break;
        }
        case 'velocity': {
          const n = target(sim, r, a.node);
          if (n && sim.bodies[n.id]) {
            sim.bodies[n.id].velocityX = a.x;
            sim.bodies[n.id].velocityY = a.y;
          }
          r.pc++;
          break;
        }
        case 'move': {
          const n = target(sim, r, a.node);
          if (n)
            r.track = {
              node: n.id,
              fromX: n.x,
              fromY: n.y,
              toX: a.x,
              toY: a.y,
              elapsed: 0,
              duration: a.ms,
            };
          r.pc++;
          if (r.track) stepTrack(sim, p, r);
          budget = 0;
          break;
        }
        case 'camera': {
          if (a.mode === 'follow') sim.cameraOverride = undefined;
          else {
            const from = cinematicCamera(sim, p);
            r.track = {
              node: '',
              fromX: from.x,
              fromY: from.y,
              toX: a.x,
              toY: a.y,
              elapsed: 0,
              duration: a.ms,
            };
            stepTrack(sim, p, r);
          }
          r.pc++;
          budget = 0;
          break;
        }
        case 'checkpoint': {
          if (a.operation === 'save' && s.checkpointFeedback) {
            r.checkpointPending = true;
            if (!s.checkpointFeedback.notify('saving')) {
              budget = 0;
              break;
            }
          }
          let ok = false;
          try {
            if (a.operation === 'save' && s.checkpointStore) {
              s.checkpointStore.write(saveState(s, p));
              ok = true;
            } else if (a.operation === 'load') {
              const data = s.checkpointStore?.read();
              ok = !!data && restoreState(s, p, data);
            }
          } catch {
            /* Full/unavailable storage follows the authored failure branch. */
          }
          r.checkpointPending = false;
          if (a.operation === 'save') s.checkpointFeedback?.notify(ok ? 'saved' : 'failed');
          r.pc = destination(script.actions, ok ? a.success : a.failure, r.pc + 1);
          budget = 0;
          break;
        }
        case 'emitter': {
          const n = target(sim, r, a.node);
          if (n) setEmitter(sim, n.id, a.enabled);
          r.pc++;
          break;
        }
        case 'sound':
          onCue(a.cue);
          r.pc++;
          break;
        case 'party-rest':
          partyRest(s, p);
          r.pc++;
          break;
        case 'battle':
          if (r.battle) {
            if (battleActive(s.rpg)) {
              budget = 0;
              break;
            }
            const result = s.rpg?.result;
            r.battle = false;
            if (s.rpg) s.rpg.claimed = false;
            r.pc = destination(
              script.actions,
              result === 'victory' ? a.win : result === 'escaped' ? a.escape : a.lose,
              r.pc + 1,
            );
          } else if (battleActive(s.rpg) || s.rpg?.claimed || s.dialogue) budget = 0;
          else if (startBattle(s, p, a.encounter)) {
            r.battle = true;
            s.rpg!.claimed = true;
            s.rpg!.previous = mask;
            budget = 0;
          } else r.pc = destination(script.actions, a.lose, r.pc + 1);
          break;
        case 'end':
          r.pc = script.actions.length;
          break;
      }
    }
    if ((r.pc < 0 || r.pc >= script.actions.length) && !r.track) {
      releaseTrack(sim, r);
      if (script.kind === 'cutscene') sim.cameraOverride = undefined;
      s.runners = s.runners.filter((x) => x !== r);
    }
  }
}
/** Explicit completion beat keeps skips from bypassing rewards and quest flags. */
export function skipCutscene(s: GameplaySession, sim: Simulation, p: Project) {
  const r = s.runners.find(
    (r) => p.gameplay?.scripts.find((x) => x.id === r.script)?.kind === 'cutscene',
  );
  const script = p.gameplay?.scripts.find((x) => x.id === r?.script);
  if (
    !r?.started ||
    !script?.skipTo ||
    r.pc > script.actions.findIndex((a) => a.id === script.skipTo)
  )
    return false;
  releaseTrack(sim, r);
  sim.cameraOverride = undefined;
  if (s.dialogue?.runner === r) s.dialogue = null;
  r.dialog = false;
  r.wait = 0;
  r.pc = script.actions.findIndex((a) => a.id === script.skipTo);
  return true;
}
export function chooseDialogue(s: GameplaySession, p: Project, choice: number) {
  const d = s.dialogue;
  if (!d) return false;
  const actions = p.gameplay!.scripts.find((x) => x.id === d.runner.script)!.actions;
  const a = actions[d.runner.pc];
  if (a.type !== 'say') return false;
  if (
    d.page + 1 === d.pages.length &&
    a.choices.length &&
    (!Number.isInteger(choice) || choice < 0 || choice >= a.choices.length)
  )
    return false;
  // One confirmation is one action: reveal OR advance, never both.
  if (isTextRevealing(d.text, d.reveal)) {
    revealAllText(d.text, d.reveal);
    return true;
  }
  if (d.page + 1 < d.pages.length) {
    d.page++;
    d.text = d.pages[d.page];
    d.reveal = createTextReveal(d.text, a.textSpeed);
    d.selected = 0;
    d.choices = d.page + 1 === d.pages.length ? a.choices.map((c) => c.text) : [];
    return true;
  }
  if (a.choices.length && (choice < 0 || choice >= a.choices.length)) return false;
  d.runner.pc = a.choices.length
    ? destination(actions, a.choices[choice].target, d.runner.pc + 1)
    : d.runner.pc + 1;
  d.runner.dialog = false;
  s.dialogue = null;
  return true;
}
export function animate(sim: Simulation, p: Project) {
  const clips = p.gameplay?.animations ?? emptyGameplay().animations;
  for (const n of sim.nodes) {
    if (!n.animator) continue;
    const b = sim.bodies[n.id];
    const motion =
      b && b.velocityY < -1 && !b.onFloor && n.physics?.motion === 'platformer'
        ? 'jump'
        : b && b.velocityY > 1 && !b.onFloor && n.physics?.motion === 'platformer'
          ? 'fall'
          : b && (Math.abs(b.velocityX) > 1 || Math.abs(b.velocityY) > 1)
            ? 'move'
            : 'idle';
    const old = sim.animations[n.id];
    const facing =
      sim.melee[n.id]?.facing ??
      (b && Math.abs(b.velocityX) > 1
        ? b.velocityX < 0
          ? 'Left'
          : 'Right'
        : b && Math.abs(b.velocityY) > 1
          ? b.velocityY < 0
            ? 'Up'
            : 'Down'
          : (old?.facing ?? 'Down'));
    const directional =
      n.physics?.motion !== 'platformer'
        ? n.animator[(motion + facing) as keyof typeof n.animator]
        : undefined;
    const swing = sim.melee[n.id];
    const attackClip = swing?.swinging
      ? n.animator[('attack' + swing.facing) as keyof typeof n.animator] || n.animator.attack
      : undefined;
    const id = attackClip || directional || n.animator[motion] || n.animator.idle;
    const clip = clips.find((c) => c.id === id);
    if (!clip) continue;
    const state = sim.animations[n.id] ?? { clip: '', time: 0 };
    if (attackClip) {
      state.clip = id;
      state.time = swing.tick / 60;
    } else if (state.clip !== id) {
      state.clip = id;
      state.time = 0;
    } else state.time += 1 / 60;
    const frame = Math.floor(state.time * clip.fps + 0.00001);
    n.asset =
      animationFrames(clip)[
        clip.loop ? frame % clip.frames.length : Math.min(frame, clip.frames.length - 1)
      ];
    sim.animations[n.id] = { ...state, facing: swing?.facing ?? facing };
  }
}
