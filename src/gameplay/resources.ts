import type { Project } from '../model';
type ResourceKind =
  | 'script'
  | 'state'
  | 'animation'
  | 'pattern'
  | 'item'
  | 'skill'
  | 'actor'
  | 'encounter'
  | 'status';
/** Build once per document revision; opening hundreds of RPG fields never rescans all rooms per row. */
export function resourceUsageIndex(p: Project) {
  const index = new Map<string, Set<string>>();
  const add = (kind: ResourceKind, id: string, where: string) => {
    const key = kind + ':' + id,
      uses = index.get(key) ?? new Set<string>();
    uses.add(where);
    index.set(key, uses);
  };
  for (const scene of p.scenes)
    for (const n of scene.nodes) {
      const where = `${scene.name} / ${n.name}`;
      for (const [from, to] of Object.entries(n.stateBindings ?? {})) {
        add('state', from, where + ' state remap');
        add('state', to, where + ' state remap');
      }
      for (const id of Object.values(n.animator ?? {})) if (id) add('animation', id, where);
      if (n.emitter) add('pattern', n.emitter.pattern, where);
      for (const e of n.events ?? []) {
        add('script', e.script, where);
        if (e.when) add('state', e.when.key, where);
      }
      for (const o of Object.values(n.overrides ?? {}))
        for (const [from, to] of Object.entries(o.stateBindings ?? {})) {
          add('state', from, where + ' instance remap');
          add('state', to, where + ' instance remap');
        }
    }
  for (const s of p.gameplay?.scripts ?? [])
    for (const a of s.actions) {
      if (a.type === 'battle') add('encounter', a.encounter, 'Script / ' + s.name);
      if (a.type === 'state') add('state', a.key, `Script / ${s.name}`);
      if (a.type === 'branch') add('state', a.condition.key, `Script / ${s.name}`);
    }
  for (const item of p.gameplay?.rpg?.items ?? [])
    if (item.stack) add('state', item.stack, 'Item / ' + item.name);
  for (const actor of p.gameplay?.rpg?.actors ?? [])
    for (const skill of actor.skills) add('skill', skill, 'Actor / ' + actor.name);
  for (const table of p.gameplay?.rpg?.encounters ?? [])
    for (const e of table.entries) add('actor', e.actor, 'Encounters / ' + table.name);
  for (const s of p.gameplay?.rpg?.skills ?? [])
    if (s.status) add('status', s.status, 'Skill / ' + s.name);
  for (const i of p.gameplay?.rpg?.items ?? [])
    if (i.cure) add('status', i.cure, 'Item / ' + i.name);
  for (const m of p.gameplay?.party?.members ?? []) add('actor', m.actor, 'Starting party');
  return (kind: ResourceKind, id: string) => [...(index.get(kind + ':' + id) ?? [])];
}
/** Handwritten C references remain developer-owned. */
export const resourceUsage = (p: Project, kind: ResourceKind, id: string) =>
  resourceUsageIndex(p)(kind, id);
