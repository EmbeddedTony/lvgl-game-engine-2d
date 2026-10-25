import type { Project } from '../model';
import type { GameplaySession } from '../gameplay/runtime';
import { hashBytes } from '../gameplay/hash';
import { cancelBattle, stats } from './runtime';
/** Mechanical IDs and rules define compatibility; display names can change safely. */
export function rpgSchema(p: Project) {
  const d = p.gameplay?.rpg;
  return hashBytes(
    new TextEncoder().encode(
      JSON.stringify([
        d?.actors.map((a) => [
          a.id,
          a.hp,
          a.mp ?? 0,
          a.attack,
          a.defense,
          a.speed,
          a.hpGrowth,
          a.mpGrowth ?? 0,
          a.attackGrowth,
          a.defenseGrowth,
          a.speedGrowth,
          a.skills,
        ]),
        d?.statuses?.map((s) => [s.id, s.kind, s.potency, s.turns]) ?? [],
        d?.items.map((i) => [
          i.id,
          i.stack,
          i.heal,
          i.mpHeal ?? 0,
          i.cure ?? '',
          i.revive ?? false,
        ]),
        d?.skills.map((s) => [
          s.id,
          s.effect,
          s.power,
          s.cost,
          s.accuracy,
          s.target ?? '',
          s.status ?? '',
          s.statusChance ?? 100,
        ]),
      ]),
    ),
  );
}
export function wrapPartySave(g: GameplaySession, p: Project, story: Uint8Array) {
  const r = g.rpg!;
  if (r.phase !== 'none' || r.claimed) return new Uint8Array();
  const payload = 12 + 28 * r.party.length,
    b = new Uint8Array(20 + story.length + payload),
    v = new DataView(b.buffer);
  v.setUint32(0, 0x3252474c, true);
  v.setUint32(4, rpgSchema(p), true);
  v.setUint32(8, story.length, true);
  v.setUint32(12, payload, true);
  b.set(story, 16);
  let at = 16 + story.length;
  v.setUint32(at, r.gold, true);
  v.setUint32(at + 4, r.rng, true);
  v.setUint32(at + 8, r.party.length, true);
  at += 12;
  for (const m of r.party) {
    v.setUint16(
      at,
      p.gameplay!.rpg!.actors.findIndex((a) => a.id === m.actor),
      true,
    );
    v.setUint16(at + 2, m.level, true);
    v.setUint16(at + 4, m.hp, true);
    v.setUint16(at + 6, m.mp, true);
    v.setUint32(at + 8, m.xp, true);
    for (let i = 0; i < 16; i++) v.setUint8(at + 12 + i, m.statuses[i] ?? 0);
    at += 28;
  }
  v.setUint32(b.length - 4, hashBytes(b.subarray(0, -4)), true);
  return b;
}
export function readPartySave(
  g: GameplaySession,
  p: Project,
  b: Uint8Array,
  restoreStory: (b: Uint8Array) => boolean,
) {
  if (!g.rpg || b.length < 64 || g.rpg.phase !== 'none' || g.rpg.claimed) return false;
  const v = new DataView(b.buffer, b.byteOffset, b.length),
    storyLength = v.getUint32(8, true),
    size = v.getUint32(12, true),
    at = 16 + storyLength;
  if (
    v.getUint32(0, true) !== 0x3252474c ||
    v.getUint32(4, true) !== rpgSchema(p) ||
    storyLength < 16 ||
    at + size + 4 !== b.length ||
    size < 40 ||
    v.getUint32(b.length - 4, true) !== hashBytes(b.subarray(0, -4))
  )
    return false;
  const gold = v.getUint32(at, true),
    rng = v.getUint32(at + 4, true),
    count = v.getUint32(at + 8, true);
  if (gold > 1e6 || !rng || count < 1 || count > 4 || size !== 12 + 28 * count) return false;
  const party = [];
  for (let i = 0; i < count; i++) {
    const q = at + 12 + i * 28,
      a = p.gameplay!.rpg!.actors[v.getUint16(q, true)],
      level = v.getUint16(q + 2, true),
      hp = v.getUint16(q + 4, true),
      mp = v.getUint16(q + 6, true),
      xp = v.getUint32(q + 8, true),
      statuses = Array.from(b.subarray(q + 12, q + 28));
    if (
      !a ||
      level < 1 ||
      level > 100 ||
      xp > 1e6 ||
      statuses.some((n, j) => n > (p.gameplay!.rpg!.statuses?.[j]?.turns ?? 0))
    )
      return false;
    const m = { actor: a.id, level, hp, mp, xp, statuses, fresh: 0, guard: false },
      max = stats(p, m);
    if (hp > max.hp || mp > max.mp) return false;
    party.push(m);
  }
  if (!restoreStory(b.subarray(16, 16 + storyLength))) return false;
  cancelBattle(g);
  Object.assign(g.rpg, { party, gold, rng });
  return true;
}
