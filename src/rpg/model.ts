import type { Project } from '../model';
export type StatusKind = 'poison' | 'regen' | 'stun' | 'attack-up' | 'defense-up' | 'slow';
export interface StatusDefinition {
  id: string;
  name: string;
  folder: string;
  kind: StatusKind;
  potency: number;
  turns: number;
}
export interface PartyDefinition {
  members: { id: string; actor: string; level: number }[];
  gold: number;
  seed: number;
  allowFlee: boolean;
}
export const statusKinds: StatusKind[] = [
  'poison',
  'regen',
  'stun',
  'attack-up',
  'defense-up',
  'slow',
];
const int = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(v);
export function rpgIssues(p: Project): string[] {
  const db = p.gameplay?.rpg,
    party = p.gameplay?.party;
  const statuses = db?.statuses ?? [];
  if (
    !Array.isArray(statuses) ||
    statuses.length > 16 ||
    statuses.some(
      (s) =>
        !s ||
        !id(s.id) ||
        typeof s.name !== 'string' ||
        s.name.length > 128 ||
        s.name.includes('\0') ||
        typeof s.folder !== 'string' ||
        s.folder.length > 128 ||
        s.folder.includes('\0') ||
        !statusKinds.includes(s.kind) ||
        !int(s.potency, 0, 100) ||
        !int(s.turns, 1, 9),
    ) ||
    new Set(statuses.map((s) => s.id)).size !== statuses.length
  )
    return ['Use up to 16 unique status definitions with 1–9 turns and 0–100 potency.'];
  for (const a of db?.actors ?? [])
    if (
      (a.mp !== undefined && !int(a.mp, 0, 9999)) ||
      (a.mpGrowth !== undefined && !int(a.mpGrowth, 0, 100)) ||
      (a.gold !== undefined && !int(a.gold, 0, 1000000))
    )
      return [`${a.name}: invalid MP, growth or gold reward.`];
  for (const s of db?.skills ?? [])
    if (
      (s.target !== undefined &&
        !['enemy', 'ally', 'self', 'all-enemies', 'all-allies'].includes(s.target)) ||
      (s.status !== undefined && s.status !== '' && !statuses.some((v) => v.id === s.status)) ||
      (s.statusChance !== undefined && !int(s.statusChance, 0, 100))
    )
      return [`${s.name}: select a valid target and status effect.`];
  for (const i of db?.items ?? [])
    if (
      (i.mpHeal !== undefined && !int(i.mpHeal, 0, 9999)) ||
      (i.revive !== undefined && typeof i.revive !== 'boolean') ||
      (i.revive === true && i.heal < 1) ||
      (i.cure !== undefined && i.cure !== '' && !statuses.some((s) => s.id === i.cure))
    )
      return [`${i.name}: select a valid cure and bounded recovery amount.`];
  for (const t of db?.encounters ?? [])
    if (t.enemyCount !== undefined && !int(t.enemyCount, 1, 4))
      return [`${t.name}: battles support 1–4 enemies.`];
  if (
    party !== undefined &&
    (!db ||
      !party ||
      !Array.isArray(party.members) ||
      party.members.length < 1 ||
      party.members.length > 4 ||
      party.members.some(
        (m) => !m || !id(m.id) || !db.actors.some((a) => a.id === m.actor) || !int(m.level, 1, 100),
      ) ||
      new Set(party.members.map((m) => m.id)).size !== party.members.length ||
      !int(party.gold, 0, 1000000) ||
      !int(party.seed, 1, 0xffffffff) ||
      typeof party.allowFlee !== 'boolean')
  )
    return [
      'Party setup needs 1–4 existing actors, levels 1–100, unique member IDs and a nonzero seed.',
    ];
  return [];
}
export const experienceAtLevel = (level: number) => 10 * level * (level - 1);
