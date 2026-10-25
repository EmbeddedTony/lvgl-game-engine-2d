import type { Project } from '../model';
import { rpgSchema } from '../rpg/save';
import { emptyRpg } from './toolkit';
/** Emit one immutable flash database. Runtime queries never parse JSON. */
export function toolkitData(p: Project, q: (s: string) => string, image: (id: string) => string) {
  const patterns = p.gameplay?.patterns ?? [],
    d = p.gameplay?.rpg ?? emptyRpg();
  const out = ['#include "engine/lge_rpg.h"'];
  out.push(
    `const lge_pattern_t game_patterns[${Math.max(1, patterns.length)}]={${patterns.map((v) => `{.id=${q(v.id)},.mode=LGE_PATTERN_${v.mode.toUpperCase()},.count=${v.count},.radius=${v.radius},.mask=${v.mask},.damage=${v.damage},.color=0x${v.color.slice(1)},.angle=${v.angle},.spread=${v.spread},.rotation=${v.rotation},.speed=${v.speed},.interval=${v.intervalMs / 1000}f,.lifetime=${v.lifetimeMs / 1000}f}`).join(',') || '{0}'}};`.replace(
      /([=,])([0-9]+)f/g,
      '$1$2.0f',
    ),
  );
  out.push(
    `static const lge_rpg_item_t rpg_items[${Math.max(1, d.items.length)}]={${d.items.map((v) => `{.id=${q(v.id)},.name=${q(v.name)},.description=${q(v.description)},.icon=${q(v.icon)},.stack=${q(v.stack)},.image=${image(v.icon)},.price=${v.price},.heal=${v.heal},.mp_heal=${v.mpHeal ?? 0},.stack_key=${(p.gameplay?.state.findIndex((f) => f.id === v.stack) ?? -1) + 1},.cure=${(d.statuses ?? []).findIndex((s) => s.id === v.cure) + 1},.revive=${v.revive ?? false}}`).join(',') || '{0}'}};`,
  );
  out.push(
    `static const lge_rpg_skill_t rpg_skills[${Math.max(1, d.skills.length)}]={${d.skills.map((v) => `{.id=${q(v.id)},.name=${q(v.name)},.description=${q(v.description)},.healing=${v.effect === 'heal'},.power=${v.power},.cost=${v.cost},.accuracy=${v.accuracy},.target=LGE_TARGET_${(v.target ?? 'default').toUpperCase().replaceAll('-', '_')},.status=${(d.statuses ?? []).findIndex((s) => s.id === v.status) + 1},.status_chance=${v.statusChance ?? 100}}`).join(',') || '{0}'}};`,
  );
  d.actors.forEach((v, i) => {
    if (v.skills.length)
      out.push(`static const char *const actor_skills_${i}[]={${v.skills.map(q).join(',')}};`);
  });
  out.push(
    `static const lge_rpg_actor_def_t rpg_actors[${Math.max(1, d.actors.length)}]={${d.actors.map((v, i) => `{.id=${q(v.id)},.name=${q(v.name)},.sprite=${q(v.sprite)},.image=${image(v.sprite)},.hp=${v.hp},.attack=${v.attack},.defense=${v.defense},.speed=${v.speed},.hp_growth=${v.hpGrowth},.attack_growth=${v.attackGrowth},.defense_growth=${v.defenseGrowth},.speed_growth=${v.speedGrowth},.skills=${v.skills.length ? 'actor_skills_' + i : 'NULL'},.skill_count=${v.skills.length},.experience=${v.experience},.gold=${v.gold ?? 0},.mp=${v.mp ?? 0},.mp_growth=${v.mpGrowth ?? 0}}`).join(',') || '{0}'}};`,
  );
  d.encounters.forEach((v, i) =>
    out.push(
      `static const lge_rpg_encounter_entry_t encounter_entries_${i}[]={${v.entries.map((e) => `{.actor=${q(e.actor)},.weight=${e.weight},.min_level=${e.minLevel},.max_level=${e.maxLevel}}`).join(',')}};`,
    ),
  );
  out.push(
    `static const lge_rpg_encounter_t rpg_encounters[${Math.max(1, d.encounters.length)}]={${d.encounters.map((v, i) => `{.id=${q(v.id)},.name=${q(v.name)},.entries=encounter_entries_${i},.count=${v.entries.length},.enemy_count=${v.enemyCount ?? 1}}`).join(',') || '{0}'}};`,
  );
  out.push(
    `static const lge_status_def_t rpg_statuses[${Math.max(1, d.statuses?.length ?? 0)}]={${d.statuses?.map((s) => `{.id=${q(s.id)},.name=${q(s.name)},.kind=LGE_STATUS_${s.kind.toUpperCase().replaceAll('-', '_')},.potency=${s.potency},.turns=${s.turns}}`).join(',') || '{0}'}};`,
  );
  out.push(
    `const lge_rpg_database_t game_rpg={.items=rpg_items,.item_count=${d.items.length},.skills=rpg_skills,.skill_count=${d.skills.length},.actors=rpg_actors,.actor_count=${d.actors.length},.encounters=rpg_encounters,.encounter_count=${d.encounters.length},.statuses=rpg_statuses,.status_count=${d.statuses?.length ?? 0}};`,
  );
  const party = p.gameplay?.party;
  out.push(
    `static const lge_party_member_def_t party_members[${Math.max(1, party?.members.length ?? 0)}]={${party?.members.map((m) => `{.actor=${d.actors.findIndex((a) => a.id === m.actor)},.level=${m.level}}`).join(',') || '{0}'}};`,
  );
  out.push(
    `const lge_party_def_t game_party={.database=&game_rpg,.members=party_members,.count=${party?.members.length ?? 0},.gold=${party?.gold ?? 0},.seed=UINT32_C(${party?.seed ?? 1}),.schema=UINT32_C(${rpgSchema(p)}),.allow_flee=${party?.allowFlee ?? false}};`,
  );
  return out.join('\n');
}
