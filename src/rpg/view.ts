import type { GameNode, Project } from '../model';
import { makeNode } from '../model';
import type { GameplaySession } from '../gameplay/runtime';
import {
  acknowledgeBattle,
  battleCommand,
  battleActive,
  partyUseItem,
  inventoryCount,
  member,
  progressBattle,
  stats,
  type BattleAction,
} from './runtime';
export interface RpgOption {
  label: string;
  type: 'command' | 'skill' | 'item' | 'target' | 'page' | 'back' | 'close' | 'continue';
  action?: BattleAction;
  resource?: string;
  target?: number;
  page?: number;
}
const actorName = (p: Project, id: string) =>
  p.gameplay!.rpg!.actors.find((a) => a.id === id)!.name;
export function rpgOptions(g: GameplaySession, p: Project): RpgOption[] {
  const s = g.rpg;
  if (!s || !s.menuOpen) return [];
  if (['victory', 'defeat', 'escaped'].includes(s.phase))
    return [{ label: 'Continue', type: 'continue' }];
  if (s.phase === 'command' && (s.turn >= 4 || s.turn !== s.order[s.cursor])) return [];
  if (s.menu === 'command')
    return [
      { label: 'Attack', type: 'command', action: 'attack' },
      { label: 'Skills', type: 'command', action: 'skill' },
      { label: 'Items', type: 'command', action: 'item' },
      { label: 'Guard', type: 'command', action: 'guard' },
      ...(p.gameplay?.party?.allowFlee
        ? [{ label: 'Escape', type: 'command' as const, action: 'flee' as const }]
        : []),
    ];
  if (s.menu === 'targets') {
    const skill = p.gameplay!.rpg!.skills.find((v) => v.id === s.resource),
      item = p.gameplay!.rpg!.items.find((v) => v.id === s.resource);
    const ally =
      s.pending === 'item' ||
      (skill?.target ?? (skill?.effect === 'heal' ? 'ally' : 'enemy')) === 'ally';
    return [
      ...(ally ? s.party : s.enemies).flatMap((m, i) =>
        (s.pending === 'item' && item?.revive ? m.hp === 0 : m.hp > 0)
          ? [
              {
                label: actorName(p, m.actor).slice(0, 18) + ' / ' + m.hp + ' HP',
                type: 'target' as const,
                target: i + (ally ? 0 : 4),
              },
            ]
          : [],
      ),
      { label: 'Back', type: 'back' },
    ];
  }
  const options: RpgOption[] =
    s.menu === 'skills'
      ? p
          .gameplay!.rpg!.actors.find((a) => a.id === member(s, s.turn)!.actor)!
          .skills.map((id) => {
            const k = p.gameplay!.rpg!.skills.find((s) => s.id === id)!;
            return { label: `${k.name.slice(0, 18)} / ${k.cost} MP`, type: 'skill', resource: id };
          })
      : p
          .gameplay!.rpg!.items.filter((i) => inventoryCount(g, i) > 0)
          .map((i) => ({
            label: `${i.name.slice(0, 18)} x${inventoryCount(g, i)}`,
            type: 'item',
            resource: i.id,
          }));
  s.page = Math.max(0, Math.min(s.page, Math.max(0, Math.ceil(options.length / 4) - 1)));
  return [
    ...options.slice(s.page * 4, s.page * 4 + 4),
    ...(s.page > 0 ? [{ label: 'Previous', type: 'page' as const, page: s.page - 1 }] : []),
    ...(options.length > (s.page + 1) * 4
      ? [{ label: 'Next', type: 'page' as const, page: s.page + 1 }]
      : []),
    { label: battleActive(s) ? 'Back' : 'Close', type: battleActive(s) ? 'back' : 'close' },
  ];
}
export function openParty(g: GameplaySession, p: Project) {
  const s = g.rpg;
  if (
    !s ||
    battleActive(s) ||
    s.claimed ||
    g.dialogue ||
    g.runners.some((r) => p.gameplay?.scripts.find((v) => v.id === r.script)?.blocking)
  )
    return false;
  s.menuOpen = true;
  s.menu = 'items';
  s.selected = s.page = 0;
  s.resource = '';
  return true;
}
export function selectRpgOption(g: GameplaySession, p: Project, index: number) {
  const s = g.rpg,
    option = rpgOptions(g, p)[index];
  if (!s || !option) return false;
  s.selected = 0;
  if (option.type === 'continue') return acknowledgeBattle(g);
  if (option.type === 'close') {
    s.menuOpen = false;
    return true;
  }
  if (option.type === 'page') {
    s.page = option.page!;
    return true;
  }
  if (option.type === 'back') {
    s.menu = battleActive(s) ? 'command' : 'items';
    s.page = 0;
    return true;
  }
  if (option.type === 'command') {
    if (option.action === 'guard' || option.action === 'flee')
      return battleCommand(g, p, option.action);
    s.pending = option.action!;
    s.resource = '';
    s.page = 0;
    s.menu =
      option.action === 'attack' ? 'targets' : option.action === 'skill' ? 'skills' : 'items';
    return true;
  }
  if (option.type === 'skill') {
    const skill = p.gameplay!.rpg!.skills.find((v) => v.id === option.resource)!;
    s.pending = 'skill';
    s.resource = skill.id;
    if (skill.target === 'self' || skill.target?.startsWith('all-'))
      return battleCommand(g, p, 'skill', skill.id, s.turn);
    s.menu = 'targets';
    return true;
  }
  if (option.type === 'item') {
    s.pending = 'item';
    s.resource = option.resource!;
    s.menu = 'targets';
    return true;
  }
  const ok = battleActive(s)
    ? battleCommand(g, p, s.pending, s.resource, option.target)
    : partyUseItem(g, p, s.resource, option.target!);
  if (!ok) {
    s.logs.push('No effect, invalid target or insufficient MP.');
    s.logs = s.logs.slice(-4);
  }
  if (!battleActive(s)) {
    s.menu = 'items';
    s.page = 0;
  }
  return ok;
}
export function stepRpgInput(g: GameplaySession, p: Project, mask: number, pressedPulse = 0) {
  const s = g.rpg;
  if (!s) return;
  const pressed = (mask & ~s.previous) | pressedPulse;
  s.previous = mask;
  if (s.phase === 'command') progressBattle(g, p);
  if (pressed & 64) {
    if (!s.menuOpen) openParty(g, p);
    else if (s.phase === 'none') s.menuOpen = false;
    else if (s.menu !== 'command') {
      s.menu = 'command';
      s.page = s.selected = 0;
    }
  }
  if (!s.menuOpen) return;
  const options = rpgOptions(g, p);
  if (!options.length) return;
  let delta = pressed & 2 ? 1 : pressed & 1 ? -1 : pressed & 8 ? 2 : pressed & 4 ? -2 : 0;
  if (delta) s.selected = (s.selected + delta + options.length * 2) % options.length;
  if (pressed & 48) selectRpgOption(g, p, Math.min(s.selected, options.length - 1));
}
export function rpgSummary(g: GameplaySession, p: Project) {
  const s = g.rpg!;
  const rows = (members: typeof s.party) =>
    members
      .map((m) => {
        const codes = (p.gameplay!.rpg!.statuses ?? [])
          .filter((_, i) => m.statuses[i] > 0)
          .map((d) => d.name.slice(0, 3))
          .join(' ');
        return `${actorName(p, m.actor).slice(0, 8)} H${m.hp} M${m.mp}${codes ? ' ' + codes : ''}`;
      })
      .join('\n');
  const current = member(s, s.turn);
  return {
    title:
      s.phase === 'none'
        ? `Party / ${s.gold} gold`
        : s.phase === 'command'
          ? `R${s.round} / ${current ? actorName(p, current.actor) : 'Battle'}'s turn`
          : s.phase === 'victory'
            ? 'Victory'
            : s.phase === 'defeat'
              ? 'Defeat'
              : 'Escaped',
    party: rows(s.party),
    enemies: rows(s.enemies),
    log: s.logs.slice(-2).join('\n'),
  };
}
/** View-only nodes share the editor's pixel renderer and never enter scenes or saves. */
export function rpgNodes(
  g: GameplaySession | undefined,
  p: Pick<Project, 'width' | 'height'> & Partial<Project>,
): GameNode[] {
  const s = g?.rpg;
  if (!g || !s) return [];
  if (!s.menuOpen)
    return g.dialogue
      ? []
      : [
          makeNode('button', {
            id: 'rpg_open',
            name: 'Party',
            layer: 'ui',
            x: p.width - 74,
            y: 6,
            width: 68,
            height: 20,
            text: 'Party [P]',
            color: '#354b61',
            radius: 2,
          }),
        ];
  const summary = rpgSummary(g, p as Project),
    sx = p.width / 320,
    sy = p.height / 240;
  const n = (
    id: string,
    kind: GameNode['kind'],
    x: number,
    y: number,
    w: number,
    h: number,
    text = '',
    color = '#dce7ee',
  ) =>
    makeNode(kind, {
      id,
      name: id,
      layer: 'ui',
      x: Math.round(x * sx),
      y: Math.round(y * sy),
      width: Math.max(1, Math.round(w * sx)),
      height: Math.max(1, Math.round(h * sy)),
      text,
      color,
      radius: 0,
    });
  const options = rpgOptions(g, p as Project);
  return [
    n('rpg_background', 'rect', 0, 0, 320, 240, '', '#1d2938'),
    n('rpg_title', 'label', 8, 4, 304, 20, summary.title),
    n('rpg_party', 'label', 8, 28, 148, 70, summary.party),
    n('rpg_enemies', 'label', 164, 28, 148, 70, summary.enemies),
    n('rpg_log', 'label', 8, 100, 304, 38, summary.log),
    ...options.map((o, i) =>
      n(
        'rpg_option_' + i,
        'button',
        8 + (i % 2) * 156,
        142 + Math.floor(i / 2) * 23,
        148,
        20,
        o.label,
        i === s.selected ? '#547d9e' : '#35475b',
      ),
    ),
  ];
}
