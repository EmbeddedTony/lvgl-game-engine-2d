import type { Project } from '../model';
import type { GameplaySession } from '../gameplay/runtime';
import { stateSet } from '../gameplay/runtime';
import {
  actorStats,
  chooseEncounter,
  skillAmount,
  type RpgSkill,
  type RpgItem,
} from '../gameplay/toolkit';
import { experienceAtLevel } from './model';
export type BattleResult = 'none' | 'victory' | 'defeat' | 'escaped';
export type BattleAction = 'attack' | 'skill' | 'item' | 'guard' | 'flee';
export interface PartyMember {
  actor: string;
  level: number;
  hp: number;
  mp: number;
  xp: number;
  statuses: number[];
  fresh: number;
  guard: boolean;
}
export interface RpgSession {
  party: PartyMember[];
  gold: number;
  rng: number;
  enemies: PartyMember[];
  claimed: boolean;
  phase: 'none' | 'command' | 'victory' | 'defeat' | 'escaped';
  result: BattleResult;
  round: number;
  order: number[];
  cursor: number;
  turn: number;
  logs: string[];
  menu: 'command' | 'skills' | 'items' | 'targets';
  menuOpen: boolean;
  page: number;
  selected: number;
  pending: BattleAction;
  resource: string;
  previous: number;
}
export function stats(p: Project, m: PartyMember) {
  const a = p.gameplay!.rpg!.actors.find((a) => a.id === m.actor)!,
    base = actorStats(a, m.level)!;
  return { ...base, mp: Math.min(9999, (a.mp ?? 0) + (a.mpGrowth ?? 0) * (m.level - 1)) };
}
export function createMember(p: Project, actor: string, level: number): PartyMember {
  const m: PartyMember = {
    actor,
    level,
    hp: 0,
    mp: 0,
    xp: experienceAtLevel(level),
    statuses: Array(16).fill(0),
    fresh: 0,
    guard: false,
  };
  const max = stats(p, m);
  m.hp = max.hp;
  m.mp = max.mp;
  return m;
}
export function createRpg(p: Project): RpgSession | undefined {
  const d = p.gameplay?.party;
  if (!d) return undefined;
  return {
    party: d.members.map((m) => createMember(p, m.actor, m.level)),
    gold: d.gold,
    rng: d.seed,
    enemies: [],
    claimed: false,
    phase: 'none',
    result: 'none',
    round: 0,
    order: [],
    cursor: 0,
    turn: 0,
    logs: [],
    menu: 'command',
    menuOpen: false,
    page: 0,
    selected: 0,
    pending: 'attack',
    resource: '',
    previous: 0,
  };
}
export function random(s: RpgSession) {
  let x = s.rng >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.rng = x >>> 0;
  return s.rng;
}
export const member = (s: RpgSession, index: number) =>
  index < 4 ? s.party[index] : s.enemies[index - 4];
const name = (p: Project, m: PartyMember) =>
  p.gameplay!.rpg!.actors.find((a) => a.id === m.actor)!.name;
const log = (s: RpgSession, text: string) => {
  s.logs.push(text);
  if (s.logs.length > 4) s.logs.shift();
};
export const battleActive = (s?: RpgSession) => !!s && s.phase !== 'none';
export const rpgBlocking = (s?: RpgSession) => !!s && (battleActive(s) || s.menuOpen || s.claimed);
function effective(p: Project, m: PartyMember, key: 'attack' | 'defense' | 'speed') {
  let value = stats(p, m)[key];
  const defs = p.gameplay?.rpg?.statuses ?? [];
  defs.forEach((d, i) => {
    if (!m.statuses[i]) return;
    if (d.kind === key + '-up') value += Math.floor((value * d.potency) / 100);
    if (key === 'speed' && d.kind === 'slow') value = Math.floor((value * (100 - d.potency)) / 100);
  });
  return Math.max(0, Math.min(9999, value));
}
function finish(s: RpgSession, p: Project): boolean {
  if (!s.party.some((m) => m.hp > 0)) {
    s.phase = s.result = 'defeat';
    log(s, 'The party was defeated.');
    return true;
  }
  if (s.enemies.some((m) => m.hp > 0)) return false;
  s.phase = s.result = 'victory';
  let xp = 0,
    gold = 0;
  for (const m of s.enemies) {
    const a = p.gameplay!.rpg!.actors.find((a) => a.id === m.actor)!;
    xp += a.experience;
    gold += a.gold ?? 0;
  }
  const alive = s.party.filter((m) => m.hp > 0),
    share = Math.floor(xp / Math.max(1, alive.length));
  for (const m of alive) {
    const before = stats(p, m);
    m.xp = Math.min(1000000, m.xp + share);
    while (m.level < 100 && m.xp >= experienceAtLevel(m.level + 1)) m.level++;
    const after = stats(p, m);
    m.hp = Math.min(after.hp, m.hp + after.hp - before.hp);
    m.mp = Math.min(after.mp, m.mp + after.mp - before.mp);
  }
  s.gold = Math.min(1000000, s.gold + gold);
  log(s, `Victory! ${share} XP each / ${gold} gold.`);
  return true;
}
function endTurn(s: RpgSession, p: Project, m: PartyMember) {
  const defs = p.gameplay?.rpg?.statuses ?? [];
  defs.forEach((d, i) => {
    if (!m.statuses[i] || m.fresh & (1 << i)) return;
    const amount = d.potency ? Math.max(1, Math.floor((stats(p, m).hp * d.potency) / 100)) : 0;
    if (m.hp && d.kind === 'poison') {
      m.hp = Math.max(0, m.hp - amount);
      log(s, `${name(p, m)} takes ${amount} poison.`);
    }
    if (m.hp && d.kind === 'regen') m.hp = Math.min(stats(p, m).hp, m.hp + amount);
    m.statuses[i]--;
  });
  m.fresh = 0;
}
function round(s: RpgSession, p: Project) {
  s.round = Math.min(65535, s.round + 1);
  s.order = [];
  s.party.forEach((m, i) => {
    if (m.hp) s.order.push(i);
  });
  s.enemies.forEach((m, i) => {
    if (m.hp) s.order.push(i + 4);
  });
  s.order.sort(
    (a, b) => effective(p, member(s, b)!, 'speed') - effective(p, member(s, a)!, 'speed') || a - b,
  );
  s.cursor = 0;
}
function validTarget(s: RpgSession, actor: number, target: number, allied: boolean, dead = false) {
  const m = member(s, target);
  return !!m && (actor < 4 === target < 4) === allied && (dead ? m.hp === 0 : m.hp > 0);
}
export function inventoryCount(g: GameplaySession, item: RpgItem) {
  return item.stack ? Math.max(0, g.values[item.stack] ?? 0) : 0;
}
function itemEffect(g: GameplaySession, p: Project, item: RpgItem, target: number) {
  const s = g.rpg!,
    m = s.party[target];
  if (!m || inventoryCount(g, item) < 1 || !!item.revive !== (m.hp === 0)) return false;
  const max = stats(p, m),
    oldHp = m.hp,
    oldMp = m.mp,
    ci = p.gameplay!.rpg!.statuses?.findIndex((d) => d.id === item.cure) ?? -1,
    was = ci >= 0 ? m.statuses[ci] : 0;
  m.hp = Math.min(max.hp, m.hp + item.heal);
  m.mp = Math.min(max.mp, m.mp + (item.mpHeal ?? 0));
  if (ci >= 0) m.statuses[ci] = 0;
  if (m.hp === oldHp && m.mp === oldMp && !was) return false;
  stateSet(g, p, item.stack, g.values[item.stack] - 1);
  log(s, `${name(p, m)} used ${item.name}.`);
  return true;
}
export function partyUseItem(g: GameplaySession, p: Project, id: string, target: number) {
  const item = p.gameplay?.rpg?.items.find((i) => i.id === id);
  return !!g.rpg && !battleActive(g.rpg) && !!item && itemEffect(g, p, item, target);
}
export function partyRest(g: GameplaySession, p: Project) {
  const s = g.rpg;
  if (!s || battleActive(s)) return false;
  for (const m of s.party) {
    const max = stats(p, m);
    m.hp = max.hp;
    m.mp = max.mp;
    m.statuses.fill(0);
    m.guard = false;
    m.fresh = 0;
  }
  log(s, 'The party is rested.');
  return true;
}
export function partyAdd(g: GameplaySession, p: Project, id: string, level: number) {
  const s = g.rpg;
  if (
    !s ||
    battleActive(s) ||
    s.party.length >= 4 ||
    !p.gameplay?.rpg?.actors.some((a) => a.id === id) ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 100
  )
    return false;
  s.party.push(createMember(p, id, level));
  return true;
}
export function partyRemove(g: GameplaySession, index: number) {
  const s = g.rpg;
  if (
    !s ||
    battleActive(s) ||
    s.party.length <= 1 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= s.party.length
  )
    return false;
  s.party.splice(index, 1);
  return true;
}
function skillTargets(s: RpgSession, skill: RpgSkill, actor: number, target: number) {
  const mode = skill.target ?? (skill.effect === 'heal' ? 'ally' : 'enemy');
  if (mode === 'self') return [actor];
  const ally = mode === 'ally' || mode === 'all-allies';
  if (mode.startsWith('all-'))
    return Array.from({ length: 8 }, (_, i) => i).filter((i) => validTarget(s, actor, i, ally));
  return validTarget(s, actor, target, ally) ? [target] : [];
}
function apply(
  g: GameplaySession,
  p: Project,
  actor: number,
  action: BattleAction,
  resource: string,
  target: number,
) {
  const s = g.rpg!,
    m = member(s, actor);
  if (!m || !m.hp) return false;
  if (action === 'guard') {
    m.guard = true;
    log(s, `${name(p, m)} guards.`);
    return true;
  }
  if (action === 'item') {
    const item = p.gameplay!.rpg!.items.find((i) => i.id === resource);
    return actor < 4 && !!item && itemEffect(g, p, item, target);
  }
  if (action === 'flee') {
    if (actor >= 4 || !p.gameplay?.party?.allowFlee) return false;
    const chance = Math.max(
      25,
      Math.min(
        90,
        50 + effective(p, m, 'speed') - Math.max(...s.enemies.map((e) => effective(p, e, 'speed'))),
      ),
    );
    if (random(s) % 100 < chance) {
      s.phase = s.result = 'escaped';
      log(s, 'The party escaped.');
    } else log(s, 'Could not escape.');
    return true;
  }
  const skill =
    action === 'skill' ? p.gameplay!.rpg!.skills.find((v) => v.id === resource) : undefined;
  if (
    action === 'skill' &&
    (!skill ||
      m.mp < skill.cost ||
      !p.gameplay!.rpg!.actors.find((v) => v.id === m.actor)!.skills.includes(resource))
  )
    return false;
  const targets = skill
    ? skillTargets(s, skill, actor, target)
    : validTarget(s, actor, target, false)
      ? [target]
      : [];
  if (!targets.length) return false;
  if (skill) m.mp -= skill.cost;
  for (const index of targets) {
    const t = member(s, index)!,
      attack = effective(p, m, 'attack'),
      defense = effective(p, t, 'defense'),
      hit = random(s) % 100 < (skill?.accuracy ?? 100);
    if (!hit) {
      log(s, `${name(p, m)} missed ${name(p, t)}.`);
      continue;
    }
    let amount = skill
      ? skillAmount({ ...skill, accuracy: 100 }, attack, defense, 0)
      : Math.max(1, Math.min(9999, 4 + attack - Math.floor(defense / 2)));
    if (skill?.effect === 'heal') t.hp = Math.min(stats(p, t).hp, t.hp + amount);
    else {
      if (t.guard) amount = Math.max(1, Math.floor((amount + 1) / 2));
      t.hp = Math.max(0, t.hp - amount);
    }
    log(
      s,
      `${name(p, m)} ${skill?.name ?? 'attacks'}: ${name(p, t)} ${skill?.effect === 'heal' ? '+' : '-'}${amount} HP.`,
    );
    const si = p.gameplay!.rpg!.statuses?.findIndex((v) => v.id === skill?.status) ?? -1;
    if (si >= 0 && t.hp && random(s) % 100 < (skill?.statusChance ?? 100)) {
      t.statuses[si] = p.gameplay!.rpg!.statuses![si].turns;
      if (index === actor) t.fresh |= 1 << si;
    }
  }
  return true;
}
function lowest(s: RpgSession, indices: number[]) {
  return (
    indices
      .filter((i) => member(s, i)?.hp)
      .sort((a, b) => member(s, a)!.hp - member(s, b)!.hp || a - b)[0] ?? -1
  );
}
/** Bounded enemy/skip advancement. Long status chains yield after 32 activations. */
export function progressBattle(g: GameplaySession, p: Project) {
  const s = g.rpg;
  if (!s || s.phase !== 'command') return;
  let budget = 32;
  while (budget-- > 0) {
    if (finish(s, p)) return;
    if (s.cursor >= s.order.length) round(s, p);
    s.turn = s.order[s.cursor];
    const m = member(s, s.turn)!;
    if (!m.hp) {
      s.cursor++;
      continue;
    }
    m.guard = false;
    const stun = (p.gameplay!.rpg!.statuses ?? []).some(
      (d, i) => d.kind === 'stun' && m.statuses[i] > 0,
    );
    if (stun) {
      log(s, `${name(p, m)} is stunned.`);
      endTurn(s, p, m);
      s.cursor++;
      continue;
    }
    if (s.turn < 4) return;
    const a = p.gameplay!.rpg!.actors.find((a) => a.id === m.actor)!;
    let chosen: RpgSkill | undefined;
    for (const id of a.skills) {
      const skill = p.gameplay!.rpg!.skills.find((s) => s.id === id)!;
      if (skill.cost <= m.mp && (skill.effect === 'damage' || m.hp < stats(p, m).hp / 2)) {
        chosen = skill;
        break;
      }
    }
    const target = chosen?.effect === 'heal' ? lowest(s, [4, 5, 6, 7]) : lowest(s, [0, 1, 2, 3]);
    if (!apply(g, p, s.turn, chosen ? 'skill' : 'attack', chosen?.id ?? '', target))
      apply(g, p, s.turn, 'attack', '', lowest(s, [0, 1, 2, 3]));
    endTurn(s, p, m);
    s.cursor++;
  }
}
export function startBattle(g: GameplaySession, p: Project, id: string) {
  const s = g.rpg,
    table = p.gameplay?.rpg?.encounters.find((v) => v.id === id);
  if (!s || !table || battleActive(s) || s.claimed || !s.party.some((m) => m.hp)) return false;
  s.enemies = [];
  for (let i = 0; i < (table.enemyCount ?? 1); i++) {
    const e = chooseEncounter(table, random(s), random(s))!;
    s.enemies.push(createMember(p, e.actor, e.level));
  }
  for (const m of s.party) {
    m.guard = false;
    m.fresh = 0;
  }
  s.phase = 'command';
  s.result = 'none';
  s.round = 0;
  s.logs = [];
  s.menu = 'command';
  s.menuOpen = true;
  s.page = s.selected = 0;
  s.previous = 0;
  round(s, p);
  log(s, 'An encounter begins.');
  progressBattle(g, p);
  return true;
}
export function battleCommand(
  g: GameplaySession,
  p: Project,
  action: BattleAction,
  resource = '',
  target = 4,
) {
  const s = g.rpg;
  if (
    !s ||
    s.phase !== 'command' ||
    s.cursor >= s.order.length ||
    s.turn !== s.order[s.cursor] ||
    s.turn >= 4 ||
    !apply(g, p, s.turn, action, resource, target)
  )
    return false;
  if (s.phase === 'command') {
    endTurn(s, p, member(s, s.turn)!);
    s.cursor++;
    progressBattle(g, p);
  }
  s.menu = 'command';
  s.page = s.selected = 0;
  return true;
}
export function acknowledgeBattle(g: GameplaySession) {
  const s = g.rpg;
  if (!s || !['victory', 'defeat', 'escaped'].includes(s.phase)) return false;
  s.phase = 'none';
  s.menuOpen = false;
  s.enemies = [];
  s.menu = 'command';
  s.page = s.selected = 0;
  return true;
}
export function cancelBattle(g: GameplaySession) {
  const s = g.rpg;
  if (!s) return;
  s.phase = 'none';
  s.claimed = false;
  s.menuOpen = false;
  s.result = 'none';
  s.enemies = [];
  for (const m of s.party) {
    m.fresh = 0;
    m.guard = false;
  }
}
