import { rpgIssues, type StatusDefinition } from '../rpg/model';
import type { Project } from '../model';

export interface BulletPattern {
  id: string;
  name: string;
  folder: string;
  mode: 'fan' | 'ring' | 'aimed';
  count: number;
  angle: number;
  spread: number;
  rotation: number;
  speed: number;
  intervalMs: number;
  lifetimeMs: number;
  radius: number;
  color: string;
  mask: number;
  damage: number;
}
export interface Emitter {
  pattern: string;
  autoplay: boolean;
}
export interface RpgItem {
  id: string;
  name: string;
  folder: string;
  description: string;
  icon: string;
  stack: string;
  price: number;
  heal: number;
  mpHeal?: number;
  cure?: string;
  revive?: boolean;
}
export interface RpgSkill {
  id: string;
  name: string;
  folder: string;
  description: string;
  effect: 'damage' | 'heal';
  power: number;
  cost: number;
  accuracy: number;
  target?: 'enemy' | 'ally' | 'self' | 'all-enemies' | 'all-allies';
  status?: string;
  statusChance?: number;
}
export interface RpgActor {
  id: string;
  name: string;
  folder: string;
  sprite: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  hpGrowth: number;
  attackGrowth: number;
  defenseGrowth: number;
  speedGrowth: number;
  skills: string[];
  experience: number;
  mp?: number;
  mpGrowth?: number;
  gold?: number;
}
export interface EncounterTable {
  id: string;
  name: string;
  folder: string;
  enemyCount?: number;
  entries: { actor: string; weight: number; minLevel: number; maxLevel: number }[];
}
export interface RpgDatabase {
  items: RpgItem[];
  skills: RpgSkill[];
  actors: RpgActor[];
  encounters: EncounterTable[];
  statuses?: StatusDefinition[];
}
export const emptyRpg = (): RpgDatabase => ({ items: [], skills: [], actors: [], encounters: [] });
export const defaultPattern = (id: string): BulletPattern => ({
  id,
  name: 'New fan',
  folder: 'Patterns',
  mode: 'fan',
  count: 5,
  angle: 90,
  spread: 60,
  rotation: 0,
  speed: 64,
  intervalMs: 750,
  lifetimeMs: 3000,
  radius: 2,
  color: '#ffb86b',
  mask: 2,
  damage: 1,
});
const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const id = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(v);
const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.length <= max && !v.includes('\0');
const base = (v: { id: string; name: string; folder: string }) =>
  id(v.id) && text(v.name, 128) && text(v.folder, 128);
const list = <T extends { id: string }>(
  v: unknown,
  max: number,
  valid: (v: T) => boolean,
): v is T[] =>
  Array.isArray(v) &&
  v.length <= max &&
  v.every((x) => x && typeof x === 'object' && valid(x)) &&
  new Set(v.map((x) => x.id)).size === v.length;
/** Flat, bounded resources with stable IDs; all cross references are checked at import/export. */
export function toolkitIssues(p: Project): string[] {
  const g = p.gameplay;
  if (!g)
    return p.scenes.some((s) => s.nodes.some((n) => n.emitter !== undefined))
      ? ['Emitters require an existing gameplay pattern.']
      : [];
  if (g.projectileLimit !== undefined && !int(g.projectileLimit, 1, 64))
    return ['Projectile pool must contain 1–64 slots.'];
  if (
    g.patterns !== undefined &&
    !list<BulletPattern>(
      g.patterns,
      64,
      (v) =>
        base(v) &&
        ['fan', 'ring', 'aimed'].includes(v.mode) &&
        int(v.count, 1, 32) &&
        int(v.angle, -360, 360) &&
        int(v.spread, 0, 360) &&
        int(v.rotation, -360, 360) &&
        int(v.speed, 1, 600) &&
        int(v.intervalMs, 50, 60000) &&
        int(v.lifetimeMs, 17, 60000) &&
        int(v.radius, 1, 8) &&
        /^#[0-9a-fA-F]{6}$/.test(v.color) &&
        int(v.mask, 0, 255) &&
        int(v.damage, 0, 9999),
    )
  )
    return ['Bullet patterns need unique IDs and bounded counts, speed, lifetime and rate.'];
  for (const scene of p.scenes)
    for (const n of scene.nodes)
      if (
        n.emitter !== undefined &&
        (!n.emitter ||
          typeof n.emitter !== 'object' ||
          !g.patterns?.some((v) => v.id === n.emitter!.pattern) ||
          typeof n.emitter.autoplay !== 'boolean' ||
          n.layer !== 'world' ||
          n.kind === 'instance')
      )
        return [`${n.name}: emitter needs an existing pattern on a world object.`];
  const d = g.rpg;
  if (d === undefined) return rpgIssues(p);
  if (
    !d ||
    !list<RpgItem>(
      d.items,
      128,
      (v) =>
        base(v) &&
        text(v.description, 512) &&
        (v.icon === '' || p.sprites.some((s) => s.id === v.icon)) &&
        (v.stack === '' || g.state.some((s) => s.id === v.stack && s.kind === 'item')) &&
        int(v.price, 0, 1000000) &&
        int(v.heal, 0, 9999),
    ) ||
    !list<RpgSkill>(
      d.skills,
      128,
      (v) =>
        base(v) &&
        text(v.description, 512) &&
        ['damage', 'heal'].includes(v.effect) &&
        int(v.power, 0, 9999) &&
        int(v.cost, 0, 9999) &&
        int(v.accuracy, 0, 100),
    ) ||
    !list<RpgActor>(
      d.actors,
      128,
      (v) =>
        base(v) &&
        (v.sprite === '' || p.sprites.some((s) => s.id === v.sprite)) &&
        int(v.hp, 1, 9999) &&
        int(v.attack, 1, 9999) &&
        int(v.defense, 0, 9999) &&
        int(v.speed, 0, 9999) &&
        [v.hpGrowth, v.attackGrowth, v.defenseGrowth, v.speedGrowth].every((x) => int(x, 0, 100)) &&
        int(v.experience, 0, 1000000) &&
        Array.isArray(v.skills) &&
        v.skills.length <= 8 &&
        new Set(v.skills).size === v.skills.length &&
        v.skills.every((x) => d.skills.some((s) => s.id === x)),
    ) ||
    !list<EncounterTable>(
      d.encounters,
      128,
      (v) =>
        base(v) &&
        Array.isArray(v.entries) &&
        v.entries.length > 0 &&
        v.entries.length <= 8 &&
        v.entries.every(
          (x) =>
            x &&
            d.actors.some((a) => a.id === x.actor) &&
            int(x.weight, 1, 255) &&
            int(x.minLevel, 1, 100) &&
            int(x.maxLevel, x.minLevel, 100),
        ),
    )
  )
    return [
      'RPG database: use valid bounded items, skills, actors and weighted encounter references.',
    ];
  return rpgIssues(p);
}
/** Integer helpers mirror the firmware. Games own combat turns, MP, status and persistence. */
export function actorStats(actor: RpgActor, level: number) {
  if (!Number.isInteger(level) || level < 1 || level > 100) return null;
  const l = level - 1;
  return {
    hp: Math.min(9999, actor.hp + actor.hpGrowth * l),
    attack: Math.min(9999, actor.attack + actor.attackGrowth * l),
    defense: Math.min(9999, actor.defense + actor.defenseGrowth * l),
    speed: Math.min(9999, actor.speed + actor.speedGrowth * l),
  };
}
export function skillAmount(skill: RpgSkill, attack: number, defense: number, roll: number) {
  if ((roll >>> 0) % 100 >= skill.accuracy) return 0;
  return Math.max(
    skill.effect === 'damage' ? 1 : 0,
    Math.min(
      9999,
      skill.power + (skill.effect === 'damage' ? attack - Math.floor(defense / 2) : 0),
    ),
  );
}
export function chooseEncounter(table: EncounterTable, roll: number, levelRoll: number) {
  const total = table.entries.reduce((v, e) => v + e.weight, 0);
  let pick = (roll >>> 0) % total;
  for (const e of table.entries) {
    if (pick < e.weight)
      return {
        actor: e.actor,
        level: e.minLevel + ((levelRoll >>> 0) % (e.maxLevel - e.minLevel + 1)),
      };
    pick -= e.weight;
  }
  return null;
}
